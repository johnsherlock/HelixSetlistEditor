import type { LibraryEntry, ListResponse, LoadedSetlistResponse, SetlistDraft } from "./types";

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }

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
