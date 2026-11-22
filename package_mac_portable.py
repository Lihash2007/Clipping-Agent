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
            zinfo.create_system = 3  # 3 = UNIX system (required for macOS to recognize permissions)
            if is_executable:
                # Unix permissions: S_IFREG | rwxr-xr-x (0o100755)
                zinfo.external_attr = 0o100755 << 16
            else:
                # Unix permissions: S_IFREG | rw-r--r-- (0o100644)
                zinfo.external_attr = 0o100644 << 16
            zf.writestr(zinfo, data)

        # Bundle native PicClip Studio.app
        app_prefix = "PicClipStudio-Mac/PicClip Studio.app/Contents"
        
        # Info.plist
        plist_content = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>PicClipStudio</string>
    <key>CFBundleIconFile</key>
    <string>logo.icns</string>
    <key>CFBundleIdentifier</key>
    <string>com.picclip.studio</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>PicClip Studio</string>
    <key>CFBundleDisplayName</key>
    <string>PicClip Studio Pro</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>2.0.0</string>
    <key>CFBundleVersion</key>
    <string>2.0.0</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>"""
        z_plist = zipfile.ZipInfo(f"{app_prefix}/Info.plist")
        z_plist.create_system = 3
        z_plist.external_attr = 0o100644 << 16
        zf.writestr(z_plist, plist_content.encode("utf-8"))

        # PkgInfo
        z_pkg = zipfile.ZipInfo(f"{app_prefix}/PkgInfo")
        z_pkg.create_system = 3
        z_pkg.external_attr = 0o100644 << 16
        zf.writestr(z_pkg, b"APPL????")

        # logo.icns
        icns_path = os.path.join(BASE_DIR, "assets", "logo.icns")
        if os.path.exists(icns_path):
            with open(icns_path, "rb") as f:
                icns_bytes = f.read()
            z_icns = zipfile.ZipInfo(f"{app_prefix}/Resources/logo.icns")
            z_icns.create_system = 3
            z_icns.external_attr = 0o100644 << 16
            zf.writestr(z_icns, icns_bytes)

        # Native MacOS executable launcher
        launcher_script = """#!/usr/bin/env bash
# PicClip Studio Pro - macOS Native App Launcher
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"

APP_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$APP_ROOT"

if command -v python3 &>/dev/null; then
    PY_BIN="python3"
elif command -v /usr/bin/python3 &>/dev/null; then
    PY_BIN="/usr/bin/python3"
else
    osascript -e 'display alert "PicClip Studio" message "Python 3 is required. Please install Xcode Command Line Tools or Python."'
    exit 1
fi

VENV_DIR="backend/venv"
if [ ! -d "$VENV_DIR" ] || [ ! -f "$VENV_DIR/bin/python" ]; then
    osascript -e 'display notification "Setting up local AI engine (first run only)..." with title "PicClip Studio Pro"'
    $PY_BIN -m venv "$VENV_DIR"
    "$VENV_DIR/bin/pip" install --upgrade pip --quiet
    "$VENV_DIR/bin/pip" install -r backend/requirements.txt --quiet
    "$VENV_DIR/bin/pip" install pywebview --quiet
fi

exec "$VENV_DIR/bin/python" desktop_launcher.py
"""
        z_exec = zipfile.ZipInfo(f"{app_prefix}/MacOS/PicClipStudio")
        z_exec.create_system = 3
        z_exec.external_attr = 0o100755 << 16
        zf.writestr(z_exec, launcher_script.replace("\r\n", "\n").encode("utf-8"))

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
        z_up.create_system = 3
        z_up.external_attr = 0o100644 << 16
        zf.writestr(z_up, empty_keep)

        z_out = zipfile.ZipInfo("PicClipStudio-Mac/backend/output/.gitkeep")
        z_out.create_system = 3
        z_out.external_attr = 0o100644 << 16
        zf.writestr(z_out, empty_keep)

    size_mb = os.path.getsize(ZIP_OUTPUT) / (1024 * 1024)
    print("\n" + "=" * 65)
    print(f"  BUILD SUCCESSFUL!")
    print(f"  Lightweight Mac Distribution: {ZIP_OUTPUT}")
    print(f"  Package File Size: {size_mb:.2f} MB  (Down from 3,112 MB!)")
    print("=" * 65)

if __name__ == "__main__":
    main()
