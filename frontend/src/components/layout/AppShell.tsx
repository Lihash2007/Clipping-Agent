"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
import { useTheme } from "@/lib/theme";

interface AppShellProps {
  children: React.ReactNode;
  headerTitle?: string;
  headerSubtitle?: string;
  headerActions?: React.ReactNode;
}

export function AppShell({
  children,
  headerTitle,
  headerSubtitle,
  headerActions,
}: AppShellProps) {
  const pathname = usePathname();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`flex h-screen w-screen overflow-hidden transition-colors duration-200 ${
      isDark ? "bg-[#08090c] text-gray-100" : "bg-[#0c0d0f] text-gray-900"
    }`}>
      {/* Sidebar matching template */}
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
      />

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 h-full overflow-hidden transition-colors duration-200 ${
        isDark ? "bg-[#0b0c10]" : "bg-[#f7f8fa]"
      }`}>
        <TopHeader
          title={headerTitle}
          subtitle={headerSubtitle}
          actions={headerActions}
        />

        <main className={`flex-1 overflow-y-auto relative ${
          isDark ? "text-gray-100" : "text-gray-900"
        }`}>
          {children}
        </main>
      </div>
    </div>
  );
}
