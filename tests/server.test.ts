import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { decodeHlsFile } from "../src/core/index.js";
import { createApp } from "../src/server/app.js";

const fixturePath = resolve(process.cwd(), "tests", "fixtures", "IMGL Fibs.hls");

const temporaryHomes: string[] = [];

function createTempHelixHome(): string {
  const homeDir = mkdtempSync(join(tmpdir(), "helix-setlist-editor-"));
  const setlistsDir = join(homeDir, "Setlists");
  const presetsDir = join(homeDir, "Presets");

  mkdirSync(setlistsDir, { recursive: true });
  mkdirSync(presetsDir, { recursive: true });
  copyFileSync(fixturePath, join(setlistsDir, "IMGL Fibs.hls"));
  writeFileSync(
    join(presetsDir, "Crunch Patch.hlx"),
    JSON.stringify(
      {
        schema: "L6Preset",
        version: 6,
        meta: { original: 0, pbn: 0, premium: 0 },
        data: {
          meta: { name: "Crunch Patch", build_sha: "test" },
          device: 2162689,
          device_version: 58720256,
          tone: { dsp0: {} },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(
    join(presetsDir, "Lead Patch.hlx"),
    JSON.stringify(
      {
        schema: "L6Preset",
        version: 6,
        meta: { original: 0, pbn: 0, premium: 0 },
        data: {
          meta: { name: "Lead Patch", build_sha: "test" },
          device: 2162689,
          device_version: 58720256,
          tone: { dsp0: {} },
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  temporaryHomes.push(homeDir);

  return homeDir;
}

afterEach(() => {
  while (temporaryHomes.length > 0) {
    const homeDir = temporaryHomes.pop();

    if (homeDir) {
      rmSync(homeDir, { recursive: true, force: true });
    }
  }
});

describe("Fastify file API", () => {
  it("lists available setlists and presets for a Helix home directory", async () => {
    const homeDir = createTempHelixHome();
    const app = createApp();

    const setlistsResponse = await app.inject({
      method: "GET",
      url: "/api/setlists",
      query: { homeDir },
    });
    const presetsResponse = await app.inject({
      method: "GET",
      url: "/api/presets",
      query: { homeDir },
    });

    expect(setlistsResponse.statusCode).toBe(200);
    expect(presetsResponse.statusCode).toBe(200);
    expect(setlistsResponse.json().items).toHaveLength(1);
    expect(setlistsResponse.json().items[0].relativePath).toBe("IMGL Fibs.hls");
    expect(presetsResponse.json().items.map((item: { relativePath: string }) => item.relativePath)).toEqual([
      "Crunch Patch.hlx",
      "Lead Patch.hlx",
    ]);

    await app.close();
  });

  it("loads a setlist into a reusable draft contract", async () => {
    const homeDir = createTempHelixHome();
    const app = createApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/setlists/load",
      query: { homeDir, relativePath: "IMGL Fibs.hls" },
    });
    const payload = response.json();

    expect(response.statusCode).toBe(200);
    expect(payload.file.relativePath).toBe("IMGL Fibs.hls");
    expect(payload.draft.sourcePath).toBe("IMGL Fibs.hls");
    expect(payload.draft.outerTemplate.schema).toBe("L6Setlist");
    expect(payload.summary.setlistName).toBe("IMGL Fibs");
    expect(payload.summary.presetCount).toBe(128);
    expect(payload.validation.crc32Matches).toBe(true);

    await app.close();
  });

  it("loads a preset into slot-ready data", async () => {
    const homeDir = createTempHelixHome();
    const app = createApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/presets/load",
      query: { homeDir, relativePath: "Crunch Patch.hlx" },
    });
    const payload = response.json();

    expect(response.statusCode).toBe(200);
    expect(payload.file.relativePath).toBe("Crunch Patch.hlx");
    expect(payload.preset.schema).toBe("L6Preset");
    expect(payload.preset.name).toBe("Crunch Patch");
    expect(payload.preset.slotData.meta.name).toBe("Crunch Patch");
    expect(payload.preset.slotData.tone).toEqual({ dsp0: {} });

    await app.close();
  });

  it("saves a modified draft to a new file and refuses overwrite without confirmation", async () => {
    const homeDir = createTempHelixHome();
    const app = createApp();
    const loadResponse = await app.inject({
      method: "GET",
      url: "/api/setlists/load",
      query: { homeDir, relativePath: "IMGL Fibs.hls" },
    });
    const loaded = loadResponse.json();

    loaded.draft.innerJson.meta.name = "IMGL Fibs Copy";

    const saveAsResponse = await app.inject({
      method: "POST",
      url: "/api/setlists/save",
      payload: {
        homeDir,
        relativePath: "IMGL Fibs Copy.hls",
        draft: loaded.draft,
      },
    });

    expect(saveAsResponse.statusCode).toBe(200);

    const savedFile = decodeHlsFile(readFileSync(resolve(homeDir, "Setlists", "IMGL Fibs Copy.hls")));

    expect((savedFile.innerJson as { meta?: { name?: string } }).meta?.name).toBe("IMGL Fibs Copy");

    const overwriteBlockedResponse = await app.inject({
      method: "POST",
      url: "/api/setlists/save",
      payload: {
        homeDir,
        relativePath: "IMGL Fibs Copy.hls",
        draft: loaded.draft,
      },
    });

    expect(overwriteBlockedResponse.statusCode).toBe(400);
    expect(overwriteBlockedResponse.json().error).toContain("Refusing to overwrite existing file");

    const overwriteAllowedResponse = await app.inject({
      method: "POST",
      url: "/api/setlists/save",
      payload: {
        homeDir,
        relativePath: "IMGL Fibs Copy.hls",
        overwrite: true,
        draft: loaded.draft,
      },
    });

    expect(overwriteAllowedResponse.statusCode).toBe(200);

    await app.close();
  });

  it("deletes a setlist file from disk", async () => {
    const homeDir = createTempHelixHome();
    const app = createApp();

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/api/setlists",
      query: { homeDir, relativePath: "IMGL Fibs.hls" },
    });
    const listResponse = await app.inject({
      method: "GET",
      url: "/api/setlists",
      query: { homeDir },
    });

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({ ok: true });
    expect(listResponse.json().items).toHaveLength(0);

    await app.close();
  });
});
