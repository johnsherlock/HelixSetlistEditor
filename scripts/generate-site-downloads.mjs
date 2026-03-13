import { writeFileSync } from "node:fs";
import { encodeGitHubReleaseAssetUrlPath } from "./github-release-assets.mjs";

function parseArgs(argv) {
  const args = {};

  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];

    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid arguments near: ${key ?? "<end>"}`);
    }

    args[key.slice(2)] = value;
  }

  return args;
}

function encodeAssetUrl(repo, tag, fileName) {
  return `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeGitHubReleaseAssetUrlPath(fileName)}`;
}

const args = parseArgs(process.argv);
const required = ["version", "repo", "tag", "mac-apple-silicon-asset-name", "windows-asset-name", "output"];

for (const key of required) {
  if (!args[key]) {
    throw new Error(`Missing required argument --${key}`);
  }
}

const downloads = {
  version: args.version,
  releaseUrl: `https://github.com/${args.repo}/releases/tag/${encodeURIComponent(args.tag)}`,
  mac: {
    label: "Download for macOS",
    url: encodeAssetUrl(args.repo, args.tag, args["mac-apple-silicon-asset-name"]),
  },
  macAppleSilicon: {
    label: "Download for Apple Silicon",
    url: encodeAssetUrl(args.repo, args.tag, args["mac-apple-silicon-asset-name"]),
  },
  windows: {
    label: "Download for Windows",
    url: encodeAssetUrl(args.repo, args.tag, args["windows-asset-name"]),
  },
};

if (args["mac-intel-asset-name"]) {
  downloads.macIntel = {
    label: "Download for Intel Mac",
    url: encodeAssetUrl(args.repo, args.tag, args["mac-intel-asset-name"]),
  };
}

writeFileSync(args.output, `${JSON.stringify(downloads, null, 2)}\n`, "utf8");
console.log(`Wrote site download metadata to ${args.output}`);
