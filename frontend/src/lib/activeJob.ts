export interface ActiveJobInfo {
  jobId: string;
  job_id?: string;
  type: string;
  title?: string;
  startedAt?: number;
  startTime?: number;
  progress?: number;
  stage?: string;
}

export type ActiveJobState = ActiveJobInfo;

const STORAGE_KEY = "pic_clip_active_job";
const LAST_PROJECT_KEY = "pic_clip_active_project_id";

export function saveActiveJob(job: Partial<ActiveJobInfo> & { job_id?: string; jobId?: string; type: string }): void {
  if (typeof window === "undefined") return;
  try {
    const normalized: ActiveJobInfo = {
      jobId: job.jobId || job.job_id || "",
      job_id: job.job_id || job.jobId || "",
      type: job.type,
      title: job.title,
      startedAt: job.startedAt || job.startTime || Date.now(),
      startTime: job.startTime || job.startedAt || Date.now(),
      progress: job.progress || 5,
      stage: job.stage || "Processing..."
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new Event("active_job_updated"));
  } catch (e) {
    console.warn("Failed to save active job:", e);
  }
}

export function getActiveJob(): ActiveJobInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.job_id && parsed.jobId) parsed.job_id = parsed.jobId;
    if (!parsed.jobId && parsed.job_id) parsed.jobId = parsed.job_id;
    return parsed;
  } catch {
    return null;
  }
}

export function updateActiveJobProgress(progress: number, stage?: string): void {
  if (typeof window === "undefined") return;
  try {
    const job = getActiveJob();
    if (job) {
      job.progress = progress;
      if (stage) job.stage = stage;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(job));
      window.dispatchEvent(new Event("active_job_updated"));
    }
  } catch (e) {
    console.warn("Failed to update active job:", e);
  }
}

export function clearActiveJob(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("active_job_updated"));
  } catch (e) {
    console.warn("Failed to clear active job:", e);
  }
}

export function saveLastActiveProjectId(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_PROJECT_KEY, projectId);
  } catch (e) {
    console.warn("Failed to save last project ID:", e);
  }
}

export function getLastActiveProjectId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

export function clearLastActiveProjectId(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LAST_PROJECT_KEY);
  } catch (e) {
    console.warn("Failed to clear last project ID:", e);
  }
}
