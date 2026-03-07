import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { computeCrc32, decodeHlsFile, rebuildHlsFile } from "../src/core/index.js";

interface SampleInnerSetlist {
  meta?: {
    name?: string;
  };
  presets: Array<{
    meta?: {
      name?: string;
    };
  }>;
}

const fixturePath = resolve(process.cwd(), "tests", "fixtures", "IMGL Fibs.hls");

describe("hls codec", () => {
  it("decodes the sample file and validates the wrapper metadata", () => {
    const fixture = readFileSync(fixturePath);
    const decoded = decodeHlsFile<SampleInnerSetlist>(fixture);

    expect(decoded.outer.schema).toBe("L6Setlist");
    expect(decoded.outer.compression.type).toBe("zlib");
    expect(decoded.validation).toEqual({
      compressionTypeMatches: true,
      crc32Matches: true,
      decompressedSizeMatches: true,
      schemaMatches: true,
    });
    expect(decoded.computed.crc32).toBe(2904027426);
    expect(decoded.computed.decompressedSize).toBe(3025464);
    expect(decoded.innerJson.meta?.name).toBe("IMGL Fibs");
    expect(decoded.innerJson.presets).toHaveLength(128);
    expect(decoded.innerJson.presets[0]?.meta?.name).toBe("Archetype");
  });

  it("rebuilds the same file without changes and preserves wrapper invariants", () => {
    const fixture = readFileSync(fixturePath);
    const decoded = decodeHlsFile<SampleInnerSetlist>(fixture);
    const rebuiltText = rebuildHlsFile(decoded);
    const rebuilt = decodeHlsFile<SampleInnerSetlist>(rebuiltText);

    expect(rebuilt.outer.schema).toBe(decoded.outer.schema);
    expect(rebuilt.outer.encoding).toBe(decoded.outer.encoding);
    expect(rebuilt.outer.version).toBe(decoded.outer.version);
    expect(rebuilt.outer.meta).toEqual(decoded.outer.meta);
    expect(rebuilt.outer.compression.type).toBe("zlib");
    expect(rebuilt.validation.crc32Matches).toBe(true);
    expect(rebuilt.validation.decompressedSizeMatches).toBe(true);
    expect(rebuilt.innerJson).toEqual(decoded.innerJson);
  });

  it("computes CRC32 from the decompressed inner JSON bytes", () => {
    const fixture = readFileSync(fixturePath);
    const decoded = decodeHlsFile<SampleInnerSetlist>(fixture);

    expect(computeCrc32(decoded.innerBytes)).toBe(decoded.outer.compression.crc32);
    expect(decoded.innerBytes.byteLength).toBe(decoded.outer.compression.decompressed_size);
  });
});
