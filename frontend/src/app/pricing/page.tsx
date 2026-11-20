"use client";

import React, { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useTheme } from "@/lib/theme";
import { usePlatformConfig, verifyPromoCode } from "@/lib/platformConfig";
import { getUserCredits, upgradePlanTier, addTopUpCredits, PlanTier } from "@/lib/credits";
import { addNotification } from "@/lib/notifications";
import {
  detectUserRegion,
  calculateLocalizedPrice,
  setUserCurrencyOverride,
  SupportedCurrency,
  RegionDetectionResult
} from "@/lib/geoCurrency";
import {
  Sparkles,
  Check,
  Zap,
  Crown,
  Tag,
  Shield,
  HelpCircle,
  HardDrive,
  Cloud,
  CheckCircle2,
  AlertCircle,
  MapPin,
  ArrowRight
} from "lucide-react";

export default function PricingPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

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

  const starterCfg = config.pricing?.starter;
  const creatorCfg = config.pricing?.creator;
  const proCfg = config.pricing?.pro;
  const topupCfg = config.pricing?.topup_50;

  const discPercent = appliedPromo?.discountPercent ?? 0;

  const creatorCalc = calculateLocalizedPrice(
    creatorCfg?.price_usd ?? 10.99,
    creatorCfg?.price_inr ?? 499,
    currency,
    billingCycle,
    discPercent
  );

  const proCalc = calculateLocalizedPrice(
    proCfg?.price_usd ?? 105.0,
    proCfg?.price_inr ?? 4799,
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
    if (tier === "free") {
      upgradePlanTier("free");
      addNotification({
        type: "system",
        title: "Active Free Starter Plan",
        message: "Switched to Free Starter (3 video generations per day).",
      });
      return;
    }

    // Direct user to Gumroad purchase
    const gumroadUrl = "https://gumroad.com/l/picclip";
    if (typeof window !== "undefined") {
      window.open(gumroadUrl, "_blank", "noopener,noreferrer");
      addNotification({
        type: "system",
        title: "Opened Gumroad Checkout in Browser",
        message: "Complete your checkout on Gumroad, then enter your License Key below to activate this PC.",
      });
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("open_desktop_license_modal"));
      }, 200);
    }
  };

  const handleBuyPack = (amount: number) => {
    const gumroadUrl = "https://gumroad.com/l/picclip";
    if (typeof window !== "undefined") {
      window.open(gumroadUrl, "_blank", "noopener,noreferrer");
      addNotification({
        type: "system",
        title: "Opened Gumroad Checkout in Browser",
        message: `Complete your +${amount} clip pack purchase on Gumroad, then paste your License Key to activate.`,
      });
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("open_desktop_license_modal"));
      }, 200);
    }
  };

  return (
    <AppShell headerTitle="Plans & Pricing" headerSubtitle="Transparent creator pricing backed by zero-cost BYOS storage">
      <div className="max-w-6xl mx-auto space-y-12 pb-16">

        {/* HERO SECTION */}
        <div className="text-center space-y-4 pt-4">
          
          {/* Automatic Geo Detection Pill */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-mono font-bold bg-purple-500/10 border border-purple-500/30 text-purple-300">
            <MapPin className="w-3.5 h-3.5 text-purple-400" />
            <span>
              {regionInfo.isIndia
                ? "🇮🇳 AUTO-DETECTED: INDIA (SPECIAL DOMESTIC PRICING)"
                : `🌐 AUTO-DETECTED: ${regionInfo.countryName.toUpperCase()} (CONVERTED FROM USD)`}
            </span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
            Simple, Transparent Creator Plans
          </h1>

          <p className="text-sm text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Because PIC-CLIP uses <strong>Bring Your Own Storage (BYOS)</strong> to store finished clips on your local computer disk or personal Google Drive, we eliminate cloud server markups.
          </p>

          {/* CURRENCY & BILLING CONTROLS */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            
            {/* Currency Selector */}
            <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-[#131622] border border-[#232738]">
              <button
                type="button"
                onClick={() => handleCurrencySelect("INR")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  currency === "INR" ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs" : "text-gray-400 hover:text-white"
                }`}
                title="Special domestic pricing for creators in India"
              >
                <span>🇮🇳 ₹ INR</span>
                <span className="text-[10px] font-mono text-amber-400 font-extrabold">(Special)</span>
              </button>

              <button
                type="button"
                onClick={() => handleCurrencySelect("USD")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  currency === "USD" ? "bg-purple-600 text-white shadow-xs" : "text-gray-400 hover:text-white"
                }`}
              >
                <span>🇺🇸 $ USD</span>
              </button>

              <button
                type="button"
                onClick={() => handleCurrencySelect("EUR")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  currency === "EUR" ? "bg-purple-600 text-white shadow-xs" : "text-gray-400 hover:text-white"
                }`}
              >
                <span>🇪🇺 € EUR</span>
              </button>

              <button
                type="button"
                onClick={() => handleCurrencySelect("GBP")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  currency === "GBP" ? "bg-purple-600 text-white shadow-xs" : "text-gray-400 hover:text-white"
                }`}
              >
                <span>🇬🇧 £ GBP</span>
              </button>
            </div>

            {/* Monthly vs Yearly */}
            <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-[#131622] border border-[#232738]">
              <button
                type="button"
                onClick={() => setBillingCycle("monthly")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  billingCycle === "monthly" ? "bg-purple-600 text-white shadow-xs" : "text-gray-400 hover:text-white"
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("yearly")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  billingCycle === "yearly" ? "bg-purple-600 text-white shadow-xs" : "text-gray-400 hover:text-white"
                }`}
              >
                <span>Yearly</span>
                <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-mono">
                  Save 20%
                </span>
              </button>
            </div>

          </div>

          {/* PROMO CODE BAR */}
          <div className="max-w-md mx-auto pt-2">
            <form onSubmit={handleApplyPromo} className="flex items-center gap-2">
              <div className="relative flex-1">
                <Tag className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Enter promo code (e.g. INDIA50)"
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                  className="w-full bg-[#131622] border border-[#232738] rounded-xl pl-10 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={isVerifyingPromo || !promoInput.trim()}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                {isVerifyingPromo ? "Checking..." : "Apply"}
              </button>
            </form>

            {appliedPromo && (
              <div className="mt-2.5 flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl text-left">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span><strong>{appliedPromo.code}</strong> applied: {appliedPromo.discountPercent}% discount unlocked!</span>
              </div>
            )}

            {promoError && (
              <div className="mt-2.5 flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-xl text-left">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{promoError}</span>
              </div>
            )}
          </div>
        </div>

        {/* 3 CORE PRICING CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">

          {/* Plan 1: Free Starter */}
          <div className={`rounded-3xl border p-8 flex flex-col justify-between space-y-8 transition-all ${
            currentTier === "free"
              ? "bg-[#11131c] border-purple-500/60 shadow-xl shadow-purple-950/20"
              : "bg-[#0f111a] border-gray-800 hover:border-gray-700"
          }`}>
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  {starterCfg?.name || "Free Starter"}
                </span>
                {currentTier === "free" && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                    Active Plan
                  </span>
                )}
              </div>

              <div>
                <span className="text-4xl font-black text-white">Free</span>
                <span className="text-xs text-gray-400 font-mono"> / forever</span>
              </div>

              <p className="text-xs text-gray-400 leading-relaxed">
                For casual gamers and beginner streamers wanting to test autonomous clipping without paying a dime.
              </p>

              <div className="space-y-3 pt-4 border-t border-gray-800 text-xs">
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span><strong>{config.quotas?.daily_free_generations ?? 3} video clips / day</strong></span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Max {config.quotas?.monthly_cap ?? 15} clips / month</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>720p HD export @ 30 FPS</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Local Disk & Google Drive offload</span>
                </div>
                <div className="flex items-center gap-2.5 text-gray-400">
                  <span className="text-xs font-bold text-gray-400">•</span>
                  <span>Subtle PIC-CLIP watermark</span>
                </div>
              </div>
            </div>

            <button
              disabled={currentTier === "free"}
              onClick={() => handleSelectTier("free")}
              className={`w-full py-3.5 rounded-2xl text-xs font-extrabold transition-all cursor-pointer ${
                currentTier === "free"
                  ? "bg-white/10 text-gray-400 cursor-default"
                  : "bg-white/10 hover:bg-white/20 text-white"
              }`}
            >
              {currentTier === "free" ? "Active Free Plan" : "Downgrade to Free"}
            </button>
          </div>

          {/* Plan 2: Creator Pass (Highlighted) */}
          <div className="rounded-3xl border-2 border-purple-500 bg-gradient-to-b from-[#1c162e] to-[#11121d] p-8 flex flex-col justify-between space-y-8 shadow-2xl shadow-purple-900/30 relative">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[10px] font-black uppercase tracking-wider shadow-md">
              Most Popular
            </div>

            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-300">
                  {creatorCfg?.name || "Creator Pass"}
                </span>
                {currentTier === "creator" && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                    Active Plan
                  </span>
                )}
              </div>

              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black text-white">{creatorCalc.formatted}</span>
                  {creatorCalc.originalFormatted && (
                    <span className="text-sm line-through text-gray-500">
                      {creatorCalc.originalFormatted}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400 font-mono"> / month</span>
              </div>

              <p className="text-xs text-purple-200/80 leading-relaxed">
                For active Twitch, Kick, and YouTube gaming creators clipping daily broadcasts into high-engagement shorts.
              </p>

              <div className="space-y-3 pt-4 border-t border-purple-500/20 text-xs">
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span><strong>{creatorCfg?.daily_limit ?? 25} video generations / day</strong></span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span><strong>{creatorCfg?.monthly_limit ?? 300} clips / month</strong> quota</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-purple-300 flex-shrink-0" />
                  <span><strong>1080p 60 FPS Lossless (CRF 17)</strong></span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-purple-300 flex-shrink-0" />
                  <span><strong>Zero Watermark</strong> + Custom Branding</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-purple-300 flex-shrink-0" />
                  <span>Auto-export to Personal Google Drive</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-purple-300 flex-shrink-0" />
                  <span>Priority AI Render Queue</span>
                </div>
              </div>
            </div>

            <button
              disabled={currentTier === "creator" || isProcessing}
              onClick={() => handleSelectTier("creator")}
              className={`w-full py-4 rounded-2xl text-xs font-black shadow-lg transition-all cursor-pointer ${
                currentTier === "creator"
                  ? "bg-white/10 text-gray-400 cursor-default"
                  : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white hover:scale-[1.02]"
              }`}
            >
              {currentTier === "creator" ? "Current Active Plan" : `Upgrade to Creator (${creatorCalc.formatted})`}
            </button>
          </div>

          {/* Plan 3: Pro Streamer Unlimited */}
          <div className={`rounded-3xl border p-8 flex flex-col justify-between space-y-8 transition-all ${
            currentTier === "pro"
              ? "bg-[#11131c] border-cyan-500/60 shadow-xl"
              : "bg-[#0f111a] border-gray-800 hover:border-gray-700"
          }`}>
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <Crown className="w-4 h-4" />
                  <span>{proCfg?.name || "Pro Streamer Unlimited"}</span>
                </span>
                {currentTier === "pro" && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                    Active Plan
                  </span>
                )}
              </div>

              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black text-white">{proCalc.formatted}</span>
                  {proCalc.originalFormatted && (
                    <span className="text-sm line-through text-gray-500">
                      {proCalc.originalFormatted}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400 font-mono"> / month</span>
              </div>

              <p className="text-xs text-gray-400 leading-relaxed">
                For heavy esports streamers, multi-streamers, and production agencies requiring infinite 4K exports.
              </p>

              <div className="space-y-3 pt-4 border-t border-gray-800 text-xs">
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span><strong>{proCfg?.daily_limit === 9999 ? "Unlimited" : proCfg?.daily_limit} video generations</strong></span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span><strong>4K Cinema Master exports</strong></span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span>Dedicated GPU Fast Lane</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span>Direct TikTok & YouTube Shorts Webhook</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span>Multi-channel publishing & batch render</span>
                </div>
              </div>
            </div>

            <button
              disabled={currentTier === "pro" || isProcessing}
              onClick={() => handleSelectTier("pro")}
              className={`w-full py-3.5 rounded-2xl text-xs font-extrabold transition-all cursor-pointer ${
                currentTier === "pro"
                  ? "bg-white/10 text-gray-400 cursor-default"
                  : "bg-cyan-600 hover:bg-cyan-500 text-white"
              }`}
            >
              {currentTier === "pro" ? "Current Active Plan" : `Upgrade to Pro (${proCalc.formatted})`}
            </button>
          </div>

        </div>

        {/* TOP-UP PACK BANNER */}
        <div className="rounded-3xl border border-purple-500/30 bg-purple-950/20 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-500/40 text-purple-300 flex items-center justify-center text-xl flex-shrink-0">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">Need extra video clips without a monthly subscription?</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Grab our <strong>+50 Clip Generation Pack</strong> for only {topupCalc.formatted}. Credits stack onto your account and never expire.
              </p>
            </div>
          </div>

          <button
            onClick={() => handleBuyPack(50)}
            className="px-6 py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black shadow-lg transition-all cursor-pointer whitespace-nowrap self-stretch sm:self-auto"
          >
            Buy +50 Pack ({topupCalc.formatted})
          </button>
        </div>

        {/* SUPPORTED PAYMENT METHODS WITH REGION HIGHLIGHT */}
        <div className="p-6 rounded-3xl bg-[#0f111a] border border-gray-800 space-y-4 text-center">
          <h3 className="text-xs font-mono uppercase tracking-wider text-gray-400">Supported Seamless Payment Methods</h3>
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-gray-300">
            {currency === "INR" ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span className="text-amber-300 font-extrabold">India UPI (GPay, PhonePe, Paytm, BHIM)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span><strong>RuPay & All Domestic Cards</strong> (Razorpay)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span><strong>Netbanking</strong> (SBI, HDFC, ICICI, Axis)</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span className="text-purple-300 font-extrabold">Global Credit Cards & Apple Pay (Lemon Squeezy)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span><strong>PayPal & Google Pay</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span><strong>USDT Crypto</strong> (Solana / Polygon)</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* FAQ SECTION */}
        <div className="space-y-6 pt-4">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-black text-white">Frequently Asked Questions</h2>
            <p className="text-xs text-gray-400">Everything you need to know about PIC-CLIP billing and storage</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-[#0f111a] border border-gray-800 space-y-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-purple-400" />
                <span>How does Bring Your Own Storage (BYOS) work?</span>
              </h4>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Unlike other SaaS tools that charge you expensive cloud storage fees, PIC-CLIP saves all rendered clips directly to your <strong>Local Computer Disk</strong> or your personal <strong>Google Drive</strong> (utilizing your free 15 GB). Your files remain 100% private.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#0f111a] border border-gray-800 space-y-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-purple-400" />
                <span>Can I cancel or change my plan anytime?</span>
              </h4>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Yes! There are no lock-in contracts. You can upgrade, downgrade, or cancel directly from your Settings page with a single click. Any purchased top-up credits stay on your account forever.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#0f111a] border border-gray-800 space-y-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-purple-400" />
                <span>How do Indian creators pay?</span>
              </h4>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Indian creators can pay in Indian Rupees (₹ INR) using UPI (Google Pay, PhonePe, Paytm), RuPay cards, or Netbanking via Razorpay. Subscriptions support UPI AutoPay for frictionless renewals.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#0f111a] border border-gray-800 space-y-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-purple-400" />
                <span>What happens when my daily free quota is used up?</span>
              </h4>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Free tiers reset automatically every night at 00:00 UTC. If you need to produce more clips immediately, you can upgrade to Creator Pass or purchase a +50 top-up pack.
              </p>
            </div>
          </div>
        </div>

      </div>
    </AppShell>
  );
}
