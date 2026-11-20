"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Check,
  Zap,
  X,
  CreditCard,
  Shield,
  ArrowRight,
  Crown,
  Tag,
  CheckCircle2,
  AlertCircle,
  Globe,
  MapPin
} from "lucide-react";
import {
  getUserCredits,
  upgradePlanTier,
  addTopUpCredits,
  PlanTier,
  PLAN_CONFIGS
} from "@/lib/credits";
import { addNotification } from "@/lib/notifications";
import { usePlatformConfig, verifyPromoCode } from "@/lib/platformConfig";
import {
  detectUserRegion,
  calculateLocalizedPrice,
  setUserCurrencyOverride,
  SupportedCurrency,
  RegionDetectionResult
} from "@/lib/geoCurrency";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: string;
}

export function UpgradeModal({ isOpen, onClose, reason }: UpgradeModalProps) {
  if (!isOpen) return null;

  const config = usePlatformConfig();
  const credits = getUserCredits();
  const currentTier = credits.tier;

  const [regionInfo, setRegionInfo] = useState<RegionDetectionResult>(detectUserRegion());
  const [currency, setCurrency] = useState<SupportedCurrency>(regionInfo.currency);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [isProcessing, setIsProcessing] = useState(false);

  // Promo code state
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discountPercent: number;
    message: string;
  } | null>(null);
  const [promoError, setPromoError] = useState("");
  const [isVerifyingPromo, setIsVerifyingPromo] = useState(false);

  // Sync region on mount and on currency changes
  useEffect(() => {
    const reg = detectUserRegion();
    setRegionInfo(reg);
    setCurrency(reg.currency);

    const handleCurrencyChange = (e: any) => {
      const updated = detectUserRegion();
      setRegionInfo(updated);
      setCurrency(updated.currency);
    };
    window.addEventListener("pic_clip_currency_changed", handleCurrencyChange);
    return () => window.removeEventListener("pic_clip_currency_changed", handleCurrencyChange);
  }, []);

  const handleCurrencySelect = (curr: SupportedCurrency) => {
    setCurrency(curr);
    setUserCurrencyOverride(curr);
  };

  // Dynamic pricing values from Master Admin
  const starterCfg = config.pricing?.starter;
  const creatorCfg = config.pricing?.creator;
  const proCfg = config.pricing?.pro;
  const topupCfg = config.pricing?.topup_50;

  // Localized calculated prices
  const discPercent = appliedPromo?.discountPercent ?? 0;

  const creatorCalc = calculateLocalizedPrice(
    creatorCfg?.price_usd ?? 9.99,
    creatorCfg?.price_inr ?? 799,
    currency,
    billingCycle,
    discPercent
  );

  const proCalc = calculateLocalizedPrice(
    proCfg?.price_usd ?? 19.99,
    proCfg?.price_inr ?? 1499,
    currency,
    billingCycle,
    discPercent
  );

  const topupCalc = calculateLocalizedPrice(
    topupCfg?.price_usd ?? 4.99,
    topupCfg?.price_inr ?? 399,
    currency,
    "monthly",
    discPercent
  );

  const handleApplyPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoInput.trim()) return;
    setIsVerifyingPromo(true);
    setPromoError("");

    const res = await verifyPromoCode(promoInput.trim());
    setIsVerifyingPromo(false);

    if (res.valid) {
      setAppliedPromo({
        code: res.code,
        discountPercent: res.discount_percent,
        message: res.message,
      });
      setPromoError("");
    } else {
      setPromoError(res.message || "Invalid promo code.");
      setAppliedPromo(null);
    }
  };

  const handleSelectTier = (tier: PlanTier) => {
    if (tier === currentTier) return;
    setIsProcessing(true);
    setTimeout(() => {
      upgradePlanTier(tier);
      setIsProcessing(false);
      addNotification({
        type: "system",
        title: `Plan Upgraded to ${PLAN_CONFIGS[tier].name}!`,
        message: `Your account now has ${PLAN_CONFIGS[tier].dailyLimit === 9999 ? "unlimited" : PLAN_CONFIGS[tier].dailyLimit} video generations per day.`,
        actionUrl: "/settings",
        actionLabel: "View Subscription",
      });
      onClose();
    }, 500);
  };

  const handleBuyPack = (amount: number) => {
    setIsProcessing(true);
    setTimeout(() => {
      addTopUpCredits(amount);
      setIsProcessing(false);
      addNotification({
        type: "system",
        title: `Added +${amount} Top-up Credits!`,
        message: `Your account received +${amount} instant generations that never expire.`,
        actionUrl: "/editor",
        actionLabel: "Create Clip",
      });
      onClose();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-4xl rounded-3xl border border-purple-500/30 bg-[#0d0f17] text-white p-6 sm:p-8 shadow-2xl relative my-8 space-y-6">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center space-y-2 max-w-xl mx-auto pt-2">
          
          {/* Automatic Region & Geo Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-bold bg-purple-500/10 border border-purple-500/30 text-purple-300">
            <MapPin className="w-3.5 h-3.5 text-purple-400" />
            <span>
              {regionInfo.isIndia
                ? "🇮🇳 AUTO-DETECTED: INDIA (SPECIAL DOMESTIC PRICING)"
                : `🌐 AUTO-DETECTED: ${regionInfo.countryName.toUpperCase()} (CONVERTED FROM USD)`}
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
            Supercharge Your Stream Clips
          </h2>

          <p className="text-xs text-gray-400">
            {reason || "Autonomous AI stream clipper with local processing and personal Google Drive sync for zero cloud bills."}
          </p>

          {/* Currency Switcher & Billing Period */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            
            {/* Automatic Multi-Currency Buttons */}
            <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-white/5 border border-white/10">
              <button
                type="button"
                onClick={() => handleCurrencySelect("INR")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  currency === "INR"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs"
                    : "text-gray-400 hover:text-white"
                }`}
                title="Special pricing for Indian creators (UPI / Cards)"
              >
                <span>🇮🇳 ₹ INR</span>
                <span className="text-[10px] font-mono text-amber-400 font-extrabold">(Special)</span>
              </button>

              <button
                type="button"
                onClick={() => handleCurrencySelect("USD")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  currency === "USD"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <span>🇺🇸 $ USD</span>
              </button>

              <button
                type="button"
                onClick={() => handleCurrencySelect("EUR")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  currency === "EUR"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <span>🇪🇺 € EUR</span>
              </button>

              <button
                type="button"
                onClick={() => handleCurrencySelect("GBP")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  currency === "GBP"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <span>🇬🇧 £ GBP</span>
              </button>
            </div>

            {/* Monthly vs Yearly */}
            <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-white/5 border border-white/10">
              <button
                type="button"
                onClick={() => setBillingCycle("monthly")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  billingCycle === "monthly" ? "bg-purple-600 text-white shadow-xs" : "text-gray-400 hover:text-white"
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("yearly")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  billingCycle === "yearly" ? "bg-purple-600 text-white shadow-xs" : "text-gray-400 hover:text-white"
                }`}
              >
                <span>Yearly</span>
                <span className="px-1.5 py-0.2 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-mono">
                  -20%
                </span>
              </button>
            </div>

          </div>
        </div>

        {/* Promo Code Input Bar */}
        <div className="max-w-md mx-auto">
          <form onSubmit={handleApplyPromo} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Tag className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Have a promo code? (e.g. INDIA50)"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={isVerifyingPromo || !promoInput.trim()}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              {isVerifyingPromo ? "Checking..." : "Apply Code"}
            </button>
          </form>

          {appliedPromo && (
            <div className="mt-2 flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span><strong>{appliedPromo.code}</strong> applied: {appliedPromo.discountPercent}% OFF unlocked!</span>
            </div>
          )}

          {promoError && (
            <div className="mt-2 flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-xl">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{promoError}</span>
            </div>
          )}
        </div>

        {/* 3 Pricing Packages Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">

          {/* Plan 1: Free Starter */}
          <div className={`rounded-3xl border p-6 flex flex-col justify-between space-y-6 transition-all ${
            currentTier === "free"
              ? "bg-[#131622] border-purple-500/60 shadow-lg shadow-purple-950/20"
              : "bg-[#11131b] border-white/10 hover:border-white/20"
          }`}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  {starterCfg?.name || "Free Starter"}
                </span>
                {currentTier === "free" && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                    Current Plan
                  </span>
                )}
              </div>

              <div>
                <span className="text-3xl font-black">Free</span>
                <span className="text-xs text-gray-400 font-mono"> / forever</span>
              </div>

              <p className="text-xs text-gray-400">
                Casual creators testing autonomous clipping with BYOS local disk storage.
              </p>

              <div className="space-y-2.5 pt-2 text-xs border-t border-white/10">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span><strong>{config.quotas?.daily_free_generations ?? 3} video clips / day</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Max {config.quotas?.monthly_cap ?? 15} clips / month</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>720p HD @ 30 FPS export</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Local Disk & Google Drive (0 server storage)</span>
                </div>
                <div className="flex items-center gap-2 text-gray-400">
                  <span className="text-xs font-bold text-gray-400">•</span>
                  <span>Subtle PIC-CLIP watermark</span>
                </div>
              </div>
            </div>

            <button
              disabled={currentTier === "free"}
              onClick={() => handleSelectTier("free")}
              className={`w-full py-3 rounded-2xl text-xs font-extrabold transition-all cursor-pointer ${
                currentTier === "free"
                  ? "bg-white/10 text-gray-400 cursor-default"
                  : "bg-white/10 hover:bg-white/20 text-white"
              }`}
            >
              {currentTier === "free" ? "Active Free Plan" : "Downgrade to Free"}
            </button>
          </div>

          {/* Plan 2: Creator Pass (Highlighted) */}
          <div className="rounded-3xl border-2 border-purple-500 bg-gradient-to-b from-[#1c162e] to-[#12131f] p-6 flex flex-col justify-between space-y-6 shadow-2xl shadow-purple-900/30 relative">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[10px] font-black uppercase tracking-wider shadow-md">
              Most Popular
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-300">
                  {creatorCfg?.name || "Creator Pass"}
                </span>
                {currentTier === "creator" && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                    Current Plan
                  </span>
                )}
              </div>

              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black">{creatorCalc.formatted}</span>
                  {creatorCalc.originalFormatted && (
                    <span className="text-sm line-through text-gray-500">
                      {creatorCalc.originalFormatted}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400 font-mono"> / month</span>
              </div>

              <p className="text-xs text-purple-200/80">
                For active Twitch, Kick, and YouTube creators clipping daily broadcasts.
              </p>

              <div className="space-y-2.5 pt-2 text-xs border-t border-purple-500/20">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span><strong>{creatorCfg?.daily_limit ?? 25} video generations / day</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span><strong>{creatorCfg?.monthly_limit ?? 300} clips / month</strong> quota</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-purple-300 flex-shrink-0" />
                  <span><strong>1080p 60 FPS Lossless (CRF 17)</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-purple-300 flex-shrink-0" />
                  <span><strong>No Watermark</strong> + Custom Branding</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-purple-300 flex-shrink-0" />
                  <span>Auto-export to Personal Google Drive</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-purple-300 flex-shrink-0" />
                  <span>Priority AI Render Queue</span>
                </div>
              </div>
            </div>

            <button
              disabled={currentTier === "creator" || isProcessing}
              onClick={() => handleSelectTier("creator")}
              className={`w-full py-3.5 rounded-2xl text-xs font-black shadow-lg transition-all cursor-pointer ${
                currentTier === "creator"
                  ? "bg-white/10 text-gray-400 cursor-default"
                  : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white hover:scale-[1.02]"
              }`}
            >
              {currentTier === "creator" ? "Active Plan" : `Upgrade to Creator (${creatorCalc.formatted})`}
            </button>
          </div>

          {/* Plan 3: Pro Streamer Unlimited */}
          <div className={`rounded-3xl border p-6 flex flex-col justify-between space-y-6 transition-all ${
            currentTier === "pro"
              ? "bg-[#131622] border-cyan-500/60 shadow-lg"
              : "bg-[#11131b] border-white/10 hover:border-white/20"
          }`}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                  <Crown className="w-3.5 h-3.5" />
                  <span>{proCfg?.name || "Pro Streamer"}</span>
                </span>
                {currentTier === "pro" && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                    Current Plan
                  </span>
                )}
              </div>

              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black">{proCalc.formatted}</span>
                  {proCalc.originalFormatted && (
                    <span className="text-sm line-through text-gray-500">
                      {proCalc.originalFormatted}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400 font-mono"> / month</span>
              </div>

              <p className="text-xs text-gray-400">
                Heavy esports streamers & agencies requiring high volume and 4K cinema master exports.
              </p>

              <div className="space-y-2.5 pt-2 text-xs border-t border-white/10">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span><strong>{proCfg?.daily_limit === 9999 ? "Unlimited" : proCfg?.daily_limit} video generations</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span><strong>4K Cinema Master exports</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span>Dedicated GPU Fast Lane</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span>Direct TikTok & Shorts Webhook</span>
                </div>
              </div>
            </div>

            <button
              disabled={currentTier === "pro" || isProcessing}
              onClick={() => handleSelectTier("pro")}
              className={`w-full py-3 rounded-2xl text-xs font-extrabold transition-all cursor-pointer ${
                currentTier === "pro"
                  ? "bg-white/10 text-gray-400 cursor-default"
                  : "bg-cyan-600 hover:bg-cyan-500 text-white"
              }`}
            >
              {currentTier === "pro" ? "Active Plan" : `Upgrade to Pro (${proCalc.formatted})`}
            </button>
          </div>

        </div>

        {/* Top-up Credits Pack */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-extrabold text-white">Need extra clips without monthly commitment?</h4>
              <p className="text-gray-400 text-[11px]">
                Get a +50 Video Generation Pack for {topupCalc.formatted}. Never expires.
              </p>
            </div>
          </div>

          <button
            onClick={() => handleBuyPack(50)}
            className="px-4 py-2 rounded-xl bg-purple-600/40 hover:bg-purple-600 text-purple-200 hover:text-white border border-purple-500/40 font-bold transition-all cursor-pointer whitespace-nowrap"
          >
            Buy +50 Pack ({topupCalc.formatted})
          </button>
        </div>

        {/* Direct Gumroad License Key Activation Pill */}
        <div className="rounded-2xl border border-violet-500/30 bg-violet-950/30 p-3.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-violet-400 shrink-0" />
            <span className="text-gray-300">Bought a Monthly, Annual, or Lifetime Pass on Gumroad?</span>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              window.dispatchEvent(new CustomEvent("open_desktop_license_modal"));
            }}
            className="px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs transition-colors cursor-pointer whitespace-nowrap shadow-sm"
          >
            Activate License Key
          </button>
        </div>

        {/* Dynamic Payment Gateways Footer */}
        <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between text-[11px] text-gray-400 gap-2">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-gray-300">Supported Methods:</span>
            {currency === "INR" ? (
              <span className="text-amber-300 font-bold">
                🇮🇳 UPI (GPay / PhonePe / Paytm / BHIM) • RuPay & Indian Cards (Razorpay)
              </span>
            ) : (
              <span className="text-purple-300 font-bold">
                🌐 Global Credit Cards, Apple Pay, PayPal (Lemon Squeezy MoR) • USDT Crypto
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-gray-400">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>256-Bit SSL Encrypted Checkout</span>
          </div>
        </div>

      </div>
    </div>
  );
}
