#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.platform !== "darwin") {
  console.log("[macos-native] Skipping native macOS bridge on this platform.");
  process.exit(0);
}

const hostArchitecture = process.arch;
const architectures = [hostArchitecture];
const nativeRoot = path.join(projectRoot, "native", "macos");
const swiftSource = path.join(nativeRoot, "src", "PaperclipToolbar.swift");
const swiftBuildRoot = path.join(nativeRoot, "swift-build");
const buildOutputRoot = path.join(projectRoot, "build", "macos-native");
const nodeGyp = path.join(projectRoot, "node_modules", ".bin", "node-gyp");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

if (!existsSync(nodeGyp)) {
  throw new Error("node-gyp is missing; install the project dependencies before building the macOS bridge.");
}

rmSync(buildOutputRoot, { recursive: true, force: true });
mkdirSync(buildOutputRoot, { recursive: true });

for (const architecture of architectures) {
  const swiftArchitecture = architecture === "x64" ? "x86_64" : architecture;
  const swiftBuildDir = path.join(swiftBuildRoot, architecture);
  const swiftLibrary = path.join(swiftBuildDir, "libPaperclipNativeToolbar.dylib");
  const architectureOutput = path.join(buildOutputRoot, architecture);
  mkdirSync(swiftBuildDir, { recursive: true });
  mkdirSync(architectureOutput, { recursive: true });

  run("swiftc", [
    "-swift-version", "5",
    "-target", `${swiftArchitecture}-apple-macosx11.0`,
    "-emit-library",
    "-module-name", "PaperclipNativeToolbar",
    swiftSource,
    "-o", swiftLibrary,
  ]);
  run("install_name_tool", ["-id", "@loader_path/libPaperclipNativeToolbar.dylib", swiftLibrary]);

  run(nodeGyp, ["rebuild", "--directory", nativeRoot, "--arch", architecture], {
    env: {
      ...process.env,
      MACOSX_DEPLOYMENT_TARGET: "11.0",
    },
  });

  const compiledAddon = path.join(nativeRoot, "build", "Release", "paperclip_native_toolbar.node");
  if (!existsSync(compiledAddon)) {
    throw new Error(`Native addon build did not produce ${compiledAddon}`);
  }

  run("install_name_tool", [
    "-change",
    "@rpath/libPaperclipNativeToolbar.dylib",
    "@loader_path/libPaperclipNativeToolbar.dylib",
    compiledAddon,
  ]);

  cpSync(compiledAddon, path.join(architectureOutput, "paperclip_native_toolbar.node"));
  cpSync(swiftLibrary, path.join(architectureOutput, "libPaperclipNativeToolbar.dylib"));
}

for (const architecture of ["arm64", "x64"]) {
  mkdirSync(path.join(buildOutputRoot, architecture), { recursive: true });
}

console.log(`[macos-native] Built the ${hostArchitecture} toolbar bridge in ${buildOutputRoot}`);
