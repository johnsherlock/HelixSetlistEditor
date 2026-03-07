export const PRESET_SLOT_COUNT = 128;

export interface SetlistDraftLike {
  sourcePath?: string;
  outerTemplate: {
    schema?: string;
    version?: number;
    encoding?: string;
    meta?: Record<string, unknown>;
    extraOuterFields?: Record<string, unknown>;
  };
  innerJson: Record<string, unknown>;
}

export interface LoadedPresetData {
  relativePath: string;
  name: string;
  slotData: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function getPresetsArray(draft: SetlistDraftLike): unknown[] {
  const innerJson = asRecord(draft.innerJson);
  return Array.isArray(innerJson.presets) ? [...innerJson.presets] : [];
}

function setPresetsArray(draft: SetlistDraftLike, presets: unknown[]): SetlistDraftLike {
  const nextDraft = clone(draft);
  const innerJson = asRecord(nextDraft.innerJson);

  innerJson.presets = presets;
  nextDraft.innerJson = innerJson;

  return nextDraft;
}

export function getPresetNames(draft: SetlistDraftLike | null): string[] {
  if (!draft) {
    return Array.from({ length: PRESET_SLOT_COUNT }, () => "");
  }

  const names = getPresetsArray(draft)
    .slice(0, PRESET_SLOT_COUNT)
    .map((preset) => {
      const meta = asRecord(asRecord(preset).meta);
      return typeof meta.name === "string" ? meta.name : "";
    });

  while (names.length < PRESET_SLOT_COUNT) {
    names.push("");
  }

  return names;
}

export function insertPresetIntoSetlistDraft(
  draft: SetlistDraftLike,
  preset: LoadedPresetData,
  insertIndex: number,
): {
  nextDraft: SetlistDraftLike;
  droppedPresetName: string | null;
  truncatedExistingPreset: boolean;
} {
  const presets = getPresetsArray(draft);
  const normalizedIndex = Math.max(0, Math.min(insertIndex, PRESET_SLOT_COUNT - 1));
  const droppedPreset = presets.length >= PRESET_SLOT_COUNT ? presets[PRESET_SLOT_COUNT - 1] : null;
  const droppedPresetName = (() => {
    if (!droppedPreset) {
      return null;
    }

    const meta = asRecord(asRecord(droppedPreset).meta);
    return typeof meta.name === "string" && meta.name.trim() ? meta.name : null;
  })();

  presets.splice(normalizedIndex, 0, clone(preset.slotData));

  while (presets.length < PRESET_SLOT_COUNT) {
    presets.push({});
  }

  const truncated = presets.length > PRESET_SLOT_COUNT;
  const limitedPresets = presets.slice(0, PRESET_SLOT_COUNT);

  return {
    nextDraft: setPresetsArray(draft, limitedPresets),
    droppedPresetName,
    truncatedExistingPreset: truncated && Boolean(droppedPresetName),
  };
}
