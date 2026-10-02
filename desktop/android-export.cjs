const { execFile } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const TurboWarp = require("@turbowarp/packager");
const { androidWindowCss, createAndroidControlsJs } = require("./android-window-policy.cjs");
const { createWhiteLoadingLogo } = require("./loading-logo.cjs");

const execFileAsync = promisify(execFile);

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

function packageSuffix(value) {
  const suffix = safeName(value).toLowerCase().replace(/-/g, "_").replace(/^[^a-z]+/, "");
  return suffix || "proyecto";
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function newestDirectory(root, predicate) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const names = entries.filter((entry) => entry.isDirectory() && predicate(entry.name)).map((entry) => entry.name);
  names.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  return names[0] ? path.join(root, names[0]) : null;
}

async function firstExisting(paths) {
  for (const candidate of paths) {
    if (candidate && await exists(candidate)) return candidate;
  }
  return null;
}

async function findAndroidTools() {
  const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
    (process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Android", "Sdk"));
  if (!sdkRoot || !(await exists(sdkRoot))) {
    throw new Error("NO SE ENCONTRÓ ANDROID SDK");
  }
  let platform = await firstExisting([
    process.env.SCRAPP_ANDROID_PLATFORM,
    path.join(sdkRoot, "platforms", "android-36.1"),
    path.join(sdkRoot, "platforms", "android-36"),
    path.join(sdkRoot, "platforms", "android-35"),
  ]);
  let buildTools = await firstExisting([
    process.env.SCRAPP_ANDROID_BUILD_TOOLS,
    path.join(sdkRoot, "build-tools", "35.0.0"),
    path.join(sdkRoot, "build-tools", "36.1.0"),
    path.join(sdkRoot, "build-tools", "36.0.0"),
  ]);
  if (!platform) platform = await newestDirectory(path.join(sdkRoot, "platforms"), (name) => /^android-\d+(?:\.\d+)?$/.test(name));
  if (!buildTools) buildTools = await newestDirectory(path.join(sdkRoot, "build-tools"), (name) => /^\d+(?:\.\d+)*$/.test(name));
  if (!platform || !buildTools) throw new Error("ANDROID SDK ESTÁ INCOMPLETO");

  const tools = {
    androidJar: path.join(platform, "android.jar"),
    aapt: path.join(buildTools, "aapt.exe"),
    aapt2: path.join(buildTools, "aapt2.exe"),
    apksignerJar: path.join(buildTools, "lib", "apksigner.jar"),
    zipalign: path.join(buildTools, "zipalign.exe"),
  };
  for (const toolPath of [tools.androidJar, tools.aapt, tools.aapt2, tools.apksignerJar, tools.zipalign]) {
    if (!(await exists(toolPath))) throw new Error(`FALTA UNA HERRAMIENTA DE ANDROID: ${path.basename(toolPath)}`);
  }
  return tools;
}

async function run(file, args, options = {}) {
  throwIfAborted(options.signal);
  return execFileAsync(file, args, {
    cwd: options.cwd,
    signal: options.signal,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
}

async function ensureAndroidSigningKey(signal) {
  const signingDirectory = path.join(os.homedir(), ".scrapp");
  const keystorePath = path.join(signingDirectory, "android-signing.keystore");
  const credentialsPath = path.join(signingDirectory, "android-signing.json");

  try {
    const credentials = JSON.parse(await fs.readFile(credentialsPath, "utf8"));
    if (credentials.password && await exists(keystorePath)) {
      return { keystorePath, password: credentials.password };
    }
  } catch {
    // Generate a new local signing identity below.
  }

  await fs.mkdir(signingDirectory, { recursive: true });
  const password = randomBytes(24).toString("base64url");
  await fs.rm(keystorePath, { force: true });
  try {
    await run("keytool", [
      "-genkeypair",
      "-alias", "scrapp",
      "-keyalg", "RSA",
      "-keysize", "2048",
      "-validity", "10000",
      "-dname", "CN=Scrapp Android Export,O=11-11 dev,C=AR",
      "-storetype", "PKCS12",
      "-keystore", keystorePath,
      "-storepass", password,
      "-keypass", password,
      "-noprompt",
    ], { signal });
    await fs.writeFile(credentialsPath, JSON.stringify({ password }, null, 2), { mode: 0o600 });
    return { keystorePath, password };
  } catch (error) {
    await Promise.all([
      fs.rm(keystorePath, { force: true }),
      fs.rm(credentialsPath, { force: true }),
    ]);
    throw error;
  }
}

async function createAndroidHtml(source, mode, onProgress, signal) {
  throwIfAborted(signal);
  const loaded = await TurboWarp.loadProject(source.data, (type, current, total) => {
    const fraction = total ? current / total : Number(current) || 0;
    onProgress({ percent: 5 + Math.round(fraction * 25), message: "Preparando proyecto Android..." });
  });
  const packager = new TurboWarp.Packager();
  const abortPackager = () => typeof packager.abort === "function" && packager.abort();
  signal?.addEventListener("abort", abortPackager, { once: true });
  try {
    packager.project = loaded;
    packager.options.target = "html";
    packager.options.app.packageName = safeName(source.name);
    packager.options.app.windowTitle = source.name;
    packager.options.resizeMode = "preserve-ratio";
    packager.options.autoplay = mode === "final";
    packager.options.controls.greenFlag.enabled = mode === "test";
    packager.options.controls.pause.enabled = mode === "test";
    packager.options.controls.stopAll.enabled = mode === "test";
    packager.options.controls.fullscreen.enabled = false;
    packager.options.appearance.background = "#050505";
    packager.options.appearance.foreground = "#f4f4f4";
    packager.options.appearance.accent = mode === "test" ? "#d4af37" : "#aa50ff";
    packager.options.loadingScreen.text = "";
    packager.options.loadingScreen.image = await createWhiteLoadingLogo();
    packager.options.loadingScreen.imageMode = "normal";
    packager.options.custom.css = androidWindowCss;
    packager.options.custom.js = createAndroidControlsJs(mode);
    const result = await packager.package();
    throwIfAborted(signal);
    if (result.type !== "text/html") throw new Error("TurboWarp no generó HTML para Android.");
    return result.data;
  } finally {
    signal?.removeEventListener("abort", abortPackager);
  }
}

function manifest(packageName, appName) {
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${packageName}">
  <uses-permission android:name="android.permission.INTERNET" />
  <application android:theme="@style/AppTheme" android:label="${escapeXml(appName)}" android:icon="@drawable/icon" android:usesCleartextTraffic="true" android:hardwareAccelerated="true">
    <activity android:name="com.elevenleven.scrapp.runtime.MainActivity" android:screenOrientation="sensorLandscape" android:configChanges="orientation|screenSize|keyboardHidden" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>`;
}

function activitySource() {
  return `package com.elevenleven.scrapp.runtime;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public final class MainActivity extends Activity {
  private WebView webView;

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().setStatusBarColor(Color.BLACK);
    getWindow().setNavigationBarColor(Color.BLACK);
    getWindow().getDecorView().setSystemUiVisibility(
      View.SYSTEM_UI_FLAG_FULLSCREEN |
      View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
      View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
      View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
      View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
      View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    );
    webView = new WebView(this);
    webView.setBackgroundColor(Color.BLACK);
    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(true);
    settings.setMediaPlaybackRequiresUserGesture(false);
    webView.setWebChromeClient(new WebChromeClient());
    webView.setWebViewClient(new WebViewClient());
    setContentView(webView);
    webView.loadUrl("file:///android_asset/index.html");
  }

  @Override public void onBackPressed() {
    if (webView != null && webView.canGoBack()) webView.goBack();
    else super.onBackPressed();
  }

  @Override protected void onDestroy() {
    if (webView != null) webView.destroy();
    super.onDestroy();
  }
}
`;
}

async function exportAndroidProject({ source, outputDirectory, mode, onProgress, signal }) {
  const tools = await findAndroidTools();
  const signing = await ensureAndroidSigningKey(signal);
  const appName = safeName(source.name);
  const packageName = `com.elevenleven.scrapp.${packageSuffix(source.name)}`;
  const outputApk = path.join(outputDirectory, `${appName}.apk`);
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "scrapp-android-"));
  const resDirectory = path.join(temporaryRoot, "res");
  const assetsDirectory = path.join(temporaryRoot, "assets");
  const dexDirectory = path.join(temporaryRoot, "dex");
  const compiledResources = path.join(temporaryRoot, "resources.zip");
  const unsignedApk = path.join(temporaryRoot, "unsigned.apk");
  const alignedApk = path.join(temporaryRoot, "aligned.apk");
  const signedApk = path.join(temporaryRoot, "signed.apk");

  try {
    onProgress({ percent: 5, message: "Preparando proyecto Android..." });
    const html = await createAndroidHtml(source, mode, onProgress, signal);
    await Promise.all([
      fs.mkdir(path.join(resDirectory, "values"), { recursive: true }),
      fs.mkdir(path.join(resDirectory, "drawable"), { recursive: true }),
      fs.mkdir(assetsDirectory, { recursive: true }),
      fs.mkdir(dexDirectory, { recursive: true }),
    ]);
    await Promise.all([
      fs.writeFile(path.join(assetsDirectory, "index.html"), html),
      fs.writeFile(path.join(temporaryRoot, "AndroidManifest.xml"), manifest(packageName, source.name), "utf8"),
      fs.writeFile(path.join(resDirectory, "values", "styles.xml"), '<?xml version="1.0" encoding="utf-8"?><resources><style name="AppTheme" parent="android:style/Theme.Material.Light.NoActionBar"><item name="android:fontFamily">sans</item><item name="android:colorAccent">#843043</item><item name="android:windowFullscreen">true</item><item name="android:windowActionModeOverlay">true</item></style></resources>', "utf8"),
      fs.copyFile(path.join(__dirname, "assets", "scrapp-icon.png"), path.join(resDirectory, "drawable", "icon.png")),
      fs.copyFile(path.join(__dirname, "assets", "android-classes.dex"), path.join(dexDirectory, "classes.dex")),
    ]);

    throwIfAborted(signal);
    onProgress({ percent: 40, message: "Compilando recursos Android..." });
    await run(tools.aapt2, ["compile", "--dir", resDirectory, "-o", compiledResources], { signal });
    await run(tools.aapt2, [
      "link", "-o", unsignedApk,
      "-I", tools.androidJar,
      "--manifest", path.join(temporaryRoot, "AndroidManifest.xml"),
      "--min-sdk-version", "23",
      "--target-sdk-version", "36",
      "--version-code", "1",
      "--version-name", "1.0",
      "-A", assetsDirectory,
      compiledResources,
    ], { signal });

    onProgress({ percent: 65, message: "Creando aplicación Android..." });
    await run(tools.aapt, ["add", unsignedApk, "classes.dex"], { cwd: dexDirectory, signal });

    onProgress({ percent: 78, message: "Firmando APK..." });
    await run(tools.zipalign, ["-f", "4", unsignedApk, alignedApk], { signal });
    await run("java", [
      "-Xint",
      "-jar", tools.apksignerJar,
      "sign",
      "--ks", signing.keystorePath,
      "--ks-key-alias", "scrapp",
      "--ks-pass", `pass:${signing.password}`,
      "--key-pass", `pass:${signing.password}`,
      "--out", signedApk,
      alignedApk,
    ], { signal });
    throwIfAborted(signal);
    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.copyFile(signedApk, outputApk);
    onProgress({ percent: 100, message: "¡Listo!" });
    return { ok: true, folderPath: outputDirectory, executablePath: outputApk, artifactPath: outputApk };
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

module.exports = {
  activitySource,
  createAndroidHtml,
  exportAndroidProject,
  findAndroidTools,
  ensureAndroidSigningKey,
  manifest,
  packageSuffix,
};
