"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ProjectItem, Clip } from "@/lib/types";
import { fetchProjects, formatErrorMessage, safeErrorText, checkStreamConnectivity, StreamConnectivityResult, cancelJob } from "@/lib/api";
import {
  saveActiveJob,
  getActiveJob,
  updateActiveJobProgress,
  clearActiveJob,
  saveLastActiveProjectId,
  getLastActiveProjectId,
} from "@/lib/activeJob";
import { addNotification } from "@/lib/notifications";
import { canGenerateVideo, consumeGenerationCredit, getUserCredits } from "@/lib/credits";
import { getStorageDestination, getGoogleDriveAccount } from "@/lib/googleDrive";
import { UpgradeModal } from "@/components/subscription/UpgradeModal";
import { useTheme } from "@/lib/theme";
import { getCurrentUser, UserAccount } from "@/lib/auth";
import { AuthModal } from "@/components/auth/AuthModal";
import { FolderOpen } from "lucide-react";
import {
  Play,
  Pause,
  Download,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Scissors,
  Search,
  Plus,
  Video,
  Layout,
  Type,
  X,
  UploadCloud,
  Link as LinkIcon,
  ArrowRight,
  Zap,
  Radio,
  Gamepad2,
  Camera,
  GraduationCap,
  Laugh,
  Mic,
  Trash2,
  Shield,
  Sliders,
  Volume2,
  Smartphone,
  Eye,
  Tv,
  Square,
  Clock,
  RotateCcw,
  Maximize2,
  Minimize2,
  SkipBack,
  SkipForward,
  Keyboard,
  HelpCircle,
  Layers,
  PlayCircle
} from "lucide-react";

interface ToastNotification {
  id: string;
  type: "success" | "error" | "info";
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
}

function SingleWindowStudioContent() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const searchParams = useSearchParams();
  const projectParam = searchParams.get("project");

  // Mandatory Authentication State
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Ingestion State (Matching assets/template.png)
  const [videoLink, setVideoLink] = useState("");
  const [captureDuration, setCaptureDuration] = useState<number>(300); // 5 min default
  const [isCheckingLink, setIsCheckingLink] = useState(false);
  const [streamCheck, setStreamCheck] = useState<StreamConnectivityResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showIngestHero, setShowIngestHero] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Projects & Active Clip State
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectItem | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [clipFilterText, setClipFilterText] = useState("");

  // Video Playback & Synchronized Preview
  const videoRef = useRef<HTMLVideoElement>(null);
  const secondaryVideoRef = useRef<HTMLVideoElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Pre-Render Preview Controls
  const [previewMode, setPreviewMode] = useState<"canvas_9_16" | "raw_source">("canvas_9_16");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [framingMode, setFramingMode] = useState<"auto" | "smart" | "fit" | "vlog_cinematic" | "split" | "screenshare">("auto");
  const [stackedRatio, setStackedRatio] = useState<number>(0.38); // 38% facecam, 62% game
  const [streamerCorner, setStreamerCorner] = useState<"top_left" | "top_right">("top_left");
  const [showSafeZoneOverlay, setShowSafeZoneOverlay] = useState<boolean>(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);

  // Subtitles & Typography
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [subtitleStyle, setSubtitleStyle] = useState<"capcut" | "neon_gold" | "clean_white" | "bold_outline">("capcut");
  const [subtitleSize, setSubtitleSize] = useState<number>(64);
  const [subtitlePlacement, setSubtitlePlacement] = useState<"bottom_safe" | "center_stage" | "top_anchor">("bottom_safe");

  // Branding & Hook Banner
  const [hookBannerText, setHookBannerText] = useState<string>("");
  const [watermarkText, setWatermarkText] = useState<string>("");
  const [watermarkPosition, setWatermarkPosition] = useState<"top_right" | "top_left" | "bottom_right">("top_right");
  const [showMascotWatermark, setShowMascotWatermark] = useState<boolean>(false);

  // Audio / Video FX
  const [audioDenoise, setAudioDenoise] = useState<boolean>(true);
  const [unsharpSharpening, setUnsharpSharpening] = useState<boolean>(true);
  const [targetFps, setTargetFps] = useState<number>(30);

  // Clip Trim Fine-Tuning
  const [clipStartAdjust, setClipStartAdjust] = useState<Record<string, number>>({});
  const [clipEndAdjust, setClipEndAdjust] = useState<Record<string, number>>({});

  const activeClip = clips.find((c) => c.id === selectedClipId) || clips[0] || null;

  const getClipBounds = (clip: Clip) => {
    const sAdj = clipStartAdjust[clip.id] || 0;
    const eAdj = clipEndAdjust[clip.id] || 0;
    const finalStart = Math.max(0, clip.start_time + sAdj);
    const finalEnd = Math.max(finalStart + 2, clip.end_time + eAdj);
    return {
      finalStart: Number(finalStart.toFixed(1)),
      finalEnd: Number(finalEnd.toFixed(1)),
      duration: Number((finalEnd - finalStart).toFixed(1)),
    };
  };

  // Studio Sub-Tabs
  const [activeStudioTab, setActiveStudioTab] = useState<"framing" | "typography" | "branding" | "fx" | "transcript">("framing");

  // Reset / Clear Workspace Modal
  const [showClearConfirmModal, setShowClearConfirmModal] = useState<boolean>(false);

  // Upgrade & Daily Credit Quota Modal
  const [showUpgradeModal, setShowUpgradeModal] = useState<boolean>(false);
  const [upgradeModalReason, setUpgradeModalReason] = useState<string | undefined>(undefined);

  // Background Jobs & Renders
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [analyzeStage, setAnalyzeStage] = useState("");
  const [renderingClips, setRenderingClips] = useState<Record<string, { status: "rendering" | "done" | "failed"; stage: string }>>({});
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({});

  // Notifications Toast Stack
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [copiedField, setCopiedField] = useState<string | null>(null);

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

  // Fullscreen Management
  const toggleFullscreen = () => {
    if (!previewContainerRef.current) return;
    if (!document.fullscreenElement) {
      if (previewContainerRef.current.requestFullscreen) {
        previewContainerRef.current.requestFullscreen().catch(() => {
          setIsFullscreen(true);
        });
      } else {
        setIsFullscreen(true);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {
          setIsFullscreen(false);
        });
      } else {
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    setCurrentUser(getCurrentUser());
    setAuthChecked(true);

    const handleAuthChange = (e: any) => {
      setCurrentUser(e.detail || getCurrentUser());
    };
    window.addEventListener("pic_clip_auth_changed", handleAuthChange);

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    return () => {
      window.removeEventListener("pic_clip_auth_changed", handleAuthChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
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

  // Quick Preset Actions (1-Click Pro Creator Profiles)
  const applyPreset = (presetName: "vlog" | "podcast" | "educational" | "gaming" | "facetrack" | "tiktok" | "square") => {
    if (presetName === "vlog") {
      setAspectRatio("9:16");
      setFramingMode("vlog_cinematic");
      setSubtitlesEnabled(true);
      setSubtitleStyle("neon_gold");
      setSubtitlePlacement("bottom_safe");
      setSubtitleSize(64);
      setAudioDenoise(true);
      setUnsharpSharpening(true);
      setTargetFps(60);
      setPreviewMode("canvas_9_16");
      addToast({
        type: "success",
        title: "Vlog Cinematic Preset Applied",
        message: "9:16 vertical subject reframing, Neon Gold kinetic subtitles & 60 FPS enabled."
      });
    } else if (presetName === "podcast") {
      setAspectRatio("9:16");
      setFramingMode("split");
      setSubtitlesEnabled(true);
      setSubtitleStyle("clean_white");
      setSubtitlePlacement("center_stage");
      setSubtitleSize(60);
      setAudioDenoise(true);
      setTargetFps(30);
      setPreviewMode("canvas_9_16");
      addToast({
        type: "success",
        title: "Podcast Dual Split Preset Applied",
        message: "Host & Guest stacked split with Clean White dialogue captions."
      });
    } else if (presetName === "educational") {
      setAspectRatio("9:16");
      setFramingMode("screenshare");
      setSubtitlesEnabled(true);
      setSubtitleStyle("bold_outline");
      setSubtitlePlacement("bottom_safe");
      setSubtitleSize(58);
      setAudioDenoise(true);
      setTargetFps(30);
      setPreviewMode("canvas_9_16");
      addToast({
        type: "success",
        title: "Tutorial & Screen Preset Applied",
        message: "Top 58% Screen + Bottom 42% Presenter layout with high-contrast subtitles."
      });
    } else if (presetName === "gaming") {
      setAspectRatio("9:16");
      setFramingMode("auto");
      setStackedRatio(0.38);
      setSubtitlesEnabled(true);
      setSubtitleStyle("capcut");
      setSubtitlePlacement("bottom_safe");
      setSubtitleSize(64);
      setAudioDenoise(true);
      setUnsharpSharpening(true);
      setTargetFps(60);
      setPreviewMode("canvas_9_16");
      addToast({
        type: "success",
        title: "Gaming Stacked Preset Applied",
        message: "9:16 layout, 38% facecam split, CapCut Pop subtitles & 60 FPS enabled."
      });
    } else if (presetName === "facetrack") {
      setAspectRatio("9:16");
      setFramingMode("smart");
      setSubtitlesEnabled(true);
      setSubtitleStyle("neon_gold");
      setSubtitlePlacement("center_stage");
      setSubtitleSize(64);
      setAudioDenoise(true);
      setUnsharpSharpening(true);
      setTargetFps(30);
      setPreviewMode("canvas_9_16");
      addToast({
        type: "success",
        title: "Face Track Pro Preset Applied",
        message: "Centered speaker framing, Neon Gold captions & speech clarity enabled."
      });
    } else if (presetName === "tiktok") {
      setAspectRatio("9:16");
      setFramingMode("auto");
      setStackedRatio(0.40);
      setSubtitlesEnabled(true);
      setSubtitleStyle("clean_white");
      setSubtitlePlacement("bottom_safe");
      setSubtitleSize(64);
      setAudioDenoise(true);
      setTargetFps(30);
      setPreviewMode("canvas_9_16");
      addToast({
        type: "success",
        title: "Viral TikTok/Reels Preset Applied",
        message: "9:16 vertical staging with bottom safe-zone typography."
      });
    } else if (presetName === "square") {
      setAspectRatio("1:1");
      setFramingMode("fit");
      setSubtitlesEnabled(true);
      setSubtitleStyle("bold_outline");
      setSubtitlePlacement("center_stage");
      setSubtitleSize(56);
      setTargetFps(30);
      setPreviewMode("canvas_9_16");
      addToast({
        type: "success",
        title: "Square Social Preset Applied",
        message: "1:1 aspect ratio with centered high-contrast typography."
      });
    }
  };

  // Keyboard Shortcuts (Space, F, Left, Right, R)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "SELECT"
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (videoRef.current && activeClip) {
          const bounds = getClipBounds(activeClip);
          const newTime = Math.max(bounds.finalStart, videoRef.current.currentTime - 1);
          videoRef.current.currentTime = newTime;
          if (secondaryVideoRef.current) secondaryVideoRef.current.currentTime = newTime;
          setCurrentTime(newTime);
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (videoRef.current && activeClip) {
          const bounds = getClipBounds(activeClip);
          const newTime = Math.min(bounds.finalEnd, videoRef.current.currentTime + 1);
          videoRef.current.currentTime = newTime;
          if (secondaryVideoRef.current) secondaryVideoRef.current.currentTime = newTime;
          setCurrentTime(newTime);
        }
      } else if (e.key === "r" || e.key === "R") {
        if (activeClip && renderingClips[activeClip.id]?.status !== "rendering") {
          e.preventDefault();
          handleRenderClip(activeClip.id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeClip, isPlaying, renderingClips]);

  // Initial Load & Job Resumption
  useEffect(() => {
    const active = getActiveJob();
    if (active) {
      setIsAnalyzing(true);
      setShowIngestHero(false);
      setAnalyzeProgress(active.progress || 5);
      setAnalyzeStage(active.stage || "AI pipeline processing...");
      pollJobStatus(active.job_id || active.jobId);
    }

    try {
      const saved = localStorage.getItem("pic_clip_studio_settings");
      if (saved) {
        const p = JSON.parse(saved);
        if (p.defaultWatermark) setWatermarkText(p.defaultWatermark);
        if (p.defaultWatermarkPos) setWatermarkPosition(p.defaultWatermarkPos);
        if (p.defaultSubtitleStyle) setSubtitleStyle(p.defaultSubtitleStyle);
        if (p.defaultSubtitleSize) setSubtitleSize(p.defaultSubtitleSize);
        if (p.defaultSubtitlePlacement) setSubtitlePlacement(p.defaultSubtitlePlacement);
        if (p.defaultStackedRatio) setStackedRatio(p.defaultStackedRatio);
        if (p.defaultUnsharp !== undefined) setUnsharpSharpening(p.defaultUnsharp);
        if (p.defaultAudioDenoise !== undefined) setAudioDenoise(p.defaultAudioDenoise);
        if (p.defaultFps) setTargetFps(p.defaultFps);
      }
    } catch {
      // ignore
    }

    loadProjects();
  }, []);

  // Sync Project Param
  useEffect(() => {
    if (projectParam && projects.length > 0) {
      const match = projects.find((p) => p.project_id === projectParam || p.file_id === projectParam);
      if (match && match.project_id !== activeProject?.project_id) {
        selectProject(match);
      }
    }
  }, [projectParam, projects]);

  const loadProjects = async () => {
    try {
      const data = await fetchProjects();
      setProjects(data);

      const active = getActiveJob();
      if (active) {
        setIsAnalyzing(true);
        setShowIngestHero(false);
        return;
      }

      if (data && data.length > 0) {
        const lastId = getLastActiveProjectId();
        const match = projectParam
          ? data.find((p) => p.project_id === projectParam || p.file_id === projectParam)
          : (lastId ? data.find((p) => p.project_id === lastId || p.file_id === lastId) : null);
        selectProject(match || data[0]);
        setShowIngestHero(false);
      } else {
        setShowIngestHero(true);
      }
    } catch (e) {
      console.error("Failed to load projects:", e);
    }
  };

  const selectProject = (p: ProjectItem) => {
    setActiveProject(p);
    saveLastActiveProjectId(p.project_id);
    setClips(p.clips || []);
    if (p.clips && p.clips.length > 0) {
      setSelectedClipId(p.clips[0].id);
      const desc = p.clips[0].layout_description || "";
      if (desc.includes("top_right")) {
        setStreamerCorner("top_right");
      } else {
        setStreamerCorner("top_left");
      }
      if (p.clips[0].suggested_layout) {
        setFramingMode(p.clips[0].suggested_layout as any);
      } else if (p.content_type === "vlog") {
        setFramingMode("vlog_cinematic");
      } else if (p.content_type === "podcast") {
        setFramingMode("smart");
      }
    }
    if (p.rendered_clips) {
      const urls: Record<string, string> = {};
      Object.entries(p.rendered_clips).forEach(([k, u]) => {
        urls[k] = u;
      });
      setDownloadUrls(urls);
    }
  };

  // Video Playback & Time Synchronization
  const handleTimeUpdate = () => {
    if (!videoRef.current || !activeClip) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);

    if (secondaryVideoRef.current && Math.abs(secondaryVideoRef.current.currentTime - t) > 0.15) {
      secondaryVideoRef.current.currentTime = t;
    }

    const bounds = getClipBounds(activeClip);
    if (t >= bounds.finalEnd) {
      videoRef.current.currentTime = bounds.finalStart;
      if (secondaryVideoRef.current) secondaryVideoRef.current.currentTime = bounds.finalStart;
      videoRef.current.pause();
      if (secondaryVideoRef.current) secondaryVideoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const playActiveClip = (clip: Clip) => {
    setSelectedClipId(clip.id);
    if (clip.suggested_layout) {
      setFramingMode(clip.suggested_layout as any);
    }
    if (videoRef.current) {
      const bounds = getClipBounds(clip);
      videoRef.current.currentTime = bounds.finalStart;
      if (secondaryVideoRef.current) secondaryVideoRef.current.currentTime = bounds.finalStart;
      videoRef.current.play().catch(() => {});
      if (secondaryVideoRef.current) secondaryVideoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      if (secondaryVideoRef.current) secondaryVideoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (activeClip) {
        const bounds = getClipBounds(activeClip);
        if (videoRef.current.currentTime < bounds.finalStart || videoRef.current.currentTime >= bounds.finalEnd) {
          videoRef.current.currentTime = bounds.finalStart;
          if (secondaryVideoRef.current) secondaryVideoRef.current.currentTime = bounds.finalStart;
        }
      }
      videoRef.current.play().catch(() => {});
      if (secondaryVideoRef.current) secondaryVideoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const replayClip = () => {
    if (!videoRef.current || !activeClip) return;
    const bounds = getClipBounds(activeClip);
    videoRef.current.currentTime = bounds.finalStart;
    if (secondaryVideoRef.current) secondaryVideoRef.current.currentTime = bounds.finalStart;
    videoRef.current.play().catch(() => {});
    if (secondaryVideoRef.current) secondaryVideoRef.current.play().catch(() => {});
    setIsPlaying(true);
  };

  const stepTime = (delta: number) => {
    if (!videoRef.current || !activeClip) return;
    const bounds = getClipBounds(activeClip);
    const newTime = Math.min(bounds.finalEnd, Math.max(bounds.finalStart, videoRef.current.currentTime + delta));
    videoRef.current.currentTime = newTime;
    if (secondaryVideoRef.current) secondaryVideoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current || !activeClip) return;
    const seekTime = Number(e.target.value);
    videoRef.current.currentTime = seekTime;
    if (secondaryVideoRef.current) secondaryVideoRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  // Live Stream Connectivity Probe
  const handleCheckStreamLink = async (url: string) => {
    if (!url.trim()) {
      setStreamCheck(null);
      return;
    }
    setIsCheckingLink(true);
    try {
      const res = await checkStreamConnectivity(url.trim());
      setStreamCheck(res);
    } catch {
      setStreamCheck(null);
    } finally {
      setIsCheckingLink(false);
    }
  };

  // Ingest: Local Video Upload
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsAnalyzing(true);
    setAnalyzeProgress(5);
    setAnalyzeStage("Uploading master video to AI pipeline...");
    setShowIngestHero(false);
    addToast({
      type: "info",
      title: "Uploading Video",
      message: `Uploading "${file.name}" to AI engine...`
    });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("target_duration", "30");
      formData.append("duration_mode", "content_auto");
      formData.append("content_type", "gaming");

      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(safeErrorText(err));
      }

      const data = await res.json();
      saveActiveJob({
        job_id: data.job_id,
        type: "analyze",
        title: file.name,
        progress: 10,
        stage: "Transcribing audio and detecting speaker faces..."
      });

      pollJobStatus(data.job_id);
    } catch (err: any) {
      clearActiveJob();
      setIsAnalyzing(false);
      setShowIngestHero(true);
      addToast({
        type: "error",
        title: "Ingestion Failed",
        message: safeErrorText(err)
      });
    }
  };

  // Ingest: Stream / VOD Link (Twitch, YouTube, Kick)
  const handleLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoLink.trim()) return;

    setIsAnalyzing(true);
    setAnalyzeProgress(5);
    setAnalyzeStage("Connecting to stream source and demuxing HLS...");
    setShowIngestHero(false);
    addToast({
      type: "info",
      title: "Connecting Stream",
      message: `Demuxing stream from ${videoLink.substring(0, 40)}...`
    });

    try {
      const formData = new FormData();
      formData.append("url", videoLink.trim());
      formData.append("stream_mode", "auto");
      formData.append("capture_duration", captureDuration.toString());
      formData.append("target_duration", "30");
      formData.append("duration_mode", "content_auto");
      formData.append("content_type", "gaming");

      const res = await fetch("/api/stream/ingest", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Stream ingest failed" }));
        throw new Error(safeErrorText(err));
      }

      const data = await res.json();
      saveActiveJob({
        job_id: data.job_id,
        type: "stream_ingest",
        title: streamCheck?.title || "Stream Capture",
        progress: 10,
        stage: "Capturing stream chunks and running visual detection..."
      });

      pollJobStatus(data.job_id);
    } catch (err: any) {
      clearActiveJob();
      setIsAnalyzing(false);
      setShowIngestHero(true);
      addToast({
        type: "error",
        title: "Stream Ingest Failed",
        message: safeErrorText(err)
      });
    }
  };

  const handleCancelJob = async () => {
    const active = getActiveJob();
    const jId = active?.job_id || active?.jobId;
    if (jId) {
      await cancelJob(jId);
    }
    clearActiveJob();
    setIsAnalyzing(false);
    setAnalyzeProgress(0);
    setAnalyzeStage("");
    addToast({
      type: "info",
      title: "Operation Cancelled",
      message: "The AI agent operation was cancelled and processing halted."
    });
  };

  // Background Job Status Polling
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
          const fId = job.result?.file_id || job.file_id;
          const updated = await fetchProjects();
          setProjects(updated);
          if (fId) {
            const found = updated.find((p) => p.project_id === fId || p.file_id === fId);
            if (found) {
              selectProject(found);
              addNotification({
                type: "analysis",
                title: "Viral Highlights Ready!",
                message: `Discovered ${found.clips?.length || 0} clips with streamer auto-framing for "${found.title}".`,
                actionUrl: `/editor?project=${encodeURIComponent(found.project_id)}`,
                actionLabel: "View Highlights",
              });
              addToast({
                type: "success",
                title: "Viral Highlights Ready!",
                message: `Discovered ${found.clips?.length || 0} clips with streamer auto-framing.`
              });
            }
          }
        } else if (job.status === "cancelled") {
          clearInterval(interval);
          clearActiveJob();
          setIsAnalyzing(false);
          addToast({
            type: "info",
            title: "Analysis Cancelled",
            message: "The AI processing job was cancelled."
          });
        } else if (job.status === "failed") {
          clearInterval(interval);
          clearActiveJob();
          setIsAnalyzing(false);
          setShowIngestHero(true);
          addToast({
            type: "error",
            title: "Analysis Failed",
            message: safeErrorText(job.error || "AI pipeline encountered an error.")
          });
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
    }, 1500);
  };

  // Render Master Clip with Full Custom Options
  const handleRenderClip = async (clipId: string) => {
    const targetClip = clips.find((c) => c.id === clipId);
    if (!targetClip || !activeProject) return;

    // Login Gate Enforcement
    if (!currentUser) {
      addToast({
        type: "error",
        title: "Authentication Required",
        message: "Please sign in or use Quick Demo Login to render clips.",
      });
      return;
    }

    // Daily Quota Check (3/day free)
    const check = canGenerateVideo();
    if (!check.allowed) {
      setUpgradeModalReason(check.reason);
      setShowUpgradeModal(true);
      addToast({
        type: "error",
        title: "Daily Free Limit Reached",
        message: check.reason || "Daily free generation limit reached (3/3).",
      });
      return;
    }

    const bounds = getClipBounds(targetClip);

    setRenderingClips((prev) => ({
      ...prev,
      [clipId]: { status: "rendering", stage: `Formatting streamer facecam & rendering ${aspectRatio}...` },
    }));

    addToast({
      type: "info",
      title: "Rendering Clip",
      message: `Exporting Clip #${targetClip.id} in ${aspectRatio} format...`
    });

    try {
      const formData = new FormData();
      formData.append("file_id", activeProject.file_id || activeProject.project_id);
      formData.append("start_time", bounds.finalStart.toString());
      formData.append("end_time", bounds.finalEnd.toString());
      formData.append("aspect_ratio", aspectRatio);
      formData.append("framing_mode", framingMode);
      formData.append("stacked_ratio", stackedRatio.toString());
      formData.append("content_type", activeProject.content_type || "gaming");
      formData.append("subtitles", subtitlesEnabled.toString());
      formData.append("subtitle_style", subtitleStyle);
      formData.append("subtitle_placement", subtitlePlacement);
      formData.append("subtitle_size", subtitleSize.toString());
      formData.append("target_fps", targetFps.toString());
      formData.append("audio_denoise", audioDenoise.toString());
      formData.append("unsharp_sharpening", unsharpSharpening.toString());

      if (hookBannerText.trim()) {
        formData.append("hook_banner", hookBannerText.trim());
      }
      if (watermarkText.trim()) {
        formData.append("watermark_text", watermarkText.trim());
        formData.append("watermark_position", watermarkPosition);
      }

      const res = await fetch("/api/clip", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Render request failed" }));
        throw new Error(safeErrorText(err));
      }

      // Consume generation credit upon successful initiation
      consumeGenerationCredit();

      const data = await res.json();
      const jId = data.job_id;

      const interval = setInterval(async () => {
        try {
          const jRes = await fetch(`/api/jobs/${jId}`);
          if (!jRes.ok) return;
          const jData = await jRes.json();

          if (jData.status === "completed") {
            clearInterval(interval);
            const outUrl = jData.result?.output_url || `/download/${jData.result?.filename}`;
            setRenderingClips((prev) => ({
              ...prev,
              [clipId]: { status: "done", stage: "Ready!" },
            }));
            setDownloadUrls((prev) => ({
              ...prev,
              [clipId]: outUrl,
              [`${bounds.finalStart}_${bounds.finalEnd}`]: outUrl,
            }));

            const storageDest = getStorageDestination();
            const gdrive = getGoogleDriveAccount();
            const storageNote = storageDest === "gdrive" && gdrive.connected
              ? " (Synced to your Google Drive /PIC-CLIP Studio/)"
              : "";

            addNotification({
              type: "render",
              title: `Clip #${targetClip.id} Rendered!`,
              message: `Master 9:16 vertical video rendered at 60 FPS with subtitles.${storageNote}`,
              downloadUrl: outUrl,
              actionUrl: outUrl,
              actionLabel: "Download MP4",
            });

            addToast({
              type: "success",
              title: "Clip Ready to Download!",
              message: `Clip #${targetClip.id} rendered with streamer facecam & subtitles.`,
              actionLabel: "Download MP4",
              actionUrl: outUrl
            });
          } else if (jData.status === "failed") {
            clearInterval(interval);
            setRenderingClips((prev) => ({
              ...prev,
              [clipId]: { status: "failed", stage: safeErrorText(jData.error || "Render failed") },
            }));
            addToast({
              type: "error",
              title: "Render Failed",
              message: safeErrorText(jData.error || "Render failed.")
            });
          }
        } catch (e) {
          console.error("Polling render error:", e);
        }
      }, 1500);
    } catch (err: any) {
      setRenderingClips((prev) => ({
        ...prev,
        [clipId]: { status: "failed", stage: safeErrorText(err) },
      }));
      addToast({
        type: "error",
        title: "Render Request Failed",
        message: safeErrorText(err)
      });
    }
  };

  // Workspace Reset / Clear
  const handleClearWorkspace = () => {
    clearActiveJob();
    setActiveProject(null);
    setClips([]);
    setSelectedClipId(null);
    setShowIngestHero(true);
    setShowClearConfirmModal(false);
    addToast({
      type: "info",
      title: "Workspace Reset",
      message: "Ready to ingest a new stream or upload a video."
    });
  };

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2500);
    addToast({
      type: "success",
      title: "Copied to Clipboard",
      message: "Content copied successfully."
    });
  };

  const filteredClips = clips.filter((c) => {
    if (!clipFilterText.trim()) return true;
    const q = clipFilterText.toLowerCase();
    return c.title.toLowerCase().includes(q) || c.transcript.toLowerCase().includes(q);
  });

  return (
    <AppShell
      headerTitle="Pro Studio"
      headerSubtitle="Single-Window Stream Clipping, 9:16 Fullscreen Staging & Dynamic Typography"
    >
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

        {/* 1. TOP HEADER STATUS BAR */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200 dark:border-gray-800">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href="/library"
                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1 border cursor-pointer ${
                  isDark
                    ? "bg-[#141620] hover:bg-[#1b1f2e] border-[#292e3e] text-gray-400 hover:text-white"
                    : "bg-white hover:bg-gray-100 border-gray-200 text-gray-700"
                }`}
              >
                <span>← Back to Projects</span>
              </Link>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono ${
                isDark ? "bg-purple-900/40 text-purple-300 border border-purple-500/30" : "bg-purple-50 text-purple-700 border border-purple-200"
              }`}>
                PIC-CLIP™ 2.0
              </span>
              <h1 className={`text-lg md:text-xl font-black ${isDark ? "text-white" : "text-gray-950"}`}>
                {activeProject ? activeProject.title : "Stream Ingest & Studio Deck"}
              </h1>
            </div>
            {activeProject && (
              <p className="text-xs text-gray-400 mt-1">
                {clips.length} curated viral moments • Streamer auto-framing active • Press <kbd className="font-mono bg-gray-800 text-purple-300 px-1 py-0.5 rounded text-[10px]">F</kbd> for Fullscreen preview
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
            {projects.length > 1 && (
              <select
                value={activeProject?.project_id || ""}
                onChange={(e) => {
                  const target = projects.find((p) => p.project_id === e.target.value);
                  if (target) selectProject(target);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer max-w-[200px] truncate ${
                  isDark ? "bg-[#141620] border-[#292e3e] text-white" : "bg-white border-gray-200 text-black"
                }`}
              >
                {projects.map((p) => (
                  <option key={p.project_id} value={p.project_id}>
                    {p.title}
                  </option>
                ))}
              </select>
            )}

            {activeProject && (
              <>
                <button
                  type="button"
                  onClick={() => setShowShortcutsModal(true)}
                  className={`p-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                    isDark ? "bg-[#141620] hover:bg-[#1a1e2c] border-[#292e3e] text-gray-400 hover:text-white" : "bg-white hover:bg-gray-100 border-gray-200 text-gray-600"
                  }`}
                  title="Keyboard Shortcuts"
                >
                  <Keyboard className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setShowClearConfirmModal(true)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${
                    isDark
                      ? "bg-[#161214] hover:bg-rose-950/40 border-rose-900/40 hover:border-rose-500/50 text-rose-300"
                      : "bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700"
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  <span>Clear Project</span>
                </button>
              </>
            )}

            <button
              onClick={() => setShowIngestHero(!showIngestHero)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer border ${
                showIngestHero
                  ? isDark ? "bg-[#181a24] border-[#2c3242] text-white" : "bg-gray-200 border-gray-300 text-black"
                  : isDark ? "bg-purple-600 hover:bg-purple-500 border-purple-500 text-white" : "bg-black hover:bg-gray-800 text-white"
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>{showIngestHero ? "Hide Ingest Lane" : "+ Ingest Video / Stream"}</span>
              {showIngestHero ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* 2. INGESTION CARDS (MATCHING assets/template.png EXACT VISUAL LAYOUT) */}
        {showIngestHero && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
            
            {/* Card 1: Upload a Video */}
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
              className={`rounded-3xl border p-8 text-center space-y-4 cursor-pointer transition-all ${
                isDragging
                  ? "border-purple-500 bg-purple-500/10 scale-[1.01]"
                  : isDark
                  ? "bg-[#111319] hover:bg-[#141620] border-[#222632] hover:border-purple-500/40"
                  : "bg-white hover:bg-purple-50/30 border-gray-200 hover:border-purple-400"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/x-matroska"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />
              <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mx-auto shadow-inner">
                <UploadCloud className="w-8 h-8" />
              </div>
              <div>
                <h3 className={`text-base font-extrabold ${isDark ? "text-white" : "text-gray-900"}`}>
                  Upload a Video
                </h3>
                <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                  Drag and drop local video files here or click to browse.
                </p>
                <span className="inline-block mt-2 text-[10px] font-mono text-gray-500 bg-gray-500/10 px-2.5 py-1 rounded-full">
                  Supports MP4, MOV, MKV up to 1GB
                </span>
              </div>
            </div>

            {/* Card 2: Paste a Video Link */}
            <div className={`rounded-3xl border p-8 space-y-4 flex flex-col justify-between ${
              isDark ? "bg-[#111319] border-[#222632]" : "bg-white border-gray-200"
            }`}>
              <div className="space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shadow-inner">
                  <LinkIcon className="w-8 h-8" />
                </div>
                <div>
                  <h3 className={`text-base font-extrabold ${isDark ? "text-white" : "text-gray-900"}`}>
                    Paste a Video Link
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Direct clip generation for Twitch, YouTube (Shorts & Live), and Kick.
                  </p>
                </div>
              </div>

              <form onSubmit={handleLinkSubmit} className="space-y-3">
                <div className="relative">
                  <input
                    type="url"
                    placeholder="https://www.twitch.tv/streamer or youtube.com/watch..."
                    value={videoLink}
                    onChange={(e) => {
                      setVideoLink(e.target.value);
                      handleCheckStreamLink(e.target.value);
                    }}
                    className={`w-full rounded-2xl pl-4 pr-12 py-3 text-xs focus:outline-none border transition-all ${
                      isDark
                        ? "bg-[#161821] border-[#292d3c] text-white focus:border-purple-500"
                        : "bg-[#f6f7f9] border-gray-200 text-gray-900 focus:border-purple-600"
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={!videoLink.trim() || isAnalyzing}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white flex items-center justify-center transition-all cursor-pointer shadow-md"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Duration Selector & Connectivity Badge */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-[11px] font-bold text-gray-400">Capture Window:</span>
                    <select
                      value={captureDuration}
                      onChange={(e) => setCaptureDuration(Number(e.target.value))}
                      className={`text-[11px] font-bold rounded-lg px-2 py-1 border cursor-pointer ${
                        isDark ? "bg-[#181a24] border-[#292d3c] text-white" : "bg-white border-gray-300 text-black"
                      }`}
                    >
                      <option value={300}>5 Min (Fast Highlights)</option>
                      <option value={600}>10 Min (Standard VOD)</option>
                      <option value={900}>15 Min (Extended Stream)</option>
                      <option value={1800}>30 Min (Deep Scan)</option>
                    </select>
                  </div>

                  {streamCheck && (
                    <div className="text-[11px] font-bold flex items-center gap-1.5">
                      {streamCheck.is_live ? (
                        <span className="text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                          Live: {streamCheck.author || "Broadcasting"}
                        </span>
                      ) : streamCheck.online ? (
                        <span className="text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-full border border-purple-500/20">
                          VOD: {streamCheck.title?.substring(0, 24) || streamCheck.author}
                        </span>
                      ) : (
                        <span className="text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20">
                          Offline / Link unreachable
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </form>
            </div>

          </div>
        )}

        {/* 3. LIVE ANALYSIS RADAR OVERLAY */}
        {isAnalyzing && (
          <div className={`rounded-3xl border p-6 md:p-8 space-y-4 shadow-xl ${
            isDark ? "bg-[#111319] border-purple-500/40" : "bg-purple-50/60 border-purple-300"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                <div>
                  <h3 className={`text-sm font-extrabold ${isDark ? "text-white" : "text-gray-950"}`}>
                    {analyzeStage || "Transcribing Audio & Framing Streamer..."}
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Dual-pass face detection, action scoring, and word-level timing in progress.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-black text-purple-400">{analyzeProgress}%</span>
                <button
                  type="button"
                  onClick={handleCancelJob}
                  className="px-3 py-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500 text-rose-300 hover:text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                  title="Abort in-progress AI analysis"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel Request</span>
                </button>
              </div>
            </div>

            <div className="w-full bg-gray-200 dark:bg-gray-800 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-purple-500 to-cyan-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.max(5, analyzeProgress)}%` }}
              />
            </div>
          </div>
        )}

        {/* 4. MAIN CREATOR WORKSPACE (SPLIT 5:7 LAYOUT) */}
        {activeProject && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* LEFT COLUMN: CURATED VIRAL MOMENTS FEED (5 COLUMNS) */}
            <div className="lg:col-span-5 space-y-4">
              
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter clips by topic or speech..."
                  value={clipFilterText}
                  onChange={(e) => setClipFilterText(e.target.value)}
                  className={`w-full pl-9 pr-4 py-2.5 rounded-xl border text-xs focus:outline-none transition-all ${
                    isDark
                      ? "bg-[#141620] border-[#272b38] text-white focus:border-purple-500"
                      : "bg-white border-gray-200 text-gray-900 focus:border-purple-600"
                  }`}
                />
              </div>

              <div className="space-y-3 max-h-[860px] overflow-y-auto pr-1">
                {filteredClips.map((clip, idx) => {
                  const isSelected = clip.id === selectedClipId;
                  const bounds = getClipBounds(clip);
                  const isRendering = renderingClips[clip.id]?.status === "rendering";
                  const renderedUrl = downloadUrls[clip.id] || downloadUrls[`${bounds.finalStart}_${bounds.finalEnd}`];

                  return (
                    <div
                      key={clip.id}
                      onClick={() => playActiveClip(clip)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-3 ${
                        isSelected
                          ? isDark
                            ? "bg-[#171924] border-purple-500 shadow-lg shadow-purple-500/10"
                            : "bg-purple-50/50 border-purple-400 shadow-md"
                          : isDark
                          ? "bg-[#111319] border-[#222632] hover:border-[#2f3545]"
                          : "bg-white border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-black px-2 py-0.5 rounded-md ${
                            clip.score >= 90
                              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                              : "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                          }`}>
                            🔥 {clip.score} Virality
                          </span>
                          <span className="text-[11px] font-mono text-gray-400">
                            #{idx + 1}
                          </span>
                        </div>

                        <span className="text-[11px] font-mono font-semibold text-gray-400">
                          {bounds.finalStart}s - {bounds.finalEnd}s ({bounds.duration}s)
                        </span>
                      </div>

                      <div>
                        <h3 className={`text-xs font-bold leading-snug line-clamp-2 ${
                          isDark ? "text-white" : "text-gray-900"
                        }`}>
                          {clip.title}
                        </h3>
                        <p className="text-[11px] text-gray-400 line-clamp-2 mt-1 leading-relaxed">
                          {clip.transcript}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-800/60" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => playActiveClip(clip)}
                          className={`text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                            isSelected ? "text-purple-400" : "text-gray-400 hover:text-white"
                          }`}
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Preview</span>
                        </button>

                        <div>
                          {renderedUrl ? (
                            <a
                              href={renderedUrl}
                              download={`clip_${clip.id}.mp4`}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-sm transition-all"
                            >
                              <Download className="w-3 h-3" />
                              <span>Download HD</span>
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRenderClip(clip.id)}
                              disabled={isRendering}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ${
                                isRendering
                                  ? "bg-purple-600/50 text-white cursor-wait"
                                  : isDark
                                  ? "bg-purple-600 hover:bg-purple-500 text-white"
                                  : "bg-black hover:bg-gray-800 text-white"
                              }`}
                            >
                              {isRendering ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>Rendering...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3 h-3" />
                                  <span>Render {aspectRatio}</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT COLUMN: PRE-RENDER WORKSTATION PLAYER & CONTROLS (7 COLUMNS) */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* PREVIEW CONTAINER (SUPPORTS NATIVE FULLSCREEN API) */}
              <div
                ref={previewContainerRef}
                className={`rounded-3xl border shadow-xl transition-all ${
                  isFullscreen
                    ? "fixed inset-0 z-50 bg-[#090b10] border-none flex flex-col justify-between p-4 md:p-8 overflow-hidden rounded-none"
                    : isDark
                    ? "bg-[#111319] border-[#222632] p-4 md:p-6 space-y-4"
                    : "bg-white border-gray-200 p-4 md:p-6 space-y-4"
                }`}
              >
                
                {/* PREVIEW TOOLBAR */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-200 dark:border-gray-800">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-gray-400">View:</span>
                    <button
                      type="button"
                      onClick={() => setPreviewMode("canvas_9_16")}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        previewMode === "canvas_9_16"
                          ? "bg-purple-600 text-white shadow-xs"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      📱 9:16 Canvas
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode("raw_source")}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        previewMode === "raw_source"
                          ? "bg-purple-600 text-white shadow-xs"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      📺 16:9 Raw Source
                    </button>
                  </div>

                  {/* QUICK ASPECT RATIO SELECTORS & FULLSCREEN */}
                  <div className="flex items-center gap-2">
                    <div className="hidden sm:flex items-center gap-1 rounded-xl p-0.5 border dark:border-gray-800 bg-gray-100 dark:bg-[#161822]">
                      <button
                        type="button"
                        onClick={() => { setAspectRatio("9:16"); setPreviewMode("canvas_9_16"); }}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          aspectRatio === "9:16" ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white"
                        }`}
                      >
                        9:16
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAspectRatio("1:1"); setPreviewMode("canvas_9_16"); }}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          aspectRatio === "1:1" ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white"
                        }`}
                      >
                        1:1
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAspectRatio("16:9"); setPreviewMode("raw_source"); }}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          aspectRatio === "16:9" ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white"
                        }`}
                      >
                        16:9
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowSafeZoneOverlay(!showSafeZoneOverlay)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 border transition-all cursor-pointer ${
                        showSafeZoneOverlay
                          ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                          : "border-gray-300 dark:border-gray-700 text-gray-400 hover:text-white"
                      }`}
                      title="TikTok / Instagram Reels safe zone HUD"
                    >
                      <Shield className="w-3 h-3" />
                      <span className="hidden sm:inline">Safe Zone</span>
                    </button>

                    {/* DEDICATED FULLSCREEN TOGGLE BUTTON */}
                    <button
                      type="button"
                      onClick={toggleFullscreen}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                        isFullscreen
                          ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                          : "bg-purple-600/10 hover:bg-purple-600/20 border-purple-500/30 text-purple-300 hover:text-white"
                      }`}
                      title="Toggle Fullscreen Preview (Shortcut: F)"
                    >
                      {isFullscreen ? (
                        <>
                          <Minimize2 className="w-3.5 h-3.5" />
                          <span>Exit Fullscreen</span>
                        </>
                      ) : (
                        <>
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span>Fullscreen</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* DYNAMIC CANVAS PREVIEW FRAME */}
                <div className={`relative mx-auto bg-black rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center border border-gray-800 transition-all ${
                  isFullscreen
                    ? aspectRatio === "16:9" || previewMode === "raw_source"
                      ? "h-[74vh] aspect-video max-w-[95vw]"
                      : aspectRatio === "1:1"
                      ? "h-[74vh] aspect-square max-w-[95vw]"
                      : "h-[76vh] aspect-[9/16] max-w-[95vw]"
                    : previewMode === "raw_source" || aspectRatio === "16:9"
                    ? "aspect-video w-full max-h-[460px]"
                    : aspectRatio === "1:1"
                    ? "aspect-square w-full max-w-[420px]"
                    : "aspect-[9/16] w-full max-w-[340px] max-h-[540px]"
                }`}>
                  
                  {activeProject.video_url ? (
                    previewMode === "canvas_9_16" && framingMode === "auto" ? (
                      /* AUTO STACKED MODE: Split Streamer Top + Gameplay Bottom */
                      <div className="w-full h-full flex flex-col relative select-none">
                        {/* TOP SECTION: Streamer Webcam Zoome & Frame */}
                        <div
                          style={{ height: `${stackedRatio * 100}%` }}
                          className="relative w-full overflow-hidden border-b-2 border-purple-500/60 bg-black"
                        >
                          <video
                            ref={secondaryVideoRef}
                            src={activeProject.video_url}
                            muted
                            playsInline
                            className="w-full h-full object-cover pointer-events-none"
                            style={{
                              transform: "scale(2.0)",
                              transformOrigin: streamerCorner === "top_right" ? "top right" : "top left",
                            }}
                          />
                          <span className="absolute top-2 left-2 text-[9px] font-bold bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-full text-purple-300 border border-purple-500/30">
                            Streamer Cam ({Math.round(stackedRatio * 100)}%)
                          </span>
                        </div>

                        {/* BOTTOM SECTION: Gameplay Centered */}
                        <div
                          style={{ height: `${(1 - stackedRatio) * 100}%` }}
                          className="relative w-full overflow-hidden bg-black"
                        >
                          <video
                            ref={videoRef}
                            src={activeProject.video_url}
                            onTimeUpdate={handleTimeUpdate}
                            playsInline
                            className="w-full h-full object-cover object-center"
                          />
                          <span className="absolute bottom-2 left-2 text-[9px] font-bold bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-full text-gray-300 border border-white/10">
                            Gameplay ({Math.round((1 - stackedRatio) * 100)}%)
                          </span>
                        </div>
                      </div>
                    ) : previewMode === "canvas_9_16" && framingMode === "split" ? (
                      /* DUAL SPEAKER SPLIT MODE: Host Top 50% + Guest Bottom 50% */
                      <div className="w-full h-full flex flex-col relative select-none">
                        <div className="relative w-full h-1/2 overflow-hidden border-b-2 border-indigo-500/80 bg-black">
                          <video
                            ref={secondaryVideoRef}
                            src={activeProject.video_url}
                            muted
                            playsInline
                            className="w-full h-full object-cover pointer-events-none"
                            style={{ transform: "scale(1.4)", transformOrigin: "center left" }}
                          />
                          <span className="absolute top-2 left-2 text-[9px] font-bold bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-full text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                            <Mic className="w-3 h-3 text-indigo-400" />
                            <span>Host (50%)</span>
                          </span>
                        </div>
                        <div className="relative w-full h-1/2 overflow-hidden bg-black">
                          <video
                            ref={videoRef}
                            src={activeProject.video_url}
                            onTimeUpdate={handleTimeUpdate}
                            playsInline
                            className="w-full h-full object-cover"
                            style={{ transform: "scale(1.4)", transformOrigin: "center right" }}
                          />
                          <span className="absolute bottom-2 left-2 text-[9px] font-bold bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-full text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                            <Mic className="w-3 h-3 text-cyan-400" />
                            <span>Guest (50%)</span>
                          </span>
                        </div>
                      </div>
                    ) : previewMode === "canvas_9_16" && framingMode === "screenshare" ? (
                      /* SCREENSHARE TUTORIAL MODE: Top 58% Screen + Bottom 42% Presenter */
                      <div className="w-full h-full flex flex-col relative select-none">
                        <div style={{ height: "58%" }} className="relative w-full overflow-hidden border-b-2 border-emerald-500/80 bg-black">
                          <video
                            ref={secondaryVideoRef}
                            src={activeProject.video_url}
                            muted
                            playsInline
                            className="w-full h-full object-contain bg-black pointer-events-none"
                          />
                          <span className="absolute top-2 left-2 text-[9px] font-bold bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-full text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <GraduationCap className="w-3 h-3 text-emerald-400" />
                            <span>Screen (58%)</span>
                          </span>
                        </div>
                        <div style={{ height: "42%" }} className="relative w-full overflow-hidden bg-black">
                          <video
                            ref={videoRef}
                            src={activeProject.video_url}
                            onTimeUpdate={handleTimeUpdate}
                            playsInline
                            className="w-full h-full object-cover object-center"
                          />
                          <span className="absolute bottom-2 left-2 text-[9px] font-bold bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-full text-teal-300 border border-teal-500/30">
                            Instructor (42%)
                          </span>
                        </div>
                      </div>
                    ) : previewMode === "canvas_9_16" && framingMode === "vlog_cinematic" ? (
                      /* VLOG CINEMATIC REFRAME MODE */
                      <div className="w-full h-full relative overflow-hidden">
                        <video
                          ref={videoRef}
                          src={activeProject.video_url}
                          onTimeUpdate={handleTimeUpdate}
                          playsInline
                          className="w-full h-full object-cover object-center"
                        />
                        <span className="absolute top-2 left-2 text-[9px] font-bold bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-full text-pink-300 border border-pink-500/30 flex items-center gap-1 z-10">
                          <Camera className="w-3 h-3 text-pink-400" />
                          <span>Vlog Subject Track</span>
                        </span>
                      </div>
                    ) : (
                      /* SINGLE VIEW (Smart Face Track or Raw 16:9 or Fit) */
                      <div className="w-full h-full relative">
                        <video
                          ref={videoRef}
                          src={activeProject.video_url}
                          onTimeUpdate={handleTimeUpdate}
                          playsInline
                          className={`w-full h-full ${previewMode === "raw_source" ? "object-contain" : "object-cover object-center"}`}
                        />
                      </div>
                    )
                  ) : (
                    <div className="text-center p-6 text-gray-500">
                      <Video className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p className="text-xs">No video loaded</p>
                    </div>
                  )}

                  {/* OVERLAY 1: TOP HOOK BANNER */}
                  {hookBannerText.trim() && (
                    <div className="absolute top-8 inset-x-3 pointer-events-none z-20 text-center animate-in fade-in duration-200">
                      <span className="inline-block bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 text-white font-black text-xs md:text-sm px-4 py-1.5 rounded-xl shadow-2xl border border-white/20 uppercase tracking-wide">
                        {hookBannerText}
                      </span>
                    </div>
                  )}

                  {/* OVERLAY 2: WATERMARK / MASCOT LOGO */}
                  {(watermarkText.trim() || showMascotWatermark) && (
                    <div className={`absolute z-20 pointer-events-none flex items-center gap-1.5 p-2 ${
                      watermarkPosition === "top_left"
                        ? "top-2 left-2"
                        : watermarkPosition === "bottom_right"
                        ? "bottom-8 right-2"
                        : "top-2 right-2"
                    }`}>
                      {showMascotWatermark && (
                        <img
                          src="/mascot_logo.png"
                          alt="Brand Logo"
                          className="w-6 h-6 object-contain opacity-90 drop-shadow-md"
                        />
                      )}
                      {watermarkText.trim() && (
                        <span className="text-[10px] font-black text-white/90 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/10">
                          {watermarkText}
                        </span>
                      )}
                    </div>
                  )}

                  {/* OVERLAY 3: LIVE ANIMATED SUBTITLE SIMULATION */}
                  {subtitlesEnabled && activeClip && (
                    <div className={`absolute inset-x-3 z-20 pointer-events-none text-center ${
                      subtitlePlacement === "top_anchor"
                        ? "top-16"
                        : subtitlePlacement === "center_stage"
                        ? "top-1/2 -translate-y-1/2"
                        : "bottom-14"
                    }`}>
                      <div className="inline-block max-w-[90%] px-3 py-1.5 rounded-xl">
                        {subtitleStyle === "capcut" && (
                          <span className="font-black uppercase tracking-wider text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]" style={{ fontSize: `${Math.round(subtitleSize * (isFullscreen ? 0.32 : 0.24))}px` }}>
                            {activeClip.title.split(" ").slice(0, 4).join(" ")}{" "}
                            <span className="text-yellow-400 bg-black/60 px-1 rounded-sm">
                              {activeClip.title.split(" ")[4] || "🔥"}
                            </span>
                          </span>
                        )}
                        {subtitleStyle === "neon_gold" && (
                          <span className="font-black uppercase tracking-wider text-amber-300 drop-shadow-[0_0_12px_rgba(245,158,11,0.8)]" style={{ fontSize: `${Math.round(subtitleSize * (isFullscreen ? 0.32 : 0.24))}px` }}>
                            {activeClip.title}
                          </span>
                        )}
                        {subtitleStyle === "clean_white" && (
                          <span className="font-extrabold text-white bg-black/75 px-3 py-1 rounded-lg backdrop-blur-xs" style={{ fontSize: `${Math.round(subtitleSize * (isFullscreen ? 0.30 : 0.22))}px` }}>
                            {activeClip.title}
                          </span>
                        )}
                        {subtitleStyle === "bold_outline" && (
                          <span className="font-black text-white uppercase" style={{ fontSize: `${Math.round(subtitleSize * (isFullscreen ? 0.32 : 0.24))}px`, textShadow: "-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000" }}>
                            {activeClip.title}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* OVERLAY 4: SAFE ZONE MASK (TIKTOK / REELS HUD SIMULATOR) */}
                  {showSafeZoneOverlay && (
                    <div className="absolute inset-0 pointer-events-none z-10 border border-dashed border-cyan-400/50 flex flex-col justify-between p-3 select-none">
                      <div className="text-[9px] font-mono font-bold text-cyan-300 bg-black/70 px-2 py-0.5 rounded self-start">
                        Safe Zone (Above UI)
                      </div>
                      <div className="flex justify-between items-end">
                        <div className="space-y-1 text-white/50 text-[10px]">
                          <div className="w-24 h-2 bg-white/20 rounded" />
                          <div className="w-16 h-2 bg-white/20 rounded" />
                        </div>
                        <div className="space-y-2 text-right text-white/40 text-[9px]">
                          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">♥</div>
                          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">💬</div>
                          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">↗</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CENTER PLAY/PAUSE BIG BUTTON */}
                  <button
                    onClick={togglePlayPause}
                    className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white flex items-center justify-center transition-all cursor-pointer shadow-lg hover:scale-105 z-30"
                  >
                    {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                  </button>

                  {/* TOP-RIGHT ON-CANVAS FULLSCREEN HOVER BUTTON */}
                  <button
                    onClick={toggleFullscreen}
                    className="absolute top-3 right-3 z-30 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-md text-white/80 hover:text-white transition-all cursor-pointer border border-white/10"
                    title={isFullscreen ? "Exit Fullscreen (F)" : "Enter Fullscreen (F)"}
                  >
                    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>

                  <div className="absolute bottom-3 left-3 z-30 flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-black/70 backdrop-blur-md text-white border border-white/10">
                      {activeClip ? activeClip.title : "Preview Stage"}
                    </span>
                  </div>
                </div>

                {/* TIMELINE SCRUBBER & DOCK CONTROLS */}
                {activeClip && (
                  <div className={`space-y-2 pt-2 ${isFullscreen ? "max-w-2xl w-full mx-auto" : ""}`}>
                    
                    {/* Time Counter & Range */}
                    <div className="flex items-center justify-between text-xs font-mono font-bold text-gray-400">
                      <span className="text-purple-400">
                        {currentTime.toFixed(1)}s
                      </span>
                      <span>
                        Clip Range: {getClipBounds(activeClip).finalStart}s - {getClipBounds(activeClip).finalEnd}s ({getClipBounds(activeClip).duration}s)
                      </span>
                    </div>

                    {/* Scrubber Slider */}
                    <input
                      type="range"
                      min={getClipBounds(activeClip).finalStart}
                      max={getClipBounds(activeClip).finalEnd}
                      step={0.1}
                      value={Math.min(Math.max(currentTime, getClipBounds(activeClip).finalStart), getClipBounds(activeClip).finalEnd)}
                      onChange={handleScrubberChange}
                      className="w-full accent-purple-500 cursor-pointer h-1.5 rounded-lg bg-gray-200 dark:bg-gray-800"
                    />

                    {/* EASY-ACCESS PLAYBACK SHUTTLE BAR */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={replayClip}
                          className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-300 transition-colors cursor-pointer"
                          title="Replay from clip start"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => stepTime(-5)}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold font-mono bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-300 transition-colors cursor-pointer"
                          title="Rewind 5 seconds"
                        >
                          -5s
                        </button>
                        <button
                          type="button"
                          onClick={togglePlayPause}
                          className="px-3 py-1 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition-colors cursor-pointer flex items-center gap-1"
                        >
                          {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                          <span>{isPlaying ? "Pause" : "Play"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => stepTime(5)}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold font-mono bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-300 transition-colors cursor-pointer"
                          title="Forward 5 seconds"
                        >
                          +5s
                        </button>
                      </div>

                      {/* In Fullscreen mode: Render button in floating dock */}
                      {isFullscreen && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRenderClip(activeClip.id)}
                            disabled={renderingClips[activeClip.id]?.status === "rendering"}
                            className="px-4 py-1.5 rounded-xl text-xs font-black bg-purple-600 hover:bg-purple-500 text-white shadow-lg flex items-center gap-1.5 cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Render {aspectRatio}</span>
                          </button>
                          <button
                            type="button"
                            onClick={toggleFullscreen}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 cursor-pointer"
                          >
                            Exit (Esc)
                          </button>
                        </div>
                      )}
                    </div>

                  </div>
                )}

                {/* MODULAR STUDIO TABS DECK (HIDDEN IN FULLSCREEN TO FOCUS ON PREVIEW) */}
                {!isFullscreen && (
                  <div className={`rounded-2xl p-4 border space-y-4 ${
                    isDark ? "bg-[#141620] border-[#252a38]" : "bg-gray-50 border-gray-200"
                  }`}>
                    
                    {/* EASY-ACCESS 1-CLICK PRO PRESETS ROW */}
                    <div className="space-y-1.5 pb-2 border-b border-gray-200 dark:border-gray-800">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-gray-400 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-400" />
                          <span>1-Click Studio Profiles:</span>
                        </span>
                        <span className="text-[10px] text-gray-500 font-mono">Auto-configures canvas & typography</span>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        <button
                          type="button"
                          onClick={() => applyPreset("vlog")}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-pink-500/30 hover:border-pink-500 bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 transition-all text-left flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Camera className="w-3.5 h-3.5 text-pink-400 flex-shrink-0" />
                          <span className="truncate">Vlog Dynamic</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => applyPreset("podcast")}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-blue-500/30 hover:border-blue-500 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 transition-all text-left flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Mic className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                          <span className="truncate">Podcast Split</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => applyPreset("educational")}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-emerald-500/30 hover:border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 transition-all text-left flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <GraduationCap className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          <span className="truncate">Tutorial PIP</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => applyPreset("gaming")}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-purple-500/30 hover:border-purple-500 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 transition-all text-left flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Gamepad2 className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                          <span className="truncate">Gaming Shorts</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => applyPreset("tiktok")}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-cyan-500/30 hover:border-cyan-500 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 transition-all text-left flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Smartphone className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                          <span className="truncate">Viral TikTok</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => applyPreset("square")}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-amber-500/30 hover:border-amber-500 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 transition-all text-left flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Square className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                          <span className="truncate">Square Post</span>
                        </button>
                      </div>
                    </div>

                    {/* TAB SWITCHER */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-gray-200 dark:border-gray-800">
                      <button
                        type="button"
                        onClick={() => setActiveStudioTab("framing")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                          activeStudioTab === "framing"
                            ? "bg-purple-600 text-white shadow-xs"
                            : "text-gray-400 hover:text-white"
                        }`}
                      >
                        <Layout className="w-3.5 h-3.5" />
                        <span>Framing & Split</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveStudioTab("typography")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                          activeStudioTab === "typography"
                            ? "bg-purple-600 text-white shadow-xs"
                            : "text-gray-400 hover:text-white"
                        }`}
                      >
                        <Type className="w-3.5 h-3.5" />
                        <span>Subtitles</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveStudioTab("branding")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                          activeStudioTab === "branding"
                            ? "bg-purple-600 text-white shadow-xs"
                            : "text-gray-400 hover:text-white"
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Hook & Branding</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveStudioTab("fx")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                          activeStudioTab === "fx"
                            ? "bg-purple-600 text-white shadow-xs"
                            : "text-gray-400 hover:text-white"
                        }`}
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Audio & FX</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveStudioTab("transcript")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                          activeStudioTab === "transcript"
                            ? "bg-purple-600 text-white shadow-xs"
                            : "text-gray-400 hover:text-white"
                        }`}
                      >
                        <Scissors className="w-3.5 h-3.5" />
                        <span>Transcript & Trim</span>
                      </button>
                    </div>

                    {/* TAB 1: FRAMING & CANVAS */}
                    {activeStudioTab === "framing" && (
                      <div className="space-y-4 animate-in fade-in duration-200">
                        
                        {/* Aspect Ratio */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-400">Target Aspect Ratio:</label>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => { setAspectRatio("9:16"); setPreviewMode("canvas_9_16"); }}
                              className={`p-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                                aspectRatio === "9:16"
                                  ? isDark ? "bg-purple-600/30 border-purple-500 text-white" : "bg-purple-100 border-purple-400 text-purple-900"
                                  : isDark ? "bg-[#181a24] border-[#282c3c] text-gray-400" : "bg-white border-gray-300 text-gray-700"
                              }`}
                            >
                              📱 9:16 Vertical
                              <span className="block text-[10px] opacity-70">Shorts / TikTok</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => { setAspectRatio("1:1"); setPreviewMode("canvas_9_16"); }}
                              className={`p-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                                aspectRatio === "1:1"
                                  ? isDark ? "bg-purple-600/30 border-purple-500 text-white" : "bg-purple-100 border-purple-400 text-purple-900"
                                  : isDark ? "bg-[#181a24] border-[#282c3c] text-gray-400" : "bg-white border-gray-300 text-gray-700"
                              }`}
                            >
                              ⏹️ 1:1 Square
                              <span className="block text-[10px] opacity-70">Insta / FB Feed</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => { setAspectRatio("16:9"); setPreviewMode("raw_source"); }}
                              className={`p-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                                aspectRatio === "16:9"
                                  ? isDark ? "bg-purple-600/30 border-purple-500 text-white" : "bg-purple-100 border-purple-400 text-purple-900"
                                  : isDark ? "bg-[#181a24] border-[#282c3c] text-gray-400" : "bg-white border-gray-300 text-gray-700"
                              }`}
                            >
                              📺 16:9 Landscape
                              <span className="block text-[10px] opacity-70">YouTube Standard</span>
                            </button>
                          </div>
                        </div>

                        {/* Framing Composition Mode */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-400">Layout Composition Engine:</label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => setFramingMode("vlog_cinematic")}
                              className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                                framingMode === "vlog_cinematic"
                                  ? isDark ? "bg-pink-600/30 border-pink-500 text-white" : "bg-pink-100 border-pink-400 text-pink-900"
                                  : isDark ? "bg-[#181a24] border-[#282c3c] text-gray-400" : "bg-white border-gray-300 text-gray-700"
                              }`}
                            >
                              📹 Vlog Dynamic
                              <span className="block text-[10px] opacity-70">9:16 Subject Track</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setFramingMode("auto")}
                              className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                                framingMode === "auto"
                                  ? isDark ? "bg-purple-600/30 border-purple-500 text-white" : "bg-purple-100 border-purple-400 text-purple-900"
                                  : isDark ? "bg-[#181a24] border-[#282c3c] text-gray-400" : "bg-white border-gray-300 text-gray-700"
                              }`}
                            >
                              🎮 Auto Stacked
                              <span className="block text-[10px] opacity-70">Streamer + Game</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setFramingMode("smart")}
                              className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                                framingMode === "smart"
                                  ? isDark ? "bg-purple-600/30 border-purple-500 text-white" : "bg-purple-100 border-purple-400 text-purple-900"
                                  : isDark ? "bg-[#181a24] border-[#282c3c] text-gray-400" : "bg-white border-gray-300 text-gray-700"
                              }`}
                            >
                              👤 Face Track
                              <span className="block text-[10px] opacity-70">Centered Speaker</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setFramingMode("split")}
                              className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                                framingMode === "split"
                                  ? isDark ? "bg-indigo-600/30 border-indigo-500 text-white" : "bg-indigo-100 border-indigo-400 text-indigo-900"
                                  : isDark ? "bg-[#181a24] border-[#282c3c] text-gray-400" : "bg-white border-gray-300 text-gray-700"
                              }`}
                            >
                              🎙️ Dual Split
                              <span className="block text-[10px] opacity-70">Host + Guest 50/50</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setFramingMode("screenshare")}
                              className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                                framingMode === "screenshare"
                                  ? isDark ? "bg-emerald-600/30 border-emerald-500 text-white" : "bg-emerald-100 border-emerald-400 text-emerald-900"
                                  : isDark ? "bg-[#181a24] border-[#282c3c] text-gray-400" : "bg-white border-gray-300 text-gray-700"
                              }`}
                            >
                              🎓 Screen + Cam
                              <span className="block text-[10px] opacity-70">Top 58% + Bot 42%</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setFramingMode("fit")}
                              className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                                framingMode === "fit"
                                  ? isDark ? "bg-purple-600/30 border-purple-500 text-white" : "bg-purple-100 border-purple-400 text-purple-900"
                                  : isDark ? "bg-[#181a24] border-[#282c3c] text-gray-400" : "bg-white border-gray-300 text-gray-700"
                              }`}
                            >
                              🔲 Letterbox Fit
                              <span className="block text-[10px] opacity-70">Blurred Backplate</span>
                            </button>
                          </div>
                        </div>

                        {/* Stacked Ratio Slider & Facecam Corner */}
                        {framingMode === "auto" && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-200 dark:border-gray-800">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs font-bold text-gray-400">
                                <span>Streamer Height Split:</span>
                                <span className="font-mono text-purple-400">{Math.round(stackedRatio * 100)}% Facecam</span>
                              </div>
                              <input
                                type="range"
                                min={0.30}
                                max={0.50}
                                step={0.02}
                                value={stackedRatio}
                                onChange={(e) => setStackedRatio(Number(e.target.value))}
                                className="w-full accent-purple-500 cursor-pointer h-1.5 rounded-lg bg-gray-200 dark:bg-gray-800"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-xs font-bold text-gray-400 block">Streamer Webcam Corner:</label>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setStreamerCorner("top_left")}
                                  className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold border cursor-pointer ${
                                    streamerCorner === "top_left"
                                      ? "bg-purple-600 text-white border-purple-500"
                                      : "bg-gray-100 dark:bg-[#181a24] border-gray-300 dark:border-gray-700 text-gray-400"
                                  }`}
                                >
                                  Top Left
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setStreamerCorner("top_right")}
                                  className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold border cursor-pointer ${
                                    streamerCorner === "top_right"
                                      ? "bg-purple-600 text-white border-purple-500"
                                      : "bg-gray-100 dark:bg-[#181a24] border-gray-300 dark:border-gray-700 text-gray-400"
                                  }`}
                                >
                                  Top Right
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                      </div>
                    )}

                    {/* TAB 2: TYPOGRAPHY & SUBTITLES */}
                    {activeStudioTab === "typography" && (
                      <div className="space-y-4 animate-in fade-in duration-200">
                        
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-gray-400">Kinetic Subtitles:</label>
                          <button
                            type="button"
                            onClick={() => setSubtitlesEnabled(!subtitlesEnabled)}
                            className={`text-xs font-bold px-3 py-1 rounded-lg border transition-all cursor-pointer ${
                              subtitlesEnabled
                                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                                : "bg-gray-500/20 border-gray-500/40 text-gray-400"
                            }`}
                          >
                            {subtitlesEnabled ? "Subtitles Active" : "Subtitles Disabled"}
                          </button>
                        </div>

                        {subtitlesEnabled && (
                          <>
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-gray-400">Subtitle Style Preset:</label>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSubtitleStyle("capcut")}
                                  className={`p-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                                    subtitleStyle === "capcut"
                                      ? isDark ? "bg-purple-600/30 border-purple-500 text-white" : "bg-purple-100 border-purple-400 text-purple-900"
                                      : isDark ? "bg-[#181a24] border-[#282c3c] text-gray-400" : "bg-white border-gray-300 text-gray-700"
                                  }`}
                                >
                                  💛 CapCut Pop
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSubtitleStyle("neon_gold")}
                                  className={`p-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                                    subtitleStyle === "neon_gold"
                                      ? isDark ? "bg-purple-600/30 border-purple-500 text-white" : "bg-purple-100 border-purple-400 text-purple-900"
                                      : isDark ? "bg-[#181a24] border-[#282c3c] text-gray-400" : "bg-white border-gray-300 text-gray-700"
                                  }`}
                                >
                                  ✨ Neon Gold
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSubtitleStyle("clean_white")}
                                  className={`p-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                                    subtitleStyle === "clean_white"
                                      ? isDark ? "bg-purple-600/30 border-purple-500 text-white" : "bg-purple-100 border-purple-400 text-purple-900"
                                      : isDark ? "bg-[#181a24] border-[#282c3c] text-gray-400" : "bg-white border-gray-300 text-gray-700"
                                  }`}
                                >
                                  ⚪ Clean White
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSubtitleStyle("bold_outline")}
                                  className={`p-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                                    subtitleStyle === "bold_outline"
                                      ? isDark ? "bg-purple-600/30 border-purple-500 text-white" : "bg-purple-100 border-purple-400 text-purple-900"
                                      : isDark ? "bg-[#181a24] border-[#282c3c] text-gray-400" : "bg-white border-gray-300 text-gray-700"
                                  }`}
                                >
                                  🔲 Bold Outline
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-200 dark:border-gray-800">
                              <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-400 block">Placement Zone:</label>
                                <div className="grid grid-cols-3 gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setSubtitlePlacement("bottom_safe")}
                                    className={`py-1.5 px-2 rounded-lg text-xs font-bold border cursor-pointer ${
                                      subtitlePlacement === "bottom_safe"
                                        ? "bg-purple-600 text-white border-purple-500"
                                        : "bg-gray-100 dark:bg-[#181a24] border-gray-300 dark:border-gray-700 text-gray-400"
                                    }`}
                                  >
                                    Bottom Safe
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSubtitlePlacement("center_stage")}
                                    className={`py-1.5 px-2 rounded-lg text-xs font-bold border cursor-pointer ${
                                      subtitlePlacement === "center_stage"
                                        ? "bg-purple-600 text-white border-purple-500"
                                        : "bg-gray-100 dark:bg-[#181a24] border-gray-300 dark:border-gray-700 text-gray-400"
                                    }`}
                                  >
                                    Center
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSubtitlePlacement("top_anchor")}
                                    className={`py-1.5 px-2 rounded-lg text-xs font-bold border cursor-pointer ${
                                      subtitlePlacement === "top_anchor"
                                        ? "bg-purple-600 text-white border-purple-500"
                                        : "bg-gray-100 dark:bg-[#181a24] border-gray-300 dark:border-gray-700 text-gray-400"
                                    }`}
                                  >
                                    Top Anchor
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-xs font-bold text-gray-400">
                                <span>Font Size Scale:</span>
                                <span className="font-mono text-purple-400">{subtitleSize}px</span>
                              </div>
                              <input
                                type="range"
                                min={48}
                                max={80}
                                step={4}
                                value={subtitleSize}
                                onChange={(e) => setSubtitleSize(Number(e.target.value))}
                                className="w-full accent-purple-500 cursor-pointer h-1.5 rounded-lg bg-gray-200 dark:bg-gray-800"
                              />
                            </div>
                          </div>
                        </>
                      )}

                    </div>
                  )}

                  {/* TAB 3: BRANDING & HOOK STUDIO */}
                  {activeStudioTab === "branding" && (
                    <div className="space-y-4 animate-in fade-in duration-200">
                      
                      {/* Top Hook Banner */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400">Top Hook Title Banner:</label>
                        <input
                          type="text"
                          placeholder="e.g. WAIT FOR THE END 😱 (Leaves blank to disable)"
                          value={hookBannerText}
                          onChange={(e) => setHookBannerText(e.target.value)}
                          className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                            isDark ? "bg-[#181a24] border-[#292d3c] text-white focus:border-purple-500" : "bg-white border-gray-300 text-black focus:border-purple-600"
                          }`}
                        />
                      </div>

                      {/* Channel Watermark */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-400">Channel Watermark Text:</label>
                          <input
                            type="text"
                            placeholder="e.g. @MyChannel"
                            value={watermarkText}
                            onChange={(e) => setWatermarkText(e.target.value)}
                            className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                              isDark ? "bg-[#181a24] border-[#292d3c] text-white focus:border-purple-500" : "bg-white border-gray-300 text-black focus:border-purple-600"
                            }`}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-400">Watermark Corner:</label>
                          <select
                            value={watermarkPosition}
                            onChange={(e: any) => setWatermarkPosition(e.target.value)}
                            className={`w-full px-3 py-2 rounded-xl text-xs border cursor-pointer ${
                              isDark ? "bg-[#181a24] border-[#292d3c] text-white" : "bg-white border-gray-300 text-black"
                            }`}
                          >
                            <option value="top_right">Top Right</option>
                            <option value="top_left">Top Left</option>
                            <option value="bottom_right">Bottom Right</option>
                          </select>
                        </div>
                      </div>

                      {/* Mascot Logo Watermark Toggle */}
                      <div className="flex items-center justify-between p-3 rounded-xl border dark:bg-[#181a24] dark:border-[#282c3c] bg-white border-gray-300">
                        <div className="flex items-center gap-2.5">
                          <img src="/mascot_logo.png" alt="Mascot Logo" className="w-6 h-6 object-contain" />
                          <div>
                            <span className="text-xs font-bold block">Mascot Logo Watermark</span>
                            <span className="text-[10px] text-gray-400">Displays transparent mascot logo in clip corner</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowMascotWatermark(!showMascotWatermark)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                            showMascotWatermark
                              ? "bg-purple-600 border-purple-500 text-white"
                              : "bg-gray-200 dark:bg-gray-800 border-transparent text-gray-400"
                          }`}
                        >
                          {showMascotWatermark ? "Enabled" : "Disabled"}
                        </button>
                      </div>

                    </div>
                  )}

                  {/* TAB 4: AUDIO & VIDEO FX */}
                  {activeStudioTab === "fx" && (
                    <div className="space-y-4 animate-in fade-in duration-200">
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        
                        {/* Audio Denoise */}
                        <div className="p-3 rounded-xl border dark:bg-[#181a24] dark:border-[#282c3c] bg-white border-gray-300 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold flex items-center gap-1.5">
                              <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                              <span>Vocal Clarity (RNNoise)</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setAudioDenoise(!audioDenoise)}
                              className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold cursor-pointer ${
                                audioDenoise ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-500/20 text-gray-400"
                              }`}
                            >
                              {audioDenoise ? "ON" : "OFF"}
                            </button>
                          </div>
                          <p className="text-[11px] text-gray-400">
                            Isolates speech and strips mechanical keyboard clicks and room hum.
                          </p>
                        </div>

                        {/* Unsharp Sharpening */}
                        <div className="p-3 rounded-xl border dark:bg-[#181a24] dark:border-[#282c3c] bg-white border-gray-300 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Adaptive Sharpening</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setUnsharpSharpening(!unsharpSharpening)}
                              className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold cursor-pointer ${
                                unsharpSharpening ? "bg-cyan-500/20 text-cyan-400" : "bg-gray-500/20 text-gray-400"
                              }`}
                            >
                              {unsharpSharpening ? "ON" : "OFF"}
                            </button>
                          </div>
                          <p className="text-[11px] text-gray-400">
                            Eliminates compression blur; crisps up gaming HUD and text overlay.
                          </p>
                        </div>

                      </div>

                      {/* Export Framerate */}
                      <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-800">
                        <div>
                          <span className="text-xs font-bold block">Master Export Framerate</span>
                          <span className="text-[11px] text-gray-400">30 FPS cinematic standard or 60 FPS mobile fluidity</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setTargetFps(30)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                              targetFps === 30
                                ? "bg-purple-600 border-purple-500 text-white"
                                : "bg-gray-100 dark:bg-[#181a24] border-gray-300 dark:border-gray-700 text-gray-400"
                            }`}
                          >
                            30 FPS
                          </button>
                          <button
                            type="button"
                            onClick={() => setTargetFps(60)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                              targetFps === 60
                                ? "bg-purple-600 border-purple-500 text-white"
                                : "bg-gray-100 dark:bg-[#181a24] border-gray-300 dark:border-gray-700 text-gray-400"
                            }`}
                          >
                            60 FPS
                          </button>
                        </div>
                      </div>

                    </div>
                  )}

                  {/* TAB 5: TRANSCRIPT & TIMING */}
                  {activeStudioTab === "transcript" && (
                    <div className="space-y-4 animate-in fade-in duration-200">
                      
                      {activeClip && (
                        <>
                          <div className="space-y-1">
                            <span className="text-xs font-bold text-gray-400 block">Interactive Speech Transcript:</span>
                            <div
                              onClick={() => {
                                if (videoRef.current) {
                                  videoRef.current.currentTime = getClipBounds(activeClip).finalStart;
                                  videoRef.current.play().catch(() => {});
                                  setIsPlaying(true);
                                }
                              }}
                              className="p-3 rounded-xl border dark:bg-[#181a24] dark:border-[#282c3c] bg-white border-gray-300 text-xs leading-relaxed cursor-pointer hover:border-purple-500/50 transition-colors"
                            >
                              <span className="text-purple-400 font-mono font-bold mr-2">
                                [{getClipBounds(activeClip).finalStart}s]
                              </span>
                              <span>{activeClip.transcript}</span>
                            </div>
                          </div>

                          {/* Fine-Tuning Trim Controls */}
                          <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-800">
                            <div className="flex items-center justify-between text-xs font-bold text-gray-400">
                              <span className="flex items-center gap-1">
                                <Scissors className="w-3.5 h-3.5 text-purple-400" />
                                <span>Adjust Clip Bounds</span>
                              </span>
                              <span className="font-mono text-purple-400">
                                {getClipBounds(activeClip).duration}s Window
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="flex items-center justify-between p-2 rounded-xl border dark:bg-[#181a24] dark:border-[#282c3c] bg-white border-gray-300">
                                <span className="text-[11px] font-bold text-gray-400">Start:</span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const cur = clipStartAdjust[activeClip.id] || 0;
                                      setClipStartAdjust((prev) => ({ ...prev, [activeClip.id]: cur - 1 }));
                                    }}
                                    className="w-6 h-6 rounded-lg bg-gray-200 dark:bg-gray-800 text-xs font-bold flex items-center justify-center cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <span className="font-mono text-xs font-bold px-1.5">
                                    {getClipBounds(activeClip).finalStart}s
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const cur = clipStartAdjust[activeClip.id] || 0;
                                      setClipStartAdjust((prev) => ({ ...prev, [activeClip.id]: cur + 1 }));
                                    }}
                                    className="w-6 h-6 rounded-lg bg-gray-200 dark:bg-gray-800 text-xs font-bold flex items-center justify-center cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              <div className="flex items-center justify-between p-2 rounded-xl border dark:bg-[#181a24] dark:border-[#282c3c] bg-white border-gray-300">
                                <span className="text-[11px] font-bold text-gray-400">End:</span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const cur = clipEndAdjust[activeClip.id] || 0;
                                      setClipEndAdjust((prev) => ({ ...prev, [activeClip.id]: cur - 1 }));
                                    }}
                                    className="w-6 h-6 rounded-lg bg-gray-200 dark:bg-gray-800 text-xs font-bold flex items-center justify-center cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <span className="font-mono text-xs font-bold px-1.5">
                                    {getClipBounds(activeClip).finalEnd}s
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const cur = clipEndAdjust[activeClip.id] || 0;
                                      setClipEndAdjust((prev) => ({ ...prev, [activeClip.id]: cur + 1 }));
                                    }}
                                    className="w-6 h-6 rounded-lg bg-gray-200 dark:bg-gray-800 text-xs font-bold flex items-center justify-center cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                    </div>
                  )}

                  {/* MASTER RENDER & EXPORT BUTTON */}
                  {activeClip && (
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
                      {downloadUrls[activeClip.id] || downloadUrls[`${getClipBounds(activeClip).finalStart}_${getClipBounds(activeClip).finalEnd}`] ? (
                        <div className="space-y-2">
                          <a
                            href={downloadUrls[activeClip.id] || downloadUrls[`${getClipBounds(activeClip).finalStart}_${getClipBounds(activeClip).finalEnd}`]}
                            download={`clip_${activeClip.id}.mp4`}
                            className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
                          >
                            <Download className="w-4 h-4" />
                            <span>Download Rendered MP4 Master</span>
                          </a>

                          <button
                            type="button"
                            onClick={handleOpenOutputFolder}
                            className="w-full py-2.5 rounded-xl border border-gray-700 bg-gray-800/80 hover:bg-gray-700 text-gray-200 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                          >
                            <FolderOpen className="w-4 h-4 text-amber-400" />
                            <span>Open in File Explorer</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                `${activeClip.title}\n\n#Gaming #Streamer #TwitchClips #Shorts #TikTok`,
                                "caption"
                              )
                            }
                            className={`w-full py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                              isDark
                                ? "bg-[#181a24] border-[#282c3c] text-purple-300 hover:text-white"
                                : "bg-white border-gray-300 text-gray-800 hover:text-black"
                            }`}
                          >
                            {copiedField === "caption" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedField === "caption" ? "Copied Caption & Hashtags!" : "Copy Title, Caption & Hashtags"}</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRenderClip(activeClip.id)}
                          disabled={renderingClips[activeClip.id]?.status === "rendering"}
                          className={`w-full py-3.5 rounded-2xl font-extrabold text-xs flex items-center justify-center gap-2 shadow-xl transition-all cursor-pointer ${
                            renderingClips[activeClip.id]?.status === "rendering"
                              ? "bg-purple-600/50 text-white cursor-wait"
                              : "bg-purple-600 hover:bg-purple-500 text-white hover:scale-[1.01]"
                          }`}
                        >
                          {renderingClips[activeClip.id]?.status === "rendering" ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Rendering Streamer Facecam & Subtitles...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              <span>Render Viral {aspectRatio} Master Clip</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  </div>
                )}

              </div>

            </div>

          </div>
        )}

        {/* EMPTY STATE IF NO ACTIVE PROJECT */}
        {!activeProject && !isAnalyzing && (
          <div className={`rounded-3xl border p-12 text-center max-w-xl mx-auto space-y-5 my-8 ${
            isDark ? "bg-[#111319] border-[#222632]" : "bg-white border-gray-200"
          }`}>
            <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mx-auto shadow-inner">
              <Scissors className="w-8 h-8" />
            </div>
            <div>
              <h3 className={`text-base font-extrabold ${isDark ? "text-white" : "text-gray-900"}`}>
                No Project Selected in Studio
              </h3>
              <p className="text-xs text-gray-400 mt-1.5 leading-relaxed max-w-md mx-auto">
                Select a project from your library to start customizing 9:16 layout, captions, and rendering clips, or ingest a new stream from the dashboard.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Link
                href="/library"
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all shadow-md cursor-pointer flex items-center gap-2"
              >
                <Layers className="w-4 h-4" />
                <span>Go to Projects Library</span>
              </Link>
              <Link
                href="/"
                className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  isDark ? "bg-[#181a24] border-[#292d3c] text-gray-300 hover:text-white" : "bg-gray-100 border-gray-200 text-gray-700 hover:text-black"
                }`}
              >
                <PlayCircle className="w-4 h-4" />
                <span>Ingest on Dashboard</span>
              </Link>
            </div>
          </div>
        )}

      </div>

      {/* 5. CONFIRMATION MODAL FOR CLEARING WORKSPACE */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-3xl p-6 border shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 ${
            isDark ? "bg-[#12141c] border-[#2a3040] text-white" : "bg-white border-gray-200 text-black"
          }`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold">Reset Current Workspace?</h3>
                <p className="text-xs text-gray-400 mt-0.5">This will clear the current video from the editor.</p>
              </div>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed">
              Are you sure you want to clear this workspace? You can start fresh with another video upload or live stream link. (Your previously exported videos remain saved in your Exports library).
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearWorkspace}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md cursor-pointer transition-all"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. KEYBOARD SHORTCUTS HELPER MODAL */}
      {showShortcutsModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-sm rounded-3xl p-6 border shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 ${
            isDark ? "bg-[#12141c] border-[#2a3040] text-white" : "bg-white border-gray-200 text-black"
          }`}>
            <div className="flex items-center justify-between border-b pb-3 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-extrabold">Pro Creator Hotkeys</h3>
              </div>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b dark:border-gray-800/60">
                <span className="text-gray-400">Play / Pause Preview</span>
                <kbd className="font-mono bg-gray-800 text-purple-300 px-2 py-0.5 rounded">Space</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b dark:border-gray-800/60">
                <span className="text-gray-400">Toggle Fullscreen Staging</span>
                <kbd className="font-mono bg-gray-800 text-purple-300 px-2 py-0.5 rounded">F</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b dark:border-gray-800/60">
                <span className="text-gray-400">Step 1s Backward / Forward</span>
                <kbd className="font-mono bg-gray-800 text-purple-300 px-2 py-0.5 rounded">← / →</kbd>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-gray-400">Quick Render Active Clip</span>
                <kbd className="font-mono bg-gray-800 text-purple-300 px-2 py-0.5 rounded">R</kbd>
              </div>
            </div>

            <button
              onClick={() => setShowShortcutsModal(false)}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs cursor-pointer transition-all"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* 7. FLOATING WORKING TOAST NOTIFICATIONS STACK */}
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
                  <a
                    href={toast.actionUrl}
                    download
                    className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shadow-sm transition-all"
                  >
                    <Download className="w-3 h-3" />
                    <span>{toast.actionLabel || "Download"}</span>
                  </a>
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

      {/* Upgrade & Payment Packages Modal */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason={upgradeModalReason}
      />

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

export default function SingleWindowStudioPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-gray-500">Loading Single-Window Studio...</div>}>
      <SingleWindowStudioContent />
    </Suspense>
  );
}
