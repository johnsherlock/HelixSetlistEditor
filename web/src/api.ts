import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

import { createOuterTemplate, decodeHlsFile, encodeHlsFile } from "../../src/core/index.js";
import type {
  AppSettings,
  LibraryEntry,
  LoadedPresetResponse,
  LoadedSetlistResponse,
  SetlistDraft,
} from "./types";

const APP_SETTINGS_KEY = "helix-setlist-editor:desktop-settings";

function debugDesktop(message: string, details?: unknown): void {
  console.info(`[helix-desktop] ${message}`, details ?? "");
}

function getBaseName(absolutePath: string): string {
  return absolutePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? absolutePath;
}

function normalizeDirectoryResult(result: string | string[] | null): string | null {
  if (!result) {
    return null;
  }

  return Array.isArray(result) ? (result[0] ?? null) : result;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

async function invokeCommand<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
  debugDesktop(`invoke ${command}`, payload);
  try {
    return await invoke<T>(command, payload);
  } catch (error) {
    console.error(`[helix-desktop] ${command} failed`, { payload, error });
    throw error;
  }
}

export async function pickSetlistDirectory(): Promise<string | null> {
  return normalizeDirectoryResult(
    await open({
      directory: true,
      multiple: false,
      title: "Select Setlist Directory",
    }),
  );
}

export async function pickPresetDirectory(): Promise<string | null> {
  return normalizeDirectoryResult(
    await open({
      directory: true,
      multiple: false,
      title: "Select Preset Directory",
    }),
  );
}

export async function listSetlists(directory: string, includeSubdirectories: boolean): Promise<LibraryEntry[]> {
  return invokeCommand<LibraryEntry[]>("list_library_entries", {
    directory,
    extension: ".hls",
    includeSubdirectories,
  });
}

export async function listPresets(directory: string, includeSubdirectories: boolean): Promise<LibraryEntry[]> {
  return invokeCommand<LibraryEntry[]>("list_library_entries", {
    directory,
    extension: ".hlx",
    includeSubdirectories,
  });
}

export async function loadSetlist(absolutePath: string): Promise<LoadedSetlistResponse> {
  const fileText = await invokeCommand<string>("read_text_file", { absolutePath });
  const decoded = decodeHlsFile<Record<string, unknown>>(fileText);
  const innerRecord = asRecord(decoded.innerJson);
  const metaRecord = asRecord(innerRecord.meta);
  const presets = Array.isArray(innerRecord.presets) ? innerRecord.presets : null;

  return {
    file: {
      name: getBaseName(absolutePath),
      absolutePath,
      relativeDirectory: "",
      modifiedAt: "",
      size: fileText.length,
    },
    draft: {
      sourcePath: absolutePath,
      outerTemplate: createOuterTemplate(decoded.outer),
      innerJson: decoded.innerJson,
    },
    validation: decoded.validation,
    summary: {
      setlistName: typeof metaRecord.name === "string" ? metaRecord.name : null,
      presetCount: presets?.length ?? null,
    },
  };
}

export async function loadPreset(absolutePath: string): Promise<LoadedPresetResponse> {
  const fileText = await invokeCommand<string>("read_text_file", { absolutePath });
  const parsed = JSON.parse(fileText) as Record<string, unknown>;
  const slotData = asRecord(parsed.data);
  const slotMeta = asRecord(slotData.meta);

  return {
    file: {
      name: getBaseName(absolutePath),
      absolutePath,
      relativeDirectory: "",
      modifiedAt: "",
      size: fileText.length,
    },
    preset: {
      schema: typeof parsed.schema === "string" ? parsed.schema : null,
      version: typeof parsed.version === "number" ? parsed.version : null,
      name: typeof slotMeta.name === "string" ? slotMeta.name : null,
      slotData,
      wrapperMeta: asRecord(parsed.meta),
    },
  };
}

export async function saveSetlist(input: {
  absolutePath: string;
  overwrite?: boolean;
  draft: SetlistDraft;
}): Promise<LibraryEntry> {
  const fileText = encodeHlsFile(input.draft.innerJson, input.draft.outerTemplate);

  await invokeCommand<void>("write_text_file", {
    absolutePath: input.absolutePath,
    contents: fileText,
    overwrite: input.overwrite ?? false,
  });

  return {
    name: getBaseName(input.absolutePath),
    absolutePath: input.absolutePath,
    relativeDirectory: "",
    modifiedAt: "",
    size: fileText.length,
  };
}

export async function saveSetlistAs(input: {
  draft: SetlistDraft;
  suggestedFileName: string;
  initialDirectory?: string | null;
}): Promise<LibraryEntry | null> {
  const selectedPath = await save({
    title: "Save Helix Setlist",
    defaultPath: input.initialDirectory
      ? `${input.initialDirectory.replace(/[\\/]$/, "")}/${input.suggestedFileName}`
      : input.suggestedFileName,
    filters: [{ name: "Helix Setlist", extensions: ["hls"] }],
  });

  if (!selectedPath) {
    return null;
  }

  return saveSetlist({
    absolutePath: selectedPath,
    overwrite: true,
    draft: input.draft,
  });
}

export async function deleteSetlist(absolutePath: string): Promise<void> {
  await invokeCommand<void>("move_file_to_trash", { absolutePath });
}

export async function loadBlankTemplate(): Promise<SetlistDraft> {
  const fileText = await invokeCommand<string>("load_blank_template");
  const decoded = decodeHlsFile<Record<string, unknown>>(fileText);

  return {
    outerTemplate: createOuterTemplate(decoded.outer),
    innerJson: decoded.innerJson,
  };
}

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const raw = localStorage.getItem(APP_SETTINGS_KEY);

    if (!raw) {
      return {};
    }

    return JSON.parse(raw) as AppSettings;
  } catch {
    return {};
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
}

export async function resetAppSettings(): Promise<void> {
  localStorage.removeItem(APP_SETTINGS_KEY);
}
