const state = {
  sources: { file: null, link: null },
  activeType: null,
  source: null,
  outputDirectory: null,
  result: null,
  resultTarget: null,
  busy: false,
  operationId: 0,
  language: localStorage.getItem("scrapp-language") === "en" ? "en" : "es",
  theme: localStorage.getItem("scrapp-theme") === "light" ? "light" : "dark",
  progressMessage: "Revisando proyecto...",
};
const byId = (id) => document.getElementById(id);

const translations = {
  es: {
    project: "PROYECTO", openFile: "ABRIR ARCHIVO", chooseProject: "Elegí tu proyecto de Scratch",
    scratchLink: "LINK DE SCRATCH", noProject: "NINGÚN PROYECTO SELECCIONADO", settings: "CONFIGURACIÓN",
    target: "DESTINO", version: "VERSIÓN", controlMode: "MODO CONTROL", finalMode: "MODO FINAL",
    output: "SALIDA:", desktop: "ESCRITORIO", windowsArchitecture: "ARQUITECTURA WINDOWS:", process: "PROCESAR",
    createApp: "CREAR APP", openFolder: "ABRIR CARPETA", runApp: "EJECUTAR APP",
    processing: "PROCESANDO PROYECTO DE SCRATCH...", reviewing: "Revisando proyecto...",
    ready: "¡LISTO!", conversionSuccess: "CONVERSIÓN FINALIZADA CON ÉXITO",
    cancel: "Interrumpir conversión", preparingConversion: "Preparando la conversión...", canceling: "Interrumpiendo conversión...",
    dragSb3: "ARRASTRÁ UN ARCHIVO .SB3", desktopMissing: "NO SE PUDO ENCONTRAR EL ESCRITORIO",
    aboutTitle: "ACERCA DE SCRAPP", versionLabel: "Versión:",
    aboutDescription: "ScrApp es una herramienta de escritorio que permite convertir proyectos de Scratch en aplicaciones independientes.",
    developedBy: "Desarrollado por", close: "Cerrar",
  },
  en: {
    project: "PROJECT", openFile: "OPEN FILE", chooseProject: "Choose your Scratch project",
    scratchLink: "SCRATCH LINK", noProject: "NO PROJECT SELECTED", settings: "SETTINGS",
    target: "TARGET", version: "VERSION", controlMode: "CONTROL MODE", finalMode: "FINAL MODE",
    output: "OUTPUT:", desktop: "DESKTOP", windowsArchitecture: "WINDOWS ARCHITECTURE:", process: "PROCESS",
    createApp: "CREATE APP", openFolder: "OPEN FOLDER", runApp: "RUN APP",
    processing: "PROCESSING SCRATCH PROJECT...", reviewing: "Reviewing project...",
    ready: "DONE!", conversionSuccess: "CONVERSION COMPLETED SUCCESSFULLY",
    cancel: "Stop conversion", preparingConversion: "Preparing conversion...", canceling: "Stopping conversion...",
    dragSb3: "DROP AN .SB3 FILE", desktopMissing: "DESKTOP FOLDER COULD NOT BE FOUND",
    aboutTitle: "ABOUT SCRAPP", versionLabel: "Version:",
    aboutDescription: "ScrApp is a desktop tool that converts Scratch projects into standalone applications.",
    developedBy: "Developed by", close: "Close",
  },
};

const runtimeMessages = {
  "Revisando proyecto...": "Reviewing project...",
  "Preparando archivos...": "Preparing files...",
  "Creando aplicación...": "Creating application...",
  "Terminando...": "Finishing...",
  "Liberando proyecto de Scratch...": "Releasing Scratch project...",
  "Preparando proyecto Android...": "Preparing Android project...",
  "Compilando recursos Android...": "Compiling Android resources...",
  "Creando aplicación Android...": "Creating Android application...",
  "Firmando APK...": "Signing APK...",
  "¡Listo!": "Done!",
  "Preparando la conversión...": "Preparing conversion...",
  "Interrumpiendo conversión...": "Stopping conversion...",
};

const errorMessages = {
  "PEGÁ UN LINK VÁLIDO DE SCRATCH": "ENTER A VALID SCRATCH LINK",
  "NO SE PUDO CONECTAR CON SCRATCH": "COULD NOT CONNECT TO SCRATCH",
  "NO SE ENCONTRÓ ESE PROYECTO PÚBLICO": "THAT PUBLIC PROJECT WAS NOT FOUND",
  "NO SE PUDO DESCARGAR EL PROYECTO": "THE PROJECT COULD NOT BE DOWNLOADED",
  "NO SE PUDO LEER EL PROYECTO": "THE PROJECT COULD NOT BE READ",
  "YA HAY UNA CONVERSIÓN EN CURSO": "A CONVERSION IS ALREADY IN PROGRESS",
};

function t(key) {
  return translations[state.language][key] || key;
}

function translateRuntimeMessage(message) {
  return state.language === "en" ? (runtimeMessages[message] || message) : message;
}

function translateError(message) {
  return state.language === "en" ? (errorMessages[message] || message) : message;
}

function applyLanguage() {
  document.documentElement.lang = state.language;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  byId("language-toggle").setAttribute("aria-checked", String(state.language === "en"));
  byId("language-toggle").setAttribute("aria-label", state.language === "es" ? "Cambiar idioma" : "Change language");
  byId("theme-toggle").setAttribute("aria-label", state.language === "es" ? "Cambiar modo de color" : "Change color mode");
  byId("cancel-app").setAttribute("aria-label", t("cancel"));
  byId("cancel-app").title = t("cancel");
  byId("about-close").setAttribute("aria-label", t("close"));
  byId("about-close").title = t("close");
  if (!state.source) byId("source-status").textContent = t("noProject");
  if (!state.outputDirectory) byId("output-path-text").textContent = t("desktop");
  byId("progress-message").textContent = translateRuntimeMessage(state.progressMessage);
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  byId("theme-toggle").setAttribute("aria-checked", String(state.theme === "dark"));
}

function selected(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value;
}

function updateTargetControls() {
  const android = selected("target") === "android";
  byId("architecture-setting").classList.toggle("disabled-setting", android);
  document.querySelectorAll('input[name="architecture"]').forEach((input) => {
    input.disabled = android;
  });
}

function setOutputDirectory(directory) {
  if (!directory) return;
  state.outputDirectory = directory;
  byId("output-path-text").textContent = directory;
  byId("output-path-text").title = directory;
}

async function chooseSb3() {
  const filePath = await window.aulaPack.pickSb3(state.language);
  if (filePath) setSource({ type: "file", value: filePath }, filePath.split(/[\\/]/).pop());
}

function resetResult() {
  state.result = null;
  state.resultTarget = null;
  byId("open-folder").disabled = true;
  byId("run-app").disabled = true;
  byId("cancel-app").disabled = true;
  byId("action-panel").classList.remove("success");
  byId("error-panel").hidden = true;
  byId("done-panel").hidden = true;
}

function activateSource(type) {
  const entry = state.sources[type];
  state.activeType = type;
  state.source = entry?.source || null;
  byId("pick-file").classList.toggle("selected", type === "file" && Boolean(entry));
  byId("link-deck").classList.toggle("selected", type === "link" && Boolean(entry));
  byId("create-app").disabled = !state.source;
  if (entry) {
    byId("source-status").textContent = entry.label;
    byId("source-status").classList.add("active");
    byId("source-led").classList.add("active");
  } else {
    byId("source-status").textContent = t("noProject");
    byId("source-status").classList.remove("active");
    byId("source-led").classList.remove("active");
  }
  resetResult();
}

function setSource(source, label) {
  state.sources[source.type] = { source, label };
  state.activeType = source.type;
  state.source = source;
  byId("source-status").textContent = label;
  byId("source-status").classList.add("active");
  byId("source-led").classList.add("active");
  byId("create-app").disabled = false;
  byId("pick-file").classList.toggle("selected", source.type === "file");
  byId("link-deck").classList.toggle("selected", source.type === "link");
  resetResult();
}

function showError(message) {
  state.result = null;
  state.resultTarget = null;
  byId("error-panel").textContent = translateError(message);
  byId("error-panel").hidden = false;
  byId("progress-panel").hidden = true;
  byId("done-panel").hidden = true;
  byId("create-app").hidden = false;
  byId("create-app").disabled = !state.source;
  byId("open-folder").disabled = true;
  byId("run-app").disabled = true;
  byId("cancel-app").disabled = true;
  byId("action-panel").classList.remove("success");
  state.busy = false;
  if (state.activeType === "link") {
    const input = byId("scratch-link");
    input.focus();
    input.select();
  }
}

byId("pick-file").addEventListener("click", async () => {
  if (state.sources.file && state.activeType !== "file") {
    activateSource("file");
    return;
  }
  await chooseSb3();
});

byId("source-status").addEventListener("click", chooseSb3);

byId("output-picker").addEventListener("click", async () => {
  setOutputDirectory(await window.aulaPack.chooseOutput(state.language));
});

document.querySelectorAll('input[name="target"]').forEach((input) => {
  input.addEventListener("change", updateTargetControls);
});

byId("link-deck").addEventListener("click", () => {
  const value = byId("scratch-link").value.trim();
  if (value && state.activeType !== "link") {
    setSource({ type: "link", value }, value);
  } else if (!value) {
    byId("scratch-link").focus();
  }
});

byId("scratch-link").addEventListener("input", (event) => {
  const value = event.currentTarget.value.trim();
  if (value) {
    setSource({ type: "link", value }, value);
  } else {
    state.sources.link = null;
    if (state.activeType === "link") activateSource("link");
  }
});

byId("drop-zone").addEventListener("dragover", (event) => event.preventDefault());
byId("drop-zone").addEventListener("drop", (event) => {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (file?.path?.toLowerCase().endsWith(".sb3")) {
    setSource({ type: "file", value: file.path }, file.name);
  } else {
    showError(t("dragSb3"));
  }
});

byId("create-app").addEventListener("click", async () => {
  if (!state.source || state.busy) return;
  if (state.activeType === "link") {
    const validation = await window.aulaPack.validateLink(state.source.value);
    if (!validation.ok) return showError(validation.message);
  }
  const outputDirectory = state.outputDirectory || await window.aulaPack.getDefaultOutput();
  if (!outputDirectory) return showError(t("desktopMissing"));
  setOutputDirectory(outputDirectory);

  state.busy = true;
  const operationId = ++state.operationId;
  state.result = null;
  state.resultTarget = null;
  byId("create-app").disabled = true;
  byId("cancel-app").disabled = false;
  byId("open-folder").disabled = true;
  byId("run-app").disabled = true;
  byId("error-panel").hidden = true;
  byId("done-panel").hidden = true;
  byId("progress-panel").hidden = false;
  byId("progress").value = 0;
  byId("progress-percent").textContent = "0%";
  state.progressMessage = "Preparando la conversión...";
  byId("progress-message").textContent = t("preparingConversion");
  byId("action-panel").classList.remove("success");

  const target = selected("target");
  const result = await window.aulaPack.createApp({
    source: state.source,
    outputDirectory,
    target,
    mode: selected("mode"),
    architecture: selected("architecture"),
    language: state.language,
  });

  if (operationId !== state.operationId) return;

  state.busy = false;
  byId("cancel-app").disabled = true;
  if (result.canceled) {
    byId("progress-panel").hidden = true;
    byId("create-app").disabled = !state.source;
    return;
  }
  if (!result.ok) return showError(result.message);
  state.result = result;
  state.resultTarget = target;
  byId("progress-panel").hidden = true;
  byId("done-panel").hidden = false;
  byId("create-app").disabled = false;
  byId("open-folder").disabled = false;
  byId("run-app").disabled = target === "android";
  byId("action-panel").classList.add("success");
});

byId("cancel-app").addEventListener("click", async () => {
  if (!state.busy) return;
  byId("cancel-app").disabled = true;
  state.progressMessage = "Interrumpiendo conversión...";
  byId("progress-message").textContent = t("canceling");
  await window.aulaPack.cancelApp().catch(() => false);
  state.operationId += 1;
  state.busy = false;
  byId("progress-panel").hidden = true;
  byId("create-app").disabled = !state.source;
});

window.aulaPack.onProgress(({ percent, message }) => {
  const value = Math.max(0, Math.min(100, percent || 0));
  byId("progress").value = value;
  byId("progress-percent").textContent = `${value}%`;
  state.progressMessage = message;
  byId("progress-message").textContent = translateRuntimeMessage(message);
});

byId("language-toggle").addEventListener("click", () => {
  state.language = state.language === "es" ? "en" : "es";
  localStorage.setItem("scrapp-language", state.language);
  applyLanguage();
});

byId("theme-toggle").addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  localStorage.setItem("scrapp-theme", state.theme);
  applyTheme();
});

byId("about-open").addEventListener("click", () => {
  byId("about-dialog").showModal();
});

byId("about-close").addEventListener("click", () => {
  byId("about-dialog").close();
});

byId("linkedin-link").addEventListener("click", () => {
  window.aulaPack.openLinkedIn();
});

byId("github-link").addEventListener("click", () => {
  window.aulaPack.openGitHub();
});

byId("open-folder").addEventListener("click", () => state.result && window.aulaPack.openFolder(state.result.artifactPath || state.result.executablePath));
byId("run-app").addEventListener("click", () => state.result && window.aulaPack.runApp(state.result.executablePath));

window.aulaPack.getDefaultOutput().then(setOutputDirectory).catch(() => {});
window.aulaPack.getAppVersion().then((version) => {
  byId("app-version").textContent = version;
}).catch(() => {
  byId("app-version").textContent = "-";
});
applyTheme();
applyLanguage();
updateTargetControls();
