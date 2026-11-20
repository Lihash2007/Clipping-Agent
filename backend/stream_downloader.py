import os
import sys
import time
import json
import subprocess
import re
import imageio_ffmpeg
import yt_dlp

FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()

# Node JS runtime path for yt-dlp
NODE_PATH = r"C:\Program Files\nodejs\node.exe"
if os.path.exists(NODE_PATH):
    node_dir = os.path.dirname(NODE_PATH)
    if node_dir not in os.environ.get("PATH", ""):
        os.environ["PATH"] += os.pathsep + node_dir

def get_streamlink_bin():
    """Returns absolute path to streamlink binary in current environment."""
    venv_bin = os.path.join(os.path.dirname(sys.executable), "streamlink.exe")
    if os.path.exists(venv_bin):
        return venv_bin
    return "streamlink"

def detect_platform(url: str) -> dict:
    """Detects platform and link type from URL."""
    url_lower = url.lower()
    info = {"platform": "unknown", "type": "video", "name": "Video"}

    if "youtube.com" in url_lower or "youtu.be" in url_lower:
        info["platform"] = "youtube"
        if "/live" in url_lower or "@" in url_lower:
            info["type"] = "live"
            info["name"] = "YouTube Live"
        elif "/shorts" in url_lower:
            info["type"] = "clip"
            info["name"] = "YouTube Short"
        else:
            info["type"] = "vod"
            info["name"] = "YouTube Video/VOD"

    elif "twitch.tv" in url_lower:
        info["platform"] = "twitch"
        if "clips.twitch.tv" in url_lower or "/clip/" in url_lower:
            info["type"] = "clip"
            info["name"] = "Twitch Clip"
        elif "/videos/" in url_lower:
            info["type"] = "vod"
            info["name"] = "Twitch VOD"
        else:
            info["type"] = "live"
            info["name"] = "Twitch Live Stream"

    elif "kick.com" in url_lower:
        info["platform"] = "kick"
        if "/video/" in url_lower or "/clip/" in url_lower:
            info["type"] = "clip"
            info["name"] = "Kick Clip/VOD"
        else:
            info["type"] = "live"
            info["name"] = "Kick Live Stream"

    return info

def check_stream_connectivity(url: str) -> dict:
    """
    Checks if a stream URL is reachable, online, live or VOD, and retrieves metadata.
    Supported platforms: Twitch, Kick, YouTube.
    """
    url = url.strip()
    platform_info = detect_platform(url)
    res = {
        "online": False,
        "is_live": False,
        "platform": platform_info["platform"],
        "name": platform_info["name"],
        "title": "",
        "author": "",
        "category": "",
        "qualities": [],
        "hls_url": None,
        "error": None
    }

    streamlink_bin = get_streamlink_bin()

    # 1. Check with Streamlink (fastest & most accurate for Twitch & Kick live streams)
    try:
        cmd = [streamlink_bin, "--json", url]
        proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=12)
        if proc.stdout:
            data = json.loads(proc.stdout)
            if "streams" in data and data["streams"]:
                res["online"] = True
                res["is_live"] = True
                res["platform"] = data.get("plugin", platform_info["platform"])
                meta = data.get("metadata") or {}
                res["author"] = meta.get("author") or meta.get("title") or ""
                res["title"] = meta.get("title") or f"{res['author']} Live Stream"
                res["category"] = meta.get("category") or ""
                res["qualities"] = [q for q in data["streams"].keys() if q not in ["best", "worst"]]
                if "best" in data["streams"] and "url" in data["streams"]["best"]:
                    res["hls_url"] = data["streams"]["best"]["url"]
                return res
            elif "error" in data:
                res["error"] = data["error"]
    except Exception as e:
        res["error"] = str(e)

    # 2. Check with yt-dlp (handles YouTube Live, YouTube VODs, Twitch VODs)
    try:
        ydl_opts = {
            "quiet": True,
            "skip_download": True,
            "no_warnings": True
        }
        if os.path.exists(NODE_PATH):
            ydl_opts["js_runtimes"] = {"node": {"path": NODE_PATH}}

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            yt_info = ydl.extract_info(url, download=False)
            if yt_info:
                res["online"] = True
                res["is_live"] = bool(yt_info.get("is_live") or yt_info.get("live_status") == "is_live")
                res["title"] = yt_info.get("title") or ""
                res["author"] = yt_info.get("uploader") or yt_info.get("channel") or ""
                res["category"] = yt_info.get("categories", [""])[0] if yt_info.get("categories") else ""
                res["error"] = None
                return res
    except Exception as e:
        err_str = str(e)
        if "not currently live" in err_str or "offline" in err_str.lower():
            res["error"] = "Stream is currently offline."
        else:
            res["error"] = err_str

    return res

def ingest_stream_or_url(
    url: str,
    output_path: str,
    stream_mode: str = "auto",
    capture_duration: int = 300,
    start_time: str = None,
    end_time: str = None,
    progress_callback = None
) -> str:
    """
    Ingests video from YouTube, Twitch, or Kick.
    Handles:
    - Live Streams: High-speed native HLS recording for `capture_duration` seconds (default 5 min).
    - VOD Sections: Fast slice download of requested time section (`start_time` - `end_time`).
    - Direct Clips & Finished Videos: Lossless MP4 download.
    """
    url = url.strip()
    platform_info = detect_platform(url)
    print(f"[IngestEngine] Analyzing source: {platform_info['name']} ({url}) - Mode: {stream_mode}, Duration: {capture_duration}s")

    if progress_callback:
        progress_callback(10, f"Testing live connectivity to {platform_info['name']}...")

    work_dir = os.path.dirname(os.path.abspath(output_path))
    os.makedirs(work_dir, exist_ok=True)

    # 1. Check Connectivity & Live Broadcast Status
    conn = check_stream_connectivity(url)
    print(f"[IngestEngine] Connectivity probe result: online={conn['online']}, is_live={conn['is_live']}, title='{conn['title']}'")

    # If user specified start/end time, it is explicitly a VOD slice window
    is_vod_slice = bool(start_time and end_time)

    # ==========================================
    # CASE A: LIVE STREAM RECORDING (Twitch, Kick, YouTube Live)
    # ==========================================
    if not is_vod_slice and (conn["is_live"] or platform_info["type"] == "live" or stream_mode in ["live", "recent"]):
        if not conn["online"] and conn.get("error"):
            # Check if definitely offline
            err = conn["error"]
            if "not currently live" in err.lower() or "offline" in err.lower():
                raise RuntimeError(f"Broadcaster '{conn['author'] or platform_info['name']}' is currently OFFLINE. Please choose a live stream or past VOD.")

        cap_secs = int(capture_duration) if capture_duration and capture_duration > 0 else 300
        if progress_callback:
            stream_label = f"'{conn['title']}'" if conn.get("title") else platform_info["name"]
            progress_callback(18, f"Recording live feed ({cap_secs}s window) from {stream_label}...")

        # Method 1: Direct HLS Stream via FFmpeg (Highest reliability & zero desync)
        recorded = False
        hls_url = conn.get("hls_url")

        if not hls_url:
            # Re-probe streamlink for HLS URL
            streamlink_bin = get_streamlink_bin()
            try:
                cmd = [streamlink_bin, "--json", url]
                p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=12)
                if p.stdout:
                    d = json.loads(p.stdout)
                    if "streams" in d and "best" in d["streams"]:
                        hls_url = d["streams"]["best"]["url"]
            except Exception as e:
                print(f"[IngestEngine] Streamlink HLS query error: {e}")

        if hls_url:
            try:
                print(f"[IngestEngine] Capturing HLS stream via FFmpeg for {cap_secs}s...")
                ff_cmd = [
                    FFMPEG_EXE,
                    "-y",
                    "-i", hls_url,
                    "-t", str(cap_secs),
                    "-c", "copy",
                    "-bsf:a", "aac_adtstoasc",
                    output_path
                ]
                proc = subprocess.run(ff_cmd, capture_output=True, timeout=cap_secs + 35)
                if os.path.exists(output_path) and os.path.getsize(output_path) > 100000:
                    recorded = True
                    print(f"[IngestEngine] HLS Live capture succeeded! File size: {os.path.getsize(output_path)} bytes")
            except Exception as e:
                print(f"[IngestEngine] FFmpeg HLS capture warning: {e}")

        # Method 2: Streamlink stdout pipe fallback
        if not recorded:
            streamlink_bin = get_streamlink_bin()
            try:
                print(f"[IngestEngine] Attempting Streamlink stdout pipe fallback for {cap_secs}s...")
                pipe_cmd = f'"{streamlink_bin}" "{url}" best --stdout | "{FFMPEG_EXE}" -y -i - -t {cap_secs} -c copy -bsf:a aac_adtstoasc "{output_path}"'
                subprocess.run(pipe_cmd, shell=True, timeout=cap_secs + 45)
                if os.path.exists(output_path) and os.path.getsize(output_path) > 100000:
                    recorded = True
                    print(f"[IngestEngine] Streamlink pipe succeeded! Size: {os.path.getsize(output_path)} bytes")
            except Exception as e:
                print(f"[IngestEngine] Streamlink pipe error: {e}")

        # Method 3: yt-dlp live stream capture
        if not recorded:
            print(f"[IngestEngine] Attempting yt-dlp live capture fallback for {cap_secs}s...")
            if progress_callback:
                progress_callback(25, f"Recording live chunks via high-speed backup engine...")
            ydl_opts = {
                "format": "best",
                "outtmpl": output_path,
                "overwrites": True,
                "ffmpeg_location": FFMPEG_EXE,
                "external_downloader": "ffmpeg",
                "external_downloader_args": {"ffmpeg_i": ["-t", str(cap_secs)]},
                "quiet": True,
                "no_warnings": True,
            }
            if os.path.exists(NODE_PATH):
                ydl_opts["js_runtimes"] = {"node": {"path": NODE_PATH}}

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

            if os.path.exists(output_path) and os.path.getsize(output_path) > 50000:
                recorded = True

        if not recorded or not os.path.exists(output_path) or os.path.getsize(output_path) < 10000:
            raise RuntimeError(f"Could not record live stream from {url}. Check if the stream is currently online.")

        if progress_callback:
            progress_callback(40, f"Live stream capture complete ({os.path.getsize(output_path) // 1024} KB)! Initializing AI clipping pipeline...")
        return output_path

    # ==========================================
    # CASE B: STATIC VOD, SECTION, OR CLIP DOWNLOAD
    # ==========================================
    else:
        ydl_opts = {
            "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "merge_output_format": "mp4",
            "outtmpl": output_path,
            "overwrites": True,
            "ffmpeg_location": FFMPEG_EXE,
            "quiet": True,
            "no_warnings": True,
        }
        if os.path.exists(NODE_PATH):
            ydl_opts["js_runtimes"] = {"node": {"path": NODE_PATH}}

        # If user specified a VOD timestamp window (e.g. 00:10:00 to 00:20:00)
        if start_time and end_time:
            if progress_callback:
                progress_callback(25, f"Downloading VOD section [{start_time} - {end_time}]...")
            ydl_opts["download_ranges"] = yt_dlp.utils.download_range_func(None, [(parse_time_str(start_time), parse_time_str(end_time))])
            ydl_opts["force_keyframes_at_cuts"] = True
        elif capture_duration and capture_duration > 0:
            if progress_callback:
                progress_callback(25, f"Downloading video segment (up to {capture_duration}s)...")
            ydl_opts["download_ranges"] = yt_dlp.utils.download_range_func(None, [(0, float(capture_duration))])
            ydl_opts["force_keyframes_at_cuts"] = True
        else:
            if progress_callback:
                progress_callback(25, f"Downloading clip at max quality...")

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
        except Exception as e:
            print(f"[IngestEngine] Range download failed ({e}), attempting standard download...")
            if progress_callback:
                progress_callback(28, "Retrying direct download...")
            ydl_opts.pop("download_ranges", None)
            ydl_opts.pop("force_keyframes_at_cuts", None)
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

        if not os.path.exists(output_path) or os.path.getsize(output_path) < 10000:
            raise RuntimeError(f"Failed to download video from {url}. Verify the link is public and accessible.")

        if progress_callback:
            progress_callback(40, f"Download complete ({os.path.getsize(output_path) // 1024} KB)! Initializing AI clipping pipeline...")
        return output_path

def parse_time_str(t_str: str) -> float:
    """Parses 'HH:MM:SS' or 'MM:SS' or seconds string into float seconds."""
    if not t_str:
        return 0.0
    parts = str(t_str).strip().split(":")
    if len(parts) == 3:
        return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
    elif len(parts) == 2:
        return float(parts[0]) * 60 + float(parts[1])
    else:
        return float(parts[0])
