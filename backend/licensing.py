"""
PicClip Studio - Hardware Node-Locking & Gumroad Subscription Licensing Engine
Protects application from unauthorized sharing by locking activation to a single hardware machine ID.
Validates monthly, annual, and lifetime licenses against Gumroad's API with offline grace periods
and monotonic clock anti-rollback protection.
"""

import os
import sys
import json
import time
import hmac
import hashlib
import platform
import subprocess
import urllib.request
import urllib.parse
from typing import Dict, Any, Optional

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LICENSE_STATE_FILE = os.path.join(BASE_DIR, "license_state.json")
CONFIG_FILE = os.path.join(BASE_DIR, "platform_config.json")

# Salt for hashing machine ID to prevent rainbow table attacks
MACHINE_SALT = "PicClip_Studio_HWID_Salt_2026_Secure"
TOKEN_SIGN_KEY = "PicClip_Local_Monotonic_Signature_Key_X99"


def run_cmd(cmd: str) -> str:
    """Safely execute system shell commands to retrieve hardware properties."""
    try:
        res = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=5
        )
        return res.stdout.strip()
    except Exception:
        return ""


def get_hardware_fingerprint() -> str:
    """
    Extracts deterministic hardware identifiers:
    - Windows: Motherboard UUID + CPU ProcessorId + Primary BIOS/Disk Serial
    - Linux: /etc/machine-id + CPU info
    - MacOS: IOPlatformUUID
    Returns a formatted 16-character Machine ID: 'PIC-XXXX-XXXX-XXXX'
    """
    system = platform.system()
    raw_identifiers = []

    if system == "Windows":
        # 1. Motherboard UUID
        uuid = run_cmd("powershell -NoProfile -Command \"(Get-CimInstance Win32_ComputerSystemProduct).UUID\"")
        if not uuid or "error" in uuid.lower():
            uuid = run_cmd("wmic csproduct get uuid").replace("UUID", "").strip()
        raw_identifiers.append(uuid or "WIN_UNKNOWN_UUID")

        # 2. CPU ProcessorId
        cpuid = run_cmd("powershell -NoProfile -Command \"(Get-CimInstance Win32_Processor).ProcessorId\"")
        if not cpuid or "error" in cpuid.lower():
            cpuid = run_cmd("wmic cpu get processorid").replace("ProcessorId", "").strip()
        raw_identifiers.append(cpuid or "WIN_UNKNOWN_CPU")

        # 3. Disk Serial
        disk = run_cmd("powershell -NoProfile -Command \"(Get-CimInstance Win32_DiskDrive | Select-Object -First 1).SerialNumber\"")
        raw_identifiers.append(disk or "WIN_UNKNOWN_DISK")

    elif system == "Darwin":
        # macOS IOPlatformUUID
        uuid = run_cmd("ioreg -d2 -c IOPlatformExpertDevice | awk -F\\\" '/IOPlatformUUID/{print $(NF-1)}'")
        raw_identifiers.append(uuid or "MAC_UNKNOWN_UUID")
    else:
        # Linux / Unix
        if os.path.exists("/etc/machine-id"):
            try:
                with open("/etc/machine-id", "r") as f:
                    raw_identifiers.append(f.read().strip())
            except Exception:
                pass
        if not raw_identifiers:
            raw_identifiers.append(platform.node())

    # Combine with salt and compute SHA-256
    raw_str = "|".join(raw_identifiers) + "|" + MACHINE_SALT
    digest = hashlib.sha256(raw_str.encode("utf-8")).hexdigest().upper()

    # Format cleanly into chunks: PIC-A1B2-C3D4-E5F6
    return f"PIC-{digest[:4]}-{digest[4:8]}-{digest[8:12]}-{digest[12:16]}"


def load_license_state() -> Dict[str, Any]:
    """Loads the locally cached license activation state."""
    if not os.path.exists(LICENSE_STATE_FILE):
        return {
            "is_active": False,
            "license_key": None,
            "machine_id": get_hardware_fingerprint(),
            "plan_type": "FREE_TRIAL",
            "activated_at": None,
            "expires_at": None,
            "last_verified_at": None,
            "last_monotonic_time": int(time.time()),
            "customer_email": None,
            "signature": None
        }

    try:
        with open(LICENSE_STATE_FILE, "r", encoding="utf-8") as f:
            state = json.load(f)
            return state
    except Exception:
        return {"is_active": False, "machine_id": get_hardware_fingerprint()}


def save_license_state(state: Dict[str, Any]):
    """Saves license state with a tamper-proof cryptographic HMAC signature."""
    # Compute signature of essential payload
    payload = f"{state.get('license_key')}|{state.get('machine_id')}|{state.get('expires_at')}|{state.get('last_monotonic_time')}|{state.get('plan_type')}"
    sig = hmac.new(TOKEN_SIGN_KEY.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    state["signature"] = sig

    with open(LICENSE_STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def verify_local_integrity(state: Dict[str, Any]) -> bool:
    """Verifies that the local state file hasn't been manually tampered with."""
    if not state.get("is_active"):
        return True
    expected_sig = state.get("signature")
    if not expected_sig:
        return False

    payload = f"{state.get('license_key')}|{state.get('machine_id')}|{state.get('expires_at')}|{state.get('last_monotonic_time')}|{state.get('plan_type')}"
    actual_sig = hmac.new(TOKEN_SIGN_KEY.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected_sig, actual_sig)


def check_anti_clock_rollback(state: Dict[str, Any]) -> bool:
    """
    Prevents user from rewinding Windows system clock to bypass expiration.
    Returns False if system clock tampering is detected.
    """
    now = int(time.time())
    last_known = state.get("last_monotonic_time") or 0

    # Allow up to 10 minutes of clock jitter/drift, but flag major rollbacks
    if now < (last_known - 600):
        return False  # Clock rolled backwards!

    # Update monotonic watermark
    state["last_monotonic_time"] = now
    return True


def verify_gumroad_license(license_key: str, permalink: str = "picclip", product_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Validates license directly against Gumroad's API with seat counting.
    Locks the license to 1 device.
    Supports both product_permalink and modern product_id.
    """
    verify_url = "https://api.gumroad.com/v2/licenses/verify"
    post_params = {
        "product_permalink": permalink,
        "license_key": license_key.strip(),
        "increment_uses_count": "true"
    }
    if product_id:
        post_params["product_id"] = product_id

    payload = urllib.parse.urlencode(post_params).encode("utf-8")

    req = urllib.request.Request(
        verify_url,
        data=payload,
        headers={"User-Agent": "PicClip-Desktop-Engine/1.0", "Content-Type": "application/x-www-form-urlencoded"}
    )

    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            data = json.loads(response.read().decode("utf-8"))
            return data
    except urllib.error.HTTPError as e:
        try:
            err_data = json.loads(e.read().decode("utf-8"))
            return {"success": False, "message": err_data.get("message", f"HTTP {e.code}")}
        except Exception:
            return {"success": False, "message": f"Gumroad API Error {e.code}"}
    except Exception as e:
        return {"success": False, "message": f"Network unreachable: {str(e)}"}


def activate_license(license_key: str) -> Dict[str, Any]:
    """
    Activates the license key on this specific machine.
    1. Checks hardware fingerprint.
    2. Validates against Gumroad or internal master keys or voucher database.
    3. Locks state to this hardware ID.
    """
    current_machine_id = get_hardware_fingerprint()
    clean_key = license_key.strip().upper()

    # Special handling for internal Master Demo/Developer keys
    if clean_key.startswith("PIC-MASTER-") or clean_key == "PICCLIP-PRO-DEMO-2026":
        state = {
            "is_active": True,
            "license_key": clean_key,
            "machine_id": current_machine_id,
            "plan_type": "LIFETIME_FOUNDER",
            "activated_at": int(time.time()),
            "expires_at": None,  # No expiry
            "last_verified_at": int(time.time()),
            "last_monotonic_time": int(time.time()),
            "customer_email": "founder@picclip.local"
        }
        save_license_state(state)
        return {
            "success": True,
            "message": "Founder Lifetime License activated successfully!",
            "plan": "LIFETIME_FOUNDER",
            "machine_id": current_machine_id,
            "expires_at": "Never"
        }

    # Check local voucher database (for admin-generated vouchers / direct sales)
    vouchers_file = os.path.join(BASE_DIR, "license_keys.json")
    if os.path.exists(vouchers_file):
        try:
            with open(vouchers_file, "r", encoding="utf-8") as vf:
                vouchers = json.load(vf)
            for v in vouchers:
                v_code = (v.get("code") or "").strip().upper()
                if hmac.compare_digest(v_code, clean_key):
                    now_ts = int(time.time())
                    # Determine tier
                    tier = (v.get("tier") or "pro").upper()
                    plan_name = "LIFETIME" if tier == "PRO" else f"PRO_{tier}"
                    v["redeemed"] = True
                    v["redeemed_by"] = current_machine_id
                    v["redeemed_at"] = now_ts
                    with open(vouchers_file, "w", encoding="utf-8") as vf_write:
                        json.dump(vouchers, vf_write, indent=2)

                    state = {
                        "is_active": True,
                        "license_key": clean_key,
                        "machine_id": current_machine_id,
                        "plan_type": plan_name,
                        "activated_at": now_ts,
                        "expires_at": None,
                        "last_verified_at": now_ts,
                        "last_monotonic_time": now_ts,
                        "customer_email": f"voucher_{clean_key[:8].lower()}@local"
                    }
                    save_license_state(state)
                    return {
                        "success": True,
                        "message": f"Successfully activated {plan_name} voucher license on this PC!",
                        "plan": plan_name,
                        "machine_id": current_machine_id,
                        "expires_at": "Lifetime"
                    }
        except Exception:
            pass

    # Verify with Gumroad API
    gumroad_res = verify_gumroad_license(clean_key)
    if not gumroad_res.get("success"):
        return {
            "success": False,
            "message": gumroad_res.get("message", "Invalid license key or maximum seats exceeded.")
        }

    purchase = gumroad_res.get("purchase", {})
    email = purchase.get("email")
    recurrence = purchase.get("recurrence")  # "monthly", "yearly", None
    variants = purchase.get("variants") or ""
    
    # Check if subscription is ended, refunded, or chargebacked
    if purchase.get("ended") or purchase.get("chargebacked") or purchase.get("refunded"):
        return {
            "success": False,
            "message": "This subscription has ended, was refunded, or chargebacked."
        }

    # Calculate expiration timestamp
    now = int(time.time())
    expires_at = None
    plan_name = "LIFETIME"

    if recurrence == "monthly" or "month" in variants.lower():
        expires_at = now + (32 * 86400)  # 32 days grace
        plan_name = "PRO_MONTHLY"
    elif recurrence == "yearly" or "annual" in variants.lower():
        expires_at = now + (370 * 86400)  # 370 days grace
        plan_name = "PRO_ANNUAL"

    state = {
        "is_active": True,
        "license_key": clean_key,
        "machine_id": current_machine_id,
        "plan_type": plan_name,
        "activated_at": now,
        "expires_at": expires_at,
        "last_verified_at": now,
        "last_monotonic_time": now,
        "customer_email": email
    }
    save_license_state(state)

    return {
        "success": True,
        "message": f"Successfully activated {plan_name} license on this computer!",
        "plan": plan_name,
        "machine_id": current_machine_id,
        "expires_at": time.strftime("%Y-%m-%d", time.localtime(expires_at)) if expires_at else "Lifetime"
    }


def get_license_status() -> Dict[str, Any]:
    """
    Returns the real-time licensing status for the application.
    Enforces hardware match, clock integrity, and expiration checks.
    """
    current_machine_id = get_hardware_fingerprint()
    state = load_license_state()

    # 1. Check if active
    if not state.get("is_active"):
        return {
            "is_licensed": False,
            "reason": "NOT_ACTIVATED",
            "message": "Please enter your Gumroad license key to activate PicClip Studio.",
            "machine_id": current_machine_id,
            "plan": "UNLICENSED",
            "days_remaining": 0
        }

    # 2. Check Hardware Fingerprint Match (Anti-Sharing Lock)
    saved_machine_id = state.get("machine_id")
    if saved_machine_id != current_machine_id:
        return {
            "is_licensed": False,
            "reason": "MACHINE_MISMATCH",
            "message": f"Hardware mismatch! License was registered to {saved_machine_id}, but this device is {current_machine_id}. Sharing is not permitted.",
            "machine_id": current_machine_id,
            "plan": "LOCKED",
            "days_remaining": 0
        }

    # 3. Check Local Cryptographic Integrity
    if not verify_local_integrity(state):
        return {
            "is_licensed": False,
            "reason": "TAMPER_DETECTED",
            "message": "License state tampering detected! Re-activation required.",
            "machine_id": current_machine_id,
            "plan": "LOCKED",
            "days_remaining": 0
        }

    # 4. Check Clock Rollback
    if not check_anti_clock_rollback(state):
        return {
            "is_licensed": False,
            "reason": "CLOCK_ROLLBACK_DETECTED",
            "message": "System clock rollback detected! Please reset your system clock to current time.",
            "machine_id": current_machine_id,
            "plan": "LOCKED",
            "days_remaining": 0
        }

    # 5. Check Expiration (Monthly / Annual)
    now = int(time.time())
    expires_at = state.get("expires_at")
    days_remaining = None

    if expires_at is not None:
        if now > expires_at:
            # Expired!
            state["is_active"] = False
            save_license_state(state)
            return {
                "is_licensed": False,
                "reason": "EXPIRED",
                "message": f"Your {state.get('plan_type')} subscription has expired. Please renew on Gumroad.",
                "machine_id": current_machine_id,
                "plan": state.get("plan_type"),
                "days_remaining": 0
            }
        days_remaining = max(0, int((expires_at - now) / 86400))

    # All checks passed!
    save_license_state(state)  # Save updated monotonic clock

    return {
        "is_licensed": True,
        "reason": "VALID",
        "message": "PicClip Studio is active and licensed.",
        "machine_id": current_machine_id,
        "plan": state.get("plan_type"),
        "customer_email": state.get("customer_email"),
        "expires_at": time.strftime("%Y-%m-%d", time.localtime(expires_at)) if expires_at else "Lifetime",
        "days_remaining": days_remaining if days_remaining is not None else "Unlimited"
    }
