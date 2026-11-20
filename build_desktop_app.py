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
