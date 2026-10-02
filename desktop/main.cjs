const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  exportWindowsProject,
  loadProjectSource,
  normalizeScratchProjectId,
  safeName,
} = require("./export-service.cjs");
const { exportAndroidProject } = require("./android-export.cjs");

let mainWindow;
let activeExport = null;
const appIconPath = path.join(__dirname, "assets", "scrapp-icon.png");

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: "#070707",
    title: "Scrapp",
    icon: appIconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}

app.setAppUserModelId("Scrapp");

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => app.quit());

ipcMain.handle("pick-sb3", async (_event, language) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: language === "en" ? "Choose a Scratch project" : "Elegí un proyecto de Scratch",
    properties: ["openFile"],
    filters: [{ name: "Proyecto Scratch", extensions: ["sb3"] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("choose-output", async (_event, language) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: language === "en" ? "Choose where to create the application" : "Elegí dónde crear la aplicación",
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("get-default-output", () => app.getPath("desktop"));
ipcMain.handle("get-app-version", () => app.getVersion());
ipcMain.handle("open-linkedin", () => shell.openExternal("https://www.linkedin.com/in/adrielyosoy/?isSelfProfile=true"));
ipcMain.handle("open-github", () => shell.openExternal("https://github.com/adrionbass"));

ipcMain.handle("validate-link", (_event, input) => {
  try {
    return { ok: true, projectId: normalizeScratchProjectId(input) };
  } catch (error) {
    return { ok: false, message: error.userMessage || "PEGÁ UN LINK VÁLIDO DE SCRATCH" };
  }
});

ipcMain.handle("create-app", async (_event, request) => {
  if (activeExport) return { ok: false, message: "YA HAY UNA CONVERSIÓN EN CURSO" };
  const controller = new AbortController();
  const operation = { controller };
  activeExport = operation;
  try {
    const source = await loadProjectSource(request.source, controller.signal);
    const outputDirectory = request.outputDirectory;
    if (!outputDirectory) throw new Error("Elegí una carpeta para guardar la aplicación.");

    const extension = request.target === "android" ? ".apk" : ".exe";
    const outputPath = path.join(outputDirectory, `${safeName(source.name)}${extension}`);
    if (await fileExists(outputPath)) {
      const english = request.language === "en";
      const confirmation = await dialog.showMessageBox(mainWindow, {
        type: "question",
        title: english ? "File already exists" : "El archivo ya existe",
        message: english
          ? `A file named "${path.basename(outputPath)}" already exists in that destination. Do you want to replace it?`
          : `Ya existe un archivo con el nombre "${path.basename(outputPath)}" en ese destino. ¿Desea reemplazarlo?`,
        buttons: english ? ["Yes", "No"] : ["Sí", "No"],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      if (confirmation.response !== 0) {
        return { ok: false, canceled: true, message: "CONVERSIÓN CANCELADA" };
      }
    }

    const exportProject = request.target === "android" ? exportAndroidProject : exportWindowsProject;
    return await exportProject({
      source,
      outputDirectory,
      mode: request.mode,
      architecture: request.architecture,
      signal: controller.signal,
      onProgress(progress) {
        if (activeExport === operation && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("export-progress", progress);
        }
      },
    });
  } catch (error) {
    if (controller.signal.aborted || error.name === "AbortError") {
      return { ok: false, canceled: true, message: "CONVERSIÓN INTERRUMPIDA" };
    }
    return {
      ok: false,
      message: error.userMessage || error.message || "No se pudo crear la aplicación.",
    };
  } finally {
    if (activeExport === operation) activeExport = null;
  }
});

ipcMain.handle("cancel-export", () => {
  if (!activeExport) return false;
  const operation = activeExport;
  activeExport = null;
  operation.controller.abort();
  return true;
});

ipcMain.handle("open-folder", (_event, artifactPath) => {
  shell.showItemInFolder(artifactPath);
  return true;
});
ipcMain.handle("run-app", (_event, executablePath) => shell.openPath(executablePath));
