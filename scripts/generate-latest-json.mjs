import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { encodeGitHubReleaseAssetUrlPath } from "./github-release-assets.mjs";

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];

    if (Object.hasOwn(args, key)) {
      const existingValue = args[key];
      args[key] = Array.isArray(existingValue) ? [...existingValue, value] : [existingValue, value];
    } else {
      args[key] = value;
    }
    index += 1;
  }

  return args;
}

function ensureArray(value) {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

const args = parseArgs(process.argv.slice(2));
const required = ["version", "repo", "tag", "output"];

for (const key of required) {
  if (!args[key]) {
    throw new Error(`Missing required argument --${key}`);
  }
}

const notes = args["notes-file"] ? readFileSync(args["notes-file"], "utf8").trim() : `Helix Setlist Editor ${args.version}`;
const platformKeys = ensureArray(args["platform-key"]);
const artifacts = ensureArray(args.artifact);
const signatureFiles = ensureArray(args["signature-file"]);

if (platformKeys.length === 0) {
  throw new Error("Missing required argument --platform-key");
}

if (platformKeys.length !== artifacts.length || platformKeys.length !== signatureFiles.length) {
  throw new Error("Each --platform-key must have a matching --artifact and --signature-file");
}

const platforms = {};

for (let index = 0; index < platformKeys.length; index += 1) {
  const platformKey = platformKeys[index];
  const artifactPath = artifacts[index];
  const signaturePath = signatureFiles[index];
  const signature = readFileSync(signaturePath, "utf8").trim();
  const artifactName = basename(artifactPath);

  platforms[platformKey] = {
    signature,
    url: `https://github.com/${args.repo}/releases/download/${args.tag}/${encodeGitHubReleaseAssetUrlPath(artifactName)}`,
  };
}

const payload = {
  version: args.version,
  notes,
  pub_date: new Date().toISOString(),
  platforms,
};

writeFileSync(args.output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${args.output}`);
