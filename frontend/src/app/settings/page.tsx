"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { useTheme } from "@/lib/theme";
import { fetchStorageStatus, clearStorageCache, clearAllPlatformData, StorageStatus, formatErrorMessage, safeErrorText, openDesktopOutputFolder } from "@/lib/api";
import { clearLastActiveProjectId, clearActiveJob } from "@/lib/activeJob";
import {
  Settings,
  Sparkles,
  Type,
  HardDrive,
  Save,
  CheckCircle2,
  Trash2,
  Sliders,
  Loader2,
  AlertCircle,
  AlertTriangle,
  X,
  Zap,
  Check,
  ExternalLink,
  ShieldCheck,
  ArrowRight,
  Tag,
  FolderOpen
} from "lucide-react";
import {
  getUserCredits,
  getTimeUntilDailyReset,
  UserCreditState,
  PLAN_CONFIGS
} from "@/lib/credits";
import {
  getStorageDestination,
  setStorageDestination,
  getGoogleDriveAccount,
  saveGoogleDriveAccount,
  connectGoogleDriveMock,
  disconnectGoogleDrive,
  StorageLocation,
  GoogleDriveAccount
} from "@/lib/googleDrive";
import { UpgradeModal } from "@/components/subscription/UpgradeModal";

export default function SettingsPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkText, setWatermarkText] = useState("@mychannel");
  const [watermarkPosition, setWatermarkPosition] = useState<"top_right" | "top_left" | "bottom_right" | "bottom_left">("top_right");
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.85);

  const [defaultSubtitleStyle, setDefaultSubtitleStyle] = useState("capcut");
  const [defaultSubtitleSize, setDefaultSubtitleSize] = useState(64);
  const [defaultSubtitlePlacement, setDefaultSubtitlePlacement] = useState("bottom_safe");

  const [defaultStackedRatio, setDefaultStackedRatio] = useState(0.38);
  const [defaultUnsharp, setDefaultUnsharp] = useState(true);
  const [defaultAudioDenoise, setDefaultAudioDenoise] = useState(true);
  const [defaultFps, setDefaultFps] = useState(30);

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [cacheClearSuccess, setCacheClearSuccess] = useState(false);
  const [cacheSuccessMsg, setCacheSuccessMsg] = useState("");
  const [cacheErrorMsg, setCacheErrorMsg] = useState<string | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [storageInfo, setStorageInfo] = useState<StorageStatus | null>(null);

  // Danger Zone: Wipe All Data Modal
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [isWipingAll, setIsWipingAll] = useState(false);
  const [wipeSuccessMsg, setWipeSuccessMsg] = useState("");

  // User Credits & Plan State
  const [credits, setCredits] = useState<UserCreditState>(getUserCredits());
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Storage Destination State (Enforced 100% Local Disk Storage)
  const [openFolderMsg, setOpenFolderMsg] = useState("");

  const refreshCredits = () => setCredits(getUserCredits());

  const handleOpenFolder = async () => {
    setOpenFolderMsg("Opening outputs folder in File Explorer / Finder...");
    await openDesktopOutputFolder();
    setTimeout(() => setOpenFolderMsg(""), 4000);
  };

  const handleWipeAll = async () => {
    setIsWipingAll(true);
    try {
      const res = await clearAllPlatformData();
      if (res.success) {
        clearLastActiveProjectId();
        clearActiveJob();
        setShowWipeModal(false);
        setWipeSuccessMsg(res.message);
        await loadStorage();
        setTimeout(() => setWipeSuccessMsg(""), 6000);
      } else {
        alert("Failed to wipe platform data: " + formatErrorMessage(res.message));
      }
    } catch (e: any) {
      alert("Error wiping data: " + formatErrorMessage(e));
    } finally {
      setIsWipingAll(false);
    }
  };

  const loadStorage = async () => {
    const info = await fetchStorageStatus();
    if (info) setStorageInfo(info);
  };

  useEffect(() => {
    loadStorage();
    refreshCredits();

    window.addEventListener("pic_clip_credits_updated", refreshCredits);

    try {
      const saved = localStorage.getItem("pic_clip_studio_settings");
      if (saved) {
        const data = JSON.parse(saved);
        if (typeof data.watermarkEnabled === "boolean") setWatermarkEnabled(data.watermarkEnabled);
        if (data.watermarkText) setWatermarkText(data.watermarkText);
        if (data.watermarkPosition) setWatermarkPosition(data.watermarkPosition);
        if (data.watermarkOpacity) setWatermarkOpacity(data.watermarkOpacity);
        if (data.defaultSubtitleStyle) setDefaultSubtitleStyle(data.defaultSubtitleStyle);
        if (data.defaultSubtitleSize) setDefaultSubtitleSize(data.defaultSubtitleSize);
        if (data.defaultSubtitlePlacement) setDefaultSubtitlePlacement(data.defaultSubtitlePlacement);
        if (data.defaultStackedRatio) setDefaultStackedRatio(data.defaultStackedRatio);
        if (typeof data.defaultUnsharp === "boolean") setDefaultUnsharp(data.defaultUnsharp);
        if (typeof data.defaultAudioDenoise === "boolean") setDefaultAudioDenoise(data.defaultAudioDenoise);
        if (data.defaultFps) setDefaultFps(data.defaultFps);
      }
    } catch (e) {
      console.warn("Could not load settings:", e);
    }

    return () => {
      window.removeEventListener("pic_clip_credits_updated", refreshCredits);
    };
  }, []);

  const handleSave = () => {
    try {
      setStorageDestination("local");
      const payload = {
        watermarkEnabled,
        watermarkText,
        watermarkPosition,
        watermarkOpacity,
        defaultSubtitleStyle,
        defaultSubtitleSize,
        defaultSubtitlePlacement,
        defaultStackedRatio,
        defaultUnsharp,
        defaultAudioDenoise,
        defaultFps,
      };
      localStorage.setItem("pic_clip_studio_settings", JSON.stringify(payload));
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (e) {
      console.error("Save error:", e);
    }
  };

  const handleClearCache = async () => {
    setIsClearingCache(true);
    setCacheErrorMsg(null);
    try {
      const res = await clearStorageCache();
      if (res.success) {
        setCacheSuccessMsg(res.message);
        setCacheClearSuccess(true);
        await loadStorage();
        setTimeout(() => setCacheClearSuccess(false), 5000);
      } else {
        setCacheErrorMsg(safeErrorText(res.message));
      }
    } catch (e: any) {
      setCacheErrorMsg(safeErrorText(e));
    } finally {
      setIsClearingCache(false);
    }
  };

  return (
    <AppShell
      headerTitle="Brand Kit & Settings"
      headerSubtitle="Channel Watermarks, Typography Presets & Master Render Defaults"
    >
      <div className="p-8 md:p-12 max-w-4xl mx-auto space-y-8">
        {/* Status Toast */}
        {savedSuccess && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 shadow-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="font-bold">Settings Saved Successfully!</span> All new projects will adopt these presets.
          </div>
        )}

        {cacheClearSuccess && (
          <div className={`p-4 rounded-2xl border text-xs flex items-center gap-2 shadow-xs ${
            isDark ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-200" : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}>
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <div>
              <span className="font-bold">Render Cache Cleared!</span> {cacheSuccessMsg || "Temporary files removed from disk."}
            </div>
          </div>
        )}

        {cacheErrorMsg && (
          <div className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 shadow-xs ${
            isDark ? "bg-rose-950/40 border-rose-500/50 text-rose-200" : "bg-rose-50 border-rose-200 text-rose-700"
          }`}>
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
              <span className="font-medium">{safeErrorText(cacheErrorMsg)}</span>
            </div>
            <button
              onClick={() => setCacheErrorMsg(null)}
              className="p-1 rounded-lg hover:bg-rose-500/20 text-rose-400 hover:text-rose-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {wipeSuccessMsg && (
          <div className={`p-4 rounded-2xl border text-xs flex items-center gap-2 shadow-xs ${
            isDark ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-200" : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}>
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span className="font-bold">{wipeSuccessMsg}</span>
          </div>
        )}

        {/* SECTION 1: BRAND KIT */}
        <div className={`rounded-3xl p-6 md:p-8 space-y-5 shadow-xs border ${
          isDark ? "bg-[#111319] border-[#232733]" : "bg-white border-gray-200/80"
        }`}>
          <div className={`flex items-center justify-between border-b pb-3 ${
            isDark ? "border-[#1e222d]" : "border-gray-100"
          }`}>
            <div>
              <h2 className={`text-sm font-black flex items-center gap-2 ${isDark ? "text-white" : "text-gray-950"}`}>
                <Sparkles className={`w-4 h-4 ${isDark ? "text-purple-400" : "text-black"}`} /> Channel Brand Kit
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Watermark badge overlay applied across all master video exports.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setWatermarkEnabled(!watermarkEnabled)}
              className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                watermarkEnabled
                  ? isDark ? "bg-purple-600 justify-end" : "bg-black justify-end"
                  : isDark ? "bg-[#282c3c] justify-start" : "bg-gray-200 justify-start"
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-white shadow-md" />
            </button>
          </div>

          {watermarkEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div>
                <label className={`text-xs font-semibold block mb-1.5 ${isDark ? "text-gray-400" : "text-gray-700"}`}>
                  Watermark Text
                </label>
                <input
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  placeholder="@yourbrand"
                  className={`w-full rounded-xl p-3 text-xs focus:outline-none font-mono font-medium border ${
                    isDark
                      ? "bg-[#171922] border-[#282c3c] text-white focus:border-purple-500"
                      : "bg-[#f6f7f9] border-gray-200 text-gray-900 focus:border-black"
                  }`}
                />
              </div>

              <div>
                <label className={`text-xs font-semibold block mb-1.5 ${isDark ? "text-gray-400" : "text-gray-700"}`}>
                  Screen Position
                </label>
                <select
                  value={watermarkPosition}
                  onChange={(e) => setWatermarkPosition(e.target.value as any)}
                  className={`w-full rounded-xl p-3 text-xs focus:outline-none border ${
                    isDark
                      ? "bg-[#171922] border-[#282c3c] text-white focus:border-purple-500"
                      : "bg-[#f6f7f9] border-gray-200 text-gray-900 focus:border-black"
                  }`}
                >
                  <option value="top_right">Top Right (Safe Corner)</option>
                  <option value="top_left">Top Left</option>
                  <option value="bottom_right">Bottom Right</option>
                  <option value="bottom_left">Bottom Left</option>
                </select>
              </div>

              <div>
                <label className={`text-xs font-semibold block mb-1.5 ${isDark ? "text-gray-400" : "text-gray-700"}`}>
                  Opacity: <span className={`font-mono font-bold ${isDark ? "text-purple-300" : "text-black"}`}>{(watermarkOpacity * 100).toFixed(0)}%</span>
                </label>
                <input
                  type="range"
                  min={0.2}
                  max={1.0}
                  step={0.05}
                  value={watermarkOpacity}
                  onChange={(e) => setWatermarkOpacity(parseFloat(e.target.value))}
                  className="w-full accent-purple-500 bg-gray-700 h-2 rounded-lg appearance-none cursor-pointer mt-3"
                />
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: SUBTITLE TYPOGRAPHY DEFAULTS */}
        <div className={`rounded-3xl p-6 md:p-8 space-y-5 shadow-xs border ${
          isDark ? "bg-[#111319] border-[#232733]" : "bg-white border-gray-200/80"
        }`}>
          <div className={`border-b pb-3 ${isDark ? "border-[#1e222d]" : "border-gray-100"}`}>
            <h2 className={`text-sm font-black flex items-center gap-2 ${isDark ? "text-white" : "text-gray-950"}`}>
              <Type className={`w-4 h-4 ${isDark ? "text-purple-400" : "text-black"}`} /> Default Subtitle Typography
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Style presets, font size, and placement applied to new clips by default.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={`text-xs font-semibold block mb-1.5 ${isDark ? "text-gray-400" : "text-gray-700"}`}>
                Default Style Preset
              </label>
              <select
                value={defaultSubtitleStyle}
                onChange={(e) => setDefaultSubtitleStyle(e.target.value)}
                className={`w-full rounded-xl p-3 text-xs focus:outline-none border ${
                  isDark
                    ? "bg-[#171922] border-[#282c3c] text-white focus:border-purple-500"
                    : "bg-[#f6f7f9] border-gray-200 text-gray-900 focus:border-black"
                }`}
              >
                <option value="capcut">CapCut Neon Cyan (Word Pop)</option>
                <option value="hormozi">Hormozi Vivid Gold</option>
                <option value="cyberpunk">Cyberpunk Neon Red</option>
                <option value="minimalist">Clean Minimalist White</option>
              </select>
            </div>

            <div>
              <label className={`text-xs font-semibold block mb-1.5 ${isDark ? "text-gray-400" : "text-gray-700"}`}>
                Default Font Size ({defaultSubtitleSize}px)
              </label>
              <select
                value={defaultSubtitleSize}
                onChange={(e) => setDefaultSubtitleSize(Number(e.target.value))}
                className={`w-full rounded-xl p-3 text-xs focus:outline-none border ${
                  isDark
                    ? "bg-[#171922] border-[#282c3c] text-white focus:border-purple-500"
                    : "bg-[#f6f7f9] border-gray-200 text-gray-900 focus:border-black"
                }`}
              >
                <option value={48}>Small (48px)</option>
                <option value={64}>Medium (64px - Recommended)</option>
                <option value={80}>Large (80px)</option>
                <option value={96}>Hero XL (96px)</option>
              </select>
            </div>

            <div>
              <label className={`text-xs font-semibold block mb-1.5 ${isDark ? "text-gray-400" : "text-gray-700"}`}>
                Default Safe-Zone Placement
              </label>
              <select
                value={defaultSubtitlePlacement}
                onChange={(e) => setDefaultSubtitlePlacement(e.target.value)}
                className={`w-full rounded-xl p-3 text-xs focus:outline-none border ${
                  isDark
                    ? "bg-[#171922] border-[#282c3c] text-white focus:border-purple-500"
                    : "bg-[#f6f7f9] border-gray-200 text-gray-900 focus:border-black"
                }`}
              >
                <option value="bottom_safe">📱 Safe Bottom (Above TikTok UI)</option>
                <option value="center">⚡ Center (High Energy / Hormozi)</option>
                <option value="divider">📐 Divider (Below Facecam)</option>
                <option value="top">🔝 Top Third</option>
              </select>
            </div>
          </div>
        </div>

        {/* SECTION 3: MASTER AV QUALITY ENGINE */}
        <div className={`rounded-3xl p-6 md:p-8 space-y-5 shadow-xs border ${
          isDark ? "bg-[#111319] border-[#232733]" : "bg-white border-gray-200/80"
        }`}>
          <div className={`border-b pb-3 ${isDark ? "border-[#1e222d]" : "border-gray-100"}`}>
            <h2 className={`text-sm font-black flex items-center gap-2 ${isDark ? "text-white" : "text-gray-950"}`}>
              <Sliders className={`w-4 h-4 ${isDark ? "text-purple-400" : "text-black"}`} /> Master AV Engine Defaults
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Hardware render parameters and acoustic post-processing filters.
            </p>
          </div>

          <div className="space-y-3">
            <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${
              isDark ? "bg-[#171922] border-[#282c3c]" : "bg-[#f7f8fa] border-gray-200/70"
            }`}>
              <div>
                <span className={`text-xs font-bold block ${isDark ? "text-white" : "text-gray-900"}`}>Lanczos Adaptive Unsharp Sharpening</span>
                <span className="text-[11px] text-gray-400">
                  Restores razor-sharp HUD textures, text, and gameplay crosshairs in vertical scale.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDefaultUnsharp(!defaultUnsharp)}
                className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                  defaultUnsharp
                    ? isDark ? "bg-purple-600 justify-end" : "bg-black justify-end"
                    : isDark ? "bg-[#282c3c] justify-start" : "bg-gray-300 justify-start"
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-white shadow-md" />
              </button>
            </div>

            <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${
              isDark ? "bg-[#171922] border-[#282c3c]" : "bg-[#f7f8fa] border-gray-200/70"
            }`}>
              <div>
                <span className={`text-xs font-bold block ${isDark ? "text-white" : "text-gray-900"}`}>Studio Vocal Acoustic De-Noising & Ducking</span>
                <span className="text-[11px] text-gray-400">
                  Attenuates gameplay background audio to prioritize clear streamer speech.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDefaultAudioDenoise(!defaultAudioDenoise)}
                className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                  defaultAudioDenoise
                    ? isDark ? "bg-purple-600 justify-end" : "bg-black justify-end"
                    : isDark ? "bg-[#282c3c] justify-start" : "bg-gray-300 justify-start"
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-white shadow-md" />
              </button>
            </div>

            <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${
              isDark ? "bg-[#171922] border-[#282c3c]" : "bg-[#f7f8fa] border-gray-200/70"
            }`}>
              <div>
                <span className={`text-xs font-bold block ${isDark ? "text-white" : "text-gray-900"}`}>Default Master Export Framerate</span>
                <span className="text-[11px] text-gray-400">
                  Export vertical clips in cinematic 30 FPS or high-fluidity 60 FPS.
                </span>
              </div>
              <div className={`flex items-center gap-1.5 rounded-xl p-1 border ${
                isDark ? "bg-[#12141a] border-[#282c3c]" : "bg-white border-gray-200"
              }`}>
                <button
                  type="button"
                  onClick={() => setDefaultFps(30)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold font-mono transition-colors cursor-pointer ${
                    defaultFps === 30
                      ? isDark ? "bg-purple-600 text-white" : "bg-black text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  30 FPS
                </button>
                <button
                  type="button"
                  onClick={() => setDefaultFps(60)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold font-mono transition-colors cursor-pointer ${
                    defaultFps === 60
                      ? isDark ? "bg-purple-600 text-white" : "bg-black text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  60 FPS
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 4: LOCAL DISK STORAGE & RENDER VAULT */}
        <div className={`rounded-3xl p-6 md:p-8 space-y-6 shadow-xs border ${
          isDark ? "bg-[#111319] border-[#232733]" : "bg-white border-gray-200/80"
        }`}>
          <div className={`border-b pb-3 ${isDark ? "border-[#1e222d]" : "border-gray-100"}`}>
            <div className="flex items-center justify-between">
              <h2 className={`text-sm font-black flex items-center gap-2 ${isDark ? "text-white" : "text-gray-950"}`}>
                <HardDrive className={`w-4 h-4 ${isDark ? "text-purple-400" : "text-black"}`} /> Local Disk Storage & Render Vault
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                100% Private Local Disk
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              All vertical MP4 master exports are saved directly to your local computer disk with zero third-party cloud uploads.
            </p>
          </div>

          {openFolderMsg && (
            <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs flex items-center gap-2">
              <FolderOpen className="w-4 h-4 flex-shrink-0" />
              <span>{openFolderMsg}</span>
            </div>
          )}

          {/* Local Disk Vault Card */}
          <div className={`p-6 rounded-3xl border space-y-4 ${
            isDark ? "bg-[#141620] border-[#252938]" : "bg-gray-50 border-gray-200"
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center shrink-0">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">Local Storage Vault (<code className="font-mono text-purple-400">/output</code>)</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Direct local NVMe/SSD storage &bull; Zero cloud bandwidth latency &bull; 100% Private
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleOpenFolder}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md whitespace-nowrap self-start sm:self-auto"
              >
                <FolderOpen className="w-4 h-4" />
                <span>Open Folder in File Explorer / Finder</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-white/5 text-xs text-gray-300">
              <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                <span className="font-bold text-white block mb-0.5">Direct SSD Storage</span>
                <span className="text-[11px] text-gray-400">Renders write immediately to your disk. No uploads or internet downloads needed.</span>
              </div>
              <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                <span className="font-bold text-white block mb-0.5">Native OS Reveal</span>
                <span className="text-[11px] text-gray-400">Clicking "Download" opens File Explorer (Windows) or Finder (Mac) with the clip selected.</span>
              </div>
              <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                <span className="font-bold text-white block mb-0.5">Uncompressed Master Quality</span>
                <span className="text-[11px] text-gray-400">Preserves maximum bitrate, 60 FPS smoothness, and lossless AAC audio.</span>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 5: SUBSCRIPTION TIER & DAILY GENERATION ALLOWANCE */}
        <div className={`rounded-3xl p-6 md:p-8 space-y-6 shadow-xs border ${
          isDark ? "bg-[#111319] border-[#232733]" : "bg-white border-gray-200/80"
        }`}>
          <div className={`border-b pb-3 ${isDark ? "border-[#1e222d]" : "border-gray-100"}`}>
            <div className="flex items-center justify-between">
              <h2 className={`text-sm font-black flex items-center gap-2 ${isDark ? "text-white" : "text-gray-950"}`}>
                <Zap className={`w-4 h-4 ${isDark ? "text-amber-400" : "text-amber-500"}`} /> Subscription Plan & Generation Credits
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                credits.tier === "pro"
                  ? "bg-cyan-500/10 border border-cyan-500/30 text-cyan-400"
                  : credits.tier === "creator"
                  ? "bg-purple-500/10 border border-purple-500/30 text-purple-400"
                  : "bg-gray-500/10 border border-gray-500/30 text-gray-400"
              }`}>
                {PLAN_CONFIGS[credits.tier].name}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Free plan includes 3 video generations per day. Upgrade to Creator Pass or Pro for high-volume 60 FPS renders.
            </p>
          </div>

          {/* Credits Overview Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            <div className={`p-4 rounded-2xl border ${isDark ? "bg-[#151722] border-[#242938]" : "bg-gray-50 border-gray-200"}`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block font-mono">
                Daily Allowance
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-black text-white">
                  {credits.tier === "pro" ? "∞" : Math.max(0, credits.dailyGenerationsLimit - credits.dailyGenerationsUsed)}
                </span>
                <span className="text-xs text-gray-400 font-mono">
                  / {credits.tier === "pro" ? "Unlimited" : `${credits.dailyGenerationsLimit} left today`}
                </span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Resets at 00:00 UTC (in {getTimeUntilDailyReset()})
              </p>
            </div>

            <div className={`p-4 rounded-2xl border ${isDark ? "bg-[#151722] border-[#242938]" : "bg-gray-50 border-gray-200"}`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block font-mono">
                Monthly Usage
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-black text-purple-400">
                  {credits.monthlyGenerationsUsed}
                </span>
                <span className="text-xs text-gray-400 font-mono">
                  / {credits.tier === "pro" ? "Unlimited" : `${credits.monthlyGenerationsLimit} clips max`}
                </span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Calendar month quota
              </p>
            </div>

            <div className={`p-4 rounded-2xl border ${isDark ? "bg-[#151722] border-[#242938]" : "bg-gray-50 border-gray-200"}`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block font-mono">
                Top-up Credits
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-black text-amber-400">
                  +{credits.purchasedCredits}
                </span>
                <span className="text-xs text-gray-400 font-mono">
                  extra clips
                </span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Credits never expire
              </p>
            </div>

          </div>

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="text-xs text-gray-400">
              <span className="font-bold text-white">Current Tier Specs: </span>
              {PLAN_CONFIGS[credits.tier].maxResolution} • {PLAN_CONFIGS[credits.tier].maxFps} FPS • {PLAN_CONFIGS[credits.tier].watermark ? "With Watermark" : "No Watermark"}
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Link
                href="/pricing"
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition-all border border-white/10 flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Tag className="w-3.5 h-3.5 text-purple-400" />
                <span>View All Plans & Pricing</span>
              </Link>
              <button
                type="button"
                onClick={() => setShowUpgradeModal(true)}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Upgrade Plan</span>
              </button>
            </div>
          </div>
        </div>

        {/* SECTION 6: STORAGE & CACHE CLEANUP */}
        <div className={`rounded-3xl p-6 md:p-8 space-y-4 shadow-xs border ${
          isDark ? "bg-[#111319] border-[#232733]" : "bg-white border-gray-200/80"
        }`}>
          <div className={`border-b pb-3 ${isDark ? "border-[#1e222d]" : "border-gray-100"}`}>
            <h2 className={`text-sm font-black flex items-center gap-2 ${isDark ? "text-white" : "text-gray-950"}`}>
              <HardDrive className={`w-4 h-4 ${isDark ? "text-purple-400" : "text-black"}`} /> Storage & Cache Management
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Clean up temporary demuxed audio chunks, intermediate frame caches, and finished render files.
            </p>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div>
              <p className={`text-xs font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Local VOD & Processing Cache</p>
              <p className="text-[11px] text-gray-400 font-mono">
                {storageInfo
                  ? `${storageInfo.formatted_size} total (${storageInfo.output_count} master renders, ${storageInfo.upload_count} source VODs)`
                  : "Scanning disk storage..."}
              </p>
            </div>

            <button
              type="button"
              onClick={handleClearCache}
              disabled={isClearingCache}
              className={`px-4 py-2 rounded-xl border font-bold text-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 ${
                isDark
                  ? "bg-[#171922] hover:bg-rose-950/30 border-[#282c3c] hover:border-rose-500/50 text-gray-300 hover:text-rose-400"
                  : "bg-gray-100 hover:bg-rose-50 border-gray-200 hover:border-rose-200 text-gray-700 hover:text-rose-600"
              }`}
            >
              {isClearingCache ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Clearing Cache...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Temporary Cache</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* SECTION 5: DANGER ZONE - CLEAR ALL DATA */}
        <div className={`rounded-3xl p-6 md:p-8 space-y-5 shadow-xs border ${
          isDark ? "bg-[#140f12] border-rose-950/60" : "bg-rose-50/40 border-rose-200"
        }`}>
          <div className={`border-b pb-3 ${isDark ? "border-rose-950/80" : "border-rose-100"}`}>
            <h2 className="text-sm font-black flex items-center gap-2 text-rose-500">
              <AlertTriangle className="w-4 h-4 text-rose-500" /> Danger Zone: Factory Reset & Wipe Data
            </h2>
            <p className={`text-xs mt-0.5 ${isDark ? "text-rose-300/70" : "text-rose-600/80"}`}>
              Permanently purge all workspace projects, uploaded raw streams, rendered clips, and caches from disk.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
            <div>
              <p className={`text-xs font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Wipe All Platform Data</p>
              <p className="text-[11px] text-gray-400">
                This action is non-reversible. You will be prompted with a confirmation dialog before deletion proceeds.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowWipeModal(true)}
              className="px-4 py-2.5 rounded-xl border border-rose-500/50 bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-500 font-bold text-xs transition-all flex items-center gap-2 cursor-pointer shadow-xs whitespace-nowrap self-start sm:self-auto"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All Data</span>
            </button>
          </div>
        </div>

        {/* SAVE BUTTON */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSave}
            className={`px-8 py-3.5 rounded-2xl font-extrabold text-xs md:text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer hover:scale-[1.01] active:scale-[0.99] ${
              isDark ? "bg-purple-600 hover:bg-purple-500 text-white" : "bg-black hover:bg-gray-800 text-white"
            }`}
          >
            <Save className="w-4 h-4" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>

      {/* CONFIRMATION MODAL: CLEAR ALL DATA */}
      {showWipeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-3xl border p-6 md:p-8 space-y-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150 ${
            isDark ? "bg-[#111319] border-rose-900/50 text-white" : "bg-white border-rose-200 text-gray-900"
          }`}>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500">
                <AlertTriangle className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <h3 className="text-base font-black">Clear All Platform Data?</h3>
                <p className="text-xs text-rose-500 font-semibold">Irreversible Platform Wipe</p>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-2 ${
              isDark ? "bg-rose-950/30 border-rose-900/40 text-rose-200/90" : "bg-rose-50 border-rose-100 text-rose-800"
            }`}>
              <p className="font-bold">Are you absolutely sure you want to proceed?</p>
              <ul className="list-disc list-inside space-y-1 text-[11px] opacity-90">
                <li>All projects and timeline metadata in Library will be erased.</li>
                <li>All raw uploaded videos and captured live streams will be removed.</li>
                <li>All exported and rendered clips will be permanently deleted.</li>
                <li>All temporary processing caches will be cleared to 0 Bytes.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowWipeModal(false)}
                disabled={isWipingAll}
                className={`px-5 py-2.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 ${
                  isDark
                    ? "bg-[#171922] hover:bg-[#1f2330] border-[#292d3c] text-gray-300"
                    : "bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-700"
                }`}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleWipeAll}
                disabled={isWipingAll}
                className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isWipingAll ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Wiping All Data...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Yes, Delete Everything</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Upgrade Plan Modal */}
      {showUpgradeModal && (
        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
        />
      )}
    </AppShell>
  );
}
