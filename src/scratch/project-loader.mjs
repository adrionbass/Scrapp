import { readFile } from "node:fs/promises";
import path from "node:path";
import { validateSb3Buffer } from "../core/sb3-validator.mjs";

export async function loadLocalSb3(filePath) {
  if (path.extname(filePath).toLowerCase() !== ".sb3") {
    throw new Error("Expected a .sb3 file.");
  }

  const buffer = await readFile(filePath);
  return {
    ...validateSb3Buffer(buffer),
    sourceBuffer: buffer,
  };
}
