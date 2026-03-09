import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

export type AvailableAppUpdate = Update;
export type AppUpdateDownloadEvent = DownloadEvent;

export async function checkForAppUpdate(): Promise<AvailableAppUpdate | null> {
  if (import.meta.env.DEV) {
    return null;
  }

  try {
    return await check();
  } catch (error) {
    console.warn("[helix-updater] update check failed", error);
    return null;
  }
}

export async function installAppUpdate(
  update: AvailableAppUpdate,
  onEvent?: (event: AppUpdateDownloadEvent) => void,
): Promise<void> {
  await update.downloadAndInstall(onEvent);
  await relaunch();
}
