import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const INPUT = process.argv[2];

if (!INPUT) {
  console.error("Usage: npm run release:publish -- <patch|minor|major|X.Y.Z>");
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

  if (typeof result !== "string") {
    return "";
  }

  return result.trim();
}

function readVersion() {
  return JSON.parse(readFileSync("package.json", "utf8")).version;
}

function ensureOnMainBranch() {
  const branch = run("git", ["branch", "--show-current"]);

  if (branch !== "main") {
    console.error(`Release publishing must be run from main. Current branch: ${branch || "(detached HEAD)"}`);
    process.exit(1);
  }
}

ensureOnMainBranch();

const startingVersion = readVersion();

run("node", ["scripts/release-prepare.mjs", INPUT], { stdio: "inherit" });

const nextVersion = readVersion();
const tag = `v${nextVersion}`;

if (startingVersion === nextVersion) {
  console.error(`Version did not change. Current version is still ${startingVersion}.`);
  process.exit(1);
}

run("git", ["push", "origin", "main"], { stdio: "inherit" });
run("git", ["push", "origin", tag], { stdio: "inherit" });

console.log(`Published ${tag}`);
console.log("GitHub Actions will build and publish the release from the pushed tag.");
