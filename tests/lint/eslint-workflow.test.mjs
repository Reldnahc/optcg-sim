import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import eslintConfig, {
  sourceFileSizeGuardTemporaryAllowlist,
} from "../../eslint.config.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const ESLINT_FIXTURE_TIMEOUT_MS = 15_000;

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

function getSourceFileSizeGuardConfig() {
  const guardConfig = eslintConfig.find(
    (config) => config.name === "source-file-size-guard",
  );

  assert.ok(guardConfig, "missing source file size guard config");

  return guardConfig;
}

function getMaxLinesRuleOptions() {
  const guardConfig = getSourceFileSizeGuardConfig();
  const rule = guardConfig.rules?.["max-lines"];

  assert.ok(Array.isArray(rule), "max-lines rule should use array options");
  assert.equal(rule[0], "error");
  assert.equal(typeof rule[1], "object");

  return rule[1];
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

test("eslint max-lines guard uses hard max 1000 for normal code files", () => {
  const guardConfig = getSourceFileSizeGuardConfig();
  const ruleOptions = getMaxLinesRuleOptions();

  assert.equal(ruleOptions.max, 1000);
  assert.deepEqual(guardConfig.files, [
    "packages/**/*.{ts,mts,cts,js,mjs,cjs}",
    "tools/**/*.{ts,mts,cts,js,mjs,cjs}",
    "tests/**/*.{ts,mts,cts,js,mjs,cjs}",
    "contracts/**/*.ts",
  ]);
});

test("eslint max-lines guard skips blank lines and comments", () => {
  const ruleOptions = getMaxLinesRuleOptions();

  assert.equal(ruleOptions.skipBlankLines, true);
  assert.equal(ruleOptions.skipComments, true);
});

test("eslint max-lines temporary allowlist is exact-path only", () => {
  assert.ok(Array.isArray(sourceFileSizeGuardTemporaryAllowlist));

  for (const allowlistedPath of sourceFileSizeGuardTemporaryAllowlist) {
    assert.doesNotMatch(
      allowlistedPath,
      /[*{}[\]?]/,
      "temporary max-lines allowlist must not use globs",
    );
    assert.doesNotMatch(
      allowlistedPath,
      /(^|\/)(specs|fixtures)(\/|$)/,
      "temporary max-lines allowlist must not target broad artifact directories",
    );
    assert.match(
      allowlistedPath,
      /^(packages|tools|tests|contracts)\//,
      "temporary max-lines allowlist entries must be repo-relative guarded code paths",
    );
  }
});

test("eslint max-lines guard excludes broad generated spec fixture and artifact paths", () => {
  const guardConfig = getSourceFileSizeGuardConfig();

  assert.ok(
    guardConfig.ignores?.includes("**/fixtures/**"),
    "fixtures should be excluded from source file size guard",
  );
  assert.ok(
    guardConfig.ignores?.includes("**/generated/**"),
    "generated machine-readable outputs should be excluded from source file size guard",
  );
  assert.ok(
    guardConfig.ignores?.includes("**/*.generated.{ts,mts,cts,js,mjs,cjs}"),
    "generated code artifacts should be excluded from source file size guard",
  );
  assert.ok(
    guardConfig.files.every((filePattern) => !filePattern.startsWith("specs/")),
    "spec docs and copied source artifacts should not be in the guarded code scope",
  );
  assert.ok(
    guardConfig.files.every(
      (filePattern) => !/[.](json|ya?ml|sql|md)$/.test(filePattern),
    ),
    "JSON, YAML, SQL, and Markdown artifacts should not be guarded",
  );
});

test("eslint max-lines guard rejects oversized guarded code", async () => {
  const eslint = await createRepoEslint();
  const oversizedSource = Array.from(
    { length: 1001 },
    (_, index) => `export const value${index} = ${index};`,
  ).join("\n");
  const results = await eslint.lintText(oversizedSource, {
    filePath: path.join(repoRoot, "packages/example/src/oversized.js"),
  });
  const messages = results.flatMap((result) =>
    result.messages.map((message) => message.ruleId),
  );

  assert.ok(messages.includes("max-lines"));
});

test("eslint max-lines guard does not count blank lines or comments", async () => {
  const eslint = await createRepoEslint();
  const commentAndBlankLines = Array.from(
    { length: 1001 },
    (_, index) => `// documentation line ${index}\n`,
  ).join("\n");
  const results = await eslint.lintText(
    `${commentAndBlankLines}\nexport const compactSource = true;\n`,
    {
      filePath: path.join(repoRoot, "packages/example/src/comment-heavy.js"),
    },
  );
  const maxLinesMessages = results.flatMap((result) =>
    result.messages.filter((message) => message.ruleId === "max-lines"),
  );

  assert.equal(maxLinesMessages.length, 0);
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

test(
  "eslint rejects explicit any and non-null assertions",
  async () => {
    const results = await lintFixture("tests/fixtures/eslint/unsafe-types.ts");
    const messages = results.flatMap((result) =>
      result.messages.map((message) => message.ruleId),
    );

    assert.ok(messages.includes("@typescript-eslint/no-explicit-any"));
    assert.ok(messages.includes("@typescript-eslint/no-non-null-assertion"));
  },
  ESLINT_FIXTURE_TIMEOUT_MS,
);

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
    "@optcg/cards",
    "@optcg/cards/representative-fixtures",
    "@optcg/browser",
    "@optcg/client",
    "@optcg/server",
    "@optcg/ui",
    "@optcg/view-engine",
    "react",
    "redis",
    "pg",
    "ws",
    "axios",
    "undici",
    "node-fetch",
    "../../../cards/src/poneglyph-client",
    "../../../browser/src/example",
    "../../../client/src/example",
    "../../../server/src/example",
    "../../../ui/src/example",
    "../../../view-engine/src/example",
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
