"use client";

import { useState, useEffect } from "react";

export interface PricingPlan {
  name: string;
  price_usd: number;
  price_inr: number;
  daily_limit?: number;
  monthly_limit?: number;
  credits?: number;
  features?: string[];
}

export interface PublicPlatformConfig {
  pricing: {
    starter: PricingPlan;
    creator: PricingPlan;
    pro: PricingPlan;
    topup_50: PricingPlan;
  };
  quotas: {
    daily_free_generations: number;
    monthly_cap: number;
    watermark_free_tier: boolean;
  };
  announcement: {
    enabled: boolean;
    badge?: string;
    message: string;
    link?: string;
    link_text?: string;
  };
  whitelisted_creators: string[];
  maintenance_mode: boolean;
  currency_rates: {
    usd_to_inr: number;
  };
  last_updated?: number;
}

export const DEFAULT_CONFIG: PublicPlatformConfig = {
  pricing: {
    starter: {
      name: "Free Starter",
      price_usd: 0,
      price_inr: 0,
      daily_limit: 3,
      monthly_limit: 15,
      features: ["3 Clips / Day", "720p 30 FPS Export", "Local Disk & Google Drive", "Watermarked"],
    },
    creator: {
      name: "Creator Pass",
      price_usd: 9.99,
      price_inr: 799,
      daily_limit: 25,
      monthly_limit: 300,
      features: ["25 Clips / Day", "1080p 60 FPS Lossless", "Google Drive Auto-Sync", "No Watermark", "Priority AI Queue"],
    },
    pro: {
      name: "Pro Streamer Unlimited",
      price_usd: 19.99,
      price_inr: 1499,
      daily_limit: 9999,
      monthly_limit: 99999,
      features: ["Unlimited Clips / Day", "4K Cinema 60 FPS Master", "Zero Watermark", "VIP Priority GPU Lane", "TikTok & YouTube Webhook"],
    },
    topup_50: {
      name: "50 Clip Credit Pack",
      price_usd: 4.99,
      price_inr: 399,
      credits: 50,
      features: ["50 Extra Clips", "Never Expires", "Stackable with Any Plan"],
    },
  },
  quotas: {
    daily_free_generations: 3,
    monthly_cap: 15,
    watermark_free_tier: true,
  },
  announcement: {
    enabled: true,
    badge: "LAUNCH OFFER",
    message: "🔥 Special Launch Deal: Use code INDIA50 or CREATOR50 to get 50% OFF your first month!",
    link: "/pricing",
    link_text: "View Plans",
  },
  whitelisted_creators: ["admin@picclip.ai"],
  maintenance_mode: false,
  currency_rates: {
    usd_to_inr: 86.5,
  },
  last_updated: Date.now(),
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

let cachedConfig: PublicPlatformConfig = DEFAULT_CONFIG;

export async function fetchPublicPlatformConfig(): Promise<PublicPlatformConfig> {
  try {
    const res = await fetch(`${API_BASE}/api/public/config`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      cachedConfig = {
        ...DEFAULT_CONFIG,
        ...data,
        pricing: {
          starter: { ...DEFAULT_CONFIG.pricing.starter, ...(data.pricing?.starter || {}) },
          creator: { ...DEFAULT_CONFIG.pricing.creator, ...(data.pricing?.creator || {}) },
          pro: { ...DEFAULT_CONFIG.pricing.pro, ...(data.pricing?.pro || {}) },
          topup_50: { ...DEFAULT_CONFIG.pricing.topup_50, ...(data.pricing?.topup_50 || {}) },
        },
        quotas: { ...DEFAULT_CONFIG.quotas, ...(data.quotas || {}) },
        announcement: { ...DEFAULT_CONFIG.announcement, ...(data.announcement || {}) },
      };
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("pic_clip_config_updated", { detail: cachedConfig }));
      }
      return cachedConfig;
    }
  } catch (e) {
    // Fallback to cache or defaults
  }
  return cachedConfig;
}

export function getCachedPublicConfig(): PublicPlatformConfig {
  return cachedConfig;
}

/**
 * React hook that subscribes to live platform configuration updates from the master admin.
 * Polling interval ensures when master admin updates prices on port 3001, live site updates instantly.
 */
export function usePlatformConfig() {
  const [config, setConfig] = useState<PublicPlatformConfig>(cachedConfig);

  useEffect(() => {
    // Initial fetch
    fetchPublicPlatformConfig().then((cfg) => setConfig({ ...cfg }));

    // Listen for custom update events
    const handleUpdate = (e: any) => {
      if (e.detail) setConfig({ ...e.detail });
    };
    window.addEventListener("pic_clip_config_updated", handleUpdate);

    // Live background polling every 2.5 seconds to stay perfectly synced with master admin changes
    const pollTimer = setInterval(() => {
      fetchPublicPlatformConfig().then((cfg) => setConfig({ ...cfg }));
    }, 2500);

    return () => {
      window.removeEventListener("pic_clip_config_updated", handleUpdate);
      clearInterval(pollTimer);
    };
  }, []);

  return config;
}

export async function verifyPromoCode(code: string): Promise<{
  valid: boolean;
  code: string;
  discount_percent: number;
  message: string;
}> {
  try {
    const res = await fetch(`${API_BASE}/api/promos/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim().toUpperCase() }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.error("Promo verification failed", e);
  }
  return {
    valid: false,
    code,
    discount_percent: 0,
    message: "Network error validating code.",
  };
}
