"use client";

import React from "react";
import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-[#07080a] text-white flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
        <ShieldAlert className="w-8 h-8 text-red-400" />
      </div>
      <h1 className="text-2xl font-bold mb-2">404 - Page Not Found</h1>
      <p className="text-gray-400 max-w-md text-sm mb-6 leading-relaxed">
        The requested path does not exist. The PIC-CLIP Master Control Station is hosted on an isolated, standalone master host for security.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all"
      >
        <ArrowLeft className="w-4 h-4" />
        Return to Studio Home
      </Link>
    </div>
  );
}
