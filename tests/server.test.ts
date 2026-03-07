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
    JSON.stringify({ meta: { name: "Crunch Patch" } }, null, 2),
    "utf8",
  );
  writeFileSync(
    join(presetsDir, "Lead Patch.hlx"),
    JSON.stringify({ meta: { name: "Lead Patch" } }, null, 2),
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
});
