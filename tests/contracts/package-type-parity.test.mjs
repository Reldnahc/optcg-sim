import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const toolPath = path.join(repoRoot, "tools", "sync-package-types.ts");
const tempRoots = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((tempRoot) =>
      rm(tempRoot, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

test("types sync check fails when canonical index exports are missing from package index", async () => {
  const tempRoot = await makeFixtureRepo();
  const initialCheck = runTool(tempRoot, "check");
  assert.equal(initialCheck.status, 0, initialCheck.stderr);

  await writeFixtureFile(
    tempRoot,
    "contracts/canonical-types.ts",
    'export type * from "./types/runtime.js";\nexport type * from "./types/primitives.js";\nexport type * from "./types/events.js";\n',
  );

  const staleCheck = runTool(tempRoot, "check");
  assert.notEqual(staleCheck.status, 0);
  assert.match(staleCheck.stderr, /packages\/types\/src\/index\.ts/);
});

test("types sync check fails when package projection output is stale", async () => {
  const tempRoot = await makeFixtureRepo();
  const initialCheck = runTool(tempRoot, "check");
  assert.equal(initialCheck.status, 0, initialCheck.stderr);

  await writeFixtureFile(
    tempRoot,
    "contracts/types/runtime.ts",
    "export interface RuntimeRow { turn: number; changed: true; }\n",
  );

  const staleCheck = runTool(tempRoot, "check");
  assert.notEqual(staleCheck.status, 0);
  assert.match(staleCheck.stderr, /packages\/types\/src\/runtime\.ts/);
});

function runTool(tempRoot, mode) {
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", toolPath, mode, "--repo-root", tempRoot],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );
}

async function makeFixtureRepo() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "optcg-type-parity-"));
  tempRoots.push(tempRoot);
  await mkdir(path.join(tempRoot, "contracts", "types"), { recursive: true });
  await mkdir(path.join(tempRoot, "packages", "types", "src"), {
    recursive: true,
  });

  await writeFixtureFile(
    tempRoot,
    "contracts/types/primitives.ts",
    'export type PrimitiveId = "A" | "B";\n',
  );
  await writeFixtureFile(
    tempRoot,
    "contracts/types/events.ts",
    'import type { PrimitiveId } from "./primitives.js";\nexport interface EventRow { id: PrimitiveId; }\n',
  );
  await writeFixtureFile(
    tempRoot,
    "contracts/types/runtime.ts",
    "export interface RuntimeRow { turn: number; }\n",
  );
  await writeFixtureFile(
    tempRoot,
    "contracts/canonical-types.ts",
    'export type * from "./types/runtime.js";\nexport type * from "./types/primitives.js";\n',
  );

  await writeFixtureFile(
    tempRoot,
    "packages/types/src/primitives.ts",
    'export type PrimitiveId = "A" | "B";\n',
  );
  await writeFixtureFile(
    tempRoot,
    "packages/types/src/events.ts",
    'import type { PrimitiveId } from "./primitives.js";\nexport interface EventRow { id: PrimitiveId; }\n',
  );
  await writeFixtureFile(
    tempRoot,
    "packages/types/src/runtime.ts",
    "export interface RuntimeRow { turn: number; }\n",
  );
  await writeFixtureFile(
    tempRoot,
    "packages/types/src/index.ts",
    'export type * from "./runtime.js";\nexport type * from "./primitives.js";\n',
  );

  for (const unmappedModule of [
    "card-metadata.ts",
    "view.ts",
    "game-state.ts",
    "effects.ts",
    "decisions.ts",
    "effect-presentation.ts",
  ]) {
    await writeFixtureFile(tempRoot, `contracts/types/${unmappedModule}`, "");
    await writeFixtureFile(
      tempRoot,
      `packages/types/src/${unmappedModule}`,
      "",
    );
  }

  return tempRoot;
}

async function writeFixtureFile(root, relativePath, content) {
  await writeFile(path.join(root, ...relativePath.split("/")), content);
}
