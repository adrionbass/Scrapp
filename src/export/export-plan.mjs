const TARGETS = new Set(["windows", "android", "html"]);
const MODES = new Set(["test", "final"]);
const DISPLAY = new Set(["window", "fullscreen"]);

export function createExportPlan({
  target = "html",
  mode = "final",
  display = "window",
  appName = "Scratch App",
  outputDirectory,
} = {}) {
  if (!TARGETS.has(target)) throw new Error(`Unsupported target: ${target}`);
  if (!MODES.has(mode)) throw new Error(`Unsupported mode: ${mode}`);
  if (!DISPLAY.has(display)) throw new Error(`Unsupported display: ${display}`);
  if (!outputDirectory) throw new Error("outputDirectory is required");

  return {
    target,
    mode,
    display,
    appName: String(appName).trim() || "Scratch App",
    outputDirectory,
  };
}
