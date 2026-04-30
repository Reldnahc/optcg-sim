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

test("package.json defines vitest-based test and coverage scripts", async () => {
  const packageJson = await readJson("package.json");

  assert.match(
    packageJson.scripts.test,
    /vitest/i,
    "test script should run Vitest",
  );
  assert.match(
    packageJson.scripts.coverage,
    /vitest/i,
    "coverage script should run Vitest",
  );
  assert.match(
    packageJson.scripts.verify,
    /pnpm run lint/i,
    "verify should orchestrate the canonical lint command",
  );
  assert.match(
    packageJson.scripts.verify,
    /pnpm run typecheck/i,
    "verify should orchestrate the canonical typecheck command",
  );
  assert.match(
    packageJson.scripts.verify,
    /pnpm run test/i,
    "verify should orchestrate the canonical test command",
  );
});

test("vitest baseline files exist", async () => {
  await readFile(path.join(repoRoot, "vitest.config.ts"), "utf8");
  await readFile(
    path.join(repoRoot, "packages/types/src/index.test.ts"),
    "utf8",
  );
});

test("package.json declares the Vitest dev dependencies", async () => {
  const packageJson = await readJson("package.json");

  assert.equal(typeof packageJson.devDependencies?.vitest, "string");
  assert.equal(
    typeof packageJson.devDependencies?.["@vitest/coverage-v8"],
    "string",
  );
});
