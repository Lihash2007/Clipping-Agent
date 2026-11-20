"use client";

import React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthModal } from "@/components/auth/AuthModal";

export default function SignupPage() {
  return (
    <AppShell headerTitle="Creator Sign Up" headerSubtitle="Specify your region and unlock localized domestic or global pricing">
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <AuthModal isOpen={true} onClose={() => { if (typeof window !== "undefined") window.location.href = "/"; }} initialMode="signup" />
      </div>
    </AppShell>
  );
}
