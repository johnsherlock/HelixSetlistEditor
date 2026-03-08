export interface LibraryEntry {
  name: string;
  absolutePath: string;
  relativeDirectory: string;
  modifiedAt: string;
  size: number;
}

export interface HlsOuterTemplate {
  schema?: string;
  version?: number;
  encoding?: string;
  meta?: Record<string, unknown>;
  extraOuterFields?: Record<string, unknown>;
}

export interface SetlistDraft {
  sourcePath?: string;
  outerTemplate: HlsOuterTemplate;
  innerJson: Record<string, unknown>;
}

export interface LoadedSetlistResponse {
  file: LibraryEntry;
  draft: SetlistDraft;
  validation: {
    compressionTypeMatches: boolean;
    crc32Matches: boolean;
    decompressedSizeMatches: boolean;
    schemaMatches: boolean;
  };
  summary: {
    setlistName: string | null;
    presetCount: number | null;
  };
}

export interface LoadedPresetResponse {
  file: LibraryEntry;
  preset: {
    schema: string | null;
    version: number | null;
    name: string | null;
    slotData: Record<string, unknown>;
    wrapperMeta: Record<string, unknown>;
  };
}

export interface AppSettings {
  setlistDirectory?: string;
  presetDirectory?: string;
  includeSetlistSubdirectories?: boolean;
  includePresetSubdirectories?: boolean;
}
