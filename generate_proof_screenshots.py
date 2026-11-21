"""
Generate high-resolution Gumroad proof screenshots for PicClip Studio.
Captures:
1. Dashboard Studio (Controls, Ingestion, Presets)
2. Video Editor Workspace (9:16 vertical reframe, kinetic subtitles)
3. Pricing & Plans ($10.99/mo, $88/yr - Save 33%, $189.99 Lifetime)
4. Settings & BYOS Storage (Local storage, zero cloud costs)
"""

import os
import time
import shutil
import subprocess

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "assets", "gumroad_proofs")
os.makedirs(OUTPUT_DIR, exist_ok=True)

CHROME_BIN = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(CHROME_BIN):
    CHROME_BIN = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

PAGES = [
    ("1_PicClip_Studio_Dashboard.png", "http://127.0.0.1:3000"),
    ("2_PicClip_Editor_Workspace.png", "http://127.0.0.1:3000/editor"),
    ("3_PicClip_Plans_And_Pricing.png", "http://127.0.0.1:3000/pricing"),
    ("4_PicClip_Settings_Storage.png", "http://127.0.0.1:3000/settings"),
]

def capture_screenshot(filename: str, url: str):
    dest = os.path.join(OUTPUT_DIR, filename)
    print(f"[*] Capturing {filename} from {url}...")
    cmd = [
        CHROME_BIN,
        "--headless=old",
        "--disable-gpu",
        "--no-sandbox",
        "--window-size=1920,1080",
        "--hide-scrollbars",
        "--virtual-time-budget=8000",
        f"--screenshot={dest}",
        url
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        print(f"[+] Successfully captured: {filename} ({os.path.getsize(dest)} bytes)")
    else:
        print(f"[!] Failed to capture {filename}: {res.stderr}")

def main():
    print("=" * 60)
    print("  PicClip Studio - Gumroad Proof Screenshots Generator")
    print("=" * 60)

    for filename, url in PAGES:
        capture_screenshot(filename, url)
        time.sleep(1)

    # Copy ML pipeline proof renders as well
    src_proof = os.path.join(BASE_DIR, "assets", "proof")
    if os.path.exists(src_proof):
        for f in os.listdir(src_proof):
            s = os.path.join(src_proof, f)
            d = os.path.join(OUTPUT_DIR, f"5_render_{f}")
            if os.path.isfile(s):
                shutil.copy2(s, d)
                print(f"[+] Added video pipeline render proof: 5_render_{f}")

    # Remove temporary test shot if exists
    test_shot = os.path.join(BASE_DIR, "test_shot.png")
    if os.path.exists(test_shot):
        try:
            os.remove(test_shot)
        except Exception:
            pass

    print("\n" + "=" * 60)
    print(f"  All proof screenshots generated in: {OUTPUT_DIR}")
    print("=" * 60)

if __name__ == "__main__":
    main()
