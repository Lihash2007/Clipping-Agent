"use client";

import { setUserCurrencyOverride, SupportedCurrency } from "./geoCurrency";
import { upgradePlanTier, addTopUpCredits, PlanTier } from "./credits";

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  country: string; // "IN", "US", "GB", etc.
  platform: "twitch" | "youtube" | "kick" | "local" | string;
  tier: PlanTier;
  daily_used: number;
  purchased_credits: number;
  is_whitelisted: boolean;
  avatar_url?: string;
  token?: string;
}

const AUTH_STORAGE_KEY = "pic_clip_auth_user_v1";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

let currentUserState: UserAccount | null = null;

function notifyAuthChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pic_clip_auth_changed", { detail: currentUserState }));
  }
}

export function getCurrentUser(): UserAccount | null {
  if (typeof window === "undefined") return null;
  if (currentUserState) return currentUserState;

  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) {
      currentUserState = JSON.parse(raw);
      return currentUserState;
    }
  } catch (e) {
    console.warn("Could not read auth state", e);
  }
  return null;
}

export async function loginWithEmail(email: string, password: string): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.detail || "Login failed" };
    }

    const user: UserAccount = data.user;
    currentUserState = user;
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));

    // Sync region & currency
    if (user.country === "IN") {
      setUserCurrencyOverride("INR");
    } else {
      setUserCurrencyOverride("USD");
    }

    // Sync tier & credits to client
    upgradePlanTier(user.tier);
    if (user.purchased_credits > 0) {
      addTopUpCredits(user.purchased_credits);
    }

    notifyAuthChanged();
    return { success: true, user };
  } catch (e: any) {
    return { success: false, error: e.message || "Network error logging in" };
  }
}

export async function signupWithEmail(
  name: string,
  email: string,
  password: string,
  country = "IN",
  platform = "twitch"
): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        password,
        country: country.toUpperCase(),
        platform,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.detail || "Signup failed" };
    }

    const user: UserAccount = data.user;
    currentUserState = user;
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));

    if (user.country === "IN") {
      setUserCurrencyOverride("INR");
    } else {
      setUserCurrencyOverride("USD");
    }

    upgradePlanTier(user.tier);
    notifyAuthChanged();
    return { success: true, user };
  } catch (e: any) {
    return { success: false, error: e.message || "Network error signing up" };
  }
}

export async function loginWithGoogleMock(email = "creator.streamer@gmail.com", name = "Streamer VIP"): Promise<UserAccount> {
  const user: UserAccount = {
    id: `usr_g_${Date.now()}`,
    name,
    email,
    country: "IN",
    platform: "youtube",
    tier: "creator",
    daily_used: 1,
    purchased_credits: 50,
    is_whitelisted: false,
    avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${name}`,
  };
  currentUserState = user;
  if (typeof window !== "undefined") {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    setUserCurrencyOverride("INR");
  }
  upgradePlanTier(user.tier);
  notifyAuthChanged();
  return user;
}

export async function loginWithTwitchMock(channel = "NinjaClips"): Promise<UserAccount> {
  const user: UserAccount = {
    id: `usr_t_${Date.now()}`,
    name: channel,
    email: `${channel.toLowerCase()}@twitch.tv`,
    country: "US",
    platform: "twitch",
    tier: "free",
    daily_used: 0,
    purchased_credits: 0,
    is_whitelisted: false,
    avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${channel}`,
  };
  currentUserState = user;
  if (typeof window !== "undefined") {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  }
  notifyAuthChanged();
  return user;
}

export function logoutUser() {
  currentUserState = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
  notifyAuthChanged();
}

/**
 * Redeem Gumroad / AppSumo / UPI Voucher License Key
 */
export async function claimLicenseVoucher(code: string): Promise<{
  success: boolean;
  message: string;
  tier?: PlanTier;
  creditsBonus?: number;
}> {
  const user = getCurrentUser();
  try {
    const res = await fetch(`${API_BASE}/api/auth/redeem-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: code.trim().toUpperCase(),
        email: user?.email,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, message: data.detail || "Voucher redemption failed" };
    }

    if (data.tier) {
      upgradePlanTier(data.tier);
      if (user) {
        user.tier = data.tier;
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      }
    }
    if (data.credits_bonus > 0) {
      addTopUpCredits(data.credits_bonus);
      if (user) {
        user.purchased_credits = (user.purchased_credits || 0) + data.credits_bonus;
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      }
    }

    notifyAuthChanged();
    return {
      success: true,
      message: data.message,
      tier: data.tier,
      creditsBonus: data.credits_bonus,
    };
  } catch (e: any) {
    return { success: false, message: e.message || "Network error redeeming voucher" };
  }
}
