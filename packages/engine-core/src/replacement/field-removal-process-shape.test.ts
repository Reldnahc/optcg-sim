import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..", "..", "..");

const readSource = (path: string): string =>
  readFileSync(join(repoRoot, path), "utf8");

test("production field-removal routing is not owned by the K.O. replacement barrel", () => {
  const routingSources = [
    "packages/engine-core/src/battle/resolution.ts",
    "packages/engine-core/src/runtime/primitives/target-ko.ts",
  ]
    .map(readSource)
    .join("\n");

  assert.doesNotMatch(
    routingSources,
    /effect-runtime-ko-replacement-process/,
    "field-removal routing must import the field-removal process owner, not the legacy K.O. barrel",
  );
  assert.match(
    routingSources,
    /field-removal-process/,
    "field-removal routing must depend on the generic field-removal process owner",
  );
});

test("selected-target K.O. primitive does not own generic field-removal execution", () => {
  const source = readSource(
    "packages/engine-core/src/runtime/primitives/target-ko.ts",
  );

  assert.doesNotMatch(source, /\bmoveFieldCardToOwnerHand\b/);
  assert.doesNotMatch(source, /\bapplyFieldRemovalProtection\b/);
  assert.doesNotMatch(
    source,
    /\bexecuteUnreplacedSelectedTargetFieldRemovalProcess\b/,
  );
  assert.match(source, /runtime\/primitives\/field-removal|\.\/field-removal/);
});
