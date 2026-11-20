"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PlayCircle,
  Layers,
  Scissors,
  LayoutGrid,
  Sliders,
  BarChart3,
  Crown,
  ChevronRight,
  ArrowRight,
  ChevronLeft,
  Tag
} from "lucide-react";

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ collapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();

  const navItems = [
    { name: "Create Clip", href: "/", icon: PlayCircle },
    { name: "Studio Editor", href: "/editor", icon: Scissors },
    { name: "Projects", href: "/library", icon: Layers },
    { name: "Rendered Exports", href: "/exports", icon: BarChart3 },
    { name: "Plans & Pricing", href: "/pricing", icon: Tag },
    { name: "Brand Kit & Settings", href: "/settings", icon: Sliders },
  ];

  return (
    <aside
      className={`relative flex flex-col h-screen border-r border-[#1e2024] bg-[#0c0d0f] text-gray-300 z-30 transition-all duration-300 select-none flex-shrink-0 ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Top: Mascot Logo */}
      <div className="h-24 flex items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center group-hover:scale-105 transition-transform">
            <img
              src="/mascot_logo.png"
              alt="PIC-CLIP Mascot Logo"
              className="w-full h-full object-contain"
            />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-black text-sm tracking-wide text-white uppercase">
                PIC-CLIP
              </span>
              <span className="text-[10px] font-mono tracking-widest text-gray-400 font-bold uppercase">
                AI Studio
              </span>
            </div>
          )}
        </Link>

        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            aria-label="Toggle Sidebar"
            className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Navigation Items */}
      <div className="flex-1 px-4 py-2 space-y-2 overflow-y-auto scrollbar-none">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3.5 px-4 py-3 rounded-2xl font-bold text-xs transition-all ${
                isActive
                  ? "bg-white text-black shadow-lg shadow-white/5 font-extrabold"
                  : "text-gray-400 hover:text-white hover:bg-white/[0.05]"
              } ${collapsed ? "justify-center px-0" : ""}`}
              title={collapsed ? item.name : undefined}
            >
              <Icon
                className={`w-5 h-5 flex-shrink-0 ${
                  isActive ? "text-black" : "text-gray-400"
                }`}
              />
              {!collapsed && <span className="tracking-wide">{item.name}</span>}
            </Link>
          );
        })}
      </div>

      {/* Upgrade Banner Card */}
      {!collapsed && (
        <div className="mx-4 mb-4 p-4 rounded-2xl bg-[#151619] border border-white/5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-xs text-white">
              <Crown className="w-4 h-4 text-amber-400" />
              <span>Upgrade</span>
            </div>
            <Link
              href="/settings"
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <p className="text-[11px] text-gray-400 leading-snug">
            Unlock longer uploads and premium AI models.
          </p>
        </div>
      )}

      {/* User Profile */}
      <div className="p-4 border-t border-[#1a1c20] flex items-center justify-between">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-full bg-white text-black font-extrabold flex items-center justify-center text-sm flex-shrink-0 shadow-md">
            L
          </div>
          {!collapsed && (
            <div className="flex flex-col truncate">
              <span className="font-bold text-xs text-white truncate">Lihash L.B.</span>
              <span className="text-[11px] text-gray-400 font-medium">Free Plan</span>
            </div>
          )}
        </div>

        {!collapsed && <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />}
      </div>
    </aside>
  );
}
