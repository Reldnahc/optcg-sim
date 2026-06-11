import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

test("target decisions do not branch by exact trigger wrapper", async () => {
  const content = await readFile(
    path.join(
      repoRoot,
      "packages/engine-core/src/effect-runtime-queue/target-decisions.ts",
    ),
    "utf8",
  );

  assert.equal(content.includes('effect.trigger.type === "main"'), false);
  assert.equal(
    content.includes('effect.trigger.type === "activateMain"'),
    false,
  );
});
