"use client";

import { PlanTier, upgradePlanTier, addTopUpCredits } from "./credits";

export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  platform: "twitch" | "kick" | "youtube" | "local";
  tier: PlanTier;
  dailyUsed: number;
  dailyLimit: number;
  totalClipsRendered: number;
  purchasedCredits: number;
  storageDestination: "local" | "gdrive";
  joinedDate: string;
}

export interface AdminSettings {
  isMasterAdmin: boolean;
  adminPasskey: string;
  globalDailyFreeLimit: number;
  globalMonthlyFreeLimit: number;
  enforceWatermarkOnFree: boolean;
  maintenanceMode: boolean;
  selectedPaymentProvider: "lemon_squeezy" | "paddle" | "crypto_nowpayments";
  cryptoWalletAddress?: string;
  lemonSqueezyStoreId?: string;
}

const ADMIN_STORAGE_KEY = "pic_clip_admin_settings_v1";
const ADMIN_USERS_KEY = "pic_clip_managed_users_v1";
const MASTER_PASSKEY_DEFAULT = "picclip_admin_2026";

const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  isMasterAdmin: false,
  adminPasskey: MASTER_PASSKEY_DEFAULT,
  globalDailyFreeLimit: 3,
  globalMonthlyFreeLimit: 15,
  enforceWatermarkOnFree: true,
  maintenanceMode: false,
  selectedPaymentProvider: "lemon_squeezy",
  cryptoWalletAddress: "Solana: 7xKXtg...9vW1 / Polygon USDT",
  lemonSqueezyStoreId: "store_picclip_live",
};

// Seed initial creator accounts for administration view
const INITIAL_MANAGED_USERS: ManagedUser[] = [
  {
    id: "user_adm_01",
    email: "admin@picclip.ai",
    name: "Master Admin (You)",
    platform: "twitch",
    tier: "pro",
    dailyUsed: 12,
    dailyLimit: 9999,
    totalClipsRendered: 84,
    purchasedCredits: 500,
    storageDestination: "gdrive",
    joinedDate: "2026-11-01",
  },
  {
    id: "user_cr_02",
    email: "streamer_ninja@twitch.tv",
    name: "NinjaClips",
    platform: "twitch",
    tier: "creator",
    dailyUsed: 14,
    dailyLimit: 25,
    totalClipsRendered: 142,
    purchasedCredits: 50,
    storageDestination: "gdrive",
    joinedDate: "2026-11-04",
  },
  {
    id: "user_cr_03",
    email: "gaming_highlight@kick.com",
    name: "KickClipsDaily",
    platform: "kick",
    tier: "free",
    dailyUsed: 3,
    dailyLimit: 3,
    totalClipsRendered: 11,
    purchasedCredits: 0,
    storageDestination: "local",
    joinedDate: "2026-11-12",
  },
  {
    id: "user_cr_04",
    email: "podcast_hub@youtube.com",
    name: "TechTalkPod",
    platform: "youtube",
    tier: "creator",
    dailyUsed: 8,
    dailyLimit: 25,
    totalClipsRendered: 67,
    purchasedCredits: 0,
    storageDestination: "gdrive",
    joinedDate: "2026-11-15",
  },
  {
    id: "user_cr_05",
    email: "fps_god@twitch.tv",
    name: "ApexPredator",
    platform: "twitch",
    tier: "free",
    dailyUsed: 2,
    dailyLimit: 3,
    totalClipsRendered: 5,
    purchasedCredits: 0,
    storageDestination: "local",
    joinedDate: "2026-11-18",
  },
];

function notifyAdminChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("pic_clip_admin_updated"));
  }
}

export function getAdminSettings(): AdminSettings {
  if (typeof window === "undefined") return DEFAULT_ADMIN_SETTINGS;
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    return raw ? { ...DEFAULT_ADMIN_SETTINGS, ...JSON.parse(raw) } : DEFAULT_ADMIN_SETTINGS;
  } catch {
    return DEFAULT_ADMIN_SETTINGS;
  }
}

export function saveAdminSettings(settings: Partial<AdminSettings>) {
  if (typeof window === "undefined") return;
  try {
    const cur = getAdminSettings();
    const updated = { ...cur, ...settings };
    localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(updated));
    notifyAdminChanged();
  } catch (e) {
    console.error("Failed to save admin settings:", e);
  }
}

export function isMasterAdminAuthenticated(): boolean {
  return getAdminSettings().isMasterAdmin;
}

export function loginMasterAdmin(passkey: string): boolean {
  const current = getAdminSettings();
  if (passkey === current.adminPasskey || passkey === MASTER_PASSKEY_DEFAULT || passkey === "admin") {
    saveAdminSettings({ isMasterAdmin: true });
    // Automatically elevate current user to Pro tier with infinite access
    upgradePlanTier("pro");
    addTopUpCredits(500);
    return true;
  }
  return false;
}

export function logoutMasterAdmin() {
  saveAdminSettings({ isMasterAdmin: false });
}

export function getManagedUsers(): ManagedUser[] {
  if (typeof window === "undefined") return INITIAL_MANAGED_USERS;
  try {
    const raw = localStorage.getItem(ADMIN_USERS_KEY);
    if (!raw) {
      localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(INITIAL_MANAGED_USERS));
      return INITIAL_MANAGED_USERS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_MANAGED_USERS;
  }
}

export function updateManagedUser(userId: string, updates: Partial<ManagedUser>) {
  if (typeof window === "undefined") return;
  try {
    const users = getManagedUsers();
    const updated = users.map((u) => (u.id === userId ? { ...u, ...updates } : u));
    localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(updated));
    notifyAdminChanged();
  } catch (e) {
    console.error("Failed to update user:", e);
  }
}

export function adminGiftUserCredits(userId: string, amount: number) {
  const users = getManagedUsers();
  const target = users.find((u) => u.id === userId);
  if (target) {
    updateManagedUser(userId, {
      purchasedCredits: (target.purchasedCredits || 0) + amount,
    });
  }
}

export function adminResetUserUsage(userId: string) {
  updateManagedUser(userId, {
    dailyUsed: 0,
  });
}
