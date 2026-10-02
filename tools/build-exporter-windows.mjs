#!/usr/bin/env node
import { createRequire } from "node:module";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createExportPlan } from "../src/export/export-plan.mjs";
import { exportWindowsApp } from "../src/export/turbowarp-windows-exporter.mjs";
import { loadLocalSb3 } from "../src/scratch/project-loader.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(root, "outputs");
const buildDirectory = path.join(root, "work", "scrapp-build");
const seedPath = path.join(root, "tests", "fixtures", "minimal.sb3");
const require = createRequire(import.meta.url);
const { createSingleExe } = require("../desktop/single-exe.cjs");
await rm(buildDirectory, { recursive: true, force: true });
const validation = await loadLocalSb3(seedPath);
const plan = createExportPlan({
  target: "windows",
  mode: "final",
  display: "window",
  appName: "scrapp",
  outputDirectory: buildDirectory,
});

const runtime = await exportWindowsApp({
  plan,
  projectData: validation.sourceBuffer,
  architecture: "x86",
});

if (runtime.archivePath) {
  await rm(runtime.archivePath, { force: true });
}

const executableDirectory = path.dirname(runtime.executablePath);
const appDirectory = path.join(executableDirectory, "resources", "app");
const safeBuildPrefix = `${path.resolve(buildDirectory)}${path.sep}`;
if (!path.resolve(appDirectory).startsWith(safeBuildPrefix)) {
  throw new Error("Refusing to replace an app directory outside the build directory.");
}

await rm(appDirectory, { recursive: true, force: true });
await mkdir(appDirectory, { recursive: true });
await cp(path.join(root, "desktop"), appDirectory, { recursive: true });
await cp(path.join(root, "node_modules"), path.join(appDirectory, "node_modules"), { recursive: true });
await writeFile(
  path.join(appDirectory, "package.json"),
  JSON.stringify({ name: "scrapp", version: "0.1.0", main: "main.cjs" }, null, 2),
  "utf8",
);

const packageJson = JSON.parse(await readFile(path.join(appDirectory, "package.json"), "utf8"));
if (packageJson.main !== "main.cjs") throw new Error("Exporter desktop package was not installed correctly.");

const outputName = process.env.SCRAPP_OUTPUT_NAME || "Scrapp.exe";
const finalExecutable = path.join(outputDirectory, outputName);
await createSingleExe({
  sourceDirectory: executableDirectory,
  entryExecutableRelative: "scrapp.exe",
  outputPath: finalExecutable,
  displayName: "Scrapp",
  toolsDirectory: path.join(root, "desktop", "tools"),
});
await rm(buildDirectory, { recursive: true, force: true });
console.log(finalExecutable);
