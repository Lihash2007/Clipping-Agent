#!/usr/bin/env bash
# ==============================================================================
# PicClip Studio Pro - 1-Click Native macOS Launcher (Apple Silicon & Intel)
# ==============================================================================

# Ensure script runs from its own directory on macOS
cd "$(cd "$(dirname "$0")" && pwd)"

# ANSI Terminal Colors
BOLD='\033[1m'
CYAN='\033[38;5;51m'
GREEN='\033[38;5;48m'
YELLOW='\033[38;5;220m'
RED='\033[38;5;196m'
NC='\033[0m' # No Color

clear
echo -e "${CYAN}${BOLD}"
echo "  ================================================================"
echo "    🎬  PIC-CLIP STUDIO PRO — NATIVE macOS LAUNCHER"
echo "    AI Video Clipping Suite for Podcasts, Gameplay & Creators"
echo "  ================================================================"
echo -e "${NC}"

# 1. Verify Python 3 Installation
if command -v python3 &>/dev/null; then
    PY_BIN="python3"
elif command -v /usr/bin/python3 &>/dev/null; then
    PY_BIN="/usr/bin/python3"
else
    echo -e "${RED}[!] Python 3 was not found on your Mac.${NC}"
    echo -e "${YELLOW}[*] Installing Apple Command Line Tools (includes Python 3)...${NC}"
    xcode-select --install
    echo -e "${YELLOW}Please complete the prompt on your screen, then re-open PicClip.command.${NC}"
    exit 1
fi

PY_VER=$($PY_BIN -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo -e "${GREEN}[+] Detected Python ${PY_VER}${NC}"

# Detect Apple Silicon vs Intel
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    echo -e "${GREEN}[+] Architecture: Apple Silicon (M1/M2/M3/M4) — Metal MPS Accelerated${NC}"
else
    echo -e "${GREEN}[+] Architecture: Intel x86_64${NC}"
fi

# 2. Virtual Environment Setup (Self-Healing & Isolated)
VENV_DIR="backend/venv"
if [ ! -d "$VENV_DIR" ] || [ ! -f "$VENV_DIR/bin/python" ]; then
    echo -e "\n${YELLOW}[*] First-time setup detected. Initializing lightweight local AI environment...${NC}"
    echo -e "${YELLOW}    (This only happens once and takes ~30-60 seconds)${NC}"
    
    $PY_BIN -m venv "$VENV_DIR"
    "$VENV_DIR/bin/pip" install --upgrade pip --quiet
    
    echo -e "${CYAN}[*] Installing optimized native dependencies...${NC}"
    "$VENV_DIR/bin/pip" install -r backend/requirements.txt --quiet
    "$VENV_DIR/bin/pip" install pywebview --quiet
    echo -e "${GREEN}[+] Environment ready!${NC}"
fi

# 3. Launch Native macOS Studio Window
echo -e "\n${CYAN}[*] Starting PicClip Studio engine & launching native studio window...${NC}"
"$VENV_DIR/bin/python" desktop_launcher.py

# Keep terminal open only if launcher crashed
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
    echo -e "\n${RED}[!] Application exited with code $EXIT_CODE.${NC}"
    echo "Press [Enter] to close..."
    read -r
fi
