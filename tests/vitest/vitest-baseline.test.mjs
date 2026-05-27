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
  assert.doesNotMatch(
    packageJson.scripts.coverage,
    /pnpm run test\b/i,
    "coverage should not inherit the narrowed root test lane",
  );
  assert.match(
    packageJson.scripts.coverage,
    /--testTimeout\s+15000\b/,
    "coverage should keep full direct Vitest coverage but allow slow aggregate workflow contracts to finish",
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

test("root vitest lane excludes contract and tooling lanes", async () => {
  const packageJson = await readJson("package.json");

  assert.match(
    packageJson.scripts.test,
    /--exclude\s+tests\/contracts\/\*\*\/\*\.test\.mjs\b/,
    "root test lane must exclude broad tests/contracts suites",
  );
  assert.match(
    packageJson.scripts.test,
    /--exclude\s+packages\/cli\/src\/\*\*\/\*\.test\.ts\b/,
    "root test lane must exclude CLI test files",
  );
  assert.match(
    packageJson.scripts.test,
    /--exclude\s+tests\/lint\/\*\*\/\*\.test\.mjs\b/,
    "root test lane must exclude lint-config test files",
  );
});

test("verify and tooling lanes preserve moved-suite enforcement", async () => {
  const packageJson = await readJson("package.json");

  assert.equal(
    typeof packageJson.scripts?.["test:tooling"],
    "string",
    "missing test:tooling script",
  );
  assert.match(
    packageJson.scripts["test:tooling"],
    /\bvitest\s+run\b/,
    "test:tooling should run vitest",
  );
  assert.match(
    packageJson.scripts["test:tooling"],
    /\bpackages\/cli\/src\b/,
    "test:tooling should include CLI suites",
  );
  assert.match(
    packageJson.scripts["test:tooling"],
    /\btests\/lint\b/,
    "test:tooling should include lint-config suites",
  );
  assert.match(
    packageJson.scripts.verify,
    /\bpnpm run test:tooling\b/,
    "verify should include tooling lane",
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
