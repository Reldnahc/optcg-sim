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

test("cards fixture capture script uses declared repo TypeScript runner", async () => {
  const rootPackageJson = await readJson("package.json");
  const cardsPackageJson = await readJson("packages/cards/package.json");
  const captureScript = cardsPackageJson.scripts?.["capture:fixture"];

  assert.equal(typeof captureScript, "string");
  assert.match(captureScript, /\bnode\b/);
  assert.match(captureScript, /--experimental-strip-types/);
  assert.match(captureScript, /--loader \.\/scripts\/source-loader\.mjs/);
  assert.match(captureScript, /src\/fixture-capture\.ts/);
  assert.doesNotMatch(captureScript, /\btsx\b/);
  assert.equal(rootPackageJson.devDependencies?.tsx, undefined);
  assert.equal(cardsPackageJson.devDependencies?.tsx, undefined);
  assert.equal(cardsPackageJson.dependencies?.tsx, undefined);
});
