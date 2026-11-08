#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

try {
  run("pnpm", ["build"]);
  run(process.execPath, ["scripts/prepare-server.mjs", "--arch", process.arch]);
  run("pnpm", ["build-ui"]);
  run("pnpm", ["exec", "electron-builder", "--dir"]);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
