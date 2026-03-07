import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { decodeHlsFile } from "../src/core/index.js";
import {
  insertPresetIntoSetlistDraft,
  movePresetWithinSetlistDraft,
  removePresetFromSetlistDraft,
} from "../src/domain/index.js";

const setlistFixturePath = resolve(process.cwd(), "tests", "fixtures", "IMGL Fibs.hls");
const presetFixture = {
  relativePath: "Boulevard.hlx",
  name: "Boulevard",
  slotData: JSON.parse(readFileSync("/Users/john/Documents/Line 6/Tones/Helix/Presets/Boulevard.hlx", "utf8")).data,
};

describe("setlist domain helpers", () => {
  it("inserts a preset and shifts the existing rows down", () => {
    const decoded = decodeHlsFile<Record<string, unknown>>(readFileSync(setlistFixturePath));
    const originalPresets = (decoded.innerJson.presets as Array<{ meta?: { name?: string } }>).map((preset) => preset.meta?.name ?? "");
    const { nextDraft } = insertPresetIntoSetlistDraft(
      {
        sourcePath: "IMGL Fibs.hls",
        outerTemplate: {
          schema: decoded.outer.schema,
          version: decoded.outer.version,
          encoding: decoded.outer.encoding,
          meta: decoded.outer.meta,
        },
        innerJson: decoded.innerJson,
      },
      presetFixture,
      1,
    );
    const nextPresets = (nextDraft.innerJson.presets as Array<{ meta?: { name?: string } }>).map((preset) => preset.meta?.name ?? "");

    expect(nextPresets).toHaveLength(128);
    expect(nextPresets[0]).toBe(originalPresets[0]);
    expect(nextPresets[1]).toBe("Boulevard");
    expect(nextPresets[2]).toBe(originalPresets[1]);
    expect(nextPresets[3]).toBe(originalPresets[2]);
  });

  it("truncates the last row when inserting into a full 128-slot setlist", () => {
    const decoded = decodeHlsFile<Record<string, unknown>>(readFileSync(setlistFixturePath));
    const originalPresets = decoded.innerJson.presets as Array<{ meta?: { name?: string } }>;
    const originalLastName = originalPresets[127]?.meta?.name ?? null;
    const { nextDraft, droppedPresetName, truncatedExistingPreset } = insertPresetIntoSetlistDraft(
      {
        sourcePath: "IMGL Fibs.hls",
        outerTemplate: {
          schema: decoded.outer.schema,
          version: decoded.outer.version,
          encoding: decoded.outer.encoding,
          meta: decoded.outer.meta,
        },
        innerJson: decoded.innerJson,
      },
      presetFixture,
      0,
    );
    const nextPresets = nextDraft.innerJson.presets as Array<{ meta?: { name?: string } }>;

    expect(nextPresets).toHaveLength(128);
    expect(nextPresets[0]?.meta?.name).toBe("Boulevard");
    expect(droppedPresetName).toBe(originalLastName);
    expect(truncatedExistingPreset).toBe(Boolean(originalLastName));
  });

  it("moves a preset to a new position and shifts the range around it", () => {
    const decoded = decodeHlsFile<Record<string, unknown>>(readFileSync(setlistFixturePath));
    const originalPresets = decoded.innerJson.presets as Array<{ meta?: { name?: string } }>;
    const moved = movePresetWithinSetlistDraft(
      {
        sourcePath: "IMGL Fibs.hls",
        outerTemplate: {
          schema: decoded.outer.schema,
          version: decoded.outer.version,
          encoding: decoded.outer.encoding,
          meta: decoded.outer.meta,
        },
        innerJson: decoded.innerJson,
      },
      0,
      3,
    );
    const names = (moved.innerJson.presets as Array<{ meta?: { name?: string } }>).map((preset) => preset.meta?.name ?? "");

    expect(names[0]).toBe(originalPresets[1]?.meta?.name ?? "");
    expect(names[1]).toBe(originalPresets[2]?.meta?.name ?? "");
    expect(names[2]).toBe(originalPresets[0]?.meta?.name ?? "");
    expect(names).toHaveLength(128);
  });

  it("removes a preset, shifts rows up, and blanks the last slot", () => {
    const decoded = decodeHlsFile<Record<string, unknown>>(readFileSync(setlistFixturePath));
    const originalPresets = decoded.innerJson.presets as Array<{ meta?: { name?: string } }>;
    const removed = removePresetFromSetlistDraft(
      {
        sourcePath: "IMGL Fibs.hls",
        outerTemplate: {
          schema: decoded.outer.schema,
          version: decoded.outer.version,
          encoding: decoded.outer.encoding,
          meta: decoded.outer.meta,
        },
        innerJson: decoded.innerJson,
      },
      0,
    );
    const names = (removed.innerJson.presets as Array<{ meta?: { name?: string } }>).map((preset) => preset.meta?.name ?? "");

    expect(names[0]).toBe(originalPresets[1]?.meta?.name ?? "");
    expect(names[126]).toBe(originalPresets[127]?.meta?.name ?? "");
    expect(names[127]).toBe("");
    expect(names).toHaveLength(128);
  });
});
