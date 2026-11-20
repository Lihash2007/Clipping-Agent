"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function IngestRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0b0d11] flex flex-col items-center justify-center space-y-3 text-white">
      <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      <p className="text-xs font-mono text-gray-400">Loading Single-Window Studio...</p>
    </div>
  );
}
