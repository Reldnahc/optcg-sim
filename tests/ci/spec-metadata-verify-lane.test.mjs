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

async function readText(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test("verify lane includes stale spec metadata validation command", async () => {
  const packageJson = await readJson("package.json");
  const verifyLane = packageJson.scripts?.verify;
  const specVerifyLane = packageJson.scripts?.["specs:verify-metadata"];

  assert.equal(typeof verifyLane, "string", "missing verify script");
  assert.equal(
    typeof specVerifyLane,
    "string",
    "missing specs:verify-metadata script",
  );

  assert.match(
    verifyLane,
    /pnpm run specs:verify-metadata/i,
    "verify should call stale spec metadata verification through canonical script",
  );
});

test("ci includes spec metadata stale-artifact check in the contract lane", async () => {
  const workflow = await readText(".github/workflows/ci.yml");

  assert.match(workflow, /^\s+contracts:\s*$/m);
  assert.match(workflow, /Verify generated spec metadata artifacts/i);
  assert.match(workflow, /pnpm run specs:verify-metadata/i);
});
