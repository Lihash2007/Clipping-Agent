#!/usr/bin/env bash
# ==============================================================================
# PicClip Studio Pro - macOS One-Click Native Launcher
# Runs directly on macOS (Apple Silicon M1-M4 & Intel) with WKWebView
# ==============================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "============================================================"
echo "  PicClip Studio Pro - Starting Native macOS Studio Engine"
echo "============================================================"

# Ensure Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "[!] Python 3 not found. Please install Python 3 or run via the .dmg installer."
    exit 1
fi

# Check for virtual environment or global pywebview
if [ ! -d "backend/venv" ]; then
    echo "[*] Initializing local environment..."
    python3 -m venv backend/venv
    backend/venv/bin/pip install --upgrade pip
    backend/venv/bin/pip install -r backend/requirements.txt
fi

echo "[*] Launching PicClip Studio native window..."
backend/venv/bin/python3 desktop_launcher.py
