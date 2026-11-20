"use client";

import React, { useState, useEffect } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Key,
  Cpu,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  AlertCircle,
  Loader2,
  X,
  Lock,
  Clock,
  RefreshCw
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import { upgradePlanTier } from "@/lib/credits";

interface LicenseStatus {
  is_licensed: boolean;
  reason?: string;
  message?: string;
  machine_id: string;
  plan?: string;
  customer_email?: string;
  expires_at?: string;
  days_remaining?: number | string;
}

interface DesktopLicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: (status: LicenseStatus) => void;
}

export function DesktopLicenseModal({
  isOpen,
  onClose,
  onStatusChange
}: DesktopLicenseModalProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [licenseKeyInput, setLicenseKeyInput] = useState("");
  const [activating, setActivating] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/desktop/license/status");
      if (res.ok) {
        const data: LicenseStatus = await res.json();
        setStatus(data);
        if (onStatusChange) onStatusChange(data);
      }
    } catch (e) {
      console.error("Failed to fetch license status:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  const handleCopyMachineId = () => {
    if (!status?.machine_id) return;
    navigator.clipboard.writeText(status.machine_id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKeyInput.trim()) return;

    setActivating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/desktop/license/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license_key: licenseKeyInput.trim() })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || data.message || "License activation failed.");
      }

      setSuccessMsg(data.message || "License successfully activated on this machine!");
      setLicenseKeyInput("");
      upgradePlanTier("pro");
      await fetchStatus();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to activate license.");
    } finally {
      setActivating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden transition-all duration-300 ${
          isDark
            ? "bg-[#0E111A] border-gray-800 text-gray-100"
            : "bg-white border-gray-200 text-gray-900"
        }`}
      >
        {/* Header */}
        <div className="relative p-6 border-b border-gray-800/60 bg-gradient-to-r from-violet-600/15 via-blue-600/10 to-transparent">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${status?.is_licensed ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-violet-500/20 text-violet-400 border border-violet-500/30"}`}>
              {status?.is_licensed ? <ShieldCheck className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">PicClip Studio Desktop License</h2>
              <p className="text-xs text-gray-400">Node-locked hardware protection & Gumroad subscription sync</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Status Banner */}
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
            </div>
          ) : status?.is_licensed ? (
            <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
                  <ShieldCheck className="w-4 h-4" /> Active & Verified Device
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {status.plan || "PRO"}
                </span>
              </div>
              <div className="text-xs text-emerald-200/80 space-y-1 pt-1">
                <p>Bound to Hardware ID: <span className="font-mono font-medium">{status.machine_id}</span></p>
                <p>Expires: <span className="font-medium text-white">{status.expires_at}</span> ({status.days_remaining} days remaining)</p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
                <ShieldAlert className="w-4 h-4" /> Standalone Device Activation Required
              </div>
              <p className="text-xs text-amber-200/80">
                This installation is locked to your PC's hardware. Enter your Gumroad subscription key to unlock unlimited AI clipping.
              </p>
            </div>
          )}

          {/* Machine ID Box */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-violet-400" /> Your Hardware Machine ID
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 font-mono text-sm px-3.5 py-2.5 rounded-lg border border-gray-700/60 bg-gray-900/80 text-gray-200 select-all">
                {status?.machine_id || "Detecting..."}
              </div>
              <button
                type="button"
                onClick={handleCopyMachineId}
                className="px-3 py-2.5 rounded-lg border border-gray-700 hover:border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                {copiedId ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copiedId ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-[11px] text-gray-500">
              Each license binds permanently to 1 PC. Prevents key cracking and sharing.
            </p>
          </div>

          {/* Key Input Form */}
          <form onSubmit={handleActivate} className="space-y-3">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-blue-400" /> Gumroad License Key
            </label>
            <input
              type="text"
              placeholder="e.g. 8A2F1C-9E4B0D-7C3A8F-1200AB"
              value={licenseKeyInput}
              onChange={(e) => setLicenseKeyInput(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-700 bg-gray-900/90 text-white placeholder-gray-500 font-mono text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
            />

            {errorMsg && (
              <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400 flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={activating || !licenseKeyInput.trim()}
              className="w-full py-2.5 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 text-white shadow-lg shadow-violet-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              {activating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Verifying Hardware Lock...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Activate Device License
                </>
              )}
            </button>
          </form>

          {/* Pricing Links */}
          <div className="pt-3 border-t border-gray-800/80 flex items-center justify-between text-xs">
            <span className="text-gray-400">Need a license key?</span>
            <a
              href="https://gumroad.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors"
            >
              Buy on Gumroad <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="text-[11px] text-gray-500 text-center">
            Tip: For testing on this computer, you can use the Founder Key: <span className="font-mono text-gray-300">PICCLIP-PRO-DEMO-2026</span>
          </div>
        </div>
      </div>
    </div>
  );
}
