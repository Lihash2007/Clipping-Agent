"""
PicClip Studio Pro - Desktop Application Automated Packaging Script
Bundles the Python ML pipeline, PyWebView desktop window, and Next.js frontend into a
standalone Windows .exe distribution using PyInstaller.
"""

import os
import sys
import shutil
import subprocess

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def run_step(desc: str, cmd: str, cwd: str = BASE_DIR):
    print(f"\n[*] {desc}...")
    res = subprocess.run(cmd, shell=True, cwd=cwd)
    if res.returncode != 0:
        print(f"[!] Step failed: {desc} (code {res.returncode})")
        sys.exit(res.returncode)
    print(f"[+] {desc} complete.")

def main():
    print("=" * 60)
    print("  PicClip Studio Pro - Standalone Desktop Packaging Pipeline")
    print("=" * 60)

    # 1. Clean previous build artifacts
    for folder in ["build", "dist"]:
        path = os.path.join(BASE_DIR, folder)
        if os.path.exists(path):
            print(f"[*] Cleaning {folder}/...")
            shutil.rmtree(path, ignore_errors=True)

    # 1.5 Ensure frontend static UI is synced into backend/frontend_dist
    frontend_out = os.path.join(BASE_DIR, "frontend", "out")
    backend_dist = os.path.join(BASE_DIR, "backend", "frontend_dist")
    if not os.path.exists(backend_dist) or not os.path.exists(os.path.join(backend_dist, "index.html")):
        if os.path.exists(frontend_out) and os.path.exists(os.path.join(frontend_out, "index.html")):
            print(f"[*] Syncing frontend/out to {backend_dist}...")
            shutil.copytree(frontend_out, backend_dist)
        else:
            print("[*] Building Next.js static UI...")
            run_step("Compiling Next.js UI", "npm run build", cwd=os.path.join(BASE_DIR, "frontend"))
            shutil.copytree(frontend_out, backend_dist)

    # 2. PyInstaller Packaging Command
    # Collects backend modules, licensing, models, and assets
    py_cmd = (
        f'"{sys.executable}" -m PyInstaller '
        '--name "PicClipStudio" '
        '--windowed '  # No console window
        '--onedir '    # Fast startup directory distribution
        '--icon "assets/logo.png" '
        '--add-data "backend;backend" '
        '--add-data "assets;assets" '
        '--hidden-import "uvicorn" '
        '--hidden-import "fastapi" '
        '--hidden-import "webview" '
        '--hidden-import "clr_loader" '
        '--hidden-import "pythonnet" '
        '--hidden-import "licensing" '
        'desktop_launcher.py'
    )

    run_step("Compiling Standalone Desktop Application with PyInstaller", py_cmd)

    print("\n" + "=" * 60)
    print("  Packaging Succeeded!")
    print(f"  Distribution folder created at: {os.path.join(BASE_DIR, 'dist', 'PicClipStudio')}")
    print("  Run PicClipStudio.exe to launch the standalone desktop app.")
    print("=" * 60)

if __name__ == "__main__":
    main()
