"""
PicClip Studio Pro - macOS Lightweight Portable Packager (Option 1)
Creates a lightweight (~115 MB) zip archive for Mac users with a native
double-clickable 1-click launcher (PicClip.command).
"""

import os
import sys
import zipfile
import shutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ZIP_OUTPUT = os.path.join(BASE_DIR, "PicClipStudio-Mac-Portable.zip")

def main():
    print("=" * 65)
    print("  PicClip Studio Pro - Building macOS Portable Package (Option 1)")
    print("=" * 65)

    # 1. Verify frontend_dist
    frontend_dist = os.path.join(BASE_DIR, "backend", "frontend_dist")
    if not os.path.exists(frontend_dist) or not os.path.exists(os.path.join(frontend_dist, "index.html")):
        frontend_out = os.path.join(BASE_DIR, "frontend", "out")
        if os.path.exists(frontend_out) and os.path.exists(os.path.join(frontend_out, "index.html")):
            print(f"[*] Syncing frontend/out to {frontend_dist}...")
            shutil.copytree(frontend_out, frontend_dist, dirs_exist_ok=True)
        else:
            print("[!] Error: backend/frontend_dist is missing. Build frontend first.")
            sys.exit(1)

    # 2. Files to include
    if os.path.exists(ZIP_OUTPUT):
        os.remove(ZIP_OUTPUT)

    print(f"[*] Packaging into {ZIP_OUTPUT}...")
    with zipfile.ZipFile(ZIP_OUTPUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        
        # Helper to add file with specific unix permissions
        def add_file(src_path: str, arc_path: str, is_executable: bool = False):
            with open(src_path, "rb") as f:
                data = f.read()
            # Standard LF line endings for shell scripts on macOS
            if arc_path.endswith(".command") or arc_path.endswith(".sh"):
                data = data.replace(b"\r\n", b"\n")
            
            zinfo = zipfile.ZipInfo(arc_path)
            zinfo.date_time = (2026, 11, 21, 12, 0, 0)
            if is_executable:
                # Unix permissions: rwxr-xr-x (0o755)
                zinfo.external_attr = 0o755 << 16
            else:
                # Unix permissions: rw-r--r-- (0o644)
                zinfo.external_attr = 0o644 << 16
            zf.writestr(zinfo, data)

        # Root files
        add_file(os.path.join(BASE_DIR, "PicClip.command"), "PicClipStudio-Mac/PicClip.command", is_executable=True)
        add_file(os.path.join(BASE_DIR, "desktop_launcher.py"), "PicClipStudio-Mac/desktop_launcher.py")
        add_file(os.path.join(BASE_DIR, "README_MAC.txt"), "PicClipStudio-Mac/README_MAC.txt")

        # Assets folder
        assets_dir = os.path.join(BASE_DIR, "assets")
        for f in os.listdir(assets_dir):
            full_p = os.path.join(assets_dir, f)
            if os.path.isfile(full_p) and not f.startswith("test_") and not f.endswith(".mp4"):
                add_file(full_p, f"PicClipStudio-Mac/assets/{f}")

        # Backend folder
        backend_dir = os.path.join(BASE_DIR, "backend")
        for root, dirs, files in os.walk(backend_dir):
            # Exclude venv, temp uploads/output, and pycache
            dirs[:] = [d for d in dirs if d not in ["venv", "uploads", "output", "outputs", "__pycache__"]]
            
            for file in files:
                if file.endswith((".pyc", ".log", ".tmp")) or file == "ffmpeg.exe":
                    continue
                full_src = os.path.join(root, file)
                rel_path = os.path.relpath(full_src, BASE_DIR)
                arc_dest = f"PicClipStudio-Mac/{rel_path.replace(os.sep, '/')}"
                add_file(full_src, arc_dest)

        # Add empty uploads and output folders
        empty_keep = b""
        z_up = zipfile.ZipInfo("PicClipStudio-Mac/backend/uploads/.gitkeep")
        z_up.external_attr = 0o644 << 16
        zf.writestr(z_up, empty_keep)

        z_out = zipfile.ZipInfo("PicClipStudio-Mac/backend/output/.gitkeep")
        z_out.external_attr = 0o644 << 16
        zf.writestr(z_out, empty_keep)

    size_mb = os.path.getsize(ZIP_OUTPUT) / (1024 * 1024)
    print("\n" + "=" * 65)
    print(f"  BUILD SUCCESSFUL!")
    print(f"  Lightweight Mac Distribution: {ZIP_OUTPUT}")
    print(f"  Package File Size: {size_mb:.2f} MB  (Down from 3,112 MB!)")
    print("=" * 65)

if __name__ == "__main__":
    main()
