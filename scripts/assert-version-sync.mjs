import { readFileSync } from "node:fs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readCargoVersion(path) {
  const contents = readFileSync(path, "utf8");
  const packageSection = contents.match(/\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m);

  if (!packageSection) {
    throw new Error(`Unable to find [package] version in ${path}`);
  }

  return packageSection[1];
}

const packageVersion = readJson("package.json").version;
const tauriVersion = readJson("src-tauri/tauri.conf.json").version;
const cargoVersion = readCargoVersion("src-tauri/Cargo.toml");
const expectedVersion = process.argv[2]?.replace(/^v/, "") ?? null;

const mismatches = [
  ["package.json", packageVersion],
  ["src-tauri/tauri.conf.json", tauriVersion],
  ["src-tauri/Cargo.toml", cargoVersion],
].filter(([, version]) => version !== packageVersion);

if (mismatches.length > 0) {
  throw new Error(
    `Version mismatch detected. package.json=${packageVersion}, ${mismatches
      .map(([label, version]) => `${label}=${version}`)
      .join(", ")}`,
  );
}

if (expectedVersion && expectedVersion !== packageVersion) {
  throw new Error(`Git tag version ${expectedVersion} does not match package version ${packageVersion}.`);
}

console.log(`Version sync OK: ${packageVersion}`);
