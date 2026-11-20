"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ProjectItem } from "@/lib/types";
import {
  fetchProjects,
  deleteProjectById,
  checkStreamConnectivity,
  StreamConnectivityResult,
  cancelJob,
  safeErrorText,
} from "@/lib/api";
import {
  saveActiveJob,
  getActiveJob,
  updateActiveJobProgress,
  clearActiveJob,
  saveLastActiveProjectId,
} from "@/lib/activeJob";
import { addNotification } from "@/lib/notifications";
import { canGenerateVideo, consumeGenerationCredit, getUserCredits } from "@/lib/credits";
import { UpgradeModal } from "@/components/subscription/UpgradeModal";
import { useTheme } from "@/lib/theme";
import { getCurrentUser, UserAccount } from "@/lib/auth";
import { AuthModal } from "@/components/auth/AuthModal";
import { FolderOpen } from "lucide-react";
import {
  UploadCloud,
  Link as LinkIcon,
  PlayCircle,
  Scissors,
  Flame,
  Layers,
  Sparkles,
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowRight,
  Trash2,
  Calendar,
  Gamepad2,
  Mic,
  Camera,
  GraduationCap,
  Laugh,
  Video,
  Shield,
  Sliders,
  Tv,
  Zap,
  Check,
  RotateCcw,
  Plus
} from "lucide-react";

type ContentType = "vlog" | "podcast" | "educational" | "comedy" | "gaming";

const CONTENT_FORMATS = [
  {
    id: "vlog" as ContentType,
    label: "Vlog & IRL",
    icon: Camera,
    badge: "Lifestyle & Travel",
    desc: "Cinematic 9:16 reframe & travel highlights"
  },
  {
    id: "podcast" as ContentType,
    label: "Podcast & Talk",
    icon: Mic,
    badge: "Interviews",
    desc: "Dialogue hooks, dual split & active speaker cut"
  },
  {
    id: "educational" as ContentType,
    label: "Tutorial & Tech",
    icon: GraduationCap,
    badge: "How-To",
    desc: "Screen + presenter PIP & step takeaways"
  },
  {
    id: "comedy" as ContentType,
    label: "Comedy & Skits",
    icon: Laugh,
    badge: "Standup",
    desc: "Setup-to-punchline timing & laughter peaks"
  },
  {
    id: "gaming" as ContentType,
    label: "Gaming Stream",
    icon: Gamepad2,
    badge: "FPS & Clutches",
    desc: "Facecam + game stacked & clutch loudness peaks"
  },
];

interface ToastNotification {
  id: string;
  type: "success" | "error" | "info";
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
}

function DashboardContent() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Mandatory Authentication State
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Ingestion Tab & Input State
  const [activeTab, setActiveTab] = useState<"upload" | "stream">("upload");
  const [contentType, setContentType] = useState<ContentType>("vlog");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dynamic AI Engine & Model Tuning Controls
  const [targetDurationTier, setTargetDurationTier] = useState<"short" | "medium" | "long">("medium"); // 30s, 45s, 60s
  const [aiSensitivity, setAiSensitivity] = useState<"balanced" | "aggressive_viral" | "deep_dialogue">("balanced");
  const [autoFaceTracking, setAutoFaceTracking] = useState<boolean>(true);
  const [systemInfo, setSystemInfo] = useState<{
    hardware_mode: string;
    cuda_available: boolean;
    device_name: string;
    cpu_threads: number;
  } | null>(null);

  // Stream URL State
  const [streamUrl, setStreamUrl] = useState("");
  const [captureDuration, setCaptureDuration] = useState<number>(300); // 5 min default
  const [isCheckingStream, setIsCheckingStream] = useState(false);
  const [streamCheck, setStreamCheck] = useState<StreamConnectivityResult | null>(null);

  // Live Agent / Background Processing State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeJobId, setAnalyzeJobId] = useState<string | null>(null);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [analyzeStage, setAnalyzeStage] = useState("");
  const [activeJobTitle, setActiveJobTitle] = useState("Video Ingestion & Analysis");

  // Completed Project Hand-off State
  const [completedProject, setCompletedProject] = useState<ProjectItem | null>(null);

  // Upgrade Modal State
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<string | undefined>(undefined);

  // Recent Projects Grid
  const [recentProjects, setRecentProjects] = useState<ProjectItem[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectToDelete, setProjectToDelete] = useState<ProjectItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Toast Notifications
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const addToast = (t: Omit<ToastNotification, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { ...t, id }]);
    if (t.type !== "error") {
      setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 6000);
    }
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  };

  // Load Projects, Auth and Hardware Acceleration Status on Mount
  useEffect(() => {
    setCurrentUser(getCurrentUser());
    setAuthChecked(true);

    const handleAuthChange = (e: any) => {
      setCurrentUser(e.detail || getCurrentUser());
    };
    window.addEventListener("pic_clip_auth_changed", handleAuthChange);

    // Fetch local hardware acceleration info
    fetch("/api/desktop/system-info")
      .then((res) => (res.ok ? res.json() : null))
      .then((info) => {
        if (info) setSystemInfo(info);
      })
      .catch(() => {});

    loadRecentProjects();

    const active = getActiveJob();
    if (active) {
      setIsAnalyzing(true);
      const jId = active.job_id || active.jobId;
      setAnalyzeJobId(jId);
      setAnalyzeProgress(active.progress || 5);
      setAnalyzeStage(active.stage || "AI Agent running in background...");
      setActiveJobTitle(active.title || "Stream Ingest & Analysis");
      pollJobStatus(jId);
    }

    return () => {
      window.removeEventListener("pic_clip_auth_changed", handleAuthChange);
    };
  }, []);

  const handleOpenOutputFolder = async () => {
    try {
      const res = await fetch("/api/desktop/open-output", { method: "POST" });
      if (res.ok) {
        addToast({
          type: "success",
          title: "Opened Output Folder",
          message: "Rendered clips folder opened in Windows Explorer.",
        });
      }
    } catch {
      // Fallback
    }
  };

  const loadRecentProjects = async () => {
    setLoadingProjects(true);
    try {
      const data = await fetchProjects();
      setRecentProjects(data);
    } catch (e) {
      console.error("Failed to load projects:", e);
    } finally {
      setLoadingProjects(false);
    }
  };

  // Probe Stream Connectivity
  const handleCheckStreamLink = async (url: string) => {
    if (!url.trim()) {
      setStreamCheck(null);
      return;
    }
    setIsCheckingStream(true);
    try {
      const res = await checkStreamConnectivity(url.trim());
      setStreamCheck(res);
    } catch {
      setStreamCheck(null);
    } finally {
      setIsCheckingStream(false);
    }
  };

  // Local File Upload
  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Login Gate Enforcement
    if (!currentUser) {
      addToast({
        type: "error",
        title: "Authentication Required",
        message: "Please sign in or use Quick Demo Login to process videos.",
      });
      return;
    }

    // Check Daily Quota (3 free / day)
    const check = canGenerateVideo();
    if (!check.allowed) {
      setUpgradeReason(check.reason);
      setShowUpgradeModal(true);
      addToast({
        type: "error",
        title: "Daily Free Limit Reached",
        message: check.reason || "Daily free generation limit reached (3/3).",
      });
      return;
    }

    setIsAnalyzing(true);
    setAnalyzeProgress(5);
    setAnalyzeStage("Uploading source media to AI pipeline...");
    setActiveJobTitle(file.name);
    setCompletedProject(null);

    addToast({
      type: "info",
      title: "File Upload Started",
      message: `Uploading "${file.name}" (${(file.size / 1024 / 1024).toFixed(1)} MB)...`,
    });

    try {
      const targetSec = targetDurationTier === "short" ? "30" : targetDurationTier === "long" ? "60" : "45";
      const formData = new FormData();
      formData.append("file", file);
      formData.append("target_duration", targetSec);
      formData.append("content_type", contentType);
      formData.append("duration_mode", "content_auto");
      formData.append("ai_sensitivity", aiSensitivity);
      formData.append("auto_face_tracking", autoFaceTracking.toString());

      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Analysis failed to start" }));
        throw new Error(safeErrorText(err));
      }

      const data = await res.json();
      setAnalyzeJobId(data.job_id);

      saveActiveJob({
        job_id: data.job_id,
        type: "video_analysis",
        title: file.name,
        progress: 10,
        stage: "Scanning frames for streamer webcam & audio...",
      });

      pollJobStatus(data.job_id);
    } catch (err: any) {
      clearActiveJob();
      setIsAnalyzing(false);
      setAnalyzeJobId(null);
      addToast({
        type: "error",
        title: "Ingestion Failed",
        message: safeErrorText(err),
      });
    }
  };

  // Stream URL Ingestion
  const handleStreamIngestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!streamUrl.trim() || isAnalyzing) return;

    // Login Gate Enforcement
    if (!currentUser) {
      addToast({
        type: "error",
        title: "Authentication Required",
        message: "Please sign in or use Quick Demo Login to capture streams.",
      });
      return;
    }

    // Check Daily Quota (3 free / day)
    const check = canGenerateVideo();
    if (!check.allowed) {
      setUpgradeReason(check.reason);
      setShowUpgradeModal(true);
      addToast({
        type: "error",
        title: "Daily Free Limit Reached",
        message: check.reason || "Daily free generation limit reached (3/3).",
      });
      return;
    }

    setIsAnalyzing(true);
    setAnalyzeProgress(5);
    setAnalyzeStage("Connecting to stream broadcast...");
    setActiveJobTitle(streamCheck?.title || "Stream Capture");
    setCompletedProject(null);

    addToast({
      type: "info",
      title: "Stream Ingest Initiated",
      message: `Capturing ${captureDuration / 60} min window from stream...`,
    });

    try {
      const targetSec = targetDurationTier === "short" ? "30" : targetDurationTier === "long" ? "60" : "45";
      const formData = new FormData();
      formData.append("url", streamUrl.trim());
      formData.append("stream_mode", "auto");
      formData.append("capture_duration", captureDuration.toString());
      formData.append("target_duration", targetSec);
      formData.append("content_type", contentType);
      formData.append("duration_mode", "content_auto");
      formData.append("ai_sensitivity", aiSensitivity);
      formData.append("auto_face_tracking", autoFaceTracking.toString());

      const res = await fetch("/api/stream/ingest", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Stream ingest failed to start" }));
        throw new Error(safeErrorText(err));
      }

      const data = await res.json();
      setAnalyzeJobId(data.job_id);

      saveActiveJob({
        job_id: data.job_id,
        type: "stream_ingest",
        title: streamCheck?.title || "Stream Capture",
        progress: 10,
        stage: "Capturing stream chunks and running visual detection...",
      });

      pollJobStatus(data.job_id);
    } catch (err: any) {
      clearActiveJob();
      setIsAnalyzing(false);
      setAnalyzeJobId(null);
      addToast({
        type: "error",
        title: "Stream Ingest Failed",
        message: safeErrorText(err),
      });
    }
  };

  // Background Job Status Poller
  const pollJobStatus = (id: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${id}`);
        if (!res.ok) return;
        const job = await res.json();

        setAnalyzeProgress(job.progress || 0);
        setAnalyzeStage(job.stage || "AI pipeline processing...");
        updateActiveJobProgress(job.progress || 0, job.stage || "");

        if (job.status === "completed") {
          clearInterval(interval);
          clearActiveJob();
          setIsAnalyzing(false);
          setAnalyzeJobId(null);

          const updated = await fetchProjects();
          setRecentProjects(updated);

          const fId = job.result?.file_id || job.file_id;
          const found = fId
            ? updated.find((p) => p.project_id === fId || p.file_id === fId)
            : updated[0];

          if (found) {
            setCompletedProject(found);
            saveLastActiveProjectId(found.project_id);
            addNotification({
              type: "analysis",
              title: "AI Viral Clips Ready!",
              message: `Discovered ${found.clips?.length || 0} moments for "${found.title}". Streamer webcam framed & kinetic captions generated.`,
              actionUrl: `/editor?project=${encodeURIComponent(found.project_id)}`,
              actionLabel: "Open in Studio",
            });
            addToast({
              type: "success",
              title: "Clips Ready in Projects!",
              message: `Generated ${found.clips?.length || 0} viral moments ready to edit in Studio.`,
              actionLabel: "Open Studio",
              actionUrl: `/editor?project=${encodeURIComponent(found.project_id)}`,
            });
          }
        } else if (job.status === "cancelled") {
          clearInterval(interval);
          clearActiveJob();
          setIsAnalyzing(false);
          setAnalyzeJobId(null);
          addNotification({
            type: "cancel",
            title: "Analysis Job Cancelled",
            message: "Stream analysis was cancelled and background resources released.",
          });
          addToast({
            type: "info",
            title: "Analysis Cancelled",
            message: "The AI agent task was cancelled successfully.",
          });
        } else if (job.status === "failed") {
          clearInterval(interval);
          clearActiveJob();
          setIsAnalyzing(false);
          setAnalyzeJobId(null);
          addToast({
            type: "error",
            title: "Processing Failed",
            message: safeErrorText(job.error || "AI pipeline encountered an error."),
          });
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
    }, 1500);
  };

  // Cancel Request Action
  const handleCancelJob = async () => {
    const active = getActiveJob();
    const jId = analyzeJobId || active?.job_id || active?.jobId;
    if (jId) {
      await cancelJob(jId);
    }
    clearActiveJob();
    setIsAnalyzing(false);
    setAnalyzeJobId(null);
    setAnalyzeProgress(0);
    setAnalyzeStage("");
    addToast({
      type: "info",
      title: "Request Cancelled",
      message: "Agent processing was halted and background tasks cleaned up.",
    });
  };

  // Delete Project Confirmation
  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    setIsDeleting(true);
    try {
      const ok = await deleteProjectById(projectToDelete.project_id);
      if (ok) {
        setRecentProjects((prev) => prev.filter((p) => p.project_id !== projectToDelete.project_id));
        if (completedProject?.project_id === projectToDelete.project_id) {
          setCompletedProject(null);
        }
        setProjectToDelete(null);
        addToast({
          type: "success",
          title: "Project Deleted",
          message: "Project and source files removed.",
        });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AppShell
      headerTitle="Create Clip"
      headerSubtitle="AI Stream Ingestion, Facecam Tracking & Kinetic Caption Studio"
    >
      <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-10">

        {/* 1. BRAND HERO SECTION WITH MASCOT LOGO */}
        <div className={`relative overflow-hidden rounded-3xl border p-8 md:p-10 shadow-2xl transition-all ${
          isDark
            ? "bg-gradient-to-br from-[#12141c] via-[#0d0f15] to-[#171424] border-[#252938]"
            : "bg-gradient-to-br from-white via-purple-50/40 to-indigo-50/30 border-purple-100"
        }`}>
          {/* Subtle ambient decorative light */}
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row items-center gap-8 justify-between">
            <div className="space-y-4 max-w-2xl text-center md:text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono font-bold tracking-wide border shadow-xs bg-purple-500/10 border-purple-500/30 text-purple-400">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                <span>PIC-CLIP™ AI 2.0 • AUTONOMOUS STREAM CLIPPING ENGINE</span>
              </div>

              <h1 className="text-3xl md:text-4xl lg:text-5xl font-black tracking-tight leading-tight">
                <span className="text-white">Convert Stream VODs into </span>
                <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-300 bg-clip-text text-transparent">
                  Viral 9:16 Shorts
                </span>
              </h1>

              <p className={`text-xs md:text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                Drop your recorded stream VODs or paste YouTube, Twitch, and Kick links. Our AI agent detects high-virality gaming and podcast moments, tracks streamer facecams, auto-splits 9:16 vertical canvas, and generates animated kinetic subtitles.
              </p>

              {/* Capability feature pills */}
              <div className="flex flex-wrap items-center gap-2 pt-2 justify-center md:justify-start">
                {[
                  { label: "Streamer Auto-Framing", icon: Tv },
                  { label: "Kinetic Captions", icon: Sparkles },
                  { label: "AI Virality Scoring", icon: Flame },
                  { label: "Twitch, Kick & YouTube", icon: Video },
                  { label: "Lossless 60 FPS", icon: Zap },
                ].map((pill, i) => {
                  const Icon = pill.icon;
                  return (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[11px] font-bold border transition-colors ${
                        isDark
                          ? "bg-[#161822] border-[#292e3f] text-gray-300"
                          : "bg-white border-gray-200 text-gray-700 shadow-xs"
                      }`}
                    >
                      <Icon className="w-3 h-3 text-purple-400" />
                      <span>{pill.label}</span>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Mascot Artwork Display (Transparent Logo without BG) */}
            <div className="flex flex-col items-center justify-center flex-shrink-0 group">
              <div className="relative w-36 h-36 md:w-44 md:h-44 flex items-center justify-center">
                <div className="absolute inset-0 bg-purple-500/20 rounded-full blur-2xl group-hover:bg-purple-500/30 transition-all duration-500 scale-90" />
                <img
                  src="/mascot_logo.png"
                  alt="PIC-CLIP Mascot Logo"
                  className="w-full h-full object-contain filter drop-shadow-[0_15px_30px_rgba(168,85,247,0.4)] group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <span className="text-[11px] font-mono font-bold tracking-widest text-purple-400 uppercase mt-2">
                Agent Active • Ready
              </span>
            </div>
          </div>
        </div>

        {/* 2. LIVE AI RADAR OVERLAY (WITH CANCEL REQUEST BUTTON) */}
        {isAnalyzing && (
          <div className={`rounded-3xl border p-6 md:p-8 space-y-5 shadow-2xl animate-in fade-in slide-in-from-top-3 duration-300 ${
            isDark
              ? "bg-[#11131a] border-purple-500/50 shadow-purple-950/20"
              : "bg-purple-50/80 border-purple-300 shadow-purple-100"
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="relative w-12 h-12 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center flex-shrink-0">
                  <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      Processing Stream
                    </span>
                    <h3 className={`text-base font-extrabold ${isDark ? "text-white" : "text-gray-950"}`}>
                      {analyzeStage || "Transcribing Audio & Framing Streamer..."}
                    </h3>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Job ID: <span className="font-mono text-purple-300">{analyzeJobId || "Active"}</span> • {activeJobTitle}
                  </p>
                </div>
              </div>

              {/* Progress & Cancel Request Action */}
              <div className="flex items-center gap-4 self-end sm:self-auto">
                <span className="font-mono text-2xl font-black text-purple-400">
                  {analyzeProgress}%
                </span>
                <button
                  type="button"
                  onClick={handleCancelJob}
                  className="px-4 py-2 rounded-xl border border-rose-500/50 bg-rose-500/10 hover:bg-rose-500 text-rose-300 hover:text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md hover:shadow-rose-500/20"
                  title="Abort in-progress AI processing"
                >
                  <X className="w-4 h-4" />
                  <span>Cancel Request</span>
                </button>
              </div>
            </div>

            {/* Glowing Progress Track */}
            <div className="w-full bg-gray-200 dark:bg-gray-800/80 h-3 rounded-full overflow-hidden p-0.5 border border-purple-500/20">
              <div
                className="bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-400 h-full rounded-full transition-all duration-300 shadow-sm shadow-purple-500/50"
                style={{ width: `${Math.max(5, analyzeProgress)}%` }}
              />
            </div>
          </div>
        )}

        {/* 3. POST-ANALYSIS CELEBRATION / STUDIO HANDOFF BANNER */}
        {completedProject && !isAnalyzing && (
          <div className={`rounded-3xl border p-6 md:p-8 space-y-5 shadow-2xl animate-in zoom-in-95 duration-300 ${
            isDark
              ? "bg-gradient-to-r from-[#121820] to-[#161226] border-emerald-500/50"
              : "bg-gradient-to-r from-emerald-50 to-purple-50 border-emerald-300"
          }`}>
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4 text-center md:text-left">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center flex-shrink-0 shadow-lg">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <div className="flex items-center gap-2 justify-center md:justify-start">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Analysis Complete
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      {completedProject.clips?.length || 0} Viral Clips Found
                    </span>
                  </div>
                  <h3 className={`text-lg md:text-xl font-black mt-1 ${isDark ? "text-white" : "text-gray-900"}`}>
                    {completedProject.title}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Clips saved in Projects! Open in Studio Editor to customize 9:16 layouts, subtitles, and render.
                  </p>
                </div>
              </div>

              {/* Direct Hand-off Action Buttons */}
              <div className="flex items-center gap-3 flex-wrap justify-center md:justify-end">
                <Link
                  href={`/editor?project=${encodeURIComponent(completedProject.project_id)}`}
                  className="px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-xl shadow-purple-600/30 hover:scale-[1.02] transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Scissors className="w-4 h-4" />
                  <span>Open in Studio Editor</span>
                </Link>

                <Link
                  href="/library"
                  className={`px-4 py-3 rounded-2xl border font-bold text-xs transition-all flex items-center gap-2 cursor-pointer ${
                    isDark
                      ? "bg-[#181a24] hover:bg-[#202434] border-[#2c3246] text-gray-300 hover:text-white"
                      : "bg-white hover:bg-gray-100 border-gray-300 text-gray-800"
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>View in Projects</span>
                </Link>

                <button
                  onClick={() => setCompletedProject(null)}
                  className="p-3 rounded-2xl text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                  title="Dismiss card"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. CREATION INGESTION DECK (TWO-LANE DESIGN) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono ${
                isDark ? "bg-purple-900/40 text-purple-300 border border-purple-500/30" : "bg-purple-100 text-purple-700"
              }`}>
                Ingestion Deck
              </span>
              <h2 className={`text-base md:text-lg font-black ${isDark ? "text-white" : "text-gray-950"}`}>
                Choose Ingestion Source
              </h2>
            </div>

            {/* Mode Switcher */}
            <div className="flex items-center gap-1.5 p-1 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111319]">
              <button
                type="button"
                onClick={() => setActiveTab("upload")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === "upload"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload Media</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("stream")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === "stream"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <LinkIcon className="w-3.5 h-3.5" />
                <span>Stream / VOD URL</span>
              </button>
            </div>
          </div>

          {/* MODE A: UPLOAD LOCAL FILE */}
          {activeTab === "upload" && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileUpload(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`rounded-3xl border-2 border-dashed p-10 md:p-14 text-center space-y-5 cursor-pointer transition-all ${
                isDragging
                  ? "border-purple-500 bg-purple-500/10 scale-[1.01]"
                  : isDark
                  ? "bg-[#111319]/80 hover:bg-[#151722] border-[#252936] hover:border-purple-500/50"
                  : "bg-white hover:bg-purple-50/20 border-gray-300 hover:border-purple-400"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />

              <div className="w-20 h-20 rounded-3xl bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center justify-center mx-auto shadow-inner group-hover:scale-110 transition-transform">
                <UploadCloud className="w-10 h-10" />
              </div>

              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className={`text-base md:text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>
                  Click to Browse or Drag & Drop Video File
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Supports MP4, MKV, MOV, and WebM. Large multi-hour gaming streams and podcast VODs supported.
                </p>
              </div>

              {/* Content Type Selector */}
              <div
                className="w-full max-w-2xl mx-auto p-2.5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/90 dark:bg-[#161822]/90 backdrop-blur-sm shadow-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-2 pb-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-gray-400">Content AI Engine:</span>
                  <span className="text-[10px] font-bold text-purple-400 font-mono">
                    {contentType === "vlog" && "📹 Cinematic Vlog Pacing & Face Tracking"}
                    {contentType === "podcast" && "🎙️ Dialogue Turn-Taking & Thought Hooks"}
                    {contentType === "educational" && "🎓 High-WPM Instructional Clarity"}
                    {contentType === "comedy" && "😂 Setup & Punchline Timing Detection"}
                    {contentType === "gaming" && "🎮 Acoustic Peaks & Gameplay differencing"}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  {CONTENT_FORMATS.map((fmt) => {
                    const Icon = fmt.icon;
                    const isSelected = contentType === fmt.id;
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setContentType(fmt.id)}
                        className={`p-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer border ${
                          isSelected
                            ? "bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-600/30 scale-[1.02]"
                            : "border-transparent text-gray-400 hover:text-white hover:bg-gray-200/50 dark:hover:bg-gray-800/50"
                        }`}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span className="text-[11px] leading-tight text-center">{fmt.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Dynamic AI Engine Parameter Controls */}
                <div className="mt-3 pt-3 border-t border-gray-200/60 dark:border-gray-800/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Clip Length:</span>
                    <div className="flex rounded-lg bg-black/10 dark:bg-black/30 p-0.5 border border-gray-700/40">
                      {[
                        { id: "short", label: "30s Short" },
                        { id: "medium", label: "45s Viral" },
                        { id: "long", label: "60s Narrative" }
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTargetDurationTier(t.id as any)}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                            targetDurationTier === t.id
                              ? "bg-purple-600 text-white shadow-xs"
                              : "text-gray-400 hover:text-white"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sensitivity:</span>
                    <select
                      value={aiSensitivity}
                      onChange={(e) => setAiSensitivity(e.target.value as any)}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-black/10 dark:bg-black/40 border border-gray-700/50 text-gray-200 focus:outline-none focus:border-purple-500"
                    >
                      <option value="balanced">Balanced (Standard)</option>
                      <option value="aggressive_viral">Aggressive (Viral Peaks)</option>
                      <option value="deep_dialogue">Deep Dialogue (Hooks)</option>
                    </select>
                  </div>

                  {systemInfo && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold">
                      <Zap className="w-3 h-3 text-emerald-400" />
                      <span>{systemInfo.hardware_mode} ({systemInfo.cpu_threads} Threads)</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* MODE B: STREAM / VOD LINK CAPTURE */}
          {activeTab === "stream" && (
            <div className={`rounded-3xl border p-8 md:p-10 space-y-6 shadow-xl ${
              isDark ? "bg-[#111319] border-[#222634]" : "bg-white border-gray-200"
            }`}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center flex-shrink-0">
                  <LinkIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className={`text-base font-extrabold ${isDark ? "text-white" : "text-gray-900"}`}>
                    Live Stream or VOD URL Ingestion
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Paste a broadcast link from YouTube, Twitch, or Kick to capture and clip.
                  </p>
                </div>
              </div>

              <form onSubmit={handleStreamIngestSubmit} className="space-y-4">
                <div className="relative">
                  <input
                    type="url"
                    placeholder="https://www.youtube.com/watch?v=... or https://twitch.tv/..."
                    value={streamUrl}
                    onChange={(e) => {
                      setStreamUrl(e.target.value);
                      handleCheckStreamLink(e.target.value);
                    }}
                    className={`w-full rounded-2xl pl-4 pr-12 py-3.5 text-xs focus:outline-none border transition-all ${
                      isDark
                        ? "bg-[#161822] border-[#292e3f] text-white focus:border-purple-500"
                        : "bg-[#f8f9fa] border-gray-200 text-gray-900 focus:border-purple-600"
                    }`}
                  />
                  {isCheckingStream && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  )}
                </div>

                {/* Stream Probe Feedback */}
                {streamCheck && (
                  <div className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
                    streamCheck.is_live
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : streamCheck.online
                      ? "bg-purple-500/10 border-purple-500/30 text-purple-300"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  }`}>
                    <div className="flex items-center gap-2.5">
                      {streamCheck.is_live && <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />}
                      <span className="font-extrabold">
                        {streamCheck.is_live
                          ? `Live: ${streamCheck.author || "Broadcasting"}`
                          : streamCheck.online
                          ? `VOD: ${streamCheck.title || streamCheck.author}`
                          : "Link Offline or Unreachable"}
                      </span>
                      {streamCheck.category && (
                        <span className="text-[10px] opacity-80 font-mono">
                          ({streamCheck.category})
                        </span>
                      )}
                    </div>
                    {streamCheck.qualities && streamCheck.qualities.length > 0 && (
                      <span className="text-[10px] font-mono opacity-80">
                        {streamCheck.qualities[0]}
                      </span>
                    )}
                  </div>
                )}

                {/* Duration & Content Options */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-xs font-bold text-gray-400">Capture Window:</span>
                    <select
                      value={captureDuration}
                      onChange={(e) => setCaptureDuration(Number(e.target.value))}
                      className={`text-xs font-bold rounded-xl px-3 py-2 border cursor-pointer ${
                        isDark ? "bg-[#181a24] border-[#292d3c] text-white" : "bg-white border-gray-300 text-black"
                      }`}
                    >
                      <option value={300}>5 Min (Fast Highlights)</option>
                      <option value={600}>10 Min (Standard VOD)</option>
                      <option value={900}>15 Min (Extended Stream)</option>
                      <option value={1800}>30 Min (Deep Scan)</option>
                    </select>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                    <span className="text-xs font-bold text-gray-400">Content AI:</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {CONTENT_FORMATS.map((fmt) => {
                        const Icon = fmt.icon;
                        const isSelected = contentType === fmt.id;
                        return (
                          <button
                            key={fmt.id}
                            type="button"
                            onClick={() => setContentType(fmt.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                              isSelected
                                ? "bg-purple-600 text-white border-purple-400 shadow-xs"
                                : "border-gray-200 dark:border-gray-800 text-gray-400 hover:text-white hover:bg-gray-100 dark:hover:bg-[#1a1c26]"
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            <span>{fmt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={!streamUrl.trim() || isAnalyzing}
                    className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-extrabold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-purple-600/20"
                  >
                    <span>Launch AI Ingest</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* 5. RECENT PROJECTS SECTION (DIRECT ACCESS TO STUDIO) */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono ${
                isDark ? "bg-purple-900/40 text-purple-300 border border-purple-500/30" : "bg-purple-100 text-purple-700"
              }`}>
                Library
              </span>
              <h2 className={`text-base md:text-lg font-black ${isDark ? "text-white" : "text-gray-950"}`}>
                Recent Projects
              </h2>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleOpenOutputFolder}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-700 bg-gray-800/80 hover:bg-gray-700 text-gray-200 text-xs font-bold transition-all cursor-pointer shadow-xs"
                title="Open rendered MP4 files in Windows Explorer"
              >
                <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                <span>Open Output Folder</span>
              </button>

              <Link
                href="/library"
                className="text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
              >
                <span>View All Projects ({recentProjects.length})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {loadingProjects ? (
            <div className="p-12 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
              <span>Loading projects...</span>
            </div>
          ) : recentProjects.length === 0 ? (
            <div className={`rounded-3xl border p-10 text-center space-y-3 ${
              isDark ? "bg-[#111319] border-[#222632]" : "bg-white border-gray-200"
            }`}>
              <Layers className="w-10 h-10 text-gray-500 mx-auto opacity-40" />
              <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                No Ingested Projects Yet
              </h3>
              <p className="text-xs text-gray-400 max-w-sm mx-auto">
                Upload a video file or enter a live stream link above to create your first viral clip set.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {recentProjects.slice(0, 3).map((project) => (
                <div
                  key={project.project_id}
                  className={`rounded-3xl border p-5 flex flex-col justify-between space-y-4 transition-all hover:scale-[1.01] ${
                    isDark
                      ? "bg-[#111319] hover:bg-[#141620] border-[#222634] hover:border-purple-500/40"
                      : "bg-white hover:bg-gray-50 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase flex items-center gap-1.5 ${
                        project.content_type === "vlog"
                          ? "bg-pink-500/10 text-pink-300 border border-pink-500/20"
                          : project.content_type === "podcast"
                          ? "bg-blue-500/10 text-blue-300 border border-blue-500/20"
                          : project.content_type === "educational"
                          ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                          : project.content_type === "comedy"
                          ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                          : "bg-purple-500/10 text-purple-300 border border-purple-500/20"
                      }`}>
                        {project.content_type === "vlog" && <Camera className="w-3 h-3" />}
                        {project.content_type === "podcast" && <Mic className="w-3 h-3" />}
                        {project.content_type === "educational" && <GraduationCap className="w-3 h-3" />}
                        {project.content_type === "comedy" && <Laugh className="w-3 h-3" />}
                        {(project.content_type === "gaming" || !project.content_type) && <Gamepad2 className="w-3 h-3" />}
                        <span>{project.content_type || "Gaming"}</span>
                      </span>

                      <div className="flex items-center gap-1 text-[11px] text-gray-400 font-mono">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(project.created_at * 1000).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div>
                      <h4 className={`text-sm font-black line-clamp-2 ${isDark ? "text-white" : "text-gray-900"}`}>
                        {project.title}
                      </h4>
                      {project.source_url && (
                        <p className="text-[10px] text-gray-400 truncate font-mono mt-0.5">
                          {project.source_url}
                        </p>
                      )}
                    </div>

                    <div className={`flex items-center justify-between rounded-2xl p-3 border text-xs font-mono ${
                      isDark ? "bg-[#161822] border-[#262b3c]" : "bg-gray-50 border-gray-100"
                    }`}>
                      <div className="flex items-center gap-1.5">
                        <Flame className="w-4 h-4 text-amber-500" />
                        <span className="font-extrabold">{project.clips?.length || 0}</span>
                        <span className="text-[10px] text-gray-400">Moments</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Scissors className="w-4 h-4 text-purple-400" />
                        <span className="font-extrabold">{Object.keys(project.rendered_clips || {}).length}</span>
                        <span className="text-[10px] text-gray-400">Rendered</span>
                      </div>
                    </div>
                  </div>

                  {/* Open in Studio Action */}
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800/80">
                    <Link
                      href={`/editor?project=${encodeURIComponent(project.project_id)}`}
                      className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      <span>Open in Studio</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => setProjectToDelete(project)}
                      className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-rose-500 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Delete project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 6. CAPABILITY SHOWCASE CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
          <div className={`rounded-3xl border p-6 space-y-3 ${
            isDark ? "bg-[#111319] border-[#222634]" : "bg-white border-gray-200"
          }`}>
            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center justify-center">
              <Tv className="w-5 h-5" />
            </div>
            <h3 className={`text-sm font-extrabold ${isDark ? "text-white" : "text-gray-900"}`}>
              Dual-Viewport Auto-Framing
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Detects streamer webcam corners and keeps gameplay centered below. Customizable 38% facecam split with safe-zone margin overlays.
            </p>
          </div>

          <div className={`rounded-3xl border p-6 space-y-3 ${
            isDark ? "bg-[#111319] border-[#222634]" : "bg-white border-gray-200"
          }`}>
            <div className="w-10 h-10 rounded-2xl bg-pink-500/10 border border-pink-500/30 text-pink-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className={`text-sm font-extrabold ${isDark ? "text-white" : "text-gray-900"}`}>
              Kinetic CapCut Subtitles
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Whisper AI word-level sync with CapCut Pop, Neon Gold, Clean White, and Bold Outline typography options and customizable sizing.
            </p>
          </div>

          <div className={`rounded-3xl border p-6 space-y-3 ${
            isDark ? "bg-[#111319] border-[#222634]" : "bg-white border-gray-200"
          }`}>
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className={`text-sm font-extrabold ${isDark ? "text-white" : "text-gray-900"}`}>
              Lossless CRF 17 Master Output
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Native 60 FPS hardware-accelerated video rendering with unsharp edge enhancement, audio denoise filter, and branded watermarks.
            </p>
          </div>
        </div>

        {/* 7. DELETE CONFIRMATION MODAL */}
        {projectToDelete && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className={`w-full max-w-md rounded-3xl p-6 border shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 ${
              isDark ? "bg-[#12141c] border-[#2a3040] text-white" : "bg-white border-gray-200 text-black"
            }`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold">Delete Project?</h3>
                  <p className="text-xs text-gray-400 mt-0.5">This action cannot be undone.</p>
                </div>
              </div>

              <p className="text-xs text-gray-400 leading-relaxed">
                Are you sure you want to delete <span className="font-bold text-white">"{projectToDelete.title}"</span>? Source video files and rendered clips will be permanently removed.
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setProjectToDelete(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteProject}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md cursor-pointer transition-all flex items-center gap-2"
                >
                  {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>{isDeleting ? "Deleting..." : "Delete Project"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 8. FLOATING TOAST NOTIFICATIONS */}
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto p-4 rounded-2xl border text-xs shadow-2xl flex items-start justify-between gap-3 animate-in slide-in-from-bottom-5 duration-300 ${
                toast.type === "success"
                  ? isDark ? "bg-[#101c18] border-emerald-500/50 text-emerald-200" : "bg-emerald-50 border-emerald-300 text-emerald-900"
                  : toast.type === "error"
                  ? isDark ? "bg-[#201015] border-rose-500/50 text-rose-200" : "bg-rose-50 border-rose-300 text-rose-900"
                  : isDark ? "bg-[#181525] border-purple-500/50 text-purple-200" : "bg-purple-50 border-purple-300 text-purple-900"
              }`}
            >
              <div className="flex items-start gap-2.5">
                {toast.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />}
                {toast.type === "error" && <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />}
                {toast.type === "info" && <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />}
                <div>
                  <h4 className="font-extrabold">{toast.title}</h4>
                  <p className="opacity-80 mt-0.5 leading-relaxed">{safeErrorText(toast.message)}</p>
                  {toast.actionUrl && (
                    <Link
                      href={toast.actionUrl}
                      className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] shadow-sm transition-all"
                    >
                      <Scissors className="w-3 h-3" />
                      <span>{toast.actionLabel || "Open"}</span>
                    </Link>
                  )}
                </div>
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

      </div>

      {/* Upgrade & Payment Packages Modal */}
      {showUpgradeModal && (
        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          reason={upgradeReason}
        />
      )}

      {/* Mandatory Creator Login Gate (Cannot be bypassed) */}
      {authChecked && !currentUser && (
        <AuthModal
          isOpen={true}
          isMandatory={true}
          onClose={() => setCurrentUser(getCurrentUser())}
        />
      )}
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-gray-500">Loading PIC-CLIP Studio...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
