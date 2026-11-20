import { ProjectItem, JobStatus } from "./types";

export const API_BASE = "";

function cleanErrorString(raw: string): string {
  if (!raw || typeof raw !== "string") {
    return "Operation could not be completed. Please verify backend connection and parameters.";
  }
  let s = raw.trim();

  // Strip out any literal "[object Object]" or variations
  s = s.replace(/\[object Object\]/gi, "").replace(/\[object [a-zA-Z0-9_]+\]/gi, "").trim();

  // If nothing left or raw empty JSON brackets or invalid placeholders
  if (
    !s ||
    s === "{}" ||
    s === "[]" ||
    s === '""' ||
    s === "null" ||
    s === "undefined" ||
    s === '{"error":{}}' ||
    s === '{"message":{}}' ||
    s === '{"detail":{}}' ||
    s.toLowerCase() === "object object" ||
    /^{\s*"(error|detail|message)"\s*:\s*\{\s*\}\s*}$/i.test(s)
  ) {
    return "Operation could not be completed. Please verify inputs and check if backend is running.";
  }

  // Common network / fetch failures
  if (
    s.toLowerCase().includes("failed to fetch") ||
    s.toLowerCase().includes("networkerror") ||
    s.toLowerCase().includes("connection refused") ||
    s.toLowerCase().includes("unable to connect")
  ) {
    return "Backend server is offline or unreachable. Please verify backend service on port 8000.";
  }

  return s;
}

export function formatErrorMessage(err: any): string {
  if (!err) return "An unexpected error occurred.";

  // If already a string
  if (typeof err === "string") {
    return cleanErrorString(err);
  }

  // Handle Error instances
  if (err instanceof Error) {
    return cleanErrorString(err.message || err.toString());
  }

  // If it's an object, deeply inspect
  if (typeof err === "object") {
    // 1. FastAPI detail field (string, array, or object)
    if (err.detail !== undefined && err.detail !== null) {
      if (typeof err.detail === "string") {
        return cleanErrorString(err.detail);
      }
      if (Array.isArray(err.detail)) {
        const msgs = err.detail
          .map((d: any) => {
            if (!d) return "";
            if (typeof d === "string") return cleanErrorString(d);
            if (d.msg && d.loc) {
              const field = Array.isArray(d.loc)
                ? d.loc.filter((x: any) => x !== "body").join(".")
                : "";
              return field ? `${field}: ${d.msg}` : d.msg;
            }
            if (d.msg) return String(d.msg);
            if (d.message) return String(d.message);
            return "";
          })
          .filter(Boolean);

        if (msgs.length > 0) return cleanErrorString(msgs.join("; "));
      }
      if (typeof err.detail === "object") {
        if (typeof err.detail.message === "string") return cleanErrorString(err.detail.message);
        if (typeof err.detail.error === "string") return cleanErrorString(err.detail.error);
        if (typeof err.detail.msg === "string") return cleanErrorString(err.detail.msg);
      }
    }

    // 2. Standard error / message properties
    if (typeof err.message === "string") {
      return cleanErrorString(err.message);
    }
    if (typeof err.error === "string") {
      return cleanErrorString(err.error);
    }
    if (err.error && typeof err.error === "object") {
      if (typeof err.error.message === "string") return cleanErrorString(err.error.message);
      if (typeof err.error.detail === "string") return cleanErrorString(err.error.detail);
    }

    // 3. HTTP status text
    if (err.statusText && typeof err.statusText === "string") {
      return cleanErrorString(`Server responded with ${err.statusText} (${err.status || 500})`);
    }

    // 4. Try JSON serialization
    try {
      const s = JSON.stringify(err);
      if (s && s !== "{}" && s !== "[]") {
        return cleanErrorString(s);
      }
    } catch {
      // ignore
    }
  }

  // Final fallback
  try {
    return cleanErrorString(String(err));
  } catch {
    return "Operation could not be completed. Please verify source media and try again.";
  }
}

export function safeErrorText(err: any): string {
  if (!err) return "An unexpected error occurred.";
  const text = formatErrorMessage(err);
  if (!text || text.includes("[object") || text.toLowerCase().includes("object object")) {
    return "Action failed. Please verify backend service on port 8000 and try again.";
  }
  return text;
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`/api/health`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchProjects(): Promise<ProjectItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/projects`, { cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error("fetchProjects error:", e);
    return [];
  }
}

export async function fetchProjectById(projectId: string): Promise<ProjectItem | null> {
  try {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error(`fetchProjectById error for ${projectId}:`, e);
    return null;
  }
}

export async function deleteProjectById(projectId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}`, { method: "DELETE" });
    return res.ok;
  } catch (e) {
    console.error(`deleteProjectById error for ${projectId}:`, e);
    return false;
  }
}

export async function getJobStatus(jobId: string): Promise<JobStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/api/jobs/${jobId}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error(`getJobStatus error for ${jobId}:`, e);
    return null;
  }
}

export async function cancelJob(jobId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/jobs/${jobId}/cancel`, { method: "POST" });
    return res.ok;
  } catch (e) {
    console.error(`cancelJob error for ${jobId}:`, e);
    return false;
  }
}

export interface StreamConnectivityResult {
  online: boolean;
  is_live: boolean;
  platform: string;
  name: string;
  title: string;
  author: string;
  category: string;
  qualities: string[];
  error?: string | null;
}

export async function checkStreamConnectivity(url: string): Promise<StreamConnectivityResult | null> {
  try {
    const res = await fetch(`/api/stream/check?url=${encodeURIComponent(url.trim())}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error("checkStreamConnectivity error:", e);
    return null;
  }
}

export interface StorageStatus {
  status: string;
  total_bytes: number;
  formatted_size: string;
  upload_bytes: number;
  output_bytes: number;
  upload_count: number;
  output_count: number;
}

export async function fetchStorageStatus(): Promise<StorageStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/api/storage/status`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error("fetchStorageStatus error:", e);
    return null;
  }
}

export async function clearStorageCache(): Promise<{ success: boolean; message: string; remaining_formatted: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/storage/clear_cache`, { method: "POST" });
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      const detail = errData ? formatErrorMessage(errData) : `Server error (HTTP ${res.status})`;
      throw new Error(detail);
    }
    const data = await res.json();
    return {
      success: true,
      message: data.message || `Cleaned temporary files.`,
      remaining_formatted: data.remaining_formatted || "0 B (Clean)"
    };
  } catch (e: any) {
    console.error("clearStorageCache error:", e);
    return {
      success: false,
      message: safeErrorText(e?.message || e),
      remaining_formatted: "Error"
    };
  }
}

export async function clearAllPlatformData(): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/storage/clear_all_data`, { method: "POST" });
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      const detail = errData ? formatErrorMessage(errData) : `Server error (HTTP ${res.status})`;
      throw new Error(detail);
    }
    const data = await res.json();
    return {
      success: true,
      message: data.message || "All platform data wiped successfully."
    };
  } catch (e: any) {
    console.error("clearAllPlatformData error:", e);
    return {
      success: false,
      message: safeErrorText(e?.message || e)
    };
  }
}
