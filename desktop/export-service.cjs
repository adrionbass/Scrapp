const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const TurboWarp = require("@turbowarp/packager");
const JSZip = require("@turbowarp/jszip");
const fetch = require("cross-fetch");
const { createSingleExe } = require("./single-exe.cjs");
const { createWhiteLoadingLogo } = require("./loading-logo.cjs");
const {
  applyPreloadPolicy,
  applyWindowPolicy,
  createCustomWindowJs,
  customWindowCss,
} = require("./window-policy.cjs");

function friendlyError(message, technical) {
  const error = new Error(technical || message);
  error.userMessage = message;
  return error;
}

function abortError() {
  const error = new Error("Export canceled");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function safeName(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "proyecto-scratch";
}

function normalizeScratchProjectId(input) {
  let value = String(input || "").trim();
  const markdownLink = value.match(/^\[[^\]]*\]\((https?:\/\/[^)]+)\)$/i);
  if (markdownLink) value = markdownLink[1];
  if (/^\d+$/.test(value)) return value;

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw friendlyError("PEGÁ UN LINK VÁLIDO DE SCRATCH");
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const match = url.pathname.match(/^\/projects\/(\d+)(?:\/editor)?\/?$/i);
  if (host !== "scratch.mit.edu" || !match) {
    throw friendlyError("PEGÁ UN LINK VÁLIDO DE SCRATCH");
  }
  return match[1];
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const abort = () => controller.abort();
  externalSignal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abort);
  }
}

async function downloadScratchProject(input, signal) {
  throwIfAborted(signal);
  const projectId = normalizeScratchProjectId(input);
  let metadataResponse;
  try {
    metadataResponse = await fetchWithTimeout(`https://trampoline.turbowarp.org/api/projects/${projectId}`, { signal });
  } catch {
    throwIfAborted(signal);
    throw friendlyError("NO SE PUDO CONECTAR CON SCRATCH");
  }
  if (!metadataResponse.ok) {
    throw friendlyError("NO SE ENCONTRÓ ESE PROYECTO PÚBLICO");
  }
  let metadata;
  try {
    metadata = await metadataResponse.json();
  } catch {
    throw friendlyError("SCRATCH DEVOLVIÓ UNA RESPUESTA INVÁLIDA");
  }
  const token = metadata.project_token;
  let projectResponse;
  try {
    projectResponse = await fetchWithTimeout(
      `https://projects.scratch.mit.edu/${projectId}?token=${encodeURIComponent(token || "")}`,
      { signal },
    );
  } catch {
    throwIfAborted(signal);
    throw friendlyError("NO SE PUDO CONECTAR CON SCRATCH");
  }
  if (!projectResponse.ok) throw friendlyError("NO SE PUDO DESCARGAR EL PROYECTO");
  let projectJson;
  try {
    projectJson = await projectResponse.json();
  } catch {
    throw friendlyError("SCRATCH DEVOLVIÓ UN PROYECTO INVÁLIDO");
  }

  const assetNames = new Set();
  for (const target of projectJson.targets || []) {
    for (const asset of [...(target.costumes || []), ...(target.sounds || [])]) {
      const name = asset.md5ext || (asset.assetId && asset.dataFormat
        ? `${asset.assetId}.${asset.dataFormat}`
        : "");
      if (name) assetNames.add(name);
    }
  }

  const zip = new JSZip();
  zip.file("project.json", JSON.stringify(projectJson));
  const names = [...assetNames];
  const workers = Array.from({ length: Math.min(6, names.length) }, async (_, workerIndex) => {
    for (let index = workerIndex; index < names.length; index += 6) {
      throwIfAborted(signal);
      const name = names[index];
      let response;
      try {
        response = await fetchWithTimeout(
          `https://assets.scratch.mit.edu/internalapi/asset/${encodeURIComponent(name)}/get/`,
          { signal },
        );
      } catch {
        throwIfAborted(signal);
        throw friendlyError("NO SE PUDO DESCARGAR UN RECURSO DEL PROYECTO");
      }
      if (!response.ok) throw friendlyError("NO SE PUDO DESCARGAR UN RECURSO DEL PROYECTO");
      zip.file(name, Buffer.from(await response.arrayBuffer()));
    }
  });
  await Promise.all(workers);
  return {
    data: await zip.generateAsync({ type: "nodebuffer", compression: "STORE" }),
    name: metadata.title || `scratch-${projectId}`,
  };
}

async function loadProjectSource(source, signal) {
  throwIfAborted(signal);
  if (source?.type === "file") {
    if (path.extname(source.value).toLowerCase() !== ".sb3") {
      throw friendlyError("ELEGÍ UN ARCHIVO .SB3");
    }
    return {
      data: await fs.readFile(source.value, { signal }),
      name: path.basename(source.value, path.extname(source.value)),
    };
  }
  if (source?.type === "link") return downloadScratchProject(source.value, signal);
  throw friendlyError("PRIMERO ELEGÍ UN PROYECTO");
}

function safeDestination(root, entryName) {
  const rootPath = path.resolve(root);
  const destination = path.resolve(rootPath, entryName.replaceAll("/", path.sep));
  if (destination !== rootPath && !destination.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error("Ruta insegura en el paquete generado.");
  }
  return destination;
}

async function extractZip(data, outputDirectory, signal) {
  const zip = await JSZip.loadAsync(data);
  for (const entry of Object.values(zip.files)) {
    throwIfAborted(signal);
    const destination = safeDestination(outputDirectory, entry.name);
    if (entry.dir) {
      await fs.mkdir(destination, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, await entry.async("nodebuffer"));
    }
  }
}

async function configureGeneratedWindow(finalDirectory, appName, mode) {
  const mainPath = path.join(finalDirectory, appName, "resources", "app", "electron-main.js");
  const preloadPath = path.join(finalDirectory, appName, "resources", "app", "electron-preload.js");
  const [mainSource, preloadSource] = await Promise.all([
    fs.readFile(mainPath, "utf8"),
    fs.readFile(preloadPath, "utf8"),
  ]);
  await Promise.all([
    fs.writeFile(mainPath, applyWindowPolicy(mainSource, mode), "utf8"),
    fs.writeFile(preloadPath, applyPreloadPolicy(preloadSource), "utf8"),
  ]);
}

async function exportWindowsProject({ source, outputDirectory, mode, architecture, onProgress, signal }) {
  throwIfAborted(signal);
  const appName = safeName(source.name);
  const target = architecture === "x64" ? "electron-win64" : "electron-win32";
  const outputExecutable = path.join(outputDirectory, `${appName}.exe`);

  onProgress({ percent: 5, message: "Revisando proyecto..." });
  let loaded;
  try {
    loaded = await TurboWarp.loadProject(source.data, (type, current, total) => {
      const fraction = total ? current / total : Number(current) || 0;
      onProgress({ percent: 5 + Math.round(fraction * 20), message: "Preparando archivos..." });
    });
  } catch {
    throw friendlyError("NO SE PUDO LEER EL PROYECTO", "TurboWarp rejected the project source.");
  }

  const packager = new TurboWarp.Packager();
  const abortPackager = () => {
    if (typeof packager.abort === "function") packager.abort();
  };
  signal?.addEventListener("abort", abortPackager, { once: true });
  packager.project = loaded;
  packager.options.target = target;
  packager.options.app.icon = new TurboWarp.Image(
    "image/png",
    await fs.readFile(path.join(__dirname, "assets", "scrapp-icon.png")),
  );
  packager.options.app.packageName = appName;
  packager.options.app.windowTitle = source.name;
  packager.options.app.windowMode = "window";
  packager.options.app.windowControls = "frameless";
  packager.options.resizeMode = "preserve-ratio";
  packager.options.custom.css = customWindowCss;
  packager.options.custom.js = createCustomWindowJs(mode);
  packager.options.autoplay = mode === "final";
  packager.options.controls.greenFlag.enabled = mode === "test";
  packager.options.controls.pause.enabled = mode === "test";
  packager.options.controls.stopAll.enabled = mode === "test";
  packager.options.controls.fullscreen.enabled = false;
  packager.options.appearance.background = "#050505";
  packager.options.appearance.foreground = "#f4f4f4";
  packager.options.appearance.accent = mode === "test" ? "#d0ab2d" : "#9d4edd";
  packager.options.loadingScreen.text = "";
  packager.options.loadingScreen.image = await createWhiteLoadingLogo();
  packager.options.loadingScreen.imageMode = "normal";
  packager.addEventListener("large-asset-fetch", ({ detail }) => {
    onProgress({ percent: 25 + Math.round((detail.progress || 0) * 45), message: "Creando aplicación..." });
  });
  packager.addEventListener("zip-progress", ({ detail }) => {
    onProgress({ percent: 70 + Math.round((detail.progress || 0) * 20), message: "Terminando..." });
  });

  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "scrapp-export-"));
  const finalDirectory = path.join(temporaryRoot, `${appName}-windows-${architecture || "x86"}`);
  const temporaryExecutable = path.join(temporaryRoot, `${appName}.exe`);
  try {
    throwIfAborted(signal);
    const result = await packager.package();
    throwIfAborted(signal);
    await fs.mkdir(finalDirectory, { recursive: true });
    await extractZip(result.data, finalDirectory, signal);
    throwIfAborted(signal);
    await configureGeneratedWindow(finalDirectory, appName, mode);
    onProgress({ percent: 92, message: "Liberando proyecto de Scratch..." });
    await createSingleExe({
      sourceDirectory: path.join(finalDirectory, appName),
      entryExecutableRelative: `${appName}.exe`,
      outputPath: temporaryExecutable,
      displayName: source.name,
      signal,
    });
    throwIfAborted(signal);
    await fs.copyFile(temporaryExecutable, outputExecutable);
    onProgress({ percent: 100, message: "¡Listo!" });
    return { ok: true, folderPath: outputDirectory, executablePath: outputExecutable };
  } finally {
    signal?.removeEventListener("abort", abortPackager);
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

module.exports = {
  applyWindowPolicy,
  exportWindowsProject,
  loadProjectSource,
  normalizeScratchProjectId,
  safeName,
};
