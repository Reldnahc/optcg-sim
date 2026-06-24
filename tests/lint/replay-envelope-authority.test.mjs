import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

test("replay reducers do not inspect client envelopes", () => {
  const reducer = readFileSync(
    "packages/engine-core/src/replay/artifact-reducer.ts",
    "utf8",
  );

  assert.doesNotMatch(reducer, /envelope/u);
  assert.doesNotMatch(reducer, /actionIndex/u);
  assert.doesNotMatch(reducer, /ClientActionEnvelope/u);
});
