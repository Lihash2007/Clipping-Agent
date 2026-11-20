"use client";

import React, { useState } from "react";
import {
  X,
  Mail,
  Lock,
  User,
  Globe,
  Tv,
  Sparkles,
  Ticket,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight
} from "lucide-react";
import {
  loginWithEmail,
  signupWithEmail,
  loginWithGoogleMock,
  loginWithTwitchMock,
  claimLicenseVoucher,
  UserAccount
} from "@/lib/auth";
import { addNotification } from "@/lib/notifications";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "signin" | "signup" | "redeem";
  isMandatory?: boolean;
}

export function AuthModal({ isOpen, onClose, initialMode = "signin", isMandatory = false }: AuthModalProps) {
  if (!isOpen) return null;

  const [mode, setMode] = useState<"signin" | "signup" | "redeem">(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Signin & Signup state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("IN");
  const [platform, setPlatform] = useState("twitch");

  // Redeem voucher state
  const [voucherCode, setVoucherCode] = useState("");

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError("");

    const res = await loginWithEmail(email, password);
    setLoading(false);

    if (res.success && res.user) {
      addNotification({
        type: "system",
        title: `Welcome back, ${res.user.name}!`,
        message: `Logged in successfully. Region set to ${res.user.country}.`,
      });
      onClose();
    } else {
      setError(res.error || "Login failed");
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) return;
    setLoading(true);
    setError("");

    const res = await signupWithEmail(name, email, password, country, platform);
    setLoading(false);

    if (res.success && res.user) {
      addNotification({
        type: "system",
        title: `Account created for ${res.user.name}!`,
        message: `Your region is ${res.user.country === "IN" ? "🇮🇳 India (Special ₹ INR)" : "Global ($ USD)"}.`,
      });
      onClose();
    } else {
      setError(res.error || "Signup failed");
    }
  };

  const handleRedeemVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucherCode.trim()) return;
    setLoading(true);
    setError("");
    setSuccessMsg("");

    const res = await claimLicenseVoucher(voucherCode.trim());
    setLoading(false);

    if (res.success) {
      setSuccessMsg(res.message);
      addNotification({
        type: "system",
        title: "Voucher Code Claimed!",
        message: res.message,
      });
      setTimeout(() => onClose(), 1500);
    } else {
      setError(res.message || "Failed to redeem voucher");
    }
  };

  const handleSocialGoogle = async () => {
    setLoading(true);
    setTimeout(async () => {
      const user = await loginWithGoogleMock();
      setLoading(false);
      addNotification({
        type: "system",
        title: `Signed in with Google!`,
        message: `Connected as ${user.name}. Google Drive BYOS auto-linked.`,
      });
      onClose();
    }, 600);
  };

  const handleSocialTwitch = async () => {
    setLoading(true);
    setTimeout(async () => {
      const user = await loginWithTwitchMock();
      setLoading(false);
      addNotification({
        type: "system",
        title: `Connected with Twitch!`,
        message: `Logged in as ${user.name}.`,
      });
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-3xl border border-purple-500/30 bg-[#0d0f17] text-white p-6 sm:p-8 shadow-2xl relative my-8 space-y-6">
        
        {/* Close Button - Hidden when login is mandatory */}
        {!isMandatory && (
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Modal Header */}
        <div className="text-center space-y-1.5 pt-1">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center justify-center mx-auto text-xl mb-3 shadow-md">
            {mode === "redeem" ? <Ticket className="w-6 h-6 text-amber-400" /> : <Sparkles className="w-6 h-6" />}
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white">
            {mode === "signin" && "Sign In to PIC-CLIP"}
            {mode === "signup" && "Create Creator Account"}
            {mode === "redeem" && "Claim License Voucher"}
          </h2>
          <p className="text-xs text-gray-400">
            {mode === "signin" && "Access your saved stream projects, credits, and Google Drive BYOS."}
            {mode === "signup" && "Specify your region to unlock localized domestic or global pricing."}
            {mode === "redeem" && "Redeem a key purchased on Gumroad, AppSumo, or via Direct UPI."}
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-white/5 border border-white/10 text-xs font-bold">
          <button
            type="button"
            onClick={() => { setMode("signin"); setError(""); }}
            className={`py-2 rounded-xl transition-all cursor-pointer ${
              mode === "signin" ? "bg-purple-600 text-white shadow-xs" : "text-gray-400 hover:text-white"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode("signup"); setError(""); }}
            className={`py-2 rounded-xl transition-all cursor-pointer ${
              mode === "signup" ? "bg-purple-600 text-white shadow-xs" : "text-gray-400 hover:text-white"
            }`}
          >
            Sign Up
          </button>
          <button
            type="button"
            onClick={() => { setMode("redeem"); setError(""); }}
            className={`py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 ${
              mode === "redeem" ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" : "text-gray-400 hover:text-white"
            }`}
          >
            <Ticket className="w-3.5 h-3.5" />
            <span>Redeem</span>
          </button>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* ================= TAB 1: SIGN IN ================= */}
        {mode === "signin" && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="text-[11px] font-mono text-gray-400 uppercase tracking-wider block mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="creator@streamer.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#151722] border border-gray-700 focus:border-purple-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-mono text-gray-400 uppercase tracking-wider block mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#151722] border border-gray-700 focus:border-purple-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              <span>Sign In</span>
            </button>

            {/* Social Logins */}
            <div className="pt-2">
              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-gray-800"></div>
                <span className="flex-shrink mx-3 text-[10px] font-mono text-gray-500 uppercase">Or continue with</span>
                <div className="flex-grow border-t border-gray-800"></div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSocialGoogle}
                  className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-gray-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Google Drive</span>
                </button>
                <button
                  type="button"
                  onClick={handleSocialTwitch}
                  className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-gray-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Tv className="w-3.5 h-3.5 text-purple-400" />
                  <span>Twitch</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ================= TAB 2: SIGN UP (REGION SPECIFIED) ================= */}
        {mode === "signup" && (
          <form onSubmit={handleSignUp} className="space-y-3.5">
            <div>
              <label className="text-[11px] font-mono text-gray-400 uppercase tracking-wider block mb-1">Your Name / Channel Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="NinjaStreamer"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#151722] border border-gray-700 focus:border-purple-500 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-mono text-gray-400 uppercase tracking-wider block mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="creator@streamer.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#151722] border border-gray-700 focus:border-purple-500 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-mono text-gray-400 uppercase tracking-wider block mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#151722] border border-gray-700 focus:border-purple-500 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Region / Country Selector */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-mono text-gray-400 uppercase tracking-wider block mb-1">
                  Country / Region
                </label>
                <div className="relative">
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full bg-[#151722] border border-gray-700 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none cursor-pointer"
                  >
                    <option value="IN">🇮🇳 India (Special ₹ INR)</option>
                    <option value="US">🇺🇸 United States ($ USD)</option>
                    <option value="GB">🇬🇧 United Kingdom (£ GBP)</option>
                    <option value="EU">🇪🇺 Europe (€ EUR)</option>
                    <option value="CA">🇨🇦 Canada (CA$)</option>
                    <option value="AU">🇦🇺 Australia (A$)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-mono text-gray-400 uppercase tracking-wider block mb-1">
                  Primary Stream
                </label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="w-full bg-[#151722] border border-gray-700 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none cursor-pointer"
                >
                  <option value="twitch">Twitch Streamer</option>
                  <option value="youtube">YouTube Gaming</option>
                  <option value="kick">Kick Broadcast</option>
                  <option value="other">Podcast / Other</option>
                </select>
              </div>
            </div>

            <p className="text-[10px] text-gray-400">
              {country === "IN"
                ? "🇮🇳 Selected India: You will see special domestic INR pricing with UPI AutoPay support."
                : "🌐 Selected Global: You will see international USD pricing with Lemon Squeezy card checkout."}
            </p>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 mt-1"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>Create Account</span>
            </button>
          </form>
        )}

        {/* ================= TAB 3: REDEEM VOUCHER (GUMROAD / APPSUMO) ================= */}
        {mode === "redeem" && (
          <form onSubmit={handleRedeemVoucher} className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
              <span className="font-bold flex items-center gap-1.5">
                <Ticket className="w-4 h-4" />
                <span>Have a digital license voucher?</span>
              </span>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                If you bought a Creator Pass or Credit Pack on <strong>Gumroad</strong>, <strong>AppSumo</strong>, or paid via <strong>Direct UPI</strong>, paste your redemption key below.
              </p>
            </div>

            <div>
              <label className="text-[11px] font-mono text-gray-400 uppercase tracking-wider block mb-1.5">
                Voucher / License Key
              </label>
              <input
                type="text"
                required
                placeholder="GUMROAD-CREATOR-99 or INDIA-STREAMER-PASS"
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                className="w-full bg-[#151722] border border-gray-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-500 font-mono focus:outline-none uppercase"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !voucherCode.trim()}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>Claim & Unlock Subscription</span>
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
