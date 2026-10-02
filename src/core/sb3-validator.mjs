import { inflateRawSync } from "node:zlib";
import { invalidScratchProject } from "./errors.mjs";

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const MAX_ZIP_COMMENT = 0xffff;
const MAX_ENTRY_COUNT = 10000;
const MAX_UNCOMPRESSED_SIZE = 300 * 1024 * 1024;
const MAX_PROJECT_JSON_SIZE = 30 * 1024 * 1024;

function findEndOfCentralDirectory(buffer) {
  const start = Math.max(0, buffer.length - MAX_ZIP_COMMENT - 22);
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }
  throw invalidScratchProject("The .sb3 file is not a valid ZIP container.");
}

function assertSafeEntryName(name) {
  const normalized = name.replaceAll("\\", "/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw invalidScratchProject("The .sb3 file contains an unsafe path.", { name });
  }
  return normalized;
}

export function readZipDirectory(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw invalidScratchProject("Expected a Buffer while reading .sb3 data.");
  }

  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (entryCount > MAX_ENTRY_COUNT) {
    throw invalidScratchProject("The .sb3 file contains too many entries.", { entryCount });
  }

  if (centralDirectoryOffset + centralDirectorySize > buffer.length) {
    throw invalidScratchProject("The .sb3 ZIP directory is corrupt.");
  }

  const entries = [];
  let cursor = centralDirectoryOffset;
  let totalUncompressedSize = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_FILE_HEADER) {
      throw invalidScratchProject("The .sb3 ZIP directory has an invalid file header.");
    }

    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const rawName = buffer.toString("utf8", cursor + 46, cursor + 46 + fileNameLength);
    const name = assertSafeEntryName(rawName);

    totalUncompressedSize += uncompressedSize;
    if (totalUncompressedSize > MAX_UNCOMPRESSED_SIZE) {
      throw invalidScratchProject("The .sb3 file is too large after extraction.");
    }

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

export function readZipEntry(buffer, entry) {
  const offset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(offset) !== LOCAL_FILE_HEADER) {
    throw invalidScratchProject("The .sb3 ZIP local header is corrupt.", { entry: entry.name });
  }

  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) {
    throw invalidScratchProject("The .sb3 ZIP entry points outside the file.", { entry: entry.name });
  }

  const compressed = buffer.subarray(dataStart, dataEnd);
  if (entry.compressionMethod === 0) {
    return compressed;
  }

  if (entry.compressionMethod === 8) {
    const inflated = inflateRawSync(compressed);
    if (inflated.length !== entry.uncompressedSize) {
      throw invalidScratchProject("The .sb3 ZIP entry size does not match after decompression.", {
        entry: entry.name,
      });
    }
    return inflated;
  }

  throw invalidScratchProject("The .sb3 file uses an unsupported ZIP compression method.", {
    entry: entry.name,
    compressionMethod: entry.compressionMethod,
  });
}

export function validateScratchProjectJson(projectJson) {
  if (!projectJson || typeof projectJson !== "object") {
    throw invalidScratchProject("project.json is not a JSON object.");
  }

  if (!Array.isArray(projectJson.targets) || projectJson.targets.length === 0) {
    throw invalidScratchProject("project.json does not contain Scratch targets.");
  }

  const stage = projectJson.targets.find((target) => target && target.isStage === true);
  if (!stage) {
    throw invalidScratchProject("project.json does not contain a Scratch stage.");
  }

  return {
    targetCount: projectJson.targets.length,
    stageName: stage.name || "Escenario",
    scratchVersion: projectJson.meta?.semver ?? projectJson.meta?.vm ?? "unknown",
  };
}

export function validateSb3Buffer(buffer) {
  const entries = readZipDirectory(buffer);
  const projectEntry = entries.find((entry) => entry.name === "project.json");
  if (!projectEntry) {
    throw invalidScratchProject("The .sb3 file does not contain project.json.");
  }

  if (projectEntry.uncompressedSize > MAX_PROJECT_JSON_SIZE) {
    throw invalidScratchProject("project.json is unexpectedly large.");
  }

  const projectJsonBytes = readZipEntry(buffer, projectEntry);
  let projectJson;
  try {
    projectJson = JSON.parse(projectJsonBytes.toString("utf8"));
  } catch (error) {
    throw invalidScratchProject("project.json is not valid JSON.", { cause: error.message });
  }

  const summary = validateScratchProjectJson(projectJson);
  return {
    entries,
    projectJson,
    summary,
  };
}
