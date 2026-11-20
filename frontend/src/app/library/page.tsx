"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { useTheme } from "@/lib/theme";
import { ProjectItem } from "@/lib/types";
import { fetchProjects, deleteProjectById, clearAllPlatformData } from "@/lib/api";
import { clearLastActiveProjectId, clearActiveJob } from "@/lib/activeJob";
import {
  FolderOpen,
  Search,
  Scissors,
  Trash2,
  Gamepad2,
  Mic,
  Calendar,
  Flame,
  Download,
  Plus,
  AlertTriangle,
  Loader2
} from "lucide-react";

export default function LibraryPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "gaming" | "podcast">("all");

  // Deletion modal state
  const [projectToDelete, setProjectToDelete] = useState<ProjectItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Clear all data modal state
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    const data = await fetchProjects();
    setProjects(data);
    setLoading(false);
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    setIsDeleting(true);
    try {
      const ok = await deleteProjectById(projectToDelete.project_id);
      if (ok) {
        setProjects((prev) => prev.filter((p) => p.project_id !== projectToDelete.project_id));
        setProjectToDelete(null);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmClearAllData = async () => {
    setIsClearingAll(true);
    try {
      const res = await clearAllPlatformData();
      if (res.success) {
        clearLastActiveProjectId();
        clearActiveJob();
        setProjects([]);
        setShowClearAllModal(false);
      }
    } finally {
      setIsClearingAll(false);
    }
  };

  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.file_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.source_url && p.source_url.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType =
      filterType === "all" ? true : p.content_type === filterType;

    return matchesSearch && matchesType;
  });

  return (
    <AppShell
      headerTitle="Projects"
      headerSubtitle="All Ingested Stream VODs & Master Videos"
    >
      <div className="p-8 md:p-12 max-w-7xl mx-auto space-y-8">
        {/* Search & Filter Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by title, stream URL, or project ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full rounded-2xl pl-11 pr-4 py-2.5 text-xs transition-colors shadow-xs border focus:outline-none ${
                isDark
                  ? "bg-[#111319] border-[#242833] text-white placeholder-gray-500 focus:border-purple-500"
                  : "bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:border-black"
              }`}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {[
              { id: "all", label: "All Projects" },
              { id: "gaming", label: "Gaming Streams" },
              { id: "podcast", label: "Podcasts" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterType(tab.id as any)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  filterType === tab.id
                    ? isDark
                      ? "bg-purple-600 text-white shadow-xs"
                      : "bg-black text-white shadow-xs"
                    : isDark
                    ? "bg-[#111319] text-gray-400 border border-[#242833] hover:text-white"
                    : "bg-white text-gray-600 border border-gray-200 hover:text-black"
                }`}
              >
                {tab.label}
              </button>
            ))}

            {projects.length > 0 && (
              <button
                onClick={() => setShowClearAllModal(true)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-500 flex items-center gap-1.5"
                title="Wipe all projects and files"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All Data</span>
              </button>
            )}
          </div>
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div className={`h-64 rounded-3xl border flex items-center justify-center text-xs ${
            isDark ? "bg-[#111319] border-[#242833] text-gray-500" : "bg-white border-gray-200 text-gray-400"
          }`}>
            Loading project library...
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className={`h-64 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center p-8 text-center space-y-3 ${
            isDark ? "bg-[#111319] border-[#242833]" : "bg-white border-gray-200"
          }`}>
            <FolderOpen className="w-10 h-10 text-gray-500" />
            <div>
              <p className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-800"}`}>No Projects Found</p>
              <p className="text-xs text-gray-400 mt-1">
                {searchQuery
                  ? "Try clearing your search query or filters."
                  : "Start your first project using the Ingest Wizard."}
              </p>
            </div>
            <Link
              href="/new"
              className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 ${
                isDark ? "bg-purple-600 hover:bg-purple-500 text-white" : "bg-black hover:bg-gray-800 text-white"
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Start New Project</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => {
              const formattedDate = new Date(project.created_at * 1000).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric"
              });

              return (
                <div
                  key={project.project_id}
                  className={`group rounded-3xl p-6 transition-all shadow-xs flex flex-col justify-between border ${
                    isDark
                      ? "bg-[#111319] border-[#232733] hover:border-purple-500 hover:shadow-purple-950/20"
                      : "bg-white border-gray-200 hover:border-black hover:shadow-md"
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-mono uppercase px-3 py-1 rounded-full font-extrabold border flex items-center gap-1.5 ${
                        isDark
                          ? "bg-[#171922] text-purple-300 border-[#292d3c]"
                          : "bg-gray-100 text-gray-900 border-gray-200"
                      }`}>
                        {project.content_type === "gaming" ? (
                          <Gamepad2 className="w-3.5 h-3.5" />
                        ) : (
                          <Mic className="w-3.5 h-3.5" />
                        )}
                        <span>{project.content_type || "Gaming"}</span>
                      </span>

                      <div className="flex items-center gap-1 text-[11px] text-gray-400 font-mono">
                        <Calendar className="w-3 h-3" />
                        <span>{formattedDate}</span>
                      </div>
                    </div>

                    <div>
                      <h3 className={`font-bold text-sm transition-colors line-clamp-2 ${
                        isDark ? "text-white group-hover:text-purple-300" : "text-gray-900 group-hover:text-black"
                      }`}>
                        {project.title}
                      </h3>
                      {project.source_url && (
                        <p className="text-[10px] font-mono text-gray-400 truncate mt-1">
                          {project.source_url}
                        </p>
                      )}
                    </div>

                    {/* Stats */}
                    <div className={`grid grid-cols-2 gap-2 rounded-2xl p-3.5 border text-xs font-mono ${
                      isDark ? "bg-[#171922] border-[#282c3c]" : "bg-[#f7f8fa] border-gray-100"
                    }`}>
                      <div className="flex items-center gap-2">
                        <Flame className="w-4 h-4 text-amber-500" />
                        <div>
                          <p className={`font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{project.clips?.length || 0}</p>
                          <p className="text-[10px] text-gray-400 font-sans font-normal">Moments</p>
                        </div>
                      </div>

                      <div className={`flex items-center gap-2 border-l pl-3 ${
                        isDark ? "border-[#282c3c]" : "border-gray-200"
                      }`}>
                        <Download className={`w-4 h-4 ${isDark ? "text-purple-300" : "text-gray-700"}`} />
                        <div>
                          <p className={`font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                            {Object.keys(project.rendered_clips || {}).length}
                          </p>
                          <p className="text-[10px] text-gray-400 font-sans font-normal">Rendered</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={`mt-5 pt-4 border-t flex items-center gap-2 ${
                    isDark ? "border-[#1e222d]" : "border-gray-100"
                  }`}>
                    <Link
                      href={`/editor?project=${encodeURIComponent(project.project_id)}`}
                      className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs ${
                        isDark
                          ? "bg-purple-600 hover:bg-purple-500 text-white"
                          : "bg-black hover:bg-gray-800 text-white"
                      }`}
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      <span>Open in Studio</span>
                    </Link>

                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setProjectToDelete(project);
                      }}
                      title="Delete Project"
                      className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                        isDark
                          ? "border-[#282c3c] hover:border-rose-500 text-gray-400 hover:text-rose-400 hover:bg-rose-950/20"
                          : "border-gray-200 hover:border-rose-400 text-gray-400 hover:text-rose-600 hover:bg-rose-50"
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CONFIRMATION MODAL: DELETE SINGLE PROJECT */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-3xl border p-6 md:p-8 space-y-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150 ${
            isDark ? "bg-[#111319] border-[#292d3c] text-white" : "bg-white border-gray-200 text-gray-900"
          }`}>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500">
                <Trash2 className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <h3 className="text-base font-black">Delete This Project?</h3>
                <p className="text-xs text-gray-400">This action cannot be undone</p>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border text-xs space-y-2 ${
              isDark ? "bg-[#171922] border-[#282c3c] text-gray-300" : "bg-gray-50 border-gray-200 text-gray-700"
            }`}>
              <p className="font-bold text-sm truncate">{projectToDelete.title}</p>
              <p className="text-[11px] text-gray-400">
                {projectToDelete.clips?.length || 0} AI clips & {Object.keys(projectToDelete.rendered_clips || {}).length} rendered videos associated with this project will be deleted.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                disabled={isDeleting}
                className={`px-5 py-2.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 ${
                  isDark
                    ? "bg-[#171922] hover:bg-[#1f2330] border-[#292d3c] text-gray-300"
                    : "bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-700"
                }`}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmDeleteProject}
                disabled={isDeleting}
                className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Project</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: CLEAR ALL DATA */}
      {showClearAllModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-3xl border p-6 md:p-8 space-y-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150 ${
            isDark ? "bg-[#111319] border-rose-900/50 text-white" : "bg-white border-rose-200 text-gray-900"
          }`}>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500">
                <AlertTriangle className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <h3 className="text-base font-black">Clear All Platform Data?</h3>
                <p className="text-xs text-rose-500 font-semibold">Irreversible Platform Wipe</p>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-2 ${
              isDark ? "bg-rose-950/30 border-rose-900/40 text-rose-200/90" : "bg-rose-50 border-rose-100 text-rose-800"
            }`}>
              <p className="font-bold">Are you sure you want to delete all {projects.length} projects?</p>
              <ul className="list-disc list-inside space-y-1 text-[11px] opacity-90">
                <li>All projects and timeline metadata will be wiped.</li>
                <li>All raw source VODs and rendered clips will be removed.</li>
                <li>All cache will be cleared to 0 Bytes.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowClearAllModal(false)}
                disabled={isClearingAll}
                className={`px-5 py-2.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 ${
                  isDark
                    ? "bg-[#171922] hover:bg-[#1f2330] border-[#292d3c] text-gray-300"
                    : "bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-700"
                }`}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmClearAllData}
                disabled={isClearingAll}
                className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isClearingAll ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Wiping All Data...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Yes, Delete Everything</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
