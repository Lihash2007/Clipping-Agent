import shutil
import os
import uuid
import imageio_ffmpeg
import ffmpeg
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import Optional
from ml_pipeline import process_video_pipeline, analyze_video_for_clips

# Setup a proper ffmpeg.exe in the PATH
bin_dir = os.path.join(os.path.dirname(__file__), "bin")
os.makedirs(bin_dir, exist_ok=True)
bundled_ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
ffmpeg_exe = os.path.join(bin_dir, "ffmpeg.exe")
if not os.path.exists(ffmpeg_exe):
    shutil.copy(bundled_ffmpeg, ffmpeg_exe)
os.environ["PATH"] = bin_dir + os.pathsep + os.environ["PATH"]

app = FastAPI()

# Allow frontend to access API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve generated videos and original uploads
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

app.mount("/download", StaticFiles(directory=OUTPUT_DIR), name="download")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

@app.get("/")
def read_root():
    return {"status": "Backend is running"}

@app.post("/api/analyze")
async def analyze_video(
    file: UploadFile = File(...),
    target_duration: float = Form(30.0),
    search_query: Optional[str] = Form(None),
    content_type: str = Form("podcast")
):
    """Analyzes a video, generating transcripts and finding multiple clips."""
    file_id = str(uuid.uuid4())
    input_path = os.path.join(UPLOAD_DIR, f"{file_id}.mp4")
    
    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        clips, segments = analyze_video_for_clips(input_path, target_duration, search_query, content_type)
        return {
            "status": "success",
            "video_url": f"/uploads/{file_id}.mp4",
            "file_id": file_id,
            "clips": clips,
            "segments": segments
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/clip")
async def process_video(
    file_id: str = Form(...),
    start_time: float = Form(...),
    end_time: float = Form(...),
    aspect_ratio: str = Form("1:1"),
    subtitles: bool = Form(False),
    subtitle_style: str = Form("yellow"),
    content_type: str = Form("podcast"),
    framing_mode: str = Form("smart")
):
    input_path = os.path.join(UPLOAD_DIR, f"{file_id}.mp4")
    if not os.path.exists(input_path):
        return {"status": "error", "message": "Original video not found."}
        
    output_path = os.path.join(OUTPUT_DIR, f"{file_id}_clipped_{start_time}.mp4")
    
    try:
        process_video_pipeline(input_path, output_path, start_time, end_time, aspect_ratio, subtitles, subtitle_style, content_type, framing_mode)
        
        import time
        return {
            "status": "success", 
            "message": "Video processed successfully",
            "output_url": f"/download/{file_id}_clipped_{start_time}.mp4?t={int(time.time())}"
        }
    except ffmpeg.Error as e:
        error_msg = e.stderr.decode('utf-8') if e.stderr else str(e)
        print(f"FFmpeg Error:\n{error_msg}")
        return {"status": "error", "message": f"FFmpeg error: {error_msg}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/download/{filename}")
async def download_file(filename: str):
    from fastapi.responses import FileResponse
    file_path = os.path.join(OUTPUT_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return {"status": "error", "message": "File not found"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
