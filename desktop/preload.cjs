const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aulaPack", {
  pickSb3: (language) => ipcRenderer.invoke("pick-sb3", language),
  chooseOutput: (language) => ipcRenderer.invoke("choose-output", language),
  getDefaultOutput: () => ipcRenderer.invoke("get-default-output"),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  validateLink: (input) => ipcRenderer.invoke("validate-link", input),
  createApp: (request) => ipcRenderer.invoke("create-app", request),
  cancelApp: () => ipcRenderer.invoke("cancel-export"),
  openFolder: (artifactPath) => ipcRenderer.invoke("open-folder", artifactPath),
  runApp: (executablePath) => ipcRenderer.invoke("run-app", executablePath),
  openLinkedIn: () => ipcRenderer.invoke("open-linkedin"),
  openGitHub: () => ipcRenderer.invoke("open-github"),
  onProgress: (callback) => ipcRenderer.on("export-progress", (_event, value) => callback(value)),
});
