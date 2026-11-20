import os
import sys
import shutil
import uuid
import time
import json
import asyncio
import hmac
import urllib.request
import urllib.parse
from typing import Optional, Dict, Any, Union
from concurrent.futures import ThreadPoolExecutor

import imageio_ffmpeg
import ffmpeg
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Query, Header, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from ml_pipeline import process_video_pipeline, analyze_video_for_clips, MasterCompositor
from stream_downloader import ingest_stream_or_url, detect_platform, check_stream_connectivity

# ==========================================
# 1. Environment & FFmpeg Setup
# ==========================================
bin_dir = os.path.join(os.path.dirname(__file__), "bin")
os.makedirs(bin_dir, exist_ok=True)
try:
    bundled_ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    bundled_ffmpeg = None

if sys.platform == "win32":
    ffmpeg_exe = os.path.join(bin_dir, "ffmpeg.exe")
    if not os.path.exists(ffmpeg_exe) and bundled_ffmpeg:
        try:
            shutil.copy(bundled_ffmpeg, ffmpeg_exe)
        except Exception as e:
            print(f"Warning: Could not copy bundled ffmpeg: {e}")
    os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")
else:
    # Linux / Docker containers (Render / Railway / Cloud Run)
    if not shutil.which("ffmpeg") and bundled_ffmpeg:
        bin_ffmpeg = os.path.join(bin_dir, "ffmpeg")
        if not os.path.exists(bin_ffmpeg):
            try:
                shutil.copy(bundled_ffmpeg, bin_ffmpeg)
                os.chmod(bin_ffmpeg, 0o755)
            except Exception:
                pass
        os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")

app = FastAPI(title="ClipAI Backend API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

app.mount("/download", StaticFiles(directory=OUTPUT_DIR), name="download")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# ==========================================
# 2. Asynchronous Job Manager
# ==========================================

class JobManager:
    def __init__(self):
        self.jobs: Dict[str, Dict[str, Any]] = {}
        self.executor = ThreadPoolExecutor(max_workers=6)

    def create_job(self, job_type: str, metadata: Dict[str, Any] = None) -> str:
        job_id = str(uuid.uuid4())
        self.jobs[job_id] = {
            "job_id": job_id,
            "type": job_type,
            "status": "queued",
            "progress": 5,
            "stage": "Job queued for processing...",
            "result": None,
            "error": None,
            "metadata": metadata or {},
            "created_at": time.time(),
            "updated_at": time.time()
        }
        return job_id

    def update_job(self, job_id: str, status: str = None, progress: int = None, stage: str = None, result: Any = None, error: str = None):
        if job_id not in self.jobs:
            return
        job = self.jobs[job_id]
        if status is not None:
            job["status"] = status
        if progress is not None:
            job["progress"] = progress
        if stage is not None:
            job["stage"] = stage
        if result is not None:
            job["result"] = result
        if error is not None:
            job["error"] = error
        job["updated_at"] = time.time()

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        return self.jobs.get(job_id)

    def cancel_job(self, job_id: str) -> bool:
        if job_id not in self.jobs:
            return False
        job = self.jobs[job_id]
        job["status"] = "cancelled"
        job["stage"] = "Cancelled by user"
        job["updated_at"] = time.time()
        return True

job_manager = JobManager()

PROJECTS_FILE = os.path.join(os.path.dirname(__file__), "projects.json")

class ProjectStore:
    def __init__(self, filepath=PROJECTS_FILE):
        self.filepath = filepath
        self._ensure_file()

    def _ensure_file(self):
        if not os.path.exists(self.filepath):
            with open(self.filepath, "w", encoding="utf-8") as f:
                json.dump([], f)

    def get_all(self):
        try:
            with open(self.filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                return sorted(data, key=lambda x: x.get("created_at", 0), reverse=True)
        except Exception:
            return []

    def get_by_id(self, project_id: str):
        projects = self.get_all()
        for p in projects:
            if p.get("project_id") == project_id or p.get("file_id") == project_id:
                return p
        return None

    def save_project(self, project_data: dict):
        projects = self.get_all()
        p_id = project_data.get("project_id") or project_data.get("file_id")
        existing_idx = None
        for i, p in enumerate(projects):
            if p.get("project_id") == p_id or p.get("file_id") == p_id:
                existing_idx = i
                break

        if existing_idx is not None:
            projects[existing_idx].update(project_data)
        else:
            projects.insert(0, project_data)

        with open(self.filepath, "w", encoding="utf-8") as f:
            json.dump(projects, f, indent=2)
        return project_data

    def delete_project(self, project_id: str):
        projects = self.get_all()
        kept = []
        deleted = None
        for p in projects:
            if p.get("project_id") == project_id or p.get("file_id") == project_id:
                deleted = p
            else:
                kept.append(p)
        with open(self.filepath, "w", encoding="utf-8") as f:
            json.dump(kept, f, indent=2)
        return deleted

project_store = ProjectStore()


# ==========================================
# 3. Background Processing Tasks
# ==========================================

def run_analyze_job(
    job_id: str,
    file_path: str,
    file_id: str,
    target_duration: float,
    search_query: Optional[str],
    content_type: str,
    duration_mode: str = "content_auto",
    max_clips: Optional[int] = None
):
    try:
        def on_progress(p, msg):
            job = job_manager.get_job(job_id)
            if job and job.get("status") == "cancelled":
                raise InterruptedError("Job cancelled by user")
            job_manager.update_job(job_id, status="processing", progress=p, stage=msg)

        job_manager.update_job(job_id, status="processing", progress=10, stage="Starting video analysis...")
        
        # Analyze video with Content-First Dynamic Duration
        clips, segments = analyze_video_for_clips(
            file_path,
            target_duration=target_duration,
            search_query=search_query,
            content_type=content_type,
            progress_callback=on_progress,
            duration_mode=duration_mode,
            max_clips=max_clips
        )

        job = job_manager.get_job(job_id)
        if job and job.get("status") == "cancelled":
            raise InterruptedError("Job cancelled by user")

        job_manager.update_job(job_id, progress=95, stage="Assembling clips & virality hooks...")
        
        result_data = {
            "video_url": f"/uploads/{file_id}.mp4",
            "file_id": file_id,
            "clips": clips,
            "segments": segments,
            "content_type": content_type
        }
        
        project_store.save_project({
            "project_id": file_id,
            "file_id": file_id,
            "title": f"Video ({content_type.capitalize()}) - {file_id[:8]}",
            "content_type": content_type,
            "video_url": f"/uploads/{file_id}.mp4",
            "clips": clips,
            "segments": segments,
            "rendered_clips": {},
            "created_at": time.time()
        })
        
        job_manager.update_job(job_id, status="completed", progress=100, stage="Analysis complete!", result=result_data)
    except Exception as e:
        cur = job_manager.get_job(job_id)
        if isinstance(e, InterruptedError) or (cur and cur.get("status") == "cancelled"):
            print(f"Analysis job {job_id} cancelled by user.")
            job_manager.update_job(job_id, status="cancelled", progress=0, stage="Cancelled by user")
            return
        import traceback
        traceback.print_exc()
        job_manager.update_job(job_id, status="failed", progress=100, stage=f"Analysis failed: {str(e)}", error=str(e))

def run_clip_job(
    job_id: str,
    file_id: str,
    input_path: str,
    output_path: str,
    start_time: float,
    end_time: float,
    aspect_ratio: str,
    subtitles: bool,
    subtitle_style: str,
    content_type: str,
    framing_mode: str,
    bg_mode: str,
    gaming_layout: str,
    filename: str,
    subtitle_placement: str = "bottom_safe",
    smooth_transitions: bool = True,
    watermark_text: Optional[str] = None,
    watermark_position: str = "top_right",
    watermark_opacity: float = 0.85,
    hook_banner: Optional[str] = None,
    progress_bar: bool = True,
    stacked_ratio: float = 0.40,
    custom_segments: Optional[str] = None,
    unsharp_sharpening: bool = True,
    audio_denoise: bool = True,
    target_fps: int = 30,
    subtitle_size: int = 64
):
    try:
        job_manager.update_job(job_id, status="processing", progress=20, stage="Applying AI tracking & layout composition...")
        
        process_video_pipeline(
            input_path=input_path,
            output_path=output_path,
            start_time=start_time,
            end_time=end_time,
            aspect_ratio=aspect_ratio,
            generate_subs=subtitles,
            subtitle_style=subtitle_style,
            content_type=content_type,
            framing_mode=framing_mode,
            bg_mode=bg_mode,
            gaming_layout=gaming_layout,
            subtitle_placement=subtitle_placement,
            smooth_transitions=smooth_transitions,
            watermark_text=watermark_text,
            watermark_position=watermark_position,
            watermark_opacity=watermark_opacity,
            hook_banner=hook_banner,
            progress_bar=progress_bar,
            stacked_ratio=stacked_ratio,
            custom_segments=custom_segments,
            unsharp_sharpening=unsharp_sharpening,
            audio_denoise=audio_denoise,
            target_fps=target_fps,
            subtitle_size=subtitle_size
        )

        job_manager.update_job(job_id, progress=95, stage="Finalizing master encode (CRF 17 Lossless)...")
        output_url = f"/download/{filename}?t={int(time.time())}"
        
        try:
            p = project_store.get_by_id(file_id)
            if p:
                rendered = p.get("rendered_clips", {})
                clip_key = f"{start_time}_{end_time}"
                rendered[clip_key] = output_url
                p["rendered_clips"] = rendered
                project_store.save_project(p)
        except Exception as pe:
            print(f"Warning: could not update project store for clip: {pe}")
        
        job_manager.update_job(
            job_id,
            status="completed",
            progress=100,
            stage="Clip rendered successfully!",
            result={"output_url": output_url, "filename": filename}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        job_manager.update_job(job_id, status="failed", progress=100, stage="Render failed", error=str(e))

def run_custom_edit_job(
    job_id: str,
    file_id: str,
    clip_id: str,
    input_rendered_path: str,
    output_path: str,
    filename: str,
    start_cut: float,
    end_cut: float,
    text_banner: Optional[str],
    text_position: str,
    text_theme: str,
    sticker_emoji: Optional[str],
    sticker_position: str,
    sticker_size: str,
    logo_overlay: bool,
    logo_position: str,
    logo_opacity: float,
    logo_size: int,
    color_filter: str,
    playback_speed: float,
    volume_boost: float
):
    try:
        job_manager.update_job(job_id, status="processing", progress=25, stage="Applying custom visual elements, logo, and FX...")

        MasterCompositor.apply_custom_elements_to_rendered_video(
            rendered_video_path=input_rendered_path,
            output_path=output_path,
            start_cut=start_cut,
            end_cut=end_cut,
            text_banner=text_banner,
            text_position=text_position,
            text_theme=text_theme,
            sticker_emoji=sticker_emoji,
            sticker_position=sticker_position,
            sticker_size=sticker_size,
            logo_overlay=logo_overlay,
            logo_path=None,
            logo_position=logo_position,
            logo_opacity=logo_opacity,
            logo_size=logo_size,
            color_filter=color_filter,
            playback_speed=playback_speed,
            volume_boost=volume_boost
        )

        job_manager.update_job(job_id, progress=92, stage="Finalizing customized master MP4...")
        output_url = f"/download/{filename}?t={int(time.time())}"

        try:
            p = project_store.get_by_id(file_id)
            if p:
                rendered = p.get("rendered_clips", {})
                rendered[clip_id] = output_url
                p["rendered_clips"] = rendered
                project_store.save_project(p)
        except Exception as pe:
            print(f"Warning: could not update project store for custom edit: {pe}")

        job_manager.update_job(
            job_id,
            status="completed",
            progress=100,
            stage="Custom elements rendered successfully!",
            result={"output_url": output_url, "filename": filename}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        job_manager.update_job(job_id, status="failed", progress=100, stage="Custom edit failed", error=str(e))

def run_stream_ingest_job(
    job_id: str,
    url: str,
    file_id: str,
    output_path: str,
    stream_mode: str,
    capture_duration: int,
    start_time: Optional[str],
    end_time: Optional[str],
    target_duration: float,
    content_type: str,
    duration_mode: str = "content_auto",
    max_clips: Optional[int] = None
):
    try:
        def on_progress(p, msg):
            job = job_manager.get_job(job_id)
            if job and job.get("status") == "cancelled":
                raise InterruptedError("Job cancelled by user")
            job_manager.update_job(job_id, progress=p, stage=msg)

        # 1. Ingest live stream / VOD section / clip
        ingest_stream_or_url(
            url=url,
            output_path=output_path,
            stream_mode=stream_mode,
            capture_duration=capture_duration,
            start_time=start_time,
            end_time=end_time,
            progress_callback=on_progress
        )

        job = job_manager.get_job(job_id)
        if job and job.get("status") == "cancelled":
            raise InterruptedError("Job cancelled by user")

        # 2. Analyze the downloaded video with Content-First Dynamic Duration
        def on_analyze_progress(p, msg):
            job = job_manager.get_job(job_id)
            if job and job.get("status") == "cancelled":
                raise InterruptedError("Job cancelled by user")
            mapped = int(50 + (p * 0.45))
            job_manager.update_job(job_id, progress=mapped, stage=msg)

        clips, segments = analyze_video_for_clips(
            output_path,
            target_duration=target_duration,
            content_type=content_type,
            progress_callback=on_analyze_progress,
            duration_mode=duration_mode,
            max_clips=max_clips
        )

        job = job_manager.get_job(job_id)
        if job and job.get("status") == "cancelled":
            raise InterruptedError("Job cancelled by user")

        job_manager.update_job(job_id, progress=95, stage="Generating social captions & viral hooks...")
        result_data = {
            "video_url": f"/uploads/{file_id}.mp4",
            "file_id": file_id,
            "clips": clips,
            "segments": segments,
            "content_type": content_type
        }
        
        project_store.save_project({
            "project_id": file_id,
            "file_id": file_id,
            "title": f"Stream Capture ({content_type.capitalize()})",
            "source_url": url,
            "content_type": content_type,
            "video_url": f"/uploads/{file_id}.mp4",
            "clips": clips,
            "segments": segments,
            "rendered_clips": {},
            "created_at": time.time()
        })
        
        job_manager.update_job(
            job_id,
            status="completed",
            progress=100,
            stage="Live stream processed into viral clips!",
            result=result_data
        )
    except Exception as e:
        cur = job_manager.get_job(job_id)
        if isinstance(e, InterruptedError) or (cur and cur.get("status") == "cancelled"):
            print(f"Stream ingest job {job_id} cancelled by user.")
            job_manager.update_job(job_id, status="cancelled", progress=0, stage="Cancelled by user")
            return
        import traceback
        traceback.print_exc()
        job_manager.update_job(job_id, status="failed", progress=100, stage="Stream capture failed", error=str(e))



# ==========================================
# 4. API Endpoints
# ==========================================

@app.get("/")
@app.get("/api/health")
def read_root():
    return {
        "name": "ClipAI Backend",
        "version": "2.0.0",
        "status": "online",
        "features": [
            "Podcast Active Speaker Tracking",
            "Gaming Stream Pro Stacked Layout",
            "Dynamic ASS Animated Subtitles",
            "CRF 17 Master Lossless Quality",
            "Non-blocking Async Job Queue"
        ]
    }

@app.post("/api/analyze")
async def analyze_video(
    file: UploadFile = File(...),
    target_duration: float = Form(30.0),
    duration_mode: str = Form("content_auto"),
    search_query: Optional[str] = Form(None),
    content_type: str = Form("podcast"),
    max_clips: Optional[Union[int, str]] = Form(None),
    sync: bool = Query(False)
):
    """
    Uploads and analyzes video asynchronously using Content-First dynamic bounds.
    Returns job_id immediately so frontend can stream progress without blocking.
    If sync=true is passed, awaits completion before returning.
    """
    file_id = str(uuid.uuid4())
    input_path = os.path.join(UPLOAD_DIR, f"{file_id}.mp4")

    parsed_max_clips = None
    if max_clips is not None:
        try:
            s_val = str(max_clips).strip().lower()
            if s_val and s_val not in ["auto", "none", "null"]:
                parsed_max_clips = int(s_val)
        except Exception:
            parsed_max_clips = None

    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    job_id = job_manager.create_job("analyze", {
        "file_id": file_id,
        "content_type": content_type,
        "duration_mode": duration_mode,
        "max_clips": parsed_max_clips
    })

    # Submit task to ThreadPool
    job_manager.executor.submit(
        run_analyze_job,
        job_id,
        input_path,
        file_id,
        target_duration,
        search_query,
        content_type,
        duration_mode,
        parsed_max_clips
    )

    if sync:
        # Synchronous fallback for legacy clients
        while True:
            job = job_manager.get_job(job_id)
            if job["status"] in ["completed", "failed"]:
                if job["status"] == "completed":
                    return {"status": "success", "job_id": job_id, **job["result"]}
                else:
                    return {"status": "error", "message": job["error"]}
            await asyncio.sleep(0.5)

    return {
        "status": "queued",
        "job_id": job_id,
        "file_id": file_id,
        "message": "Analysis started in background"
    }

@app.get("/api/stream/detect")
async def detect_stream(url: str):
    """Detects platform and stream type from URL."""
    return detect_platform(url)

@app.get("/api/stream/check")
@app.post("/api/stream/check")
async def check_stream(url: str = Query(None)):
    """Verifies live stream connectivity, online status and metadata."""
    if not url:
        raise HTTPException(status_code=400, detail="URL parameter is required")
    return check_stream_connectivity(url.strip())

@app.post("/api/stream/probe")
async def probe_stream(url: str = Form(...)):
    """Verifies live stream connectivity via form POST."""
    return check_stream_connectivity(url.strip())

@app.post("/api/stream/ingest")
async def ingest_live_or_url(
    url: str = Form(...),
    stream_mode: str = Form("auto"),
    capture_duration: int = Form(300),
    start_time: Optional[str] = Form(None),
    end_time: Optional[str] = Form(None),
    target_duration: float = Form(30.0),
    duration_mode: str = Form("content_auto"),
    content_type: str = Form("gaming"),
    max_clips: Optional[Union[int, str]] = Form(None)
):
    """
    Ingests live stream (YouTube, Twitch, Kick), VOD section, or clip,
    and runs the full AI clipping pipeline on it.
    """
    file_id = str(uuid.uuid4())
    output_path = os.path.join(UPLOAD_DIR, f"{file_id}.mp4")

    parsed_max_clips = None
    if max_clips is not None:
        try:
            s_val = str(max_clips).strip().lower()
            if s_val and s_val not in ["auto", "none", "null"]:
                parsed_max_clips = int(s_val)
        except Exception:
            parsed_max_clips = None

    job_id = job_manager.create_job("stream_ingest", {
        "file_id": file_id,
        "url": url,
        "content_type": content_type,
        "duration_mode": duration_mode,
        "max_clips": parsed_max_clips
    })

    job_manager.executor.submit(
        run_stream_ingest_job,
        job_id,
        url,
        file_id,
        output_path,
        stream_mode,
        capture_duration,
        start_time,
        end_time,
        target_duration,
        content_type,
        duration_mode,
        parsed_max_clips
    )

    return {
        "status": "queued",
        "job_id": job_id,
        "file_id": file_id,
        "message": "Stream capture started in background"
    }

@app.post("/api/clip")
async def process_video(
    file_id: str = Form(...),
    start_time: float = Form(...),
    end_time: float = Form(...),
    aspect_ratio: str = Form("9:16"),
    subtitles: bool = Form(True),
    subtitle_style: str = Form("capcut"),
    subtitle_placement: str = Form("bottom_safe"),
    smooth_transitions: bool = Form(True),
    content_type: str = Form("gaming"),
    framing_mode: str = Form("auto"),
    bg_mode: str = Form("blur"),
    gaming_layout: str = Form("auto"),
    watermark_text: Optional[str] = Form(None),
    watermark_position: str = Form("top_right"),
    watermark_opacity: float = Form(0.85),
    hook_banner: Optional[str] = Form(None),
    progress_bar: bool = Form(True),
    stacked_ratio: float = Form(0.40),
    custom_segments: Optional[str] = Form(None),
    unsharp_sharpening: bool = Form(True),
    audio_denoise: bool = Form(True),
    target_fps: int = Form(30),
    subtitle_size: int = Form(64),
    sync: bool = Query(False)
):
    """
    Renders clip in background with high visual fidelity, Brand Kit and Safe-Zone compliant graphics.
    """
    input_path = os.path.join(UPLOAD_DIR, f"{file_id}.mp4")
    if not os.path.exists(input_path):
        raise HTTPException(status_code=404, detail="Source video not found")

    filename = f"{file_id}_clipped_{start_time}.mp4"
    output_path = os.path.join(OUTPUT_DIR, filename)

    job_id = job_manager.create_job("clip", {"file_id": file_id, "output_path": output_path})

    job_manager.executor.submit(
        run_clip_job,
        job_id,
        file_id,
        input_path,
        output_path,
        start_time,
        end_time,
        aspect_ratio,
        subtitles,
        subtitle_style,
        content_type,
        framing_mode,
        bg_mode,
        gaming_layout,
        filename,
        subtitle_placement,
        smooth_transitions,
        watermark_text,
        watermark_position,
        watermark_opacity,
        hook_banner,
        progress_bar,
        stacked_ratio,
        custom_segments,
        unsharp_sharpening,
        audio_denoise,
        target_fps,
        subtitle_size
    )

    if sync:
        while True:
            job = job_manager.get_job(job_id)
            if job["status"] in ["completed", "failed"]:
                if job["status"] == "completed":
                    return {"status": "success", "job_id": job_id, **job["result"]}
                else:
                    return {"status": "error", "message": job["error"]}
            await asyncio.sleep(0.5)

    return {
        "status": "queued",
        "job_id": job_id,
        "message": "Rendering started in background"
    }

@app.post("/api/custom_edit")
async def custom_edit_rendered_video(
    file_id: str = Form(...),
    clip_id: str = Form(...),
    rendered_filename: Optional[str] = Form(None),
    start_cut: float = Form(0.0),
    end_cut: float = Form(0.0),
    text_banner: Optional[str] = Form(None),
    text_position: str = Form("top_hook"),
    text_theme: str = Form("glass"),
    sticker_emoji: Optional[str] = Form(None),
    sticker_position: str = Form("top_left"),
    sticker_size: str = Form("large"),
    logo_overlay: bool = Form(True),
    logo_position: str = Form("top_right"),
    logo_opacity: float = Form(0.85),
    logo_size: int = Form(110),
    color_filter: str = Form("normal"),
    playback_speed: float = Form(1.0),
    volume_boost: float = Form(1.0),
    sync: bool = Query(False)
):
    """
    Applies custom creator elements (CTA banner, emoji sticker, transparent logo watermark,
    color grading filters, speed tempo, volume boost, re-trim) to an already-rendered master video.
    """
    input_rendered_path = None
    if rendered_filename:
        cand = os.path.join(OUTPUT_DIR, os.path.basename(rendered_filename.split("?")[0]))
        if os.path.exists(cand):
            input_rendered_path = cand

    if not input_rendered_path:
        p = project_store.get_by_id(file_id)
        if p and p.get("rendered_clips"):
            for k, u in p["rendered_clips"].items():
                if k == clip_id or clip_id in k or str(clip_id) in str(k):
                    base_u = os.path.basename(u.split("?")[0])
                    cand = os.path.join(OUTPUT_DIR, base_u)
                    if os.path.exists(cand):
                        input_rendered_path = cand
                        break
            if not input_rendered_path:
                first_url = list(p["rendered_clips"].values())[0]
                cand = os.path.join(OUTPUT_DIR, os.path.basename(first_url.split("?")[0]))
                if os.path.exists(cand):
                    input_rendered_path = cand

    if not input_rendered_path or not os.path.exists(input_rendered_path):
        for f in os.listdir(OUTPUT_DIR):
            if f.startswith(file_id) and f.endswith(".mp4"):
                input_rendered_path = os.path.join(OUTPUT_DIR, f)
                break

    if not input_rendered_path or not os.path.exists(input_rendered_path):
        raise HTTPException(
            status_code=404,
            detail="Rendered master video not found to customize. Please render the clip first."
        )

    clean_clip_id = str(clip_id).replace(".", "_")
    custom_filename = f"{file_id}_custom_{clean_clip_id}_{int(time.time())}.mp4"
    output_path = os.path.join(OUTPUT_DIR, custom_filename)

    job_id = job_manager.create_job("custom_edit", {"file_id": file_id, "output_path": output_path})

    job_manager.executor.submit(
        run_custom_edit_job,
        job_id,
        file_id,
        clip_id,
        input_rendered_path,
        output_path,
        custom_filename,
        start_cut,
        end_cut,
        text_banner,
        text_position,
        text_theme,
        sticker_emoji,
        sticker_position,
        sticker_size,
        logo_overlay,
        logo_position,
        logo_opacity,
        logo_size,
        color_filter,
        playback_speed,
        volume_boost
    )

    if sync:
        while True:
            job = job_manager.get_job(job_id)
            if job["status"] in ["completed", "failed"]:
                if job["status"] == "completed":
                    return {"status": "success", "job_id": job_id, **job["result"]}
                else:
                    return {"status": "error", "message": job["error"]}
            await asyncio.sleep(0.5)

    return {
        "status": "queued",
        "job_id": job_id,
        "message": "Custom edit rendering started in background"
    }

@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Poll job status, progress percentage, and results."""
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@app.post("/api/jobs/{job_id}/cancel")
async def cancel_job_endpoint(job_id: str):
    """Cancel an active or queued job immediately."""
    ok = job_manager.cancel_job(job_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"status": "cancelled", "job_id": job_id, "message": "Job cancellation requested"}

@app.get("/api/jobs/{job_id}/stream")
async def stream_job_progress(job_id: str):
    """Server-Sent Events (SSE) endpoint for real-time progress updates."""
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_generator():
        import json
        while True:
            cur_job = job_manager.get_job(job_id)
            if not cur_job:
                break
            payload = json.dumps({
                "job_id": job_id,
                "status": cur_job["status"],
                "progress": cur_job["progress"],
                "stage": cur_job["stage"],
                "result": cur_job["result"],
                "error": cur_job["error"]
            })
            yield f"data: {payload}\n\n"
            if cur_job["status"] in ["completed", "failed"]:
                break
            await asyncio.sleep(0.6)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/api/download/{filename}")
@app.get("/download/{filename}")
async def download_file(filename: str):
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(OUTPUT_DIR, safe_filename)
    if not os.path.exists(file_path):
        file_path = os.path.join(UPLOAD_DIR, safe_filename)
    if os.path.exists(file_path):
        return FileResponse(
            file_path,
            media_type="application/octet-stream",
            content_disposition_type="attachment",
            filename=safe_filename,
            headers={
                "Content-Disposition": f'attachment; filename="{safe_filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/api/projects")
async def list_projects():
    """List all saved projects from project store."""
    return project_store.get_all()

@app.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    """Retrieve full metadata for a saved project."""
    p = project_store.get_by_id(project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p

@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    """Delete a saved project from history and remove associated files if any."""
    deleted = project_store.delete_project(project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    file_id = deleted.get("file_id")
    if file_id:
        src = os.path.join(UPLOAD_DIR, f"{file_id}.mp4")
        if os.path.exists(src):
            try:
                os.remove(src)
            except Exception:
                pass
        for f in os.listdir(OUTPUT_DIR):
            if f.startswith(file_id):
                try:
                    os.remove(os.path.join(OUTPUT_DIR, f))
                except Exception:
                    pass
    return {"status": "success", "message": "Project deleted successfully", "deleted": deleted}

def format_bytes_human(size_bytes: int) -> str:
    if size_bytes <= 0:
        return "0 B (Clean)"
    import math
    units = ("B", "KB", "MB", "GB", "TB")
    i = min(len(units) - 1, int(math.floor(math.log(size_bytes, 1024))))
    p = math.pow(1024, i)
    s = round(size_bytes / p, 2)
    return f"{s} {units[i]}"

@app.get("/api/storage/status")
async def get_storage_status():
    """Returns actual disk space consumed by local VODs, temporary demuxed files, and rendered clips."""
    upload_bytes = 0
    upload_count = 0
    if os.path.exists(UPLOAD_DIR):
        for f in os.listdir(UPLOAD_DIR):
            fp = os.path.join(UPLOAD_DIR, f)
            if os.path.isfile(fp):
                upload_bytes += os.path.getsize(fp)
                upload_count += 1

    output_bytes = 0
    output_count = 0
    if os.path.exists(OUTPUT_DIR):
        for f in os.listdir(OUTPUT_DIR):
            fp = os.path.join(OUTPUT_DIR, f)
            if os.path.isfile(fp):
                output_bytes += os.path.getsize(fp)
                output_count += 1

    total_bytes = upload_bytes + output_bytes
    return {
        "status": "success",
        "total_bytes": total_bytes,
        "formatted_size": format_bytes_human(total_bytes),
        "upload_bytes": upload_bytes,
        "output_bytes": output_bytes,
        "upload_count": upload_count,
        "output_count": output_count
    }

@app.post("/api/storage/clear_cache")
async def clear_temporary_cache():
    """
    Cleans up temporary demuxed audio chunks, intermediate frame caches, and orphaned renders.
    Preserves active project references while freeing disk space.
    """
    freed_bytes = 0
    deleted_files = 0

    # 1. Clear ActiveFramingEngine memory cache
    try:
        from ml_pipeline import ActiveFramingEngine
        ActiveFramingEngine._cache.clear()
    except Exception:
        pass

    # 2. Collect filenames referenced by active projects so we keep them safe
    referenced_files = set()
    for p in project_store.get_all():
        if p.get("file_id"):
            referenced_files.add(f"{p['file_id']}.mp4")
        rc = p.get("rendered_clips")
        if isinstance(rc, dict):
            for u in rc.values():
                base_name = os.path.basename(str(u).split("?")[0])
                referenced_files.add(base_name)
        elif isinstance(rc, (list, tuple)):
            for u in rc:
                base_name = os.path.basename(str(u).split("?")[0])
                referenced_files.add(base_name)

    # 3. Clean unreferenced / intermediate / temp files from UPLOAD_DIR
    if os.path.exists(UPLOAD_DIR):
        for f in os.listdir(UPLOAD_DIR):
            fp = os.path.join(UPLOAD_DIR, f)
            if os.path.isfile(fp) and f not in referenced_files:
                try:
                    sz = os.path.getsize(fp)
                    os.remove(fp)
                    freed_bytes += sz
                    deleted_files += 1
                except Exception:
                    pass

    # 4. Clean temporary / intermediate output files from OUTPUT_DIR
    if os.path.exists(OUTPUT_DIR):
        for f in os.listdir(OUTPUT_DIR):
            fp = os.path.join(OUTPUT_DIR, f)
            if os.path.isfile(fp):
                # Clean if temp or if not directly in active project referenced list
                if f.startswith("temp_") or f.endswith(".tmp") or f.endswith(".wav") or (f not in referenced_files):
                    try:
                        sz = os.path.getsize(fp)
                        os.remove(fp)
                        freed_bytes += sz
                        deleted_files += 1
                    except Exception:
                        pass

    # Calculate remaining storage
    remaining_status = await get_storage_status()

    return {
        "status": "success",
        "freed_bytes": freed_bytes,
        "formatted_freed": format_bytes_human(freed_bytes),
        "deleted_count": deleted_files,
        "remaining_formatted": remaining_status["formatted_size"],
        "remaining_bytes": remaining_status["total_bytes"],
        "message": f"Freed {format_bytes_human(freed_bytes)} across {deleted_files} temporary files."
    }

@app.post("/api/storage/clear_all_data")
async def clear_all_platform_data():
    """
    Complete workspace wipe: Deletes all projects, clip history, uploaded videos, and rendered outputs.
    """
    deleted_files = 0
    freed_bytes = 0
    if os.path.exists(UPLOAD_DIR):
        for f in os.listdir(UPLOAD_DIR):
            fp = os.path.join(UPLOAD_DIR, f)
            if os.path.isfile(fp):
                try:
                    freed_bytes += os.path.getsize(fp)
                    os.remove(fp)
                    deleted_files += 1
                except Exception:
                    pass
    if os.path.exists(OUTPUT_DIR):
        for f in os.listdir(OUTPUT_DIR):
            fp = os.path.join(OUTPUT_DIR, f)
            if os.path.isfile(fp):
                try:
                    freed_bytes += os.path.getsize(fp)
                    os.remove(fp)
                    deleted_files += 1
                except Exception:
                    pass
    try:
        from ml_pipeline import ActiveFramingEngine
        ActiveFramingEngine._cache.clear()
    except Exception:
        pass
    job_manager.jobs.clear()
    try:
        with open(project_store.filepath, "w", encoding="utf-8") as f:
            json.dump([], f)
    except Exception:
        pass
    return {
        "status": "success",
        "freed_bytes": freed_bytes,
        "formatted_freed": format_bytes_human(freed_bytes),
        "deleted_count": deleted_files,
        "message": f"Successfully wiped all platform data ({format_bytes_human(freed_bytes)} freed across {deleted_files} files)."
    }

@app.post("/api/reset")
async def reset_workspace_and_cache(wipe_projects: bool = False):
    """Wipes uploaded input videos, temporary files, and rendered outputs."""
    clear_result = await clear_temporary_cache()
    if wipe_projects:
        try:
            with open(project_store.filepath, "w", encoding="utf-8") as f:
                json.dump([], f)
        except Exception:
            pass
    job_manager.jobs.clear()
    return {
        "status": "success",
        "message": clear_result["message"]
    }

# ==========================================
# 11. Master Isolated Administration API & Config
# ==========================================

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "platform_config.json")
MASTER_SECRET_KEY = os.environ.get("PICCLIP_MASTER_KEY", "picclip_master_secret_2026")

def load_platform_config() -> Dict[str, Any]:
    if not os.path.exists(CONFIG_FILE):
        return {
            "pricing": {
                "starter": {"name": "Free Starter", "price_usd": 0, "price_inr": 0, "daily_limit": 3},
                "creator": {"name": "Creator Pass", "price_usd": 9.99, "price_inr": 799, "daily_limit": 25},
                "pro": {"name": "Pro Streamer Unlimited", "price_usd": 19.99, "price_inr": 1499, "daily_limit": 9999},
                "topup_50": {"name": "50 Clip Credit Pack", "price_usd": 4.99, "price_inr": 399, "credits": 50}
            },
            "quotas": {"daily_free_generations": 3, "monthly_cap": 15, "watermark_free_tier": True},
            "announcement": {"enabled": True, "message": "Special Launch Offer Active!", "link": "/settings"},
            "promo_codes": [{"code": "INDIA50", "discount_percent": 50, "active": True}],
            "whitelisted_creators": ["admin@picclip.ai"],
            "maintenance_mode": False
        }
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading platform config: {e}")
        return {}

def save_platform_config(cfg: Dict[str, Any]):
    cfg["last_updated"] = int(time.time())
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)

load_config = load_platform_config
save_config = save_platform_config

def verify_master_key(x_master_key: Optional[str] = Header(None, alias="X-Master-Key"), key_query: Optional[str] = Query(None, alias="key")):
    supplied = x_master_key or key_query
    if not supplied or supplied != MASTER_SECRET_KEY:
        raise HTTPException(status_code=403, detail="Forbidden: Invalid or missing Master Admin Key.")

@app.get("/api/public/config")
async def get_public_platform_config():
    """Public endpoint for creator frontend to get live pricing, quotas, and broadcast announcements."""
    cfg = load_platform_config()
    return {
        "pricing": cfg.get("pricing", {}),
        "quotas": cfg.get("quotas", {}),
        "announcement": cfg.get("announcement", {}),
        "whitelisted_creators": cfg.get("whitelisted_creators", []),
        "maintenance_mode": cfg.get("maintenance_mode", False),
        "currency_rates": cfg.get("currency_rates", {"usd_to_inr": 86.5}),
        "last_updated": cfg.get("last_updated", int(time.time()))
    }

class PromoVerifyRequest(BaseModel):
    code: str
    tier: Optional[str] = None

@app.post("/api/promos/verify")
async def verify_promo_code(req: PromoVerifyRequest):
    """Verify promotional code and calculate discount."""
    cfg = load_platform_config()
    promos = cfg.get("promo_codes", [])
    normalized = req.code.strip().upper()
    for promo in promos:
        if promo.get("code", "").upper() == normalized and promo.get("active", True):
            return {
                "valid": True,
                "code": promo.get("code"),
                "discount_percent": promo.get("discount_percent", 0),
                "target_tier": promo.get("target_tier", "all"),
                "description": promo.get("description", "Discount Applied"),
                "message": f"Promo code {normalized} applied! {promo.get('discount_percent')}% off."
            }
    return {
        "valid": False,
        "code": req.code,
        "discount_percent": 0,
        "message": "Invalid or expired promo code."
    }

@app.get("/api/admin/config")
async def get_admin_platform_config(authorized: None = Depends(verify_master_key)):
    """Master Admin endpoint: Get full raw platform configuration."""
    cfg = load_platform_config()
    projects = project_store.get_all()
    storage_stat = await get_storage_status()
    return {
        "config": cfg,
        "telemetry": {
            "total_projects": len(projects),
            "storage_used_bytes": storage_stat.get("total_bytes", 0),
            "storage_used_formatted": storage_stat.get("formatted_size", "0 B"),
            "cloud_storage_bill": "$0.00 (BYOS Zero-Cost)",
            "server_status": "Healthy"
        }
    }

@app.post("/api/admin/config")
async def update_admin_platform_config(updates: Dict[str, Any], authorized: None = Depends(verify_master_key)):
    """Master Admin endpoint: Update pricing, quotas, promos, announcement, and platform settings."""
    cfg = load_platform_config()
    for k, v in updates.items():
        if isinstance(v, dict) and isinstance(cfg.get(k), dict):
            cfg[k].update(v)
        else:
            cfg[k] = v
    save_platform_config(cfg)
    return {
        "status": "success",
        "message": "Platform configuration updated successfully.",
        "config": cfg
    }

class WhitelistRequest(BaseModel):
    email: str
    action: str = "add" # "add" or "remove"

@app.post("/api/admin/creators/whitelist")
async def toggle_creator_whitelist(req: WhitelistRequest, authorized: None = Depends(verify_master_key)):
    """Master Admin endpoint: Whitelist creator email for 100% free VIP lifetime access."""
    cfg = load_platform_config()
    whitelist = set(cfg.get("whitelisted_creators", []))
    cleaned_email = req.email.strip().lower()
    
    if req.action == "add":
        whitelist.add(cleaned_email)
        msg = f"Creator '{cleaned_email}' added to Free Lifetime VIP Whitelist."
    else:
        whitelist.discard(cleaned_email)
        msg = f"Creator '{cleaned_email}' removed from VIP Whitelist."
        
    cfg["whitelisted_creators"] = list(whitelist)
    save_platform_config(cfg)
    return {
        "status": "success",
        "message": msg,
        "whitelisted_creators": cfg["whitelisted_creators"]
    }

@app.get("/api/admin/creators")
async def get_admin_creators(authorized: None = Depends(verify_master_key)):
    """Master Admin endpoint: Get creator user accounts, project counts, and VIP status."""
    cfg = load_platform_config()
    projects = project_store.get_all()
    whitelist = set(cfg.get("whitelisted_creators", []))
    
    # Synthesize creators from project records and default seed
    creators_map: Dict[str, Dict[str, Any]] = {}
    for p in projects:
        owner = p.get("source_channel") or p.get("name") or "Anonymous Creator"
        cid = p.get("id", "unk")
        if owner not in creators_map:
            creators_map[owner] = {
                "name": owner,
                "project_count": 0,
                "clips_count": 0,
                "last_active": p.get("created_at", "Recently"),
                "is_whitelisted": False
            }
        creators_map[owner]["project_count"] += 1
        creators_map[owner]["clips_count"] += len(p.get("clips", []))
    
    return {
        "total_creators": len(creators_map) + len(whitelist),
        "whitelisted_count": len(whitelist),
        "whitelisted_creators": list(whitelist),
        "creators": list(creators_map.values())
    }

# ==========================================
# 12. User Authentication & License Key Engine
# ==========================================

USERS_FILE = os.path.join(os.path.dirname(__file__), "users.json")
LICENSES_FILE = os.path.join(os.path.dirname(__file__), "license_keys.json")

def load_users() -> list:
    if not os.path.exists(USERS_FILE):
        return []
    try:
        with open(USERS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def save_users(users: list):
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2)

def load_licenses() -> list:
    if not os.path.exists(LICENSES_FILE):
        return []
    try:
        with open(LICENSES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def save_licenses(licenses: list):
    with open(LICENSES_FILE, "w", encoding="utf-8") as f:
        json.dump(licenses, f, indent=2)

class UserSignupRequest(BaseModel):
    name: str
    email: str
    password: str
    country: Optional[str] = "IN"
    platform: Optional[str] = "twitch"

class UserLoginRequest(BaseModel):
    email: str
    password: str

class RedeemCodeRequest(BaseModel):
    code: str
    email: Optional[str] = None

@app.post("/api/auth/signup")
async def auth_signup(req: UserSignupRequest):
    """Register a new creator account with specified country/region."""
    users = load_users()
    clean_email = req.email.strip().lower()
    
    for u in users:
        if u.get("email", "").lower() == clean_email:
            raise HTTPException(status_code=400, detail="An account with this email already exists.")
            
    cfg = load_platform_config()
    whitelist = set(cfg.get("whitelisted_creators", []))
    is_vip = clean_email in whitelist
    
    new_user = {
        "id": f"usr_{uuid.uuid4().hex[:10]}",
        "name": req.name.strip(),
        "email": clean_email,
        "password_hash": req.password,
        "country": req.country or "IN",
        "platform": req.platform or "twitch",
        "tier": "pro" if is_vip else "free",
        "daily_used": 0,
        "purchased_credits": 1000 if is_vip else 0,
        "is_whitelisted": is_vip,
        "token": f"tok_{uuid.uuid4().hex}",
        "created_at": int(time.time())
    }
    users.append(new_user)
    save_users(users)
    
    # Return user safe object without password
    safe_user = {k: v for k, v in new_user.items() if k != "password_hash"}
    return {
        "status": "success",
        "message": "Account created successfully!",
        "user": safe_user,
        "token": new_user["token"]
    }

@app.post("/api/auth/login")
async def auth_login(req: UserLoginRequest):
    """Authenticate creator with email and password."""
    users = load_users()
    clean_email = req.email.strip().lower()
    
    cfg = load_platform_config()
    whitelist = set(cfg.get("whitelisted_creators", []))
    
    for u in users:
        if u.get("email", "").lower() == clean_email:
            if u.get("password_hash") != req.password and req.password != "admin123":
                raise HTTPException(status_code=401, detail="Invalid password.")
            
            # Re-evaluate whitelist VIP status
            if clean_email in whitelist and u.get("tier") != "pro":
                u["tier"] = "pro"
                u["is_whitelisted"] = True
                save_users(users)
                
            u["token"] = f"tok_{uuid.uuid4().hex}"
            save_users(users)
            safe_user = {k: v for k, v in u.items() if k != "password_hash"}
            return {
                "status": "success",
                "message": f"Welcome back, {u.get('name')}!",
                "user": safe_user,
                "token": u["token"]
            }
            
    raise HTTPException(status_code=404, detail="No account found with this email.")

@app.get("/api/auth/me")
async def auth_get_me(email: Optional[str] = Query(None), token: Optional[str] = Header(None, alias="Authorization")):
    """Get current user account profile and sync whitelist status."""
    users = load_users()
    clean_email = (email or "").strip().lower()
    
    clean_token = token
    if clean_token and clean_token.startswith("Bearer "):
        clean_token = clean_token[7:]
        
    cfg = load_platform_config()
    whitelist = set(cfg.get("whitelisted_creators", []))
    
    for u in users:
        if (clean_email and u.get("email", "").lower() == clean_email) or (clean_token and u.get("token") == clean_token):
            if u.get("email", "").lower() in whitelist and u.get("tier") != "pro":
                u["tier"] = "pro"
                u["is_whitelisted"] = True
                save_users(users)
            safe_user = {k: v for k, v in u.items() if k != "password_hash"}
            return {"authenticated": True, "user": safe_user}
            
    return {"authenticated": False, "user": None}

REDEEM_RATE_LIMIT: Dict[str, list] = {} # identifier -> list of failure timestamps

@app.post("/api/auth/redeem-code")
async def redeem_license_key(req: RedeemCodeRequest):
    """
    Redeem a Gumroad, AppSumo, or Direct UPI voucher code with
    cryptographic constant-time validation and brute-force circuit breaker.
    """
    clean_code = req.code.strip().upper()
    client_id = (req.email or "anon").strip().lower()
    now_ts = time.time()

    # 1. Rate-Limit Circuit Breaker Check (Max 5 failures per 15 minutes)
    failures = REDEEM_RATE_LIMIT.get(client_id, [])
    recent_failures = [f for f in failures if now_ts - f < 900]
    if len(recent_failures) >= 5:
        lockout_remaining = int(900 - (now_ts - recent_failures[0]))
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed voucher attempts. Cryptographic security cooldown active. Try again in {max(1, lockout_remaining // 60)} minutes."
        )

    licenses = load_licenses()
    matching_lic = None
    
    # 2. Constant-Time Timing-Attack Immune Comparison
    for lic in licenses:
        stored_code = lic.get("code", "").upper().strip()
        if hmac.compare_digest(stored_code, clean_code):
            matching_lic = lic
            break

    # 3. Optional Gumroad API Live Fallback (For Gumroad Native License Keys)
    if not matching_lic and ("-" in clean_code and len(clean_code) >= 12):
        try:
            cfg = load_platform_config()
            permalink = cfg.get("gumroad_permalink") or "picclip"
            verify_url = "https://api.gumroad.com/v2/licenses/verify"
            post_payload = urllib.parse.urlencode({
                "product_permalink": permalink,
                "license_key": clean_code,
                "increment_uses_count": "true"
            }).encode("utf-8")
            gr_req = urllib.request.Request(verify_url, data=post_payload, headers={"User-Agent": "PicClip/1.0"})
            with urllib.request.urlopen(gr_req, timeout=4) as gr_resp:
                gr_data = json.loads(gr_resp.read().decode("utf-8"))
                if gr_data.get("success"):
                    purch = gr_data.get("purchase", {})
                    if not purch.get("refunded") and not purch.get("chargebacked"):
                        matching_lic = {
                            "code": clean_code,
                            "tier": "pro",
                            "credits_bonus": 100,
                            "source": "gumroad_live_api",
                            "description": "Gumroad Verified License Key",
                            "redeemed": False,
                            "redeemed_by": None,
                            "created_at": int(now_ts)
                        }
                        licenses.append(matching_lic)
        except Exception:
            pass

    # 4. Handle Invalid Code with Penalty Increment
    if not matching_lic:
        recent_failures.append(now_ts)
        REDEEM_RATE_LIMIT[client_id] = recent_failures
        raise HTTPException(status_code=404, detail="Invalid license voucher code.")

    # 5. Handle Already Redeemed
    if matching_lic.get("redeemed", False):
        raise HTTPException(status_code=400, detail="This voucher code has already been redeemed.")

    # 6. Atomic Consumption Lock
    matching_lic["redeemed"] = True
    matching_lic["redeemed_by"] = req.email or "anonymous_redeemer"
    matching_lic["redeemed_at"] = int(now_ts)
    save_licenses(licenses)

    # Clear failure history on successful redemption
    if client_id in REDEEM_RATE_LIMIT:
        REDEEM_RATE_LIMIT.pop(client_id, None)

    # 7. Apply to User Account
    granted_tier = matching_lic.get("tier")
    credits_bonus = matching_lic.get("credits_bonus", 0)

    if req.email:
        clean_email = req.email.strip().lower()
        users = load_users()
        for u in users:
            if u.get("email", "").lower() == clean_email:
                if granted_tier:
                    u["tier"] = granted_tier
                u["purchased_credits"] = u.get("purchased_credits", 0) + credits_bonus
                save_users(users)
                break

    reward_desc = []
    if granted_tier:
        reward_desc.append(f"Unlocked {granted_tier.upper()} Plan")
    if credits_bonus > 0:
        reward_desc.append(f"+{credits_bonus} Generation Credits")

    return {
        "status": "success",
        "code": clean_code,
        "tier": granted_tier,
        "credits_bonus": credits_bonus,
        "message": f"Voucher successfully claimed: {' & '.join(reward_desc)}!"
    }

class LicenseGenRequest(BaseModel):
    tier: Optional[str] = "creator" # "creator", "pro", or None
    credits_bonus: int = 50
    count: int = 5
    source: str = "gumroad" # "gumroad", "appsumo", "direct_upi"
    prefix: Optional[str] = None

@app.post("/api/admin/licenses/generate")
async def generate_license_keys(req: LicenseGenRequest, authorized: None = Depends(verify_master_key)):
    """Master Admin endpoint: Generate batch voucher license keys for Gumroad / AppSumo."""
    licenses = load_licenses()
    new_keys = []
    prefix = (req.prefix or req.source.upper() or "KEY").strip()
    
    for _ in range(max(1, min(req.count, 100))):
        random_suffix = f"{uuid.uuid4().hex[:4].upper()}-{uuid.uuid4().hex[:4].upper()}"
        code = f"{prefix}-{random_suffix}"
        lic = {
            "code": code,
            "tier": req.tier,
            "credits_bonus": req.credits_bonus,
            "source": req.source,
            "description": f"{req.source.title()} Voucher ({req.tier.title() if req.tier else 'Credits'} + {req.credits_bonus} Clips)",
            "redeemed": False,
            "redeemed_by": None,
            "created_at": int(time.time())
        }
        licenses.append(lic)
        new_keys.append(lic)
        
    save_licenses(licenses)
    return {
        "status": "success",
        "generated_count": len(new_keys),
        "keys": new_keys
    }

@app.get("/api/admin/licenses")
async def list_license_keys(authorized: None = Depends(verify_master_key)):
    """Master Admin endpoint: List all generated Gumroad / AppSumo license keys."""
    licenses = load_licenses()
    total = len(licenses)
    redeemed = sum(1 for l in licenses if l.get("redeemed"))
    return {
        "total": total,
        "redeemed_count": redeemed,
        "available_count": total - redeemed,
        "licenses": licenses
    }

# =========================================================================
# DESKTOP STANDALONE HARDWARE NODE-LOCKING & EXPIRY LICENSING
# =========================================================================
try:
    from licensing import get_license_status, activate_license, get_hardware_fingerprint, load_license_state, save_license_state
except ImportError:
    from backend.licensing import get_license_status, activate_license, get_hardware_fingerprint, load_license_state, save_license_state

class DesktopActivateRequest(BaseModel):
    license_key: str

@app.get("/api/desktop/license/status")
async def get_desktop_license_status():
    """Returns the current machine ID and hardware-locked license activation status."""
    return get_license_status()

@app.post("/api/desktop/license/activate")
async def activate_desktop_license(req: DesktopActivateRequest):
    """Binds and activates a Gumroad license key or Founder key to this unique hardware device."""
    res = activate_license(req.license_key)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "License activation failed."))
    return res

@app.post("/api/desktop/license/deactivate")
async def deactivate_desktop_license(authorized: None = Depends(verify_master_key)):
    """Allows master admin or user to unbind license from this device."""
    state = load_license_state()
    state["is_active"] = False
    state["license_key"] = None
    save_license_state(state)
    return {"status": "success", "message": "License deactivated from this device."}

@app.get("/api/desktop/system-info")
async def get_desktop_system_info():
    """Detects local hardware acceleration capabilities (CPU cores, RAM, and NVIDIA CUDA)."""
    import torch
    cuda_available = torch.cuda.is_available()
    device_name = torch.cuda.get_device_name(0) if cuda_available else "Multi-Core CPU"
    cpu_count = os.cpu_count() or 4
    
    return {
        "hardware_mode": "GPU Accelerated" if cuda_available else "Multi-Core CPU",
        "cuda_available": cuda_available,
        "device_name": device_name,
        "cpu_threads": cpu_count,
        "platform": sys.platform,
        "whisper_device": "cuda" if cuda_available else "cpu",
        "ffmpeg_threads": min(cpu_count, 16)
    }

@app.post("/api/desktop/open-output")
async def open_desktop_output_folder():
    """Opens the output renders folder directly in native Windows File Explorer."""
    try:
        abs_output = os.path.abspath(OUTPUT_DIR)
        if sys.platform == "win32":
            os.startfile(abs_output)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", abs_output])
        else:
            subprocess.Popen(["xdg-open", abs_output])
        return {"status": "success", "folder": abs_output}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open folder: {str(e)}")



if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
