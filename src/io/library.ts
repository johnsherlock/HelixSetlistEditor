import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

import {
  createOuterTemplate,
  decodeHlsFile,
  encodeHlsFile,
  type HlsOuterTemplate,
  type HlsValidationResult,
} from "../core/index.js";

export interface LibraryEntry {
  name: string;
  relativePath: string;
  modifiedAt: string;
  size: number;
}

export interface SetlistDraft<TInner = unknown> {
  sourcePath?: string;
  outerTemplate: HlsOuterTemplate;
  innerJson: TInner;
}

export interface LoadedSetlist<TInner = unknown> {
  file: LibraryEntry;
  draft: SetlistDraft<TInner>;
  validation: HlsValidationResult;
  summary: {
    setlistName: string | null;
    presetCount: number | null;
  };
}

export interface SaveSetlistInput<TInner = unknown> {
  relativePath: string;
  overwrite?: boolean;
  draft: SetlistDraft<TInner>;
}

export interface LoadedPreset {
  file: LibraryEntry;
  preset: {
    schema: string | null;
    version: number | null;
    name: string | null;
    slotData: Record<string, unknown>;
    wrapperMeta: Record<string, unknown>;
  };
}

const COLLECTIONS = {
  presets: { directoryName: "Presets", extension: ".hlx" },
  setlists: { directoryName: "Setlists", extension: ".hls" },
} as const;

type CollectionName = keyof typeof COLLECTIONS;

export class HelixLibraryService {
  constructor(private readonly homeDir: string) {}

  getHomeDir(): string {
    return this.homeDir;
  }

  getCollectionDir(collection: CollectionName): string {
    return resolve(this.homeDir, COLLECTIONS[collection].directoryName);
  }

  async listSetlists(): Promise<LibraryEntry[]> {
    return this.listCollection("setlists");
  }

  async listPresets(): Promise<LibraryEntry[]> {
    return this.listCollection("presets");
  }

  async loadSetlist<TInner = unknown>(relativePath: string): Promise<LoadedSetlist<TInner>> {
    const absolutePath = this.resolveCollectionPath("setlists", relativePath);
    const fileBuffer = await readFile(absolutePath);
    const fileStats = await stat(absolutePath);
    const decoded = decodeHlsFile<TInner>(fileBuffer);
    const innerRecord = this.asRecord(decoded.innerJson);
    const metaRecord = this.asRecord(innerRecord.meta);
    const presets = Array.isArray(innerRecord.presets) ? innerRecord.presets : null;

    return {
      file: {
        name: this.getBaseName(relativePath),
        relativePath,
        modifiedAt: fileStats.mtime.toISOString(),
        size: fileStats.size,
      },
      draft: {
        sourcePath: relativePath,
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

  async loadPreset(relativePath: string): Promise<LoadedPreset> {
    const absolutePath = this.resolveCollectionPath("presets", relativePath);
    const fileBuffer = await readFile(absolutePath, "utf8");
    const fileStats = await stat(absolutePath);
    const parsed = JSON.parse(fileBuffer) as Record<string, unknown>;
    const data = this.asRecord(parsed.data);
    const dataMeta = this.asRecord(data.meta);

    return {
      file: {
        name: this.getBaseName(relativePath),
        relativePath,
        modifiedAt: fileStats.mtime.toISOString(),
        size: fileStats.size,
      },
      preset: {
        schema: typeof parsed.schema === "string" ? parsed.schema : null,
        version: typeof parsed.version === "number" ? parsed.version : null,
        name: typeof dataMeta.name === "string" ? dataMeta.name : null,
        slotData: data,
        wrapperMeta: this.asRecord(parsed.meta),
      },
    };
  }

  async saveSetlist<TInner = unknown>(input: SaveSetlistInput<TInner>): Promise<LibraryEntry> {
    const absolutePath = this.resolveCollectionPath("setlists", input.relativePath);
    const parentDir = resolve(absolutePath, "..");
    const fileAlreadyExists = await this.pathExists(absolutePath);

    if (fileAlreadyExists && !input.overwrite) {
      throw new Error(`Refusing to overwrite existing file: ${input.relativePath}`);
    }

    await mkdir(parentDir, { recursive: true });

    const output = encodeHlsFile(input.draft.innerJson, input.draft.outerTemplate);
    await writeFile(absolutePath, output, "utf8");

    const fileStats = await stat(absolutePath);

    return {
      name: this.getBaseName(input.relativePath),
      relativePath: input.relativePath,
      modifiedAt: fileStats.mtime.toISOString(),
      size: fileStats.size,
    };
  }

  async deleteSetlist(relativePath: string): Promise<void> {
    const absolutePath = this.resolveCollectionPath("setlists", relativePath);
    await unlink(absolutePath);
  }

  private async listCollection(collection: CollectionName): Promise<LibraryEntry[]> {
    const collectionDir = this.getCollectionDir(collection);
    const entries = await this.walkDirectory(collectionDir);
    const filteredEntries = await Promise.all(
      entries
        .filter((filePath) => extname(filePath).toLowerCase() === COLLECTIONS[collection].extension)
        .map(async (filePath) => {
          const fileStats = await stat(filePath);
          const relativePath = relative(collectionDir, filePath);

          return {
            name: this.getBaseName(relativePath),
            relativePath,
            modifiedAt: fileStats.mtime.toISOString(),
            size: fileStats.size,
          } satisfies LibraryEntry;
        }),
    );

    return filteredEntries.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath, undefined, { sensitivity: "base" }),
    );
  }

  private async walkDirectory(directoryPath: string): Promise<string[]> {
    if (!(await this.pathExists(directoryPath))) {
      return [];
    }

    const directoryEntries = await readdir(directoryPath, { withFileTypes: true });
    const nested = await Promise.all(
      directoryEntries.map(async (entry) => {
        const entryPath = join(directoryPath, entry.name);

        if (entry.isDirectory()) {
          return this.walkDirectory(entryPath);
        }

        if (entry.isFile()) {
          return [entryPath];
        }

        return [];
      }),
    );

    return nested.flat();
  }

  private resolveCollectionPath(collection: CollectionName, relativePath: string): string {
    const baseDir = this.getCollectionDir(collection);
    const absolutePath = resolve(baseDir, relativePath);
    const relativeToBase = relative(baseDir, absolutePath);

    if (relativeToBase.startsWith("..") || relativeToBase.startsWith("/")) {
      throw new Error(`Path escapes ${COLLECTIONS[collection].directoryName}: ${relativePath}`);
    }

    return absolutePath;
  }

  private async pathExists(pathToCheck: string): Promise<boolean> {
    try {
      await stat(pathToCheck);
      return true;
    } catch {
      return false;
    }
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  }

  private getBaseName(relativePath: string): string {
    return relativePath.replace(/\.[^.]+$/, "");
  }
}
