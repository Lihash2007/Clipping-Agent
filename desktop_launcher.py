"""
PicClip Studio Pro - Desktop Native Launcher
Starts the embedded high-performance Python ML engine and launches the
native Microsoft Edge / WebView2 desktop window without any external browser.
"""

import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Ensure backend modules and venv site-packages are always discoverable
sys.path.insert(0, BASE_DIR)
sys.path.insert(0, os.path.join(BASE_DIR, "backend"))

# Cross-platform venv site-packages discovery (uncompiled dev only)
if not getattr(sys, "frozen", False):
    for p in [
        os.path.join(BASE_DIR, "backend", "venv", "Lib", "site-packages"),
        os.path.join(BASE_DIR, "backend", "venv", "lib", f"python{sys.version_info.major}.{sys.version_info.minor}", "site-packages"),
        os.path.join(BASE_DIR, "venv", "lib", f"python{sys.version_info.major}.{sys.version_info.minor}", "site-packages"),
    ]:
        if os.path.exists(p):
            sys.path.insert(0, p)

# Pre-import core ML modules for PyInstaller discovery
try:
    import whisper
except ImportError:
    pass
try:
    import faster_whisper
    import ctranslate2
except ImportError:
    pass
try:
    import mediapipe
except ImportError:
    pass
try:
    import sentence_transformers
except ImportError:
    pass

import time
import socket
import threading
import urllib.request
import uvicorn

# Safe desktop window library import
try:
    import webview
except Exception:
    webview = None

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

    # 3. Native desktop window with bulletproof fallback
    launched_native = False
    if webview is not None:
        try:
            webview.create_window(
                title="PicClip Studio Pro - AI Clipping Suite",
                url=target_url,
                width=1400,
                height=900,
                min_size=(1080, 720),
                background_color="#090D16",
                text_select=True
            )
            if sys.platform == "win32":
                try:
                    webview.start(gui="edgechromium", debug=False)
                    launched_native = True
                except BaseException as e_edge:
                    print(f"[*] EdgeChromium native view unavailable ({e_edge}), trying standard GUI...")
                    try:
                        webview.start(debug=False)
                        launched_native = True
                    except BaseException as e_std:
                        print(f"[*] Standard native GUI failed ({e_std}), falling back to browser...")
                        launched_native = False
            else:
                webview.start(debug=False)
                launched_native = True
        except BaseException as err:
            print(f"[!] Native desktop window error: {err}. Falling back to default browser...")
            launched_native = False

    # 4. If native window is unavailable or encountered any runtime/CLR exception, open in system browser
    if not launched_native:
        import webbrowser
        print(f"[*] Opening PicClip Studio in default browser: {target_url}")
        webbrowser.open(target_url)
        try:
            while True:
                time.sleep(1)
        except (KeyboardInterrupt, SystemExit):
            pass

    print("[*] PicClip Studio closed.")

if __name__ == "__main__":
    try:
        main()
    except BaseException as fatal_err:
        import traceback
        print(f"[!] Launcher exception: {traceback.format_exc()}")
        try:
            import webbrowser
            webbrowser.open("http://127.0.0.1:8000")
            time.sleep(2)
        except Exception:
            pass
