import assert from "node:assert/strict";
import { readdir as readDir, readFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import * as engineCorePackage from "@optcg/engine-core";
import type { MatchCardManifest } from "@optcg/types";
import {
  advanceDonPhase,
  advanceDrawPhase,
  advanceEndPhase,
  advanceRefreshPhase,
  advanceRngFloat01,
  advanceRngUint32,
  applyAction,
  applyDeterministicEntry,
  applyDeterministicOperation,
  applyEndMainPhase,
  assertGameStateInvariants,
  canonicalSerializeStateValue,
  checkpointResolverFromList,
  collectGameStateInvariantViolations,
  computeView,
  createInitialState,
  evaluateEffectBlockRuntimeSupport,
  filterStateForPlayer,
  GameStateInvariantError,
  getLegalActions,
  hashCanonicalStateValue,
  hashReplayStateForScope,
  initializeRng,
  processEffectRuntime,
  reconstructReplayArtifactStates,
  reindexZoneCards,
  resolveSupportedVanillaBattle,
  enterMainPhase,
  respondToMulliganDecision,
  splitEffectTextSpotlightPresentation,
  startMulliganFlow,
  toPublicTimerState,
} from "./index.js";

test("package runtime boundary exposes engine-core helpers", () => {
  assert.deepEqual(Object.keys(engineCorePackage).sort(), [
    "GameStateInvariantError",
    "advanceDonPhase",
    "advanceDrawPhase",
    "advanceEndPhase",
    "advanceRefreshPhase",
    "advanceRngFloat01",
    "advanceRngUint32",
    "applyAction",
    "applyDeterministicEntry",
    "applyDeterministicOperation",
    "applyEndMainPhase",
    "assertGameStateInvariants",
    "canonicalSerializeStateValue",
    "checkpointResolverFromList",
    "collectGameStateInvariantViolations",
    "computeView",
    "createInitialState",
    "enterMainPhase",
    "evaluateEffectBlockRuntimeSupport",
    "filterStateForPlayer",
    "getLegalActions",
    "hashCanonicalStateValue",
    "hashReplayStateForScope",
    "initializeRng",
    "processEffectRuntime",
    "reconstructReplayArtifactStates",
    "reindexZoneCards",
    "resolveSupportedVanillaBattle",
    "respondToMulliganDecision",
    "splitEffectTextSpotlightPresentation",
    "startMulliganFlow",
    "toPublicTimerState",
  ]);
  assert.equal(engineCorePackage.advanceRefreshPhase, advanceRefreshPhase);
  assert.equal(engineCorePackage.advanceDrawPhase, advanceDrawPhase);
  assert.equal(engineCorePackage.advanceDonPhase, advanceDonPhase);
  assert.equal(engineCorePackage.enterMainPhase, enterMainPhase);
  assert.equal(engineCorePackage.advanceEndPhase, advanceEndPhase);
  assert.equal(engineCorePackage.initializeRng, initializeRng);
  assert.equal(engineCorePackage.processEffectRuntime, processEffectRuntime);
  assert.equal(
    engineCorePackage.reconstructReplayArtifactStates,
    reconstructReplayArtifactStates,
  );
  assert.equal(engineCorePackage.reindexZoneCards, reindexZoneCards);
  assert.equal(engineCorePackage.advanceRngUint32, advanceRngUint32);
  assert.equal(engineCorePackage.advanceRngFloat01, advanceRngFloat01);
  assert.equal(engineCorePackage.getLegalActions, getLegalActions);
  assert.equal(engineCorePackage.applyAction, applyAction);
  assert.equal(
    engineCorePackage.applyDeterministicEntry,
    applyDeterministicEntry,
  );
  assert.equal(
    engineCorePackage.applyDeterministicOperation,
    applyDeterministicOperation,
  );
  assert.equal(engineCorePackage.applyEndMainPhase, applyEndMainPhase);
  assert.equal(
    engineCorePackage.resolveSupportedVanillaBattle,
    resolveSupportedVanillaBattle,
  );
  assert.equal(
    engineCorePackage.canonicalSerializeStateValue,
    canonicalSerializeStateValue,
  );
  assert.equal(
    engineCorePackage.checkpointResolverFromList,
    checkpointResolverFromList,
  );
  assert.equal(
    engineCorePackage.hashCanonicalStateValue,
    hashCanonicalStateValue,
  );
  assert.equal(
    engineCorePackage.hashReplayStateForScope,
    hashReplayStateForScope,
  );
  assert.equal(
    engineCorePackage.collectGameStateInvariantViolations,
    collectGameStateInvariantViolations,
  );
  assert.equal(engineCorePackage.computeView, computeView);
  assert.equal(
    engineCorePackage.evaluateEffectBlockRuntimeSupport,
    evaluateEffectBlockRuntimeSupport,
  );
  assert.equal(engineCorePackage.filterStateForPlayer, filterStateForPlayer);
  assert.equal(engineCorePackage.createInitialState, createInitialState);
  assert.equal(
    engineCorePackage.assertGameStateInvariants,
    assertGameStateInvariants,
  );
  assert.equal(
    engineCorePackage.GameStateInvariantError,
    GameStateInvariantError,
  );
  assert.equal(
    engineCorePackage.respondToMulliganDecision,
    respondToMulliganDecision,
  );
  assert.equal(engineCorePackage.startMulliganFlow, startMulliganFlow);
  assert.equal(
    engineCorePackage.splitEffectTextSpotlightPresentation,
    splitEffectTextSpotlightPresentation,
  );
  assert.equal(engineCorePackage.toPublicTimerState, toPublicTimerState);
});

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const forbiddenEngineProductionImports = [
  "@optcg/cards",
  "optcg-deck-hash",
  "redis",
] as const;

function isPlainManifestFixture(value: unknown): value is MatchCardManifest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record["manifestHash"] === "string" &&
    record["source"] === "poneglyph-fixture" &&
    typeof record["cardDataVersion"] === "string" &&
    typeof record["effectDefinitionsVersion"] === "string" &&
    typeof record["customHandlerVersion"] === "string" &&
    typeof record["banlistVersion"] === "string" &&
    typeof record["createdAt"] === "string" &&
    typeof record["cards"] === "object" &&
    record["cards"] !== null
  );
}

test("package boundary allows plain real-card DSL manifest fixture data", async () => {
  const fixturePath = path.join(
    repoRoot,
    "fixtures/cards/real-card-dsl-match-card-manifest.json",
  );
  const parsed = JSON.parse(await readFile(fixturePath, "utf8")) as unknown;

  assert.ok(
    isPlainManifestFixture(parsed),
    "engine-core tests may load plain manifest JSON without importing @optcg/cards",
  );
  assert.ok(
    Object.keys(parsed.cards).length > 0,
    "real-card DSL manifest fixture should contain card data",
  );
});

const importPatternForPackage = (packageName: string): RegExp => {
  const escapedPackageName = packageName.replace(
    /[.*+?^${}()|[\]\\]/gu,
    "\\$&",
  );
  return new RegExp(
    `(?:\\bimport(?:\\s+type)?\\b[\\s\\S]*?\\bfrom\\s*["']${escapedPackageName}(?:/[^"']*)?["']|\\bimport\\s*["']${escapedPackageName}(?:/[^"']*)?["']|\\bexport(?:\\s+type)?\\b[\\s\\S]*?\\bfrom\\s*["']${escapedPackageName}(?:/[^"']*)?["']|\\bimport\\s*\\(\\s*["']${escapedPackageName}(?:/[^"']*)?["']\\s*\\))`,
    "u",
  );
};

test("production engine-core source files do not import card, deck hash, or cache packages", async () => {
  const srcDirectoryPath = path.join(repoRoot, "packages/engine-core/src");
  const productionSourcePaths =
    await listProductionSourcePaths(srcDirectoryPath);
  const forbiddenImportPatterns = forbiddenEngineProductionImports.map(
    (packageName) => ({
      packageName,
      pattern: importPatternForPackage(packageName),
    }),
  );

  assert.ok(productionSourcePaths.length > 0);
  for (const sourcePath of productionSourcePaths) {
    const source = await readFile(sourcePath, "utf8");

    for (const { packageName, pattern } of forbiddenImportPatterns) {
      assert.equal(
        pattern.test(source),
        false,
        `engine-core production source must not import ${packageName}: ${sourcePath}`,
      );
    }
  }
});

test("production engine-core support predicates do not encode exact draw wrapper-body pairs", async () => {
  const srcDirectoryPath = path.join(repoRoot, "packages/engine-core/src");
  const productionSourcePaths =
    await listProductionSourcePaths(srcDirectoryPath);
  const exactWrapperDrawSupportPattern =
    /\bisSupported(?:Optional)?(?:NoChoice)?(?:OnPlay|WhenAttacking|OnOpponentAttack|OnKO|MainEvent|ActivateMain).*DrawEffect\b/u;

  assert.ok(productionSourcePaths.length > 0);
  for (const sourcePath of productionSourcePaths) {
    const source = await readFile(sourcePath, "utf8");
    assert.equal(
      exactWrapperDrawSupportPattern.test(source),
      false,
      `engine-core production support predicate must not encode an exact draw wrapper/body pair: ${sourcePath}`,
    );
  }
});

test("effect runtime queue results stays a small assembly module", async () => {
  const sourcePath = path.join(
    repoRoot,
    "packages/engine-core/src/effect-runtime-queue/results.ts",
  );
  const source = await readFile(sourcePath, "utf8");
  const lineCount = source.trimEnd().split("\n").length;

  assert.ok(
    lineCount <= 220,
    `effect-runtime-queue/results.ts should assemble focused modules, not own queue resolution; found ${String(lineCount)} lines`,
  );
});

test("effect runtime sequence saved-field-object stays a small public barrel", async () => {
  const sourcePath = path.join(
    repoRoot,
    "packages/engine-core/src/effect-runtime-sequence/saved-field-object.ts",
  );
  const source = await readFile(sourcePath, "utf8");
  const lineCount = source.trimEnd().split("\n").length;

  assert.ok(
    lineCount <= 160,
    `effect-runtime-sequence/saved-field-object.ts should be a public barrel over focused saved-field-object modules; found ${String(lineCount)} lines`,
  );
});

test("effect runtime sequence runner stays a small public barrel", async () => {
  const sourcePath = path.join(
    repoRoot,
    "packages/engine-core/src/effect-runtime-sequence/runner.ts",
  );
  const source = await readFile(sourcePath, "utf8");
  const lineCount = source.trimEnd().split("\n").length;

  assert.ok(
    lineCount <= 160,
    `effect-runtime-sequence/runner.ts should be a public barrel over focused runner modules; found ${String(lineCount)} lines`,
  );
});

test("replacement primitives stays a small public barrel", async () => {
  const sourcePath = path.join(
    repoRoot,
    "packages/engine-core/src/replacement/primitives.ts",
  );
  const source = await readFile(sourcePath, "utf8");
  const lineCount = source.trimEnd().split("\n").length;

  assert.ok(
    lineCount <= 180,
    `replacement/primitives.ts should be a public barrel over focused replacement support modules; found ${String(lineCount)} lines`,
  );
});

test("replacement field-removal process stays a small public barrel", async () => {
  const sourcePath = path.join(
    repoRoot,
    "packages/engine-core/src/replacement/field-removal-process.ts",
  );
  const source = await readFile(sourcePath, "utf8");
  const lineCount = source.trimEnd().split("\n").length;

  assert.ok(
    lineCount <= 220,
    `replacement/field-removal-process.ts should be a public barrel over focused field-removal process modules; found ${String(lineCount)} lines`,
  );
});

async function listProductionSourcePaths(
  directoryPath: string,
): Promise<readonly string[]> {
  const entries: Dirent[] = await readDir(directoryPath, {
    withFileTypes: true,
  });
  const sourcePaths: string[] = [];

  for (const entry of entries) {
    if (entry.name === "__tests__" || entry.name === "__fixtures__") {
      continue;
    }
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      const nestedPaths = await listProductionSourcePaths(absolutePath);
      sourcePaths.push(...nestedPaths);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (
      !entry.name.endsWith(".ts") ||
      entry.name.endsWith(".test.ts") ||
      entry.name.endsWith(".spec.ts")
    ) {
      continue;
    }
    sourcePaths.push(absolutePath);
  }

  return sourcePaths;
}
