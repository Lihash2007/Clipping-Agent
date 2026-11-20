"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Search,
  Bell,
  Sun,
  Moon,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Scissors,
  Trash2,
  Check,
  X,
  Volume2,
  VolumeX,
  Laptop,
  Layers,
  ArrowRight,
  Tag,
  LogOut,
  User,
  Ticket,
  ShieldCheck,
  ShieldAlert
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import { DesktopLicenseModal } from "@/components/licensing/DesktopLicenseModal";
import { getActiveJob, ActiveJobState } from "@/lib/activeJob";
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllNotifications,
  getUnreadCount,
  requestDesktopNotificationPermission,
  getNotificationSettings,
  saveNotificationSettings,
  AppNotification
} from "@/lib/notifications";
import { getUserCredits, getRemainingDailyGenerations, UserCreditState } from "@/lib/credits";
import { UpgradeModal } from "@/components/subscription/UpgradeModal";
import { fetchPublicPlatformConfig } from "@/lib/platformConfig";
import { getCurrentUser, logoutUser, UserAccount } from "@/lib/auth";
import { AuthModal } from "@/components/auth/AuthModal";
import { Zap } from "lucide-react";

interface TopHeaderProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function TopHeader({ title, subtitle, actions }: TopHeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  // Active Job State
  const [activeJob, setActiveJob] = useState<ActiveJobState | null>(null);

  // Notifications State
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [desktopEnabled, setDesktopEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Credits & Pricing State
  const [credits, setCredits] = useState<UserCreditState>(getUserCredits());
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [announcement, setAnnouncement] = useState<{
    enabled: boolean;
    badge?: string;
    message: string;
    link?: string;
    link_text?: string;
  } | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Authentication State
  const [user, setUser] = useState<UserAccount | null>(getCurrentUser());
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"signin" | "signup" | "redeem">("signin");

  // Desktop Standalone Hardware Licensing State
  const [desktopLicense, setDesktopLicense] = useState<{
    is_licensed: boolean;
    plan?: string;
    machine_id?: string;
    days_remaining?: number | string;
  } | null>(null);
  const [showDesktopLicenseModal, setShowDesktopLicenseModal] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const refreshDesktopLicense = async () => {
    try {
      const res = await fetch("/api/desktop/license/status");
      if (res.ok) {
        const data = await res.json();
        setDesktopLicense(data);
      }
    } catch {
      // Offline or local dev fallback
    }
  };

  const refreshCredits = () => {
    setCredits(getUserCredits());
  };

  const refreshNotifications = () => {
    const list = getNotifications();
    setNotifications(list);
    setUnreadCount(getUnreadCount());
    const settings = getNotificationSettings();
    setDesktopEnabled(settings.desktopAlerts);
    setSoundEnabled(settings.soundEnabled);
    refreshCredits();
  };

  useEffect(() => {
    // Initial sync
    setActiveJob(getActiveJob());
    refreshNotifications();
    refreshCredits();
    refreshDesktopLicense();

    fetchPublicPlatformConfig().then((cfg) => {
      if (cfg && cfg.announcement) {
        setAnnouncement(cfg.announcement);
      }
    });

    // Polling active jobs
    const timer = setInterval(() => {
      setActiveJob(getActiveJob());
    }, 1200);

    // Listen for custom notification & credits update events
    const handleNotifUpdate = () => {
      refreshNotifications();
    };

    const handleCreditsUpdate = () => {
      refreshCredits();
    };

    window.addEventListener("pic_clip_notifications_updated", handleNotifUpdate);
    window.addEventListener("pic_clip_credits_updated", handleCreditsUpdate);

    const handleOpenLicenseModal = () => {
      setShowDesktopLicenseModal(true);
    };
    window.addEventListener("open_desktop_license_modal", handleOpenLicenseModal);

    const handleAuthChange = (e: any) => {
      setUser(e.detail || getCurrentUser());
      refreshCredits();
    };
    window.addEventListener("pic_clip_auth_changed", handleAuthChange);

    // Close dropdowns on outside click
    const handleOutsideClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      clearInterval(timer);
      window.removeEventListener("pic_clip_notifications_updated", handleNotifUpdate);
      window.removeEventListener("pic_clip_credits_updated", handleCreditsUpdate);
      window.removeEventListener("pic_clip_auth_changed", handleAuthChange);
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const handleToggleDesktop = async () => {
    if (!desktopEnabled) {
      const granted = await requestDesktopNotificationPermission();
      setDesktopEnabled(granted);
    } else {
      saveNotificationSettings({ desktopAlerts: false });
      setDesktopEnabled(false);
    }
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    saveNotificationSettings({ soundEnabled: next });
  };

  const filteredNotifs = filter === "all" ? notifications : notifications.filter((n) => !n.read);

  const formatRelativeTime = (ts: number) => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <>
      {/* Remote Admin Broadcast Announcement Banner */}
      {announcement?.enabled && !bannerDismissed && (
        <div className="bg-gradient-to-r from-purple-900/90 via-indigo-900/90 to-purple-950/90 border-b border-purple-500/30 px-6 py-2 text-xs text-white flex items-center justify-between z-30 transition-all">
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 rounded-full bg-purple-500 text-[10px] font-black uppercase tracking-wider text-white shadow-xs">
              {announcement.badge || "OFFER"}
            </span>
            <span className="font-medium text-purple-100">{announcement.message}</span>
            {announcement.link && (
              <Link
                href="/pricing"
                className="underline text-purple-200 hover:text-white font-bold ml-2 cursor-pointer flex items-center gap-1"
              >
                <span>{announcement.link_text || "View Plans & Pricing"}</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            className="p-1 rounded-md text-purple-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Dismiss announcement"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <header
        className={`h-20 px-8 flex items-center justify-between z-20 flex-shrink-0 transition-colors duration-200 border-b ${
          isDark
            ? "bg-[#0b0c0f] border-[#1e2025] text-white"
            : "bg-[#f7f8fa] border-gray-200/80 text-gray-900"
        }`}
    >
      {/* Search Bar matching template */}
      <div className="relative w-full max-w-md">
        <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? "text-gray-400" : "text-gray-400"}`} />
        <input
          type="text"
          placeholder="Search projects, clips, templates..."
          className={`w-full rounded-2xl pl-11 pr-12 py-2.5 text-xs transition-all focus:outline-none shadow-xs ${
            isDark
              ? "bg-[#15161a] border border-[#23262d] text-gray-100 placeholder-gray-500 focus:border-purple-500"
              : "bg-[#ecedf0] hover:bg-white focus:bg-white border border-transparent focus:border-gray-300 text-gray-800 placeholder-gray-500"
          }`}
        />
        <div
          className={`absolute right-3.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-semibold shadow-xs ${
            isDark
              ? "bg-[#1f2127] border border-[#2b2e37] text-gray-300"
              : "bg-white border border-gray-200 text-gray-500"
          }`}
        >
          ⌘K
        </div>
      </div>

      {/* Center: Live Background AI Job Status Pill if Active */}
      {activeJob && (
        <Link
          href="/"
          className={`hidden md:flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border text-xs font-bold transition-all shadow-sm ${
            isDark
              ? "bg-purple-950/40 border-purple-500/40 text-purple-300 hover:bg-purple-900/50"
              : "bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
          }`}
          title="Click to view ongoing AI analysis"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500"></span>
          </span>
          <span className="font-mono text-[11px] font-extrabold">{activeJob.progress || 5}%</span>
          <span className="max-w-[160px] truncate text-[11px] font-normal opacity-80">
            {activeJob.stage || "AI Analyzing stream..."}
          </span>
        </Link>
      )}

      {/* Right Controls: Theme Toggle, Notifications, Actions, User Avatar */}
      <div className="flex items-center gap-3.5">
        {actions}

        {/* Pricing & Plans Link */}
        <Link
          href="/pricing"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer shadow-xs"
          title="View subscription plans and pricing"
        >
          <Tag className="w-3.5 h-3.5 text-purple-400" />
          <span>Plans</span>
        </Link>

        {/* Desktop Hardware Node-Lock License Pill */}
        <button
          type="button"
          onClick={() => setShowDesktopLicenseModal(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer shadow-xs border ${
            desktopLicense?.is_licensed
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
              : "bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25 animate-pulse"
          }`}
          title="Desktop Node-Locked Hardware License Status"
        >
          {desktopLicense?.is_licensed ? (
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          )}
          <span className="font-mono text-[11px]">
            {desktopLicense?.is_licensed
              ? desktopLicense.plan === "LIFETIME_FOUNDER"
                ? "FOUNDER"
                : desktopLicense.days_remaining !== undefined && desktopLicense.days_remaining !== "Unlimited"
                ? `${desktopLicense.plan || "PRO"} (${desktopLicense.days_remaining}d)`
                : "PRO PC"
              : "Activate PC"}
          </span>
        </button>

        {/* Daily Free Generation Credits Counter */}
        <button
          type="button"
          onClick={() => setShowUpgradeModal(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer shadow-xs border ${
            credits.tier === "pro"
              ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20"
              : credits.dailyGenerationsUsed < credits.dailyGenerationsLimit
              ? isDark
                ? "bg-purple-950/40 border-purple-500/40 text-purple-300 hover:bg-purple-900/50"
                : "bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20 animate-pulse"
          }`}
          title="Free Plan: 3 video generations / day. Click to upgrade or view packages."
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-mono text-[11px]">
            {credits.tier === "pro"
              ? "Unlimited 4K"
              : `${Math.max(0, credits.dailyGenerationsLimit - credits.dailyGenerationsUsed)}/${credits.dailyGenerationsLimit} Free Today`}
          </span>
        </button>

        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          title={isDark ? "Switch to Light Theme" : "Switch to Dark Theme"}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer shadow-xs border ${
            isDark
              ? "bg-[#16171d] border-[#292c35] text-yellow-300 hover:bg-[#20222a]"
              : "bg-white border-gray-200 text-gray-700 hover:text-black hover:bg-gray-50"
          }`}
        >
          {isDark ? (
            <>
              <Sun className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-[11px] font-mono text-gray-200">Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-purple-600" />
              <span className="text-[11px] font-mono text-gray-700">Dark Mode</span>
            </>
          )}
        </button>

        {/* Notification Bell with Working Dropdown Popover */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            aria-label="Notifications"
            className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs border ${
              isNotifOpen
                ? "bg-purple-600 text-white border-purple-500"
                : isDark
                ? "bg-[#15161a] border-[#23262d] text-gray-300 hover:text-white"
                : "bg-white border-gray-200 text-gray-700 hover:text-black"
            }`}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-purple-600 text-white text-[10px] font-mono font-black flex items-center justify-center border-2 border-[#0b0c0f] shadow-sm animate-pulse">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {/* NOTIFICATION CENTER DROPDOWN */}
          {isNotifOpen && (
            <div
              className={`absolute right-0 mt-3 w-80 sm:w-96 rounded-3xl border shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${
                isDark
                  ? "bg-[#12141c] border-[#262b3b] text-gray-100"
                  : "bg-white border-gray-200 text-gray-900"
              }`}
            >
              {/* Header */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-purple-400" />
                  <h3 className="font-extrabold text-sm">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 font-mono">
                      {unreadCount} new
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllNotificationsAsRead}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 transition-colors cursor-pointer"
                    >
                      Mark all read
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      onClick={clearAllNotifications}
                      className="p-1 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Clear all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800/40 flex items-center gap-2 bg-gray-50/50 dark:bg-[#151722]/50 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                    filter === "all"
                      ? "bg-purple-600 text-white shadow-xs"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  All ({notifications.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("unread")}
                  className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                    filter === "unread"
                      ? "bg-purple-600 text-white shadow-xs"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Unread ({unreadCount})
                </button>
              </div>

              {/* Notification List */}
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800/50">
                {filteredNotifs.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-gray-500 mx-auto opacity-40" />
                    <p className="text-xs font-bold text-gray-400">All caught up!</p>
                    <p className="text-[11px] text-gray-500">
                      You will be notified when AI analysis or clip renders complete.
                    </p>
                  </div>
                ) : (
                  filteredNotifs.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => markNotificationAsRead(n.id)}
                      className={`p-4 transition-colors flex items-start gap-3 cursor-pointer ${
                        !n.read
                          ? isDark
                            ? "bg-[#181a26]/80 hover:bg-[#1e2030]"
                            : "bg-purple-50/50 hover:bg-purple-50"
                          : isDark
                          ? "hover:bg-[#151722]"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      {/* Icon */}
                      <div className="mt-0.5 flex-shrink-0">
                        {n.type === "render" ? (
                          <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center justify-center">
                            <Scissors className="w-4 h-4" />
                          </div>
                        ) : n.type === "analysis" ? (
                          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                            <Sparkles className="w-4 h-4" />
                          </div>
                        ) : n.type === "cancel" ? (
                          <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center">
                            <AlertCircle className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
                            <Bell className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="font-extrabold text-xs truncate text-white">
                            {n.title}
                          </h4>
                          <span className="text-[10px] font-mono text-gray-400 flex-shrink-0">
                            {formatRelativeTime(n.timestamp)}
                          </span>
                        </div>

                        <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed line-clamp-2">
                          {n.message}
                        </p>

                        {/* Action buttons */}
                        <div className="mt-2 flex items-center gap-2">
                          {n.actionUrl && (
                            <Link
                              href={n.actionUrl}
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsNotifOpen(false);
                                markNotificationAsRead(n.id);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-[10px] shadow-xs transition-all"
                            >
                              <span>{n.actionLabel || "View"}</span>
                              <ArrowRight className="w-3 h-3" />
                            </Link>
                          )}
                          {n.downloadUrl && (
                            <a
                              href={n.downloadUrl}
                              download
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[10px] shadow-xs transition-all"
                            >
                              <span>Download MP4</span>
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Delete icon */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(n.id);
                        }}
                        className="text-gray-500 hover:text-rose-400 p-1 rounded-md opacity-60 hover:opacity-100 transition-opacity cursor-pointer flex-shrink-0"
                        title="Dismiss"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Preferences Footer */}
              <div className="p-3 border-t border-gray-100 dark:border-gray-800/80 bg-gray-50/70 dark:bg-[#0e1017] flex items-center justify-between text-[11px] font-mono">
                <button
                  type="button"
                  onClick={handleToggleDesktop}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    desktopEnabled
                      ? "text-purple-400 font-bold bg-purple-500/10"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                  title="Enable native OS / Chrome desktop push alerts"
                >
                  <Laptop className="w-3.5 h-3.5" />
                  <span>Desktop Alerts: {desktopEnabled ? "ON" : "OFF"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleSound}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    soundEnabled
                      ? "text-emerald-400 font-bold bg-emerald-500/10"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                  title="Play pleasant audio chime when processing finishes"
                >
                  {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                  <span>Sound: {soundEnabled ? "ON" : "OFF"}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Account / Profile Area */}
        {user ? (
          <div className="relative" ref={profileMenuRef}>
            <button
              type="button"
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center gap-2 p-1 rounded-full hover:bg-white/5 transition-all cursor-pointer"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-600 to-cyan-500 text-white font-extrabold flex items-center justify-center text-xs shadow-md hover:scale-105 transition-transform border border-white/20">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  (user.name || "U")[0].toUpperCase()
                )}
              </div>
              <span className="hidden md:inline text-xs font-bold text-gray-200 max-w-[100px] truncate">
                {user.name}
              </span>
            </button>

            {/* Profile Dropdown Popover */}
            {isProfileMenuOpen && (
              <div className="absolute right-0 top-12 w-64 rounded-2xl border border-gray-800 bg-[#0f111a] text-white p-3 shadow-2xl z-50 space-y-3 animate-in fade-in zoom-in-95">
                {/* User Info Header */}
                <div className="pb-2.5 border-b border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white truncate max-w-[140px]">{user.name}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {user.tier}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 font-mono truncate">{user.email}</p>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-gray-400">
                    <span>Region:</span>
                    <span className="text-amber-300 font-bold">
                      {user.country === "IN" ? "🇮🇳 India (Special ₹ INR)" : `🌐 ${user.country} (Global $ USD)`}
                    </span>
                  </div>
                </div>

                {/* Quick Menu Actions */}
                <div className="space-y-1 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      setAuthModalMode("redeem");
                      setShowAuthModal(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-amber-300 hover:bg-amber-500/10 font-bold transition-colors cursor-pointer"
                  >
                    <Ticket className="w-4 h-4 text-amber-400" />
                    <span>Redeem Voucher Code</span>
                  </button>

                  <Link
                    href="/pricing"
                    onClick={() => setIsProfileMenuOpen(false)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <Tag className="w-4 h-4 text-purple-400" />
                    <span>Subscription Plans</span>
                  </Link>

                  <Link
                    href="/settings"
                    onClick={() => setIsProfileMenuOpen(false)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <User className="w-4 h-4 text-cyan-400" />
                    <span>Account Settings</span>
                  </Link>
                </div>

                {/* Sign Out Button */}
                <div className="pt-2 border-t border-gray-800">
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      logoutUser();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-rose-400 hover:bg-rose-500/10 font-bold text-xs transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowUpgradeModal(true)}
              className="px-3.5 py-1.5 rounded-full text-xs font-black text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all shadow-md cursor-pointer flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Upgrade to Pro</span>
            </button>
          </div>
        )}
      </div>
    </header>

    {/* Upgrade & Payment Packages Modal */}
    {showUpgradeModal && (
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
      />
    )}

    {/* User Authentication & Voucher Modal */}
    {showAuthModal && (
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        initialMode={authModalMode}
      />
    )}

    {/* Desktop Hardware License Modal */}
    {showDesktopLicenseModal && (
      <DesktopLicenseModal
        isOpen={showDesktopLicenseModal}
        onClose={() => setShowDesktopLicenseModal(false)}
        onStatusChange={(st) => setDesktopLicense(st)}
      />
    )}
  </>
);
}
