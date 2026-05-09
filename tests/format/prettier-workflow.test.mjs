import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { check, getFileInfo, resolveConfig } from "prettier";
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

test("package.json defines format scripts", async () => {
  const packageJson = await readJson("package.json");

  assert.equal(
    typeof packageJson.scripts?.format,
    "string",
    "missing format script",
  );
  assert.equal(
    typeof packageJson.scripts?.["format:check"],
    "string",
    "missing format:check script",
  );
});

test("prettier config files exist", async () => {
  await readFile(path.join(repoRoot, ".prettierrc"), "utf8");
  await readFile(path.join(repoRoot, ".prettierignore"), "utf8");
});

test("prettier detects an intentionally unformatted representative file", async () => {
  const fixturePath = path.join(
    repoRoot,
    "tests/fixtures/prettier/unformatted.js",
  );
  const source = await readFile(fixturePath, "utf8");
  const config = await resolveConfig(fixturePath);

  const isFormatted = await check(source, {
    ...config,
    filepath: fixturePath,
  });

  assert.equal(
    isFormatted,
    false,
    "Prettier should detect the unformatted representative fixture as drift",
  );
});

test("ignored fixture paths are excluded by prettier ignore rules", async () => {
  const fixturePath = path.join(
    repoRoot,
    "tests/fixtures/prettier/ignored/generated.js",
  );
  const fileInfo = await getFileInfo(fixturePath, {
    ignorePath: path.join(repoRoot, ".prettierignore"),
  });

  assert.equal(
    fileInfo.ignored,
    true,
    "ignored fixture should be excluded by Prettier",
  );
});

test("cleanup workflow scratch artifacts are excluded by prettier ignore rules", async () => {
  const cleanupPlanPath = path.join(
    repoRoot,
    ".cleanup/bound-cleanup-plan.json",
  );
  const fileInfo = await getFileInfo(cleanupPlanPath, {
    ignorePath: path.join(repoRoot, ".prettierignore"),
  });

  assert.equal(
    fileInfo.ignored,
    true,
    "cleanup workflow scratch artifacts should be excluded by Prettier",
  );
});
