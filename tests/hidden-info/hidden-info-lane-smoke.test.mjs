import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

async function readJson(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const contents = await readFile(absolutePath, "utf8");
  return JSON.parse(contents);
}

test("package.json exposes a dedicated hidden-info lane", async () => {
  const packageJson = await readJson("package.json");
  const hiddenInfoScript = packageJson.scripts?.["test:hidden-info"];

  assert.equal(
    hiddenInfoScript,
    "corepack pnpm exec vitest run tests/hidden-info",
    "test:hidden-info should call the canonical hidden-info target directly",
  );
  assert.notEqual(
    hiddenInfoScript,
    packageJson.scripts?.test,
    "test:hidden-info should be independent from the generic test lane",
  );
  assert.doesNotMatch(
    hiddenInfoScript,
    /\bpnpm run test\b/i,
    "test:hidden-info should not delegate to the generic test script",
  );
});
