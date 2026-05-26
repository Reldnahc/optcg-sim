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
  const contents = await readFile(path.join(repoRoot, relativePath), "utf8");
  return JSON.parse(contents);
}

test("root dev command starts both client and match server", async () => {
  const packageJson = await readJson("package.json");
  const script = packageJson.scripts?.dev;

  assert.equal(script, "node --experimental-strip-types tools/dev-match.ts");
  assert.equal(packageJson.scripts?.["dev:match"], script);

  const runner = await readFile(
    path.join(repoRoot, "tools", "dev-match.ts"),
    "utf8",
  );
  assert.match(runner, /@optcg\/match-server/u);
  assert.match(runner, /@optcg\/client/u);
  assert.match(runner, /--filter/u);
});
