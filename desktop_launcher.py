"""
PicClip Studio Pro - Desktop Native Launcher
Starts the embedded high-performance Python ML engine and launches the
native Microsoft Edge / WebView2 desktop window without any external browser.
"""

import os
import sys
import time
import socket
import threading
import urllib.request
import uvicorn
import webview

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE_DIR, "backend"))

def find_available_port(default_port: int = 8000) -> int:
    """Finds an open localhost port."""
    for port in range(default_port, default_port + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return default_port

def is_server_ready(url: str) -> bool:
    """Checks if the backend or frontend server is ready to accept requests."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "PicClipLauncher/1.0"})
        with urllib.request.urlopen(req, timeout=1) as resp:
            return resp.status in [200, 304, 404]
    except Exception:
        return False

def start_backend_server(port: int):
    """Runs uvicorn in a daemon thread."""
    from backend.main import app
    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=port,
        log_level="error",
        access_log=False
    )
    server = uvicorn.Server(config)
    server.run()

def main():
    print("=" * 60)
    print("  PicClip Studio Pro - Desktop Launch Sequence")
    print("=" * 60)

    # 1. Start or detect backend server
    backend_port = 8000
    if not is_server_ready(f"http://127.0.0.1:{backend_port}/docs"):
        backend_port = find_available_port(8000)
        print(f"[*] Starting local ML Engine on 127.0.0.1:{backend_port}...")
        backend_thread = threading.Thread(target=start_backend_server, args=(backend_port,), daemon=True)
        backend_thread.start()

        # Wait up to 10 seconds for backend to start
        for _ in range(20):
            if is_server_ready(f"http://127.0.0.1:{backend_port}/docs"):
                break
            time.sleep(0.5)

    print(f"[+] ML Engine active on 127.0.0.1:{backend_port}")

    # 2. Determine Frontend Target URL
    # If Next.js dev server is running on 3000, use it. Otherwise use backend static mount or localhost:3000.
    target_url = "http://localhost:3000"
    if not is_server_ready(target_url):
        # Fallback to backend served UI or 3000
        target_url = f"http://127.0.0.1:{backend_port}"

    print(f"[*] Launching Native Desktop Window: {target_url}")

    # 3. Create native desktop window
    window = webview.create_window(
        title="PicClip Studio Pro - AI Clipping Suite",
        url=target_url,
        width=1400,
        height=900,
        min_size=(1080, 720),
        background_color="#090D16",
        text_select=True
    )

    # Start PyWebView event loop
    webview.start(debug=False)
    print("[*] PicClip Studio closed.")

if __name__ == "__main__":
    main()
