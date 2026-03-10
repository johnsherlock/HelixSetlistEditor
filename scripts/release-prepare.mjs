import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const INPUT = process.argv[2];
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

if (!INPUT) {
  console.error("Usage: npm run release:prepare -- <patch|minor|major|X.Y.Z>");
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

function ensureCleanWorktree() {
  const status = run("git", ["status", "--porcelain"]);

  if (status) {
    console.error("Working tree is not clean. Commit or stash changes before preparing a release.");
    process.exit(1);
  }
}

function ensureNoExistingTag(tag) {
  try {
    const existing = run("git", ["tag", "--list", tag]);

    if (existing === tag) {
      console.error(`Tag ${tag} already exists.`);
      process.exit(1);
    }
  } catch {
    // ignore and continue
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readCargoToml(path) {
  return readFileSync(path, "utf8");
}

function bumpSemver(currentVersion, input) {
  const match = currentVersion.match(SEMVER_RE);

  if (!match) {
    throw new Error(`Current version is not valid semver: ${currentVersion}`);
  }

  const [, majorRaw, minorRaw, patchRaw] = match;
  let major = Number.parseInt(majorRaw, 10);
  let minor = Number.parseInt(minorRaw, 10);
  let patch = Number.parseInt(patchRaw, 10);

  if (input === "patch") {
    patch += 1;
    return `${major}.${minor}.${patch}`;
  }

  if (input === "minor") {
    minor += 1;
    patch = 0;
    return `${major}.${minor}.${patch}`;
  }

  if (input === "major") {
    major += 1;
    minor = 0;
    patch = 0;
    return `${major}.${minor}.${patch}`;
  }

  if (!SEMVER_RE.test(input)) {
    throw new Error(`Invalid version input: ${input}`);
  }

  return input;
}

function replaceCargoVersion(contents, nextVersion) {
  const replaced = contents.replace(
    /^(\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m,
    `$1${nextVersion}$3`,
  );

  if (replaced === contents) {
    throw new Error("Failed to update version in src-tauri/Cargo.toml");
  }

  return replaced;
}

ensureCleanWorktree();

const packageJsonPath = "package.json";
const packageLockPath = "package-lock.json";
const cargoTomlPath = "src-tauri/Cargo.toml";
const tauriConfigPath = "src-tauri/tauri.conf.json";

const packageJson = readJson(packageJsonPath);
const packageLock = readJson(packageLockPath);
const tauriConfig = readJson(tauriConfigPath);
const currentVersion = packageJson.version;
const nextVersion = bumpSemver(currentVersion, INPUT);
const nextTag = `v${nextVersion}`;

if (nextVersion === currentVersion) {
  console.error(`Version is already ${currentVersion}.`);
  process.exit(1);
}

ensureNoExistingTag(nextTag);

packageJson.version = nextVersion;
packageLock.version = nextVersion;
if (packageLock.packages?.[""]) {
  packageLock.packages[""].version = nextVersion;
}
tauriConfig.version = nextVersion;

writeJson(packageJsonPath, packageJson);
writeJson(packageLockPath, packageLock);
writeJson(tauriConfigPath, tauriConfig);
writeFileSync(cargoTomlPath, replaceCargoVersion(readCargoToml(cargoTomlPath), nextVersion), "utf8");

run("node", ["scripts/assert-version-sync.mjs", nextTag], { stdio: "inherit" });
run("git", ["add", packageJsonPath, packageLockPath, cargoTomlPath, tauriConfigPath], { stdio: "inherit" });
run("git", ["commit", "-m", `Release ${nextTag}`], { stdio: "inherit" });
run("git", ["tag", nextTag], { stdio: "inherit" });

console.log(`Prepared ${nextTag}`);
console.log("Next steps:");
console.log("  git push origin main");
console.log(`  git push origin ${nextTag}`);
