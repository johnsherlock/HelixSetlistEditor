import { deflateSync, inflateSync } from "node:zlib";

export interface HlsCompressionInfo {
  crc32: number;
  decompressed_size: number;
  type: string;
}

export interface HlsOuterFile {
  encoded_data: string;
  compression: HlsCompressionInfo;
  schema: string;
  version?: number;
  encoding?: string;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface HlsOuterTemplate {
  schema?: string;
  version?: number;
  encoding?: string;
  meta?: Record<string, unknown>;
  extraOuterFields?: Record<string, unknown>;
}

export interface HlsValidationResult {
  compressionTypeMatches: boolean;
  crc32Matches: boolean;
  decompressedSizeMatches: boolean;
  schemaMatches: boolean;
}

export interface DecodedHlsFile<TInner = unknown> {
  outer: HlsOuterFile;
  innerBytes: Buffer;
  innerText: string;
  innerJson: TInner;
  computed: {
    crc32: number;
    decompressedSize: number;
  };
  validation: HlsValidationResult;
}

const CRC32_TABLE = new Uint32Array(256);

for (let index = 0; index < 256; index += 1) {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  CRC32_TABLE[index] = value >>> 0;
}

export function computeCrc32(input: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of input) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

export function parseHlsOuterFile(input: string | Buffer): HlsOuterFile {
  const text = Buffer.isBuffer(input) ? input.toString("utf8") : input;
  const outer = JSON.parse(text) as HlsOuterFile;

  if (typeof outer !== "object" || outer === null) {
    throw new TypeError("Expected outer .hls JSON to be an object.");
  }

  if (typeof outer.encoded_data !== "string") {
    throw new TypeError("Expected .hls encoded_data to be a base64 string.");
  }

  if (typeof outer.schema !== "string") {
    throw new TypeError("Expected .hls schema to be a string.");
  }

  if (
    typeof outer.compression !== "object" ||
    outer.compression === null ||
    typeof outer.compression.type !== "string" ||
    typeof outer.compression.crc32 !== "number" ||
    typeof outer.compression.decompressed_size !== "number"
  ) {
    throw new TypeError("Expected .hls compression metadata to be present.");
  }

  return outer;
}

export function decodeHlsFile<TInner = unknown>(input: string | Buffer): DecodedHlsFile<TInner> {
  const outer = parseHlsOuterFile(input);
  const compressed = Buffer.from(outer.encoded_data, "base64");
  const innerBytes = inflateSync(compressed);
  const innerText = innerBytes.toString("utf8");
  const innerJson = JSON.parse(innerText) as TInner;
  const computed = {
    crc32: computeCrc32(innerBytes),
    decompressedSize: innerBytes.byteLength,
  };

  return {
    outer,
    innerBytes,
    innerText,
    innerJson,
    computed,
    validation: {
      compressionTypeMatches: outer.compression.type === "zlib",
      crc32Matches: outer.compression.crc32 === computed.crc32,
      decompressedSizeMatches: outer.compression.decompressed_size === computed.decompressedSize,
      schemaMatches: outer.schema === "L6Setlist",
    },
  };
}

export function createOuterTemplate(outer: HlsOuterFile): HlsOuterTemplate {
  const {
    encoded_data: _encodedData,
    compression: _compression,
    schema,
    version,
    encoding,
    meta,
    ...extraOuterFields
  } = outer;

  return {
    schema,
    version,
    encoding,
    meta,
    extraOuterFields,
  };
}

export function encodeHlsFile<TInner>(
  innerJson: TInner,
  options: HlsOuterTemplate = { schema: "L6Setlist", encoding: "Base64" },
): string {
  const innerText = JSON.stringify(innerJson);
  const innerBytes = Buffer.from(innerText, "utf8");
  const compressedBytes = deflateSync(innerBytes);
  const outer: HlsOuterFile = {
    ...(options.extraOuterFields ?? {}),
    schema: options.schema ?? "L6Setlist",
    version: options.version,
    encoding: options.encoding ?? "Base64",
    meta: options.meta,
    encoded_data: compressedBytes.toString("base64"),
    compression: {
      crc32: computeCrc32(innerBytes),
      decompressed_size: innerBytes.byteLength,
      type: "zlib",
    },
  };

  return JSON.stringify(outer, null, 2);
}

export function rebuildHlsFile<TInner>(decoded: DecodedHlsFile<TInner>, nextInnerJson?: TInner): string {
  return encodeHlsFile(nextInnerJson ?? decoded.innerJson, createOuterTemplate(decoded.outer));
}
