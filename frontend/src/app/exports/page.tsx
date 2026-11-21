"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { useTheme } from "@/lib/theme";
import { ProjectItem, Clip } from "@/lib/types";
import { fetchProjects, handleDownloadAndReveal, openDesktopOutputFolder } from "@/lib/api";
import {
  DownloadCloud,
  Play,
  Share2,
  Copy,
  Check,
  Flame,
  X,
  Scissors,
  Film,
  FolderOpen
} from "lucide-react";

interface RenderedClipItem {
  projectTitle: string;
  projectId: string;
  clipKey: string;
  downloadUrl: string;
  clipData?: Clip;
}

export default function ExportsPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [renderedClips, setRenderedClips] = useState<RenderedClipItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeVideoModal, setActiveVideoModal] = useState<RenderedClipItem | null>(null);
  const [activeSocialModal, setActiveSocialModal] = useState<RenderedClipItem | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleDownloadClick = async (downloadUrl: string, filename?: string) => {
    showToast("Opening rendered MP4 in File Explorer / Finder...");
    await handleDownloadAndReveal(downloadUrl, filename);
  };

  const handleOpenFolderClick = async () => {
    showToast("Opening output folder in File Explorer / Finder...");
    await openDesktopOutputFolder();
  };

  useEffect(() => {
    loadExports();
  }, []);

  const loadExports = async () => {
    setLoading(true);
    const data = await fetchProjects();
    setProjects(data);

    const list: RenderedClipItem[] = [];
    const seenUrls = new Set<string>();

    data.forEach((p) => {
      if (p.rendered_clips) {
        Object.entries(p.rendered_clips).forEach(([key, url]) => {
          const fullUrl = url;
          const cleanUrl = fullUrl.split("?")[0];
          if (seenUrls.has(cleanUrl)) return;
          seenUrls.add(cleanUrl);

          // Find clip metadata matching clip id or start_end bounds
          let matched = p.clips?.find((c) => c.id === key);
          if (!matched && key.includes("_")) {
            const [startStr, endStr] = key.split("_");
            const s = parseFloat(startStr);
            const e = parseFloat(endStr);
            matched = p.clips?.find(
              (c) => Math.abs(c.start_time - s) < 1.0 || Math.abs(c.end_time - e) < 1.0
            );
          }
          if (!matched && p.clips && p.clips.length > 0) {
            matched = p.clips[0];
          }

          list.push({
            projectTitle: p.title,
            projectId: p.project_id,
            clipKey: key,
            downloadUrl: fullUrl,
            clipData: matched,
          });
        });
      }
    });

    setRenderedClips(list);
    setLoading(false);
  };

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <AppShell
      headerTitle="Rendered Exports"
      headerSubtitle="Lossless Master Vertical MP4s Ready for TikTok, Reels & YouTube Shorts"
    >
      <div className="p-8 md:p-12 max-w-7xl mx-auto space-y-8">
        {/* Header Stats */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className={`text-xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>
              Finished Video Vault
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {renderedClips.length} Master Vertical Clips Rendered Across Your Workspaces &bull; 100% Local Disk Storage
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenFolderClick}
              className={`text-xs font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 border cursor-pointer shadow-xs ${
                isDark
                  ? "bg-[#181b24] border-[#292d3e] hover:bg-[#202534] text-white"
                  : "bg-white border-gray-200 hover:bg-gray-100 text-gray-800"
              }`}
              title="Open outputs folder directly in Windows File Explorer or macOS Finder"
            >
              <FolderOpen className="w-3.5 h-3.5 text-purple-400" />
              <span>Open Output Folder</span>
            </button>

            <Link
              href="/"
              className={`text-xs font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 shadow-xs ${
                isDark ? "bg-purple-600 hover:bg-purple-500 text-white" : "bg-black hover:bg-gray-800 text-white"
              }`}
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Open Studio Editor</span>
            </Link>
          </div>
        </div>

        {/* Action Feedback Toast */}
        {toastMsg && (
          <div className="p-3 px-4 rounded-xl bg-purple-600/90 text-white text-xs font-bold flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-top duration-200">
            <FolderOpen className="w-4 h-4 shrink-0" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Content Grid */}
        {loading ? (
          <div className={`h-64 rounded-3xl border flex items-center justify-center text-xs ${
            isDark ? "bg-[#111319] border-[#242833] text-gray-500" : "bg-white border-gray-200 text-gray-400"
          }`}>
            Loading exports vault...
          </div>
        ) : renderedClips.length === 0 ? (
          <div className={`h-64 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center p-8 text-center space-y-3 ${
            isDark ? "bg-[#111319] border-[#242833]" : "bg-white border-gray-200"
          }`}>
            <Film className="w-10 h-10 text-gray-500" />
            <div>
              <p className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-800"}`}>No Rendered Clips Yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Open any project in the Studio Editor and click "Render Clip (R)" to generate master MP4s.
              </p>
            </div>
            <Link
              href="/"
              className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-colors ${
                isDark ? "bg-purple-600 hover:bg-purple-500 text-white" : "bg-black hover:bg-gray-800 text-white"
              }`}
            >
              Open Studio Editor
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {renderedClips.map((item, idx) => {
              const title =
                item.clipData?.title ||
                item.clipData?.hook_sentence ||
                `Master Clip #${idx + 1}`;
              const score = item.clipData?.score || 95;

              return (
                <div
                  key={`${item.projectId}-${item.clipKey}`}
                  className={`group rounded-3xl p-4.5 transition-all shadow-xs flex flex-col justify-between border ${
                    isDark
                      ? "bg-[#111319] border-[#232733] hover:border-purple-500 hover:shadow-purple-950/20"
                      : "bg-white border-gray-200/80 hover:border-black hover:shadow-md"
                  }`}
                >
                  <div className="space-y-3.5">
                    {/* Video Mockup Thumbnail with Play overlay */}
                    <div
                      onClick={() => setActiveVideoModal(item)}
                      className="relative aspect-[9/14] w-full rounded-2xl bg-black overflow-hidden cursor-pointer group/thumb"
                    >
                      <video
                        src={item.downloadUrl}
                        preload="metadata"
                        className="w-full h-full object-cover opacity-85 group-hover/thumb:opacity-100 transition-opacity"
                      />

                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover/thumb:bg-black/10 transition-colors">
                        <div className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-lg group-hover/thumb:scale-110 transition-transform">
                          <Play className="w-5 h-5 ml-0.5 fill-black" />
                        </div>
                      </div>

                      {/* Score Badge */}
                      <div className="absolute top-3 left-3 bg-black/80 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                        <Flame className="w-3 h-3 text-amber-400" />
                        <span className="text-[10px] font-mono font-bold text-white">
                          {score}
                        </span>
                      </div>

                      {/* CRF Pill */}
                      <div className="absolute top-3 right-3 bg-white/90 px-2 py-0.5 rounded-full shadow-sm">
                        <span className="text-[9px] font-mono font-bold text-black">
                          CRF 15
                        </span>
                      </div>
                    </div>

                    {/* Meta info */}
                    <div>
                      <h3 className={`font-bold text-xs md:text-sm line-clamp-1 transition-colors ${
                        isDark ? "text-white group-hover:text-purple-300" : "text-gray-900 group-hover:text-black"
                      }`}>
                        {title}
                      </h3>
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">
                        {item.projectTitle}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className={`mt-4 pt-3 border-t flex items-center gap-2 ${
                    isDark ? "border-[#1e222d]" : "border-gray-100"
                  }`}>
                    <button
                      onClick={() => handleDownloadClick(item.downloadUrl, `clip_${item.clipKey}.mp4`)}
                      className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs ${
                        isDark ? "bg-purple-600 hover:bg-purple-500 text-white" : "bg-black hover:bg-gray-800 text-white"
                      }`}
                      title="Reveal in File Explorer / Finder & Save MP4"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Open in Explorer / Save</span>
                    </button>

                    <button
                      onClick={() => setActiveSocialModal(item)}
                      title="Social Publisher & Copy"
                      className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                        isDark
                          ? "border-[#282c3c] hover:border-purple-400 text-gray-300 hover:text-white hover:bg-[#1a1d26]"
                          : "border-gray-200 hover:border-black text-gray-600 hover:text-black hover:bg-gray-50"
                      }`}
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* VIDEO PLAYER MODAL */}
        {activeVideoModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className={`relative w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 border ${
              isDark ? "bg-[#111319] border-[#292d3c]" : "bg-white border-gray-200"
            }`}>
              <div className={`flex items-center justify-between pb-2 border-b ${
                isDark ? "border-[#1e222d]" : "border-gray-100"
              }`}>
                <span className={`text-xs font-bold truncate ${isDark ? "text-white" : "text-gray-900"}`}>
                  {activeVideoModal.clipData?.title || "Master Clip Preview"}
                </span>
                <button
                  onClick={() => setActiveVideoModal(null)}
                  className={`p-1 rounded-lg ${isDark ? "text-gray-400 hover:text-white hover:bg-white/10" : "text-gray-400 hover:text-black hover:bg-gray-100"}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="aspect-[9/16] w-full rounded-2xl overflow-hidden bg-black shadow-inner">
                <video
                  src={activeVideoModal.downloadUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => handleDownloadClick(activeVideoModal.downloadUrl, `clip_${activeVideoModal.clipKey}.mp4`)}
                  className={`w-full py-3 rounded-xl font-extrabold text-xs transition-colors flex items-center justify-center gap-2 shadow cursor-pointer ${
                    isDark ? "bg-purple-600 hover:bg-purple-500 text-white" : "bg-black hover:bg-gray-800 text-white"
                  }`}
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>Save & Open in File Explorer / Finder</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SOCIAL PUBLISHER MODAL */}
        {activeSocialModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className={`relative w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-5 border ${
              isDark ? "bg-[#111319] border-[#292d3c]" : "bg-white border-gray-200"
            }`}>
              <div className={`flex items-center justify-between pb-2 border-b ${
                isDark ? "border-[#1e222d]" : "border-gray-100"
              }`}>
                <div className="flex items-center gap-2">
                  <Share2 className={`w-4 h-4 ${isDark ? "text-purple-400" : "text-gray-900"}`} />
                  <span className={`text-sm font-black ${isDark ? "text-white" : "text-gray-900"}`}>
                    Viral Social Publisher Package
                  </span>
                </div>
                <button
                  onClick={() => setActiveSocialModal(null)}
                  className={`p-1 rounded-lg ${isDark ? "text-gray-400 hover:text-white hover:bg-white/10" : "text-gray-400 hover:text-black hover:bg-gray-100"}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Title */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span className="font-bold">Viral Video Title</span>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          activeSocialModal.clipData?.title ||
                            activeSocialModal.projectTitle,
                          "title"
                        )
                      }
                      className={`text-[11px] font-bold hover:underline flex items-center gap-1 cursor-pointer ${
                        isDark ? "text-purple-400" : "text-gray-900"
                      }`}
                    >
                      {copiedField === "title" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedField === "title" ? "Copied!" : "Copy"}</span>
                    </button>
                  </div>
                  <div className={`p-3.5 rounded-xl border text-xs font-mono font-medium ${
                    isDark ? "bg-[#171922] border-[#282c3c] text-white" : "bg-[#f7f8fa] border-gray-200 text-gray-900"
                  }`}>
                    {activeSocialModal.clipData?.title || activeSocialModal.projectTitle}
                  </div>
                </div>

                {/* Caption & Hashtags */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span className="font-bold">Captions & Hashtags</span>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          activeSocialModal.clipData?.social?.caption ||
                            `${activeSocialModal.clipData?.title || "Insane viral moment!"}\n\n#Gaming #StreamClips #Shorts #TikTok #Viral`,
                          "caption"
                        )
                      }
                      className={`text-[11px] font-bold hover:underline flex items-center gap-1 cursor-pointer ${
                        isDark ? "text-purple-400" : "text-gray-900"
                      }`}
                    >
                      {copiedField === "caption" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedField === "caption" ? "Copied!" : "Copy"}</span>
                    </button>
                  </div>
                  <div className={`p-3.5 rounded-xl border text-xs font-mono whitespace-pre-line leading-relaxed ${
                    isDark ? "bg-[#171922] border-[#282c3c] text-gray-200" : "bg-[#f7f8fa] border-gray-200 text-gray-800"
                  }`}>
                    {activeSocialModal.clipData?.social?.caption ||
                      `${activeSocialModal.clipData?.title || "Insane viral moment!"}\n\n#Gaming #StreamClips #Shorts #TikTok #Viral`}
                  </div>
                </div>

                {/* Viral Reasoning */}
                {activeSocialModal.clipData?.social?.why_viral && (
                  <div className={`p-3.5 rounded-xl border text-xs ${
                    isDark ? "bg-amber-950/30 border-amber-500/30 text-amber-200" : "bg-amber-50 border-amber-200 text-amber-800"
                  }`}>
                    <span className="font-bold block mb-0.5">🔥 Virality Trigger:</span>
                    <span>{activeSocialModal.clipData.social.why_viral}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
