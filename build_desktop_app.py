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

def prepare_clean_backend(staging_dir: str):
    """Prepares a clean copy of backend without venv, uploads, outputs, or pycache."""
    if os.path.exists(staging_dir):
        shutil.rmtree(staging_dir, ignore_errors=True)
    os.makedirs(staging_dir, exist_ok=True)

    src_backend = os.path.join(BASE_DIR, "backend")

    # Copy files
    for item in os.listdir(src_backend):
        s_path = os.path.join(src_backend, item)
        d_path = os.path.join(staging_dir, item)

        # Ignore developer environments, temp uploads/outputs, and cache
        if item in ["venv", "uploads", "output", "outputs", "__pycache__"]:
            continue

        if os.path.isdir(s_path):
            shutil.copytree(s_path, d_path)
        else:
            shutil.copy2(s_path, d_path)

    # Ensure empty uploads and output folders exist
    for sub in ["uploads", "output"]:
        sub_path = os.path.join(staging_dir, sub)
        os.makedirs(sub_path, exist_ok=True)
        with open(os.path.join(sub_path, ".gitkeep"), "w") as f:
            pass

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

    # 2. Ensure frontend static UI is synced into backend/frontend_dist
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

    # 3. Create clean backend staging folder (NO backend/venv)
    backend_clean = os.path.join(BASE_DIR, "backend_clean")
    print("[*] Preparing clean backend distribution (excluding venv)...")
    prepare_clean_backend(backend_clean)

    # 4. PyInstaller Packaging Command
    # Collects backend modules, licensing, models, and assets
    py_cmd = (
        f'"{sys.executable}" -m PyInstaller '
        '--name "PicClipStudio" '
        '--windowed '  # No console window
        '--onedir '    # Fast startup directory distribution
        '--icon "assets/logo.png" '
        f'--add-data "{backend_clean};backend" '
        '--add-data "assets;assets" '
        '--collect-all "whisper" '
        '--collect-all "faster_whisper" '
        '--collect-all "ctranslate2" '
        '--collect-all "mediapipe" '
        '--collect-all "clr_loader" '
        '--collect-all "pythonnet" '
        '--collect-all "webview" '
        '--hidden-import "uvicorn" '
        '--hidden-import "fastapi" '
        '--hidden-import "webview" '
        '--hidden-import "clr_loader" '
        '--hidden-import "pythonnet" '
        '--hidden-import "licensing" '
        '--hidden-import "whisper" '
        '--hidden-import "faster_whisper" '
        '--hidden-import "ctranslate2" '
        '--hidden-import "mediapipe" '
        '--hidden-import "sentence_transformers" '
        '--hidden-import "torch" '
        '--hidden-import "scipy.signal" '
        'desktop_launcher.py'
    )

    try:
        run_step("Compiling Standalone Desktop Application with PyInstaller", py_cmd)
    finally:
        # Cleanup staging
        if os.path.exists(backend_clean):
            shutil.rmtree(backend_clean, ignore_errors=True)

    dist_dir = os.path.join(BASE_DIR, "dist")
    app_folder = os.path.join(dist_dir, "PicClipStudio")
    print("\n" + "=" * 60)
    print("  Packaging Succeeded!")
    print(f"  Distribution folder created at: {app_folder}")
    print("=" * 60)

    # 4.5 Add Launch Helper & How-To Guide to Distribution
    bat_content = """@echo off
setlocal
cd /d "%~dp0"
title PicClip Studio Pro
echo ============================================================
echo   PicClip Studio Pro - Starting Local AI Engine...
echo ============================================================
echo Unblocking Windows permissions...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -Path .\\PicClipStudio.exe -ErrorAction SilentlyContinue; if (Test-Path .\\_internal) { Get-ChildItem -Path .\\_internal -Recurse | Unblock-File -ErrorAction SilentlyContinue }" 2>nul
echo Launching PicClip Studio Pro...
start "" "PicClipStudio.exe"
"""
    with open(os.path.join(app_folder, "Launch PicClip.bat"), "w", encoding="utf-8") as f:
        f.write(bat_content)

    readme_content = """======================================================================
               PICCLIP STUDIO PRO - QUICK START GUIDE
======================================================================

HOW TO START:
  Option 1 (Recommended - 1-Click Launch):
  Double-click "Launch PicClip.bat"
  This automatically unblocks permissions and starts the app instantly.

  Option 2:
  Double-click "PicClipStudio.exe"

----------------------------------------------------------------------
IF WINDOWS DEFENDER SMARTSCREEN APPEARS:
----------------------------------------------------------------------
When downloading software from the internet outside the Microsoft Store,
Windows Defender SmartScreen may display:
  "Windows protected your PC"

To start PicClip:
  1. Click "More info" (underlined link on the prompt)
  2. Click the "Run anyway" button at the bottom

This prompt only appears once on first launch.
PicClip Studio is 100% private and runs completely offline on your device.
======================================================================
"""
    with open(os.path.join(app_folder, "HOW_TO_RUN.txt"), "w", encoding="utf-8") as f:
        f.write(readme_content)

    # 5. Compress into distributable zip archive
    print("\n[*] Compressing distribution into PicClipStudio-Windows.zip...")
    zip_target = os.path.join(BASE_DIR, "PicClipStudio-Windows")
    shutil.make_archive(zip_target, "zip", dist_dir)
    zip_size_mb = os.path.getsize(f"{zip_target}.zip") / (1024 * 1024)
    print(f"[+] Created {zip_target}.zip ({zip_size_mb:.2f} MB)")

if __name__ == "__main__":
    main()
