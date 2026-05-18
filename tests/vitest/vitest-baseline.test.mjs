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

const cleanupHeavyFiles = [
  "tests/contracts/post-merge-cleanup-contract.test.mjs",
  "tests/contracts/post-merge-cleanup-parent-contract.test.mjs",
  "tests/contracts/post-merge-cleanup-preflight-contract.test.mjs",
  "tests/contracts/post-merge-cleanup-executor-contract.test.mjs",
  "tests/contracts/post-merge-branch-cleanup-contract.test.mjs",
  "tests/github/post-merge-cleanup-closeout.test.mjs",
  "tests/github/post-merge-cleanup-evidence-builder.test.mjs",
];

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
  assert.doesNotMatch(
    packageJson.scripts.coverage,
    /pnpm run test\b/i,
    "coverage should not inherit the narrowed root test lane",
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

test("root vitest lane excludes cleanup-heavy workflow contracts", async () => {
  const packageJson = await readJson("package.json");

  for (const cleanupFile of cleanupHeavyFiles) {
    assert.match(
      packageJson.scripts.test,
      new RegExp(
        `--exclude\\s+${cleanupFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      ),
      `root test lane must exclude ${cleanupFile}`,
    );
  }
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
