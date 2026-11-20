"use client";

export interface AppNotification {
  id: string;
  type: "render" | "analysis" | "system" | "cancel";
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
  downloadUrl?: string;
}

const STORAGE_KEY = "pic_clip_notifications_v1";
const SETTINGS_KEY = "pic_clip_notification_settings_v1";

export interface NotificationSettings {
  desktopAlerts: boolean;
  soundEnabled: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  desktopAlerts: false,
  soundEnabled: true,
};

// Dispatch custom browser event when notifications change
function notifyListeners() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("pic_clip_notifications_updated"));
  }
}

export function getNotificationSettings(): NotificationSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveNotificationSettings(settings: Partial<NotificationSettings>) {
  if (typeof window === "undefined") return;
  try {
    const current = getNotificationSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    notifyListeners();
  } catch (e) {
    console.error("Failed to save notification settings:", e);
  }
}

export function getNotifications(): AppNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Seed initial helpful notifications for a great out-of-the-box user experience
      const initial: AppNotification[] = [
        {
          id: "welcome-1",
          type: "system",
          title: "PIC-CLIP AI Engine Initialized",
          message: "Autonomous webcam tracking, kinetic subtitles, and 9:16 layout engines are online.",
          timestamp: Date.now() - 1000 * 60 * 15, // 15 mins ago
          read: false,
          actionUrl: "/",
          actionLabel: "Create Clip",
        },
        {
          id: "plan-tier-1",
          type: "system",
          title: "Creator Free Tier Active",
          message: "You have 60 minutes of stream processing credits remaining this month.",
          timestamp: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
          read: false,
          actionUrl: "/settings",
          actionLabel: "View Plan",
        },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function addNotification(
  item: Omit<AppNotification, "id" | "timestamp" | "read">
): AppNotification {
  const newNotif: AppNotification = {
    ...item,
    id: "notif_" + Math.random().toString(36).substring(2, 9),
    timestamp: Date.now(),
    read: false,
  };

  if (typeof window !== "undefined") {
    try {
      const list = getNotifications();
      // Keep up to 50 notifications
      const updated = [newNotif, ...list].slice(0, 50);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      notifyListeners();

      const settings = getNotificationSettings();

      // Audio Chime (Synthesized via Web Audio API)
      if (settings.soundEnabled) {
        playNotificationChime();
      }

      // Desktop Push Notification
      if (settings.desktopAlerts && "Notification" in window && Notification.permission === "granted") {
        try {
          new Notification(newNotif.title, {
            body: newNotif.message,
            icon: "/mascot_logo.png",
          });
        } catch (e) {
          console.warn("Desktop notification error:", e);
        }
      }
    } catch (e) {
      console.error("Failed to persist notification:", e);
    }
  }

  return newNotif;
}

export function markNotificationAsRead(id: string) {
  if (typeof window === "undefined") return;
  try {
    const list = getNotifications();
    const updated = list.map((n) => (n.id === id ? { ...n, read: true } : n));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    notifyListeners();
  } catch (e) {
    console.error("Failed to mark notification as read:", e);
  }
}

export function markAllNotificationsAsRead() {
  if (typeof window === "undefined") return;
  try {
    const list = getNotifications();
    const updated = list.map((n) => ({ ...n, read: true }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    notifyListeners();
  } catch (e) {
    console.error("Failed to mark all notifications as read:", e);
  }
}

export function deleteNotification(id: string) {
  if (typeof window === "undefined") return;
  try {
    const list = getNotifications();
    const updated = list.filter((n) => n.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    notifyListeners();
  } catch (e) {
    console.error("Failed to delete notification:", e);
  }
}

export function clearAllNotifications() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    notifyListeners();
  } catch (e) {
    console.error("Failed to clear notifications:", e);
  }
}

export function getUnreadCount(): number {
  const list = getNotifications();
  return list.filter((n) => !n.read).length;
}

export async function requestDesktopNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }
  try {
    const perm = await Notification.requestPermission();
    const granted = perm === "granted";
    saveNotificationSettings({ desktopAlerts: granted });
    return granted;
  } catch {
    return false;
  }
}

/**
 * Pleasant two-tone chime generated synthetically using Web Audio API
 * No external MP3 file dependency required.
 */
export function playNotificationChime() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Tone 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    gain1.gain.setValueAtTime(0.08, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.3);

    // Tone 2: 880.00 Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880.0, ctx.currentTime + 0.12);
    gain2.gain.setValueAtTime(0.09, ctx.currentTime + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.46);
  } catch {
    // AudioContext might be blocked until user gesture, ignore safely
  }
}
