import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const privateKeyPath = ".secrets/tauri-updater.key";
const password = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "helix-beta-updater";

if (!existsSync(privateKeyPath)) {
  console.error(`Missing updater private key: ${privateKeyPath}`);
  process.exit(1);
}

const privateKey = readFileSync(privateKeyPath, "utf8").trim();

if (!privateKey) {
  console.error(`Updater private key file is empty: ${privateKeyPath}`);
  process.exit(1);
}

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["tauri", "build"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      TAURI_SIGNING_PRIVATE_KEY: privateKey,
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password,
    },
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
