"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { AuthModal } from "@/components/auth/AuthModal";

export default function LoginPage() {
  return (
    <AppShell headerTitle="Creator Sign In" headerSubtitle="Log in to manage your AI stream clips and credits">
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <AuthModal isOpen={true} onClose={() => { if (typeof window !== "undefined") window.location.href = "/"; }} initialMode="signin" />
      </div>
    </AppShell>
  );
}
