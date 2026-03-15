const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const targets = ["dist", "dist-electron"];
const processNames = ["Rover.exe", "Sing-box Modern.exe", "electron.exe", "app-builder.exe", "7za.exe"];

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function killLikelyLockingProcesses() {
  if (process.platform !== "win32") return;
  for (const name of processNames) {
    spawnSync("taskkill", ["/F", "/T", "/IM", name], { stdio: "ignore" });
  }
}

function removeWithRetry(targetPath, maxAttempts = 20) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      const retryable = ["EBUSY", "EPERM", "ENOTEMPTY"].includes(error?.code);
      if (!retryable || attempt === maxAttempts) {
        throw error;
      }
      sleep(300 * attempt);
    }
  }
}

function main() {
  killLikelyLockingProcesses();
  for (const target of targets) {
    removeWithRetry(path.resolve(process.cwd(), target));
  }
}

main();
