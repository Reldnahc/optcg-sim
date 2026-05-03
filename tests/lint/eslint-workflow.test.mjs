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

async function lintFixture(relativePath) {
  const { ESLint } = await import("eslint");
  const eslint = new ESLint({
    cwd: repoRoot,
    ignore: false,
  });

  return eslint.lintFiles([relativePath]);
}

async function createRepoEslint() {
  const { ESLint } = await import("eslint");

  return new ESLint({
    cwd: repoRoot,
  });
}

test("package.json defines a real eslint-based lint script", async () => {
  const packageJson = await readJson("package.json");

  assert.equal(
    typeof packageJson.scripts?.lint,
    "string",
    "missing lint script",
  );
  assert.match(
    packageJson.scripts.lint,
    /eslint/i,
    "lint script should run eslint",
  );
  assert.doesNotMatch(
    packageJson.scripts.lint,
    /--ignore-pattern\s+tests\/fixtures\/eslint\/\*\*/i,
    "repo-wide fixture ignores should live in ESLint config, not only in the CLI script",
  );
});

test("eslint config file exists", async () => {
  const configCandidates = ["eslint.config.mjs", "eslint.config.js"];

  const contents = await Promise.any(
    configCandidates.map(async (candidate) =>
      readFile(path.join(repoRoot, candidate), "utf8"),
    ),
  );

  assert.equal(typeof contents, "string");
});

test("eslint ignores rule-testing fixtures during repo-wide linting", async () => {
  const eslint = await createRepoEslint();
  const isIgnored = await eslint.isPathIgnored(
    path.join(repoRoot, "tests/fixtures/eslint/unsafe-types.ts"),
  );

  assert.equal(
    isIgnored,
    true,
    "repo-wide lint should ignore rule-testing fixtures",
  );
});

test("eslint rejects explicit any and non-null assertions", async () => {
  const results = await lintFixture("tests/fixtures/eslint/unsafe-types.ts");
  const messages = results.flatMap((result) =>
    result.messages.map((message) => message.ruleId),
  );

  assert.ok(messages.includes("@typescript-eslint/no-explicit-any"));
  assert.ok(messages.includes("@typescript-eslint/no-non-null-assertion"));
});

test("eslint rejects ts-ignore and ts-nocheck", async () => {
  const results = await lintFixture(
    "tests/fixtures/eslint/banned-ts-comments.ts",
  );
  const messages = results.flatMap((result) =>
    result.messages.map((message) => message.ruleId),
  );

  assert.ok(messages.includes("@typescript-eslint/ban-ts-comment"));
});

test("eslint rejects default exports and console usage in production code", async () => {
  const results = await lintFixture(
    "tests/fixtures/eslint/production-smells.ts",
  );
  const messages = results.flatMap((result) =>
    result.messages.map((message) => message.ruleId),
  );

  assert.ok(messages.includes("no-restricted-syntax"));
  assert.ok(messages.includes("no-console"));
});

test("eslint rejects floating promises", async () => {
  const results = await lintFixture(
    "tests/fixtures/eslint/floating-promise.ts",
  );
  const messages = results.flatMap((result) =>
    result.messages.map((message) => message.ruleId),
  );

  assert.ok(messages.includes("@typescript-eslint/no-floating-promises"));
});

test("eslint rejects focused tests", async () => {
  const results = await lintFixture(
    "tests/fixtures/eslint/focused.only.test.ts",
  );
  const messages = results.flatMap((result) =>
    result.messages.map((message) => message.ruleId),
  );

  assert.ok(messages.includes("vitest/no-focused-tests"));
});

test("eslint rejects forbidden engine-core imports", async () => {
  const results = await lintFixture(
    "tests/fixtures/eslint/packages/engine-core/src/forbidden-import.ts",
  );
  const restrictedImportMessages = results.flatMap((result) =>
    result.messages.filter(
      (message) => message.ruleId === "no-restricted-imports",
    ),
  );
  const restrictedImportText = restrictedImportMessages
    .map((message) => message.message)
    .join("\n");
  const requiredForbiddenSources = [
    "react",
    "redis",
    "pg",
    "ws",
    "axios",
    "undici",
    "node-fetch",
    "../../../browser/src/example",
    "../../../client/src/example",
    "../../../server/src/example",
  ];

  assert.equal(
    restrictedImportMessages.length,
    requiredForbiddenSources.length,
    "engine-core boundary fixture should trigger one no-restricted-imports error per forbidden import class",
  );
  for (const source of requiredForbiddenSources) {
    assert.ok(
      restrictedImportText.includes(source),
      `engine-core boundary fixture should reject ${source}`,
    );
  }
});
