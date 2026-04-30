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

test("repo bootstrap files exist", async () => {
  const expectedFiles = [
    "package.json",
    "pnpm-workspace.yaml",
    "tsconfig.base.json",
    ".editorconfig",
    ".gitattributes",
    ".gitignore",
    "packages/types/package.json",
    "packages/types/tsconfig.json",
    "packages/types/src/index.ts",
  ];

  await Promise.all(
    expectedFiles.map(async (relativePath) => {
      const absolutePath = path.join(repoRoot, relativePath);
      await readFile(absolutePath, "utf8");
    }),
  );
});

test("package.json defines canonical root task names", async () => {
  const packageJson = await readJson("package.json");

  assert.equal(typeof packageJson.name, "string");
  assert.equal(typeof packageJson.private, "boolean");
  assert.ok(packageJson.private, "root package must be private");

  const requiredScripts = ["lint", "typecheck", "test", "coverage", "verify"];
  for (const scriptName of requiredScripts) {
    assert.equal(
      typeof packageJson.scripts?.[scriptName],
      "string",
      `missing ${scriptName} script`,
    );
  }
});

test("tsconfig base enforces the required strict compiler options", async () => {
  const tsconfig = await readJson("tsconfig.base.json");
  const compilerOptions = tsconfig.compilerOptions ?? {};

  const expectedOptions = {
    strict: true,
    noImplicitAny: true,
    noImplicitOverride: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    noFallthroughCasesInSwitch: true,
    noPropertyAccessFromIndexSignature: true,
    useUnknownInCatchVariables: true,
    noEmitOnError: true,
  };

  for (const [optionName, optionValue] of Object.entries(expectedOptions)) {
    assert.equal(
      compilerOptions[optionName],
      optionValue,
      `expected compilerOptions.${optionName} to equal ${optionValue}`,
    );
  }
});

test("minimal package extends the shared tsconfig base", async () => {
  const packageTsconfig = await readJson("packages/types/tsconfig.json");
  const packageJson = await readJson("packages/types/package.json");

  assert.equal(packageTsconfig.extends, "../../tsconfig.base.json");
  assert.equal(packageJson.name, "@optcg/types");
  assert.equal(packageJson.private, true);
});
