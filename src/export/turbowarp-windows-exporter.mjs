import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { exportFailed } from "../core/errors.mjs";

const require = createRequire(import.meta.url);
const TurboWarp = require("@turbowarp/packager");
const JSZip = require("@turbowarp/jszip");
const {
  applyPreloadPolicy,
  applyWindowPolicy,
  createCustomWindowJs,
  customWindowCss,
} = require("../../desktop/window-policy.cjs");

function safeFileName(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "scratch-app";
}

function assertSafeArchivePath(root, entryName) {
  const destination = path.resolve(root, entryName.replaceAll("/", path.sep));
  const rootPrefix = `${path.resolve(root)}${path.sep}`;
  if (destination !== path.resolve(root) && !destination.startsWith(rootPrefix)) {
    throw new Error(`Unsafe path in generated Windows archive: ${entryName}`);
  }
  return destination;
}

async function extractGeneratedArchive(data, outputDirectory) {
  const zip = await JSZip.loadAsync(data);
  for (const entry of Object.values(zip.files)) {
    const destination = assertSafeArchivePath(outputDirectory, entry.name);
    if (entry.dir) {
      await mkdir(destination, { recursive: true });
      continue;
    }

    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, await entry.async("nodebuffer"));
  }
}

async function configureGeneratedWindow(artifactDirectory, appName, mode) {
  const mainPath = path.join(artifactDirectory, appName, "resources", "app", "electron-main.js");
  const preloadPath = path.join(artifactDirectory, appName, "resources", "app", "electron-preload.js");
  const [mainSource, preloadSource] = await Promise.all([
    readFile(mainPath, "utf8"),
    readFile(preloadPath, "utf8"),
  ]);
  await Promise.all([
    writeFile(mainPath, applyWindowPolicy(mainSource, mode), "utf8"),
    writeFile(preloadPath, applyPreloadPolicy(preloadSource), "utf8"),
  ]);
}

export async function exportWindowsApp({
  plan,
  projectData,
  architecture = "x86",
  onProgress = () => {},
}) {
  if (!Buffer.isBuffer(projectData)) {
    throw exportFailed("The validated .sb3 source buffer is required.");
  }
  if (!new Set(["x86", "x64"]).has(architecture)) {
    throw exportFailed(`Unsupported Windows architecture: ${architecture}`);
  }

  try {
    const appName = safeFileName(plan.appName);
    const target = architecture === "x86" ? "electron-win32" : "electron-win64";
    const artifactDirectory = path.join(plan.outputDirectory, `${appName}-windows-${architecture}`);
    const archivePath = path.join(plan.outputDirectory, `${appName}-windows-${architecture}.zip`);

    const loadedProject = await TurboWarp.loadProject(projectData, (type, current, total) => {
      onProgress({ phase: "load", type, current, total });
    });
    const packager = new TurboWarp.Packager();
    packager.project = loadedProject;
    packager.options.target = target;
    packager.options.app.icon = new TurboWarp.Image(
      "image/png",
      await readFile(path.resolve(import.meta.dirname, "../../desktop/assets/scrapp-icon.png")),
    );
    packager.options.app.packageName = appName;
    packager.options.app.windowTitle = plan.appName;
    packager.options.app.windowMode = "window";
    packager.options.app.windowControls = "frameless";
    packager.options.resizeMode = "preserve-ratio";
    packager.options.custom.css = customWindowCss;
    packager.options.custom.js = createCustomWindowJs(plan.mode);
    packager.options.autoplay = plan.mode === "final";
    packager.options.controls.greenFlag.enabled = plan.mode === "test";
    packager.options.controls.pause.enabled = plan.mode === "test";
    packager.options.controls.stopAll.enabled = plan.mode === "test";
    packager.options.controls.fullscreen.enabled = false;
    packager.options.appearance.background = "#050505";
    packager.options.appearance.foreground = "#f4f4f4";
    packager.options.appearance.accent = plan.mode === "test" ? "#c8aa2c" : "#b04cff";
    packager.options.loadingScreen.text = "CARGANDO PROYECTO";

    packager.addEventListener("large-asset-fetch", ({ detail }) => {
      onProgress({ phase: "runtime", asset: detail.asset, progress: detail.progress });
    });
    packager.addEventListener("zip-progress", ({ detail }) => {
      onProgress({ phase: "package", progress: detail.progress });
    });

    const result = await packager.package();
    if (result.type !== "application/zip") {
      throw new Error(`Unexpected TurboWarp output type: ${result.type}`);
    }

    await mkdir(plan.outputDirectory, { recursive: true });
    await writeFile(archivePath, result.data);
    await mkdir(artifactDirectory, { recursive: true });
    await extractGeneratedArchive(result.data, artifactDirectory);
    await configureGeneratedWindow(artifactDirectory, appName, plan.mode);
    const executablePath = path.join(artifactDirectory, appName, `${appName}.exe`);

    return {
      artifactDirectory,
      archivePath,
      executablePath,
      architecture,
      runtime: "Electron 22.3.27",
    };
  } catch (error) {
    if (error?.code === "ExportFailed") throw error;
    throw exportFailed("TurboWarp could not create the Windows app.", {
      cause: error.message,
    });
  }
}
