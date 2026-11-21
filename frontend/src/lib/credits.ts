"use client";

import { getCachedPublicConfig } from "./platformConfig";

export type PlanTier = "free" | "creator" | "pro";

export interface UserCreditState {
  tier: PlanTier;
  dailyGenerationsLimit: number;
  dailyGenerationsUsed: number;
  monthlyGenerationsLimit: number;
  monthlyGenerationsUsed: number;
  lastResetDate: string; // YYYY-MM-DD
  purchasedCredits: number; // Extra top-up credits that never expire
}

const CREDITS_STORAGE_KEY = "pic_clip_user_credits_v1";

const PLAN_CONFIGS: Record<
  PlanTier,
  {
    name: string;
    price: string;
    dailyLimit: number;
    monthlyLimit: number;
    maxResolution: string;
    maxFps: number;
    watermark: boolean;
    localStorageOnly: boolean;
    googleDriveSync?: boolean;
  }
> = {
  free: {
    name: "Free Starter",
    price: "$0 / mo",
    dailyLimit: 3,
    monthlyLimit: 15,
    maxResolution: "720p",
    maxFps: 30,
    watermark: true,
    localStorageOnly: true,
  },
  creator: {
    name: "Monthly Pro Pass",
    price: "$10.99 / mo",
    dailyLimit: 9999,
    monthlyLimit: 99999,
    maxResolution: "1080p",
    maxFps: 60,
    watermark: false,
    localStorageOnly: true,
  },
  pro: {
    name: "Annual Pro Pass",
    price: "$88.00 / yr",
    dailyLimit: 9999,
    monthlyLimit: 99999,
    maxResolution: "4K",
    maxFps: 60,
    watermark: false,
    localStorageOnly: true,
  },
};

function getTodayString(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function notifyCreditsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("pic_clip_credits_updated"));
  }
}

export function getUserCredits(): UserCreditState {
  if (typeof window === "undefined") {
    return {
      tier: "free",
      dailyGenerationsLimit: 3,
      dailyGenerationsUsed: 0,
      monthlyGenerationsLimit: 15,
      monthlyGenerationsUsed: 0,
      lastResetDate: getTodayString(),
      purchasedCredits: 0,
    };
  }

  try {
    const raw = localStorage.getItem(CREDITS_STORAGE_KEY);
    const today = getTodayString();

    let state: UserCreditState;
    if (raw) {
      state = JSON.parse(raw);
    } else {
      state = {
        tier: "free",
        dailyGenerationsLimit: 3,
        dailyGenerationsUsed: 0,
        monthlyGenerationsLimit: 15,
        monthlyGenerationsUsed: 0,
        lastResetDate: today,
        purchasedCredits: 0,
      };
    }

    // Auto-reset daily quota if day has passed
    if (state.lastResetDate !== today) {
      state.dailyGenerationsUsed = 0;
      state.lastResetDate = today;

      // Check month rollover
      const prevMonth = state.lastResetDate?.substring(0, 7);
      const curMonth = today.substring(0, 7);
      if (prevMonth !== curMonth) {
        state.monthlyGenerationsUsed = 0;
      }

      localStorage.setItem(CREDITS_STORAGE_KEY, JSON.stringify(state));
    }

    // Ensure limits match current tier with dynamic master server overrides
    const config = PLAN_CONFIGS[state.tier] || PLAN_CONFIGS.free;
    const dynamicCfg = getCachedPublicConfig();
    if (state.tier === "free" && dynamicCfg?.quotas?.daily_free_generations) {
      state.dailyGenerationsLimit = dynamicCfg.quotas.daily_free_generations;
    } else {
      state.dailyGenerationsLimit = config.dailyLimit;
    }

    if (state.tier === "free" && dynamicCfg?.quotas?.monthly_cap) {
      state.monthlyGenerationsLimit = dynamicCfg.quotas.monthly_cap;
    } else {
      state.monthlyGenerationsLimit = config.monthlyLimit;
    }

    return state;
  } catch (e) {
    console.warn("Failed to load credits:", e);
    return {
      tier: "free",
      dailyGenerationsLimit: 3,
      dailyGenerationsUsed: 0,
      monthlyGenerationsLimit: 15,
      monthlyGenerationsUsed: 0,
      lastResetDate: getTodayString(),
      purchasedCredits: 0,
    };
  }
}

export function getRemainingDailyGenerations(): number {
  const c = getUserCredits();
  if (c.tier === "pro") return 9999;
  const standardRemaining = Math.max(0, c.dailyGenerationsLimit - c.dailyGenerationsUsed);
  return standardRemaining + c.purchasedCredits;
}

export function canGenerateVideo(): { allowed: boolean; reason?: string } {
  const c = getUserCredits();
  if (c.tier === "pro") return { allowed: true };

  // Check if user has purchased top-up credits
  if (c.purchasedCredits > 0) {
    return { allowed: true };
  }

  // Check daily free quota (3/day)
  if (c.dailyGenerationsUsed >= c.dailyGenerationsLimit) {
    return {
      allowed: false,
      reason: `Daily free limit reached (${c.dailyGenerationsLimit}/${c.dailyGenerationsLimit}). Upgrade your plan or add a generation pack to continue immediately.`,
    };
  }

  // Check monthly limit (15/mo)
  if (c.monthlyGenerationsUsed >= c.monthlyGenerationsLimit) {
    return {
      allowed: false,
      reason: `Monthly free allowance (${c.monthlyGenerationsLimit} clips) reached. Upgrade to Creator Pass for 300 clips/mo.`,
    };
  }

  return { allowed: true };
}

export function consumeGenerationCredit(): boolean {
  if (typeof window === "undefined") return true;
  const c = getUserCredits();

  // If pro, no consumption needed
  if (c.tier === "pro") {
    c.dailyGenerationsUsed += 1;
    c.monthlyGenerationsUsed += 1;
    localStorage.setItem(CREDITS_STORAGE_KEY, JSON.stringify(c));
    notifyCreditsChanged();
    return true;
  }

  // Consume from purchased top-up credits first if standard limit reached
  if (c.dailyGenerationsUsed >= c.dailyGenerationsLimit && c.purchasedCredits > 0) {
    c.purchasedCredits -= 1;
    c.monthlyGenerationsUsed += 1;
    localStorage.setItem(CREDITS_STORAGE_KEY, JSON.stringify(c));
    notifyCreditsChanged();
    return true;
  }

  if (c.dailyGenerationsUsed < c.dailyGenerationsLimit) {
    c.dailyGenerationsUsed += 1;
    c.monthlyGenerationsUsed += 1;
    localStorage.setItem(CREDITS_STORAGE_KEY, JSON.stringify(c));
    notifyCreditsChanged();
    return true;
  }

  return false;
}

export function upgradePlanTier(tier: PlanTier) {
  if (typeof window === "undefined") return;
  const c = getUserCredits();
  c.tier = tier;
  const config = PLAN_CONFIGS[tier];
  c.dailyGenerationsLimit = config.dailyLimit;
  c.monthlyGenerationsLimit = config.monthlyLimit;
  localStorage.setItem(CREDITS_STORAGE_KEY, JSON.stringify(c));
  notifyCreditsChanged();
}

export function addTopUpCredits(amount: number) {
  if (typeof window === "undefined") return;
  const c = getUserCredits();
  c.purchasedCredits += amount;
  localStorage.setItem(CREDITS_STORAGE_KEY, JSON.stringify(c));
  notifyCreditsChanged();
}

export function getTimeUntilDailyReset(): string {
  const now = new Date();
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  const diffMs = tomorrow.getTime() - now.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m`;
}

export { PLAN_CONFIGS };
