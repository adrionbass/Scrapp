const { execFile } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

async function appendFile(source, destination) {
  await pipeline(fs.createReadStream(source), fs.createWriteStream(destination, { flags: "a" }));
}

async function createSingleExe({
  sourceDirectory,
  entryExecutableRelative,
  outputPath,
  toolsDirectory = path.join(__dirname, "tools"),
  signal,
}) {
  const source = path.resolve(sourceDirectory);
  const parent = path.dirname(source);
  const folderName = path.basename(source);
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), "scrapp-sfx-"));
  const archivePath = path.join(temporaryDirectory, "payload.7z");
  const sevenZip = path.join(toolsDirectory, "7zr.exe");
  const launcher = path.join(toolsDirectory, "scrapp-launcher.exe");

  try {
    await fsp.access(sevenZip);
    await fsp.access(launcher);
    await execFileAsync(
      sevenZip,
      ["a", archivePath, folderName, "-t7z", "-m0=lzma2", "-mx=3", "-mmt=on", "-y"],
      { cwd: parent, windowsHide: true, maxBuffer: 1024 * 1024, signal },
    );

    if (signal?.aborted) {
      const error = new Error("Export canceled");
      error.name = "AbortError";
      throw error;
    }

    const runPath = path.win32.join(folderName, entryExecutableRelative);
    if (path.win32.isAbsolute(runPath) || runPath.split("\\").includes("..")) {
      throw new Error("Ruta de inicio insegura para el ejecutable único.");
    }
    const entry = Buffer.from(runPath, "utf8");
    if (entry.length > 511) throw new Error("La ruta de inicio es demasiado larga.");

    const [launcherInfo, sevenZipInfo, archiveInfo] = await Promise.all([
      fsp.stat(launcher),
      fsp.stat(sevenZip),
      fsp.stat(archivePath),
    ]);
    const footer = Buffer.alloc(552);
    Buffer.from("SCRAPP_BUNDLE_V1", "ascii").copy(footer, 0);
    footer.writeBigUInt64LE(BigInt(launcherInfo.size), 16);
    footer.writeBigUInt64LE(BigInt(sevenZipInfo.size), 24);
    footer.writeBigUInt64LE(BigInt(archiveInfo.size), 32);
    entry.copy(footer, 40);

    await fsp.mkdir(path.dirname(outputPath), { recursive: true });
    await fsp.copyFile(launcher, outputPath);
    await appendFile(sevenZip, outputPath);
    await appendFile(archivePath, outputPath);
    await fsp.appendFile(outputPath, footer);
    return outputPath;
  } finally {
    await fsp.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

module.exports = { createSingleExe };
