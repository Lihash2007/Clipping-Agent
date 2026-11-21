"use client";

export type StorageLocation = "local" | "gdrive";

export interface GoogleDriveAccount {
  connected: boolean;
  email?: string;
  name?: string;
  avatarUrl?: string;
  folderName: string;
  totalSpaceGb: number; // e.g. 15 GB free
  usedSpaceGb: number;
  autoSyncRenderedClips: boolean;
  connectedAt?: number;
}

const STORAGE_DEST_KEY = "pic_clip_storage_destination_v1";
const GDRIVE_ACCOUNT_KEY = "pic_clip_gdrive_account_v1";

const DEFAULT_GDRIVE_ACCOUNT: GoogleDriveAccount = {
  connected: false,
  folderName: "PIC-CLIP Studio",
  totalSpaceGb: 15.0,
  usedSpaceGb: 2.4,
  autoSyncRenderedClips: true,
};

function notifyStorageChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("pic_clip_storage_updated"));
  }
}

export function getStorageDestination(): StorageLocation {
  return "local";
}

export function setStorageDestination(dest: StorageLocation) {
  // Enforced 100% local disk storage for maximum performance and privacy
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_DEST_KEY, "local");
    notifyStorageChanged();
  } catch (e) {
    console.warn("Failed to set storage destination:", e);
  }
}

export function getGoogleDriveAccount(): GoogleDriveAccount {
  if (typeof window === "undefined") return DEFAULT_GDRIVE_ACCOUNT;
  try {
    const raw = localStorage.getItem(GDRIVE_ACCOUNT_KEY);
    return raw ? { ...DEFAULT_GDRIVE_ACCOUNT, ...JSON.parse(raw) } : DEFAULT_GDRIVE_ACCOUNT;
  } catch {
    return DEFAULT_GDRIVE_ACCOUNT;
  }
}

export function saveGoogleDriveAccount(account: Partial<GoogleDriveAccount>) {
  if (typeof window === "undefined") return;
  try {
    const cur = getGoogleDriveAccount();
    const updated = { ...cur, ...account };
    localStorage.setItem(GDRIVE_ACCOUNT_KEY, JSON.stringify(updated));
    notifyStorageChanged();
  } catch (e) {
    console.warn("Failed to save Google Drive account:", e);
  }
}

/**
 * Connect user's personal Google Drive account
 * In production, triggers Google OAuth 2.0 with drive.file scope:
 * https://www.googleapis.com/auth/drive.file
 */
export function connectGoogleDriveMock(email: string = "creator@gmail.com", name: string = "Stream Creator"): GoogleDriveAccount {
  const connected: GoogleDriveAccount = {
    connected: true,
    email,
    name,
    avatarUrl: undefined,
    folderName: "PIC-CLIP Studio",
    totalSpaceGb: 15.0,
    usedSpaceGb: 3.1,
    autoSyncRenderedClips: true,
    connectedAt: Date.now(),
  };
  saveGoogleDriveAccount(connected);
  setStorageDestination("gdrive");
  return connected;
}

export function disconnectGoogleDrive() {
  saveGoogleDriveAccount({
    connected: false,
    email: undefined,
    name: undefined,
  });
  setStorageDestination("local");
}
