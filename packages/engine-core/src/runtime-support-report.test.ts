import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

import {
  createRuntimeSupportReport,
  runtimeSupportRecord,
} from "./runtime-support-report.js";

test("runtime support records are runtime-authority evidence", () => {
  assert.deepEqual(
    runtimeSupportRecord({
      family: "body",
      id: "draw",
      supported: true,
      effectPath: ["effect"],
    }),
    {
      authority: "runtime",
      family: "body",
      id: "draw",
      supported: true,
      effectPath: ["effect"],
    },
  );
});

test("runtime support report derives missing evidence from unsupported records", () => {
  const report = createRuntimeSupportReport([
    runtimeSupportRecord({
      family: "entryPoint",
      id: "onPlay",
      supported: true,
      effectPath: ["entry"],
    }),
    runtimeSupportRecord({
      family: "body",
      id: "customUnsupported",
      supported: false,
      reason: "unsupported auto effect body",
      effectPath: ["effect"],
    }),
  ]);

  assert.equal(report.supported, false);
  assert.equal(report.reason, "unsupported auto effect body");
  assert.deepEqual(report.missing, [
    {
      authority: "runtime",
      family: "body",
      id: "customUnsupported",
      reason: "unsupported auto effect body",
      effectPath: ["effect"],
    },
  ]);
});

test("runtime support reporting stays independent from parser and card metadata authority", async () => {
  const [reportSource, admissionSource] = await Promise.all([
    readFile(new URL("./runtime-support-report.ts", import.meta.url), "utf8"),
    readFile(new URL("./effect-runtime-admission.ts", import.meta.url), "utf8"),
  ]);
  const forbiddenAuthority =
    /\b(?:cardId|parserRuleId|shapeId|componentEvidenceId|runtimeCapability|supportAllowlist|supportInventory)\b/u;
  const forbiddenMap =
    /\b(?:parserRule|shape|component|capability)[A-Za-z0-9_]*To[A-Za-z0-9_]*(?:Support|Certification)\b/u;

  assert.doesNotMatch(reportSource, forbiddenAuthority);
  assert.doesNotMatch(reportSource, forbiddenMap);
  assert.doesNotMatch(admissionSource, forbiddenMap);
});
