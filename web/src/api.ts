import type { LibraryEntry, ListResponse, LoadedPresetResponse, LoadedSetlistResponse, SetlistDraft } from "./types";

function debugApi(message: string, details?: unknown): void {
  console.info(`[helix-api] ${message}`, details ?? "");
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  debugApi("request", {
    input: String(input),
    method: init?.method ?? "GET",
  });

  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const responseText = await response.text();
  const payload = (() => {
    if (!responseText.trim()) {
      return {} as T & { error?: string };
    }

    try {
      return JSON.parse(responseText) as T & { error?: string };
    } catch {
      return {
        error: responseText,
      } as T & { error?: string };
    }
  })();

  if (!response.ok) {
    console.error("[helix-api] request failed", {
      input: String(input),
      method: init?.method ?? "GET",
      status: response.status,
      statusText: response.statusText,
      payload,
    });
    throw new Error(payload.error ?? "Request failed.");
  }

  debugApi("response", {
    input: String(input),
    method: init?.method ?? "GET",
    status: response.status,
  });

  return payload;
}

export async function fetchSetlists(homeDir: string): Promise<LibraryEntry[]> {
  const params = new URLSearchParams({ homeDir });
  const response = await requestJson<ListResponse>(`/api/setlists?${params.toString()}`);
  return response.items;
}

export async function fetchPresets(homeDir: string): Promise<LibraryEntry[]> {
  const params = new URLSearchParams({ homeDir });
  const response = await requestJson<ListResponse>(`/api/presets?${params.toString()}`);
  return response.items;
}

export async function loadSetlist(homeDir: string, relativePath: string): Promise<LoadedSetlistResponse> {
  const params = new URLSearchParams({ homeDir, relativePath });
  return requestJson<LoadedSetlistResponse>(`/api/setlists/load?${params.toString()}`);
}

export async function loadPreset(homeDir: string, relativePath: string): Promise<LoadedPresetResponse> {
  const params = new URLSearchParams({ homeDir, relativePath });
  return requestJson<LoadedPresetResponse>(`/api/presets/load?${params.toString()}`);
}

export async function saveSetlist(input: {
  homeDir: string;
  relativePath: string;
  overwrite?: boolean;
  draft: SetlistDraft;
}): Promise<LibraryEntry> {
  const response = await requestJson<{ file: LibraryEntry }>("/api/setlists/save", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.file;
}

export async function deleteSetlist(homeDir: string, relativePath: string): Promise<void> {
  const params = new URLSearchParams({ homeDir, relativePath });
  debugApi("delete setlist", { homeDir, relativePath });
  await requestJson<{ ok: true }>(`/api/setlists?${params.toString()}`, {
    method: "DELETE",
  });
}
