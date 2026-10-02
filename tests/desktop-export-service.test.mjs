import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { applyWindowPolicy, normalizeScratchProjectId } = require("../desktop/export-service.cjs");
const {
  applyPreloadPolicy,
  createCustomWindowJs,
  customWindowCss,
} = require("../desktop/window-policy.cjs");
const { createSingleExe } = require("../desktop/single-exe.cjs");
const { activitySource, ensureAndroidSigningKey, manifest, packageSuffix } = require("../desktop/android-export.cjs");
const { androidWindowCss, createAndroidControlsJs } = require("../desktop/android-window-policy.cjs");
const { createWhiteLoadingLogo } = require("../desktop/loading-logo.cjs");

test("application icon assets contain the current multicolor Scrapp icon", async () => {
  const png = await readFile(new URL("../desktop/assets/scrapp-icon.png", import.meta.url));
  const ico = await readFile(new URL("../tools/native-launcher/scrapp.ico", import.meta.url));
  const svg = await readFile(new URL("../desktop/assets/scrapp-icon.svg", import.meta.url), "utf8");
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(ico.readUInt16LE(4), 7);
  assert.match(svg, /#812e42/i);
  assert.match(svg, /#d4af37/i);
  assert.match(svg, /#a556ff/i);
  assert.match(svg, /translate\(111\.32 111\.32\) scale\(0\.78\)/);
});

test("exported apps use the white Scrapp logo while loading", async () => {
  const logo = await createWhiteLoadingLogo();
  const encoded = logo.readAsURL().split(",", 2)[1];
  const svg = Buffer.from(encoded, "base64").toString("utf8");
  assert.match(svg, /fill="#ffffff"/);
  assert.doesNotMatch(svg, /fill="#812e42"/i);
});

test("Android exporter creates stable package metadata", () => {
  assert.equal(packageSuffix("Mi Juego 2026"), "mi_juego_2026");
  assert.match(manifest("com.elevenleven.scrapp.demo", "Mi Juego"), /package="com\.elevenleven\.scrapp\.demo"/);
  assert.match(manifest("com.elevenleven.scrapp.demo", "Mi Juego"), /sensorLandscape/);
  assert.match(activitySource("com.elevenleven.scrapp.demo"), /file:\/\/\/android_asset\/index\.html/);
  assert.match(activitySource(), /package com\.elevenleven\.scrapp\.runtime/);
  assert.match(manifest("com.elevenleven.scrapp.demo", "Mi Juego"), /com\.elevenleven\.scrapp\.runtime\.MainActivity/);
});

test("Android signing identity is generated locally instead of being bundled", async () => {
  const source = await readFile(new URL("../desktop/android-export.cjs", import.meta.url), "utf8");
  assert.equal(typeof ensureAndroidSigningKey, "function");
  assert.match(source, /path\.join\(os\.homedir\(\), "\.scrapp"\)/);
  assert.match(source, /randomBytes\(24\)/);
  assert.doesNotMatch(source, /assets.*scrapp-android\.keystore/);
});

test("Android exporter bundles its reusable runtime dex", async () => {
  const dexPath = path.resolve("desktop/assets/android-classes.dex");
  await access(dexPath);
  const dex = await readFile(dexPath);
  assert.equal(dex.subarray(0, 4).toString("ascii"), "dex\n");
});

test("Android exports use the Scrapp side controls", () => {
  const controlMode = createAndroidControlsJs("test");
  const finalMode = createAndroidControlsJs("final");
  assert.match(androidWindowCss, /#scrapp-controlbar/);
  assert.match(androidWindowCss, /#loading \.loading-image \{ width: min\(38%, 240px\)/);
  assert.match(androidWindowCss, /#scrapp-turbo-speeds[^}]*gap: 7px/);
  assert.match(androidWindowCss, /calc\(100% - 64px\)/);
  assert.match(controlMode, /green-flag-button/);
  assert.match(controlMode, /scrapp-volume-slider/);
  assert.match(androidWindowCss, /background: #a556ff/);
  assert.match(androidWindowCss, /#scrapp-volume-value \{ width: 38px; height: 38px; flex: 0 0 38px/);
  assert.match(androidWindowCss, /#scrapp-volume-value\.muted[^}]*background: #232323/);
  assert.match(controlMode, /volumeMuted = !volumeMuted/);
  assert.match(controlMode, /tabindex="-1" id="scrapp-volume-value"/);
  assert.match(controlMode, /mousedown.*preventDefault/);
  assert.match(controlMode, /setScrappVolume\(volumeMuted \? 0 : volumePercent\)/);
  assert.match(controlMode, /scrapp-turbo-speeds/);
  assert.match(controlMode, /\[2, 3, 4\]/);
  assert.match(finalMode, /scrapp-volume-slider/);
  assert.doesNotMatch(finalMode, /scrapp-turbo-speeds/);
  assert.doesNotThrow(() => new Function(controlMode));
  assert.doesNotThrow(() => new Function(finalMode));
});

test("desktop exporter accepts Scratch IDs and project links", () => {
  assert.equal(normalizeScratchProjectId("1374833171"), "1374833171");
  assert.equal(
    normalizeScratchProjectId("https://scratch.mit.edu/projects/1374833171/editor/"),
    "1374833171",
  );
  assert.equal(
    normalizeScratchProjectId("www.scratch.mit.edu/projects/1374833171/?from=clipboard"),
    "1374833171",
  );
  assert.equal(
    normalizeScratchProjectId("[proyecto](https://scratch.mit.edu/projects/1380043512/editor/)"),
    "1380043512",
  );
});

test("desktop exporter rejects non-Scratch links", () => {
  assert.throws(() => normalizeScratchProjectId("https://example.com/projects/123"));
  assert.throws(() => normalizeScratchProjectId("javascript:alert(1)"));
});

test("desktop exporter preserves the Scratch ratio and removes maximize", () => {
  const generatedMain = [
    "const createProjectWindow = (url) => {",
    "  const options = {",
    "    minWidth: 50,",
    "    minHeight: 50,",
    "  };",
    "  const window = createWindow(options);",
    "  if (windowMode === 'maximize') {",
    "    window.maximize();",
    "  }",
  ].join("\n");

  const testMode = applyWindowPolicy(generatedMain, "test");
  assert.match(testMode, /minWidth: 544/);
  assert.match(testMode, /minHeight: 392/);
  assert.match(testMode, /resizable: true/);
  assert.match(testMode, /maximizable: false/);
  assert.match(testMode, /window\.setMaximizable\(false\)/);
  assert.match(testMode, /const initialBounds = window\.getBounds\(\)/);
  assert.match(testMode, /initialBounds\.width < aspectWidth \+ extraWidth/);
  assert.match(testMode, /window\.on\('will-resize'/);
  assert.match(testMode, /maxDisplayWidth/);
  assert.match(testMode, /options\.width \+= 64/);
  assert.match(testMode, /options\.height \+= -16/);
  assert.match(testMode, /ScrappWindow\.toggleFit/);

  const finalMode = applyWindowPolicy(generatedMain, "final");
  assert.match(finalMode, /minHeight: 392/);
  assert.match(finalMode, /options\.height \+= 32/);
});

test("generated app exposes proportional fit and mode-specific controls", () => {
  const preload = applyPreloadPolicy("const {contextBridge, ipcRenderer} = require('electron');\n");
  assert.match(preload, /ScrappWindow/);
  assert.match(preload, /minimize/);
  assert.match(preload, /toggleFit/);
  assert.match(preload, /close/);
  assert.match(customWindowCss, /background: #000 !important/);
  assert.match(customWindowCss, /#843043/);
  assert.match(customWindowCss, /#loading \.loading-image \{ width: min\(38%, 240px\)/);
  assert.match(customWindowCss, /#scrapp-turbo-speeds[^}]*gap: 7px/);
  assert.match(createCustomWindowJs("test"), /stop-all-button/);
  assert.match(createCustomWindowJs("test"), /launchScreen\.click/);
  assert.match(createCustomWindowJs("test"), /controls\.querySelector\('\.green-flag-button'\)/);
  assert.match(createCustomWindowJs("test"), /scrapp-volume-slider/);
  assert.match(customWindowCss, /background: #a556ff/);
  assert.match(customWindowCss, /#scrapp-volume-value \{ width: 38px; height: 38px; flex: 0 0 38px/);
  assert.match(customWindowCss, /#scrapp-volume-value\.muted[^}]*background: #232323/);
  assert.match(createCustomWindowJs("test"), /volumeMuted = !volumeMuted/);
  assert.match(createCustomWindowJs("test"), /tabindex="-1" id="scrapp-volume-value"/);
  assert.match(createCustomWindowJs("test"), /mousedown.*preventDefault/);
  assert.match(createCustomWindowJs("final"), /volumeMuted = !volumeMuted/);
  assert.match(createCustomWindowJs("test"), /setScrappVolume\(volumeMuted \? 0 : volumePercent\)/);
  assert.match(createCustomWindowJs("test"), /scrapp-turbo/);
  assert.match(createCustomWindowJs("test"), /runtime\.turboMode/);
  assert.match(createCustomWindowJs("test"), /turboScales = \{ 2: 2, 3: 3, 4: 4 \}/);
  assert.match(createCustomWindowJs("test"), /turboFramerates = \{ 2: 83, 3: 167, 4: 250 \}/);
  assert.match(createCustomWindowJs("test"), /setScrappClockScale\(turboEnabled \? speed : 1\)/);
  assert.match(createCustomWindowJs("test"), /setScrappAudioScale\(turboEnabled \? speed : 1\)/);
  assert.match(createCustomWindowJs("test"), /stretchScrappAudio/);
  assert.doesNotMatch(createCustomWindowJs("test"), /playbackRate\.value\s*=/);
  assert.match(createCustomWindowJs("test"), /scrapp-turbo-speeds/);
  assert.match(createCustomWindowJs("test"), /speedButton\.textContent = level \+ 'x'/);
  assert.doesNotMatch(createCustomWindowJs("test"), /scrapp-turbo-more/);
  assert.match(createCustomWindowJs("final"), /Maximizar/);
  assert.doesNotThrow(() => new Function(createCustomWindowJs("test")));
});

test("single-file packager creates one executable payload", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "scrapp-test-"));
  try {
    const source = path.join(temporary, "demo");
    const output = path.join(temporary, "Demo.exe");
    await mkdir(source);
    await writeFile(path.join(source, "demo.exe"), "fixture");
    await createSingleExe({
      sourceDirectory: source,
      entryExecutableRelative: "demo.exe",
      outputPath: output,
      displayName: "Demo",
    });
    const data = await readFile(output);
    assert.equal(data.subarray(0, 2).toString("ascii"), "MZ");
    assert.ok(data.length > 129024);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("single-file packaging can be canceled", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "scrapp-cancel-test-"));
  try {
    const source = path.join(temporary, "demo");
    await mkdir(source);
    await writeFile(path.join(source, "demo.exe"), "fixture");
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      createSingleExe({
        sourceDirectory: source,
        entryExecutableRelative: "demo.exe",
        outputPath: path.join(temporary, "Demo.exe"),
        signal: controller.signal,
      }),
      { name: "AbortError" },
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
