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

    # 2. PyInstaller macOS Packaging Command
    icon_param = ""
    icon_path = os.path.join(BASE_DIR, "assets", "logo.png")
    if os.path.exists(icon_path):
        icon_param = f'--icon "{icon_path}"'

    py_cmd = (
        f'"{sys.executable}" -m PyInstaller '
        '--name "PicClipStudio" '
        '--windowed '
        '--onedir '
        '--osx-bundle-identifier "com.picclip.studio" '
        f'{icon_param} '
        '--add-data "backend:backend" '
        '--add-data "assets:assets" '
        '--hidden-import "uvicorn" '
        '--hidden-import "fastapi" '
        '--hidden-import "webview" '
        '--hidden-import "licensing" '
        '--hidden-import "torch" '
        '--hidden-import "ffmpeg" '
        'desktop_launcher.py'
    )

    run_step("Compiling macOS .app Bundle with PyInstaller", py_cmd)

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
        dmg_cmd = f'hdiutil create -volname "PicClip Studio" -srcfolder "{dist_dir}" -ov -format UDZO "{dmg_path}"'
        subprocess.run(dmg_cmd, shell=True)
        if os.path.exists(dmg_path):
            print(f"[+] Successfully built Drag-and-Drop DMG: {dmg_path}")

    print("\n" + "=" * 60)
    print("  macOS Packaging Succeeded!")
    print(f"  Distribution files created in: {dist_dir}")
    print("=" * 60)

if __name__ == "__main__":
    main()
