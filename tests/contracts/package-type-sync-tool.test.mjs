import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

test("write mode produces deterministic package output from canonical inputs", async () => {
  const tempRoot = await makeFixtureRepo();
  const first = runTool(tempRoot, "write");
  assert.equal(first.status, 0, first.stderr);

  const firstPrimitives = await readFixtureFile(
    tempRoot,
    "packages/types/src/primitives.ts",
  );
  const firstEvents = await readFixtureFile(
    tempRoot,
    "packages/types/src/events.ts",
  );
  const firstRuntime = await readFixtureFile(
    tempRoot,
    "packages/types/src/runtime.ts",
  );
  const firstIndex = await readFixtureFile(
    tempRoot,
    "packages/types/src/index.ts",
  );
  const firstUnmappedSupport = await readFixtureFile(
    tempRoot,
    "packages/types/src/support.ts",
  );

  const second = runTool(tempRoot, "write");
  assert.equal(second.status, 0, second.stderr);

  const secondPrimitives = await readFixtureFile(
    tempRoot,
    "packages/types/src/primitives.ts",
  );
  const secondEvents = await readFixtureFile(
    tempRoot,
    "packages/types/src/events.ts",
  );
  const secondRuntime = await readFixtureFile(
    tempRoot,
    "packages/types/src/runtime.ts",
  );
  const secondIndex = await readFixtureFile(
    tempRoot,
    "packages/types/src/index.ts",
  );
  const secondUnmappedSupport = await readFixtureFile(
    tempRoot,
    "packages/types/src/support.ts",
  );

  assert.equal(secondPrimitives, firstPrimitives);
  assert.equal(secondEvents, firstEvents);
  assert.equal(secondRuntime, firstRuntime);
  assert.equal(secondIndex, firstIndex);
  assert.equal(secondUnmappedSupport, firstUnmappedSupport);
  assert.equal(
    firstUnmappedSupport,
    "export type SupportMarker = 'package-local';\n",
  );
});

test("check mode fails when package output is stale and identifies stale file paths", async () => {
  const tempRoot = await makeFixtureRepo();
  const write = runTool(tempRoot, "write");
  assert.equal(write.status, 0, write.stderr);

  await writeFixtureFile(
    tempRoot,
    "packages/types/src/primitives.ts",
    'export type PrimitiveId = "stale";\n',
  );

  const check = runTool(tempRoot, "check");
  assert.notEqual(check.status, 0);
  assert.match(check.stderr, /packages\/types\/src\/primitives\.ts/);
  assert.match(check.stderr, /stale|mismatch/i);
});

test("check mode succeeds when generated outputs are clean", async () => {
  const tempRoot = await makeFixtureRepo();
  const write = runTool(tempRoot, "write");
  assert.equal(write.status, 0, write.stderr);

  const check = runTool(tempRoot, "check");
  assert.equal(check.status, 0, check.stderr);
});

test("stale diagnostics are emitted in stable sorted package-path order", async () => {
  const tempRoot = await makeFixtureRepo();
  const write = runTool(tempRoot, "write");
  assert.equal(write.status, 0, write.stderr);

  await writeFixtureFile(
    tempRoot,
    "packages/types/src/runtime.ts",
    "export type RuntimeMarker = 'drift-runtime';\n",
  );
  await writeFixtureFile(
    tempRoot,
    "packages/types/src/events.ts",
    "export type EventMarker = 'drift-events';\n",
  );

  const check = runTool(tempRoot, "check");
  assert.notEqual(check.status, 0);

  const diagnostics = check.stderr
    .split(/\r?\n/)
    .filter((line) => line.includes("packages/types/src/"));
  assert.deepEqual(diagnostics, [
    "packages/types/src/events.ts",
    "packages/types/src/runtime.ts",
  ]);
  assert.deepEqual(diagnostics, [...diagnostics].sort());
});

test("sync preserves type-only import and export semantics and .js specifiers", async () => {
  const tempRoot = await makeFixtureRepo();
  const write = runTool(tempRoot, "write");
  assert.equal(write.status, 0, write.stderr);

  const runtimeOutput = await readFixtureFile(
    tempRoot,
    "packages/types/src/runtime.ts",
  );
  const indexOutput = await readFixtureFile(
    tempRoot,
    "packages/types/src/index.ts",
  );

  assert.match(
    runtimeOutput,
    /^import type\s+\{[^]*\}\s+from "\.\/primitives\.js";/m,
  );
  assert.match(indexOutput, /export type \* from "\.\/primitives\.js";/);
  assert.doesNotMatch(indexOutput, /"\.\/types\//);
});

test("package scripts expose sync entrypoints and tools tsconfig typechecks the tool", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(repoRoot, "package.json"), "utf8"),
  );
  const toolsTsconfig = JSON.parse(
    await readFile(path.join(repoRoot, "tools", "tsconfig.json"), "utf8"),
  );

  assert.equal(
    packageJson.scripts?.["types:sync:write"],
    "node --experimental-strip-types tools/sync-package-types.ts write",
  );
  assert.equal(
    packageJson.scripts?.["types:sync:check"],
    "node --experimental-strip-types tools/sync-package-types.ts check",
  );
  assert.ok(
    toolsTsconfig.files.includes("sync-package-types.ts"),
    "tools tsconfig must include sync-package-types.ts so root typecheck covers it",
  );
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
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "optcg-type-sync-"));
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
    "contracts/types/card-metadata.ts",
    "export interface CardMetadata { name: string; }\n",
  );
  await writeFixtureFile(
    tempRoot,
    "contracts/types/decisions.ts",
    "export interface DecisionPrompt { id: string; }\n",
  );
  await writeFixtureFile(
    tempRoot,
    "contracts/types/effects.ts",
    "export interface EffectRow { id: string; }\n",
  );
  await writeFixtureFile(
    tempRoot,
    "contracts/types/effect-continuous.ts",
    "export interface EffectContinuousRow { id: string; }\n",
  );
  await writeFixtureFile(
    tempRoot,
    "contracts/types/effect-costs.ts",
    "export interface EffectCostRow { id: string; }\n",
  );
  await writeFixtureFile(
    tempRoot,
    "contracts/types/effect-definition.ts",
    "export interface EffectDefinitionRow { id: string; }\n",
  );
  await writeFixtureFile(
    tempRoot,
    "contracts/types/effect-policies.ts",
    "export interface EffectPolicyRow { id: string; }\n",
  );
  await writeFixtureFile(
    tempRoot,
    "contracts/types/effect-protection.ts",
    "export interface EffectProtectionRow { id: string; }\n",
  );
  await writeFixtureFile(
    tempRoot,
    "contracts/types/effect-triggers.ts",
    "export interface EffectTriggerRow { id: string; }\n",
  );
  await writeFixtureFile(
    tempRoot,
    "contracts/types/events.ts",
    'import type { PrimitiveId } from "./primitives.js";\nexport interface EventRow { id: PrimitiveId; }\n',
  );
  await writeFixtureFile(
    tempRoot,
    "contracts/types/game-state.ts",
    "export interface GameStateRow { turn: number; }\n",
  );
  await writeFixtureFile(
    tempRoot,
    "contracts/types/runtime.ts",
    'import type { PrimitiveId } from "./primitives.js";\nexport interface RuntimeRow { id: PrimitiveId; }\n',
  );
  await writeFixtureFile(
    tempRoot,
    "contracts/types/effect-presentation.ts",
    'export interface EffectPresentationRow { id: "span"; }\n',
  );
  await writeFixtureFile(
    tempRoot,
    "contracts/types/support-certification.ts",
    'export interface SupportCertificationRow { id: "support"; }\n',
  );
  await writeFixtureFile(
    tempRoot,
    "contracts/types/view.ts",
    "export interface PlayerView { activePlayer: string; }\n",
  );
  await writeFixtureFile(
    tempRoot,
    "contracts/canonical-types.ts",
    'export type * from "./types/runtime.js";\nexport type * from "./types/primitives.js";\nexport type * from "./types/events.js";\nexport type * from "./types/card-metadata.js";\n',
  );
  await writeFixtureFile(
    tempRoot,
    "contracts/types/support.ts",
    "export interface SupportContractOnly { hidden: true; }\n",
  );
  await writeFixtureFile(
    tempRoot,
    "packages/types/src/support.ts",
    "export type SupportMarker = 'package-local';\n",
  );
  return tempRoot;
}

async function readFixtureFile(root, relativePath) {
  return readFile(path.join(root, ...relativePath.split("/")), "utf8");
}

async function writeFixtureFile(root, relativePath, content) {
  await writeFile(path.join(root, ...relativePath.split("/")), content);
}
