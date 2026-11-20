"use client";

export type SupportedCurrency = "INR" | "USD" | "EUR" | "GBP" | "CAD" | "AUD";

export interface RegionDetectionResult {
  countryCode: string;
  countryName: string;
  currency: SupportedCurrency;
  symbol: string;
  isIndia: boolean;
  flag: string;
  conversionRateFromUsd: number; // For non-India regions converting from Dollar
  paymentBadge: string;
}

const STORAGE_KEY = "pic_clip_user_currency_override_v1";

// Live fallback conversion rates from USD
const DEFAULT_CONVERSION_RATES: Record<SupportedCurrency, number> = {
  USD: 1.0,
  INR: 86.5,  // Note: India uses special admin-specified prices, rate is fallback
  EUR: 0.93,
  GBP: 0.79,
  CAD: 1.40,
  AUD: 1.54,
};

const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "CA$",
  AUD: "A$",
};

const CURRENCY_FLAGS: Record<SupportedCurrency, string> = {
  INR: "🇮🇳",
  USD: "🇺🇸",
  EUR: "🇪🇺",
  GBP: "🇬🇧",
  CAD: "🇨🇦",
  AUD: "🇦🇺",
};

/**
 * Automatically detects the user's geographical region from browser locale and timezone.
 * India is special: Always receives the specified domestic ₹ INR pricing.
 * Other regions are converted from the base USD ($) rate.
 */
export function detectUserRegion(): RegionDetectionResult {
  if (typeof window === "undefined") {
    return {
      countryCode: "IN",
      countryName: "India",
      currency: "INR",
      symbol: "₹",
      isIndia: true,
      flag: "🇮🇳",
      conversionRateFromUsd: 1.0,
      paymentBadge: "UPI (GPay/PhonePe) & RuPay",
    };
  }

  // Check explicit user manual override
  const stored = localStorage.getItem(STORAGE_KEY) as SupportedCurrency | null;
  if (stored && CURRENCY_SYMBOLS[stored]) {
    return buildRegionResult(stored, "User Selected");
  }

  try {
    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || "").toLowerCase();
    const languages = (navigator.languages || [navigator.language || ""]).map((l) => l.toLowerCase());

    // 1. Check for India (SPECIAL)
    const isIndiaTz = tz === "asia/kolkata" || tz === "asia/calcutta" || tz.includes("kolkata") || tz.includes("calcutta");
    const isIndiaLang = languages.some(
      (l) => l.endsWith("-in") || l === "hi" || l === "te" || l === "ta" || l === "mr" || l === "bn" || l === "gu" || l === "kn"
    );

    if (isIndiaTz || isIndiaLang) {
      return {
        countryCode: "IN",
        countryName: "India",
        currency: "INR",
        symbol: "₹",
        isIndia: true,
        flag: "🇮🇳",
        conversionRateFromUsd: 1.0,
        paymentBadge: "UPI (GPay / PhonePe / Paytm) & RuPay Cards",
      };
    }

    // 2. Check for United Kingdom
    if (tz.includes("london") || languages.some((l) => l.endsWith("-gb"))) {
      return buildRegionResult("GBP", "United Kingdom", "GB");
    }

    // 3. Check for European Union
    if (tz.startsWith("europe/")) {
      return buildRegionResult("EUR", "Europe", "EU");
    }

    // 4. Check for Canada
    if (tz.includes("toronto") || tz.includes("vancouver") || tz.includes("montreal") || languages.some((l) => l.endsWith("-ca"))) {
      return buildRegionResult("CAD", "Canada", "CA");
    }

    // 5. Check for Australia
    if (tz.startsWith("australia/") || languages.some((l) => l.endsWith("-au"))) {
      return buildRegionResult("AUD", "Australia", "AU");
    }

    // Default to United States / Global ($ USD)
    return buildRegionResult("USD", "United States (Global)", "US");
  } catch (e) {
    // Fallback default
    return buildRegionResult("USD", "Global", "US");
  }
}

function buildRegionResult(currency: SupportedCurrency, countryName: string, countryCode = "US"): RegionDetectionResult {
  const isIndia = currency === "INR";
  return {
    countryCode,
    countryName,
    currency,
    symbol: CURRENCY_SYMBOLS[currency] || "$",
    isIndia,
    flag: CURRENCY_FLAGS[currency] || "🌐",
    conversionRateFromUsd: DEFAULT_CONVERSION_RATES[currency] || 1.0,
    paymentBadge: isIndia
      ? "UPI (GPay/PhonePe) & RuPay"
      : "Cards, Apple Pay, PayPal (Lemon Squeezy)",
  };
}

export function setUserCurrencyOverride(curr: SupportedCurrency) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, curr);
    window.dispatchEvent(new CustomEvent("pic_clip_currency_changed", { detail: curr }));
  }
}

export function clearUserCurrencyOverride() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("pic_clip_currency_changed", { detail: null }));
  }
}

/**
 * Calculates the final localized display price.
 * - India: Uses the explicit specified INR price from Master Admin (e.g. ₹799)
 * - Overseas: Takes the base USD price and converts it to EUR/GBP/CAD/AUD or keeps USD
 */
export function calculateLocalizedPrice(
  baseUsd: number,
  specifiedInr: number,
  currency: SupportedCurrency,
  billingCycle: "monthly" | "yearly",
  discountPercent = 0
): {
  amount: number;
  formatted: string;
  originalAmount?: number;
  originalFormatted?: string;
  symbol: string;
} {
  const symbol = CURRENCY_SYMBOLS[currency] || "$";

  // Base price selection
  let rawPrice = 0;
  if (currency === "INR") {
    // India Special: Use explicit specified admin price
    rawPrice = specifiedInr;
  } else if (currency === "USD") {
    rawPrice = baseUsd;
  } else {
    // Other regions: Converted from Dollar
    const rate = DEFAULT_CONVERSION_RATES[currency] || 1.0;
    rawPrice = parseFloat((baseUsd * rate).toFixed(2));
  }

  // Yearly discount (-33%)
  let finalPrice = rawPrice;
  if (billingCycle === "yearly" && finalPrice > 0) {
    finalPrice = currency === "INR" ? Math.round(finalPrice * 0.67) : parseFloat((finalPrice * 0.67).toFixed(2));
  }

  // Original before promo
  const originalAmount = finalPrice;

  // Promo code discount
  if (discountPercent > 0 && finalPrice > 0) {
    const disc = (finalPrice * discountPercent) / 100;
    finalPrice = currency === "INR" ? Math.round(finalPrice - disc) : parseFloat((finalPrice - disc).toFixed(2));
  }

  const formatAmount = (val: number) => {
    if (val === 0) return "Free";
    if (currency === "INR") return `${symbol}${val.toLocaleString("en-IN")}`;
    return `${symbol}${val.toFixed(2)}`;
  };

  return {
    amount: finalPrice,
    formatted: formatAmount(finalPrice),
    originalAmount: discountPercent > 0 ? originalAmount : undefined,
    originalFormatted: discountPercent > 0 ? formatAmount(originalAmount) : undefined,
    symbol,
  };
}
