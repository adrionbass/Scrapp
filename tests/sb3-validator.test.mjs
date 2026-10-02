import test from "node:test";
import assert from "node:assert/strict";
import { validateSb3Buffer } from "../src/core/sb3-validator.mjs";
import { createMinimalSb3, createZip } from "./helpers/zip.mjs";

test("validates a minimal deflated sb3 container", () => {
  const result = validateSb3Buffer(createMinimalSb3());
  assert.equal(result.summary.targetCount, 1);
  assert.equal(result.summary.stageName, "Escenario");
});

test("rejects unsafe ZIP paths", () => {
  const zip = createZip([{ name: "../project.json", data: "{}" }]);
  assert.throws(() => validateSb3Buffer(zip), /unsafe path/);
});

test("rejects a container without project.json", () => {
  const zip = createZip([{ name: "asset.txt", data: "hello" }]);
  assert.throws(() => validateSb3Buffer(zip), /does not contain project.json/);
});

test("rejects malformed project json", () => {
  const zip = createZip([{ name: "project.json", data: "{ nope" }]);
  assert.throws(() => validateSb3Buffer(zip), /not valid JSON/);
});
