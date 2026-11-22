"""
PicClip Studio Pro - macOS Standalone Application Packaging Script
Builds a native macOS .app bundle and creates a distributable Drag-and-Drop .dmg
for Apple Silicon (M1/M2/M3/M4) and Intel Macs.
"""

import os
import sys
import shutil
import platform
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
    for item in os.listdir(src_backend):
        s_path = os.path.join(src_backend, item)
        d_path = os.path.join(staging_dir, item)

        if item in ["venv", "uploads", "output", "outputs", "__pycache__"]:
            continue

        if os.path.isdir(s_path):
            shutil.copytree(s_path, d_path)
        else:
            shutil.copy2(s_path, d_path)

    for sub in ["uploads", "output"]:
        sub_path = os.path.join(staging_dir, sub)
        os.makedirs(sub_path, exist_ok=True)
        with open(os.path.join(sub_path, ".gitkeep"), "w") as f:
            pass

def main():
    print("=" * 60)
    print("  PicClip Studio Pro - macOS Native Packaging Pipeline")
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

    # 2. Prepare clean backend staging folder (NO venv)
    backend_clean = os.path.join(BASE_DIR, "backend_clean_mac")
    print("[*] Preparing clean backend distribution for macOS...")
    prepare_clean_backend(backend_clean)

    # 3. PyInstaller macOS Packaging Command
    icon_param = ""
    icns_path = os.path.join(BASE_DIR, "assets", "logo.icns")
    if os.path.exists(icns_path):
        icon_param = f'--icon "{icns_path}"'

    py_cmd = (
        f'"{sys.executable}" -m PyInstaller '
        '--name "PicClipStudio" '
        '--noconfirm '
        '--windowed '
        '--onedir '
        '--osx-bundle-identifier "com.picclip.studio" '
        f'{icon_param} '
        f'--add-data "{backend_clean}:backend" '
        '--add-data "assets:assets" '
        '--collect-all "whisper" '
        '--collect-all "faster_whisper" '
        '--collect-all "ctranslate2" '
        '--collect-all "mediapipe" '
        '--hidden-import "uvicorn" '
        '--hidden-import "fastapi" '
        '--hidden-import "webview" '
        '--hidden-import "licensing" '
        '--hidden-import "torch" '
        '--hidden-import "scipy.signal" '
        'desktop_launcher.py'
    )

    try:
        run_step("Compiling macOS .app Bundle with PyInstaller", py_cmd)
    finally:
        if os.path.exists(backend_clean):
            shutil.rmtree(backend_clean, ignore_errors=True)

    dist_dir = os.path.join(BASE_DIR, "dist")
    app_path = os.path.join(dist_dir, "PicClipStudio.app")
    if not os.path.exists(app_path):
        app_path = os.path.join(dist_dir, "PicClipStudio", "PicClipStudio.app")

    # 3. Create macOS Zip Archive
    zip_output = os.path.join(BASE_DIR, "PicClipStudio-macOS")
    target_to_archive = app_path if os.path.exists(app_path) else os.path.join(dist_dir, "PicClipStudio")
    print(f"\n[*] Creating macOS distribution archive from {target_to_archive}...")
    shutil.make_archive(zip_output, "zip", dist_dir)
    print(f"[+] Created {zip_output}.zip")

    # 4. If running on native macOS, build Drag-and-Drop .dmg
    if platform.system() == "Darwin":
        dmg_path = os.path.join(BASE_DIR, "PicClipStudio-macOS.dmg")
        print("[*] Creating native Apple Disk Image (.dmg)...")
        dmg_staging = os.path.join(BASE_DIR, "dmg_staging")
        if os.path.exists(dmg_staging):
            shutil.rmtree(dmg_staging, ignore_errors=True)
        os.makedirs(dmg_staging, exist_ok=True)

        if os.path.exists(app_path):
            dest_app = os.path.join(dmg_staging, "PicClip Studio.app")
            if os.path.isdir(app_path):
                shutil.copytree(app_path, dest_app)
            else:
                shutil.copy(app_path, dest_app)
        else:
            shutil.copytree(dist_dir, os.path.join(dmg_staging, "PicClipStudio"))

        try:
            os.symlink("/Applications", os.path.join(dmg_staging, "Applications"))
        except Exception as sym_err:
            print(f"[!] Could not create /Applications symlink: {sym_err}")

        dmg_cmd = f'hdiutil create -volname "PicClip Studio" -srcfolder "{dmg_staging}" -ov -format UDZO "{dmg_path}"'
        subprocess.run(dmg_cmd, shell=True)
        if os.path.exists(dmg_path):
            print(f"[+] Successfully built Drag-and-Drop DMG: {dmg_path}")
        shutil.rmtree(dmg_staging, ignore_errors=True)

    print("\n" + "=" * 60)
    print("  macOS Packaging Succeeded!")
    print(f"  Distribution files created in: {dist_dir}")
    print("=" * 60)

if __name__ == "__main__":
    main()
