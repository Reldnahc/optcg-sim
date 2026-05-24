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
  assertGameStateInvariants,
  canonicalSerializeStateValue,
  collectGameStateInvariantViolations,
  computeView,
  createInitialState,
  evaluateEffectBlockRuntimeSupport,
  filterStateForPlayer,
  GameStateInvariantError,
  getLegalActions,
  hashCanonicalStateValue,
  initializeRng,
  resolveSupportedVanillaBattle,
  enterMainPhase,
  respondToMulliganDecision,
  startMulliganFlow,
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
    "assertGameStateInvariants",
    "canonicalSerializeStateValue",
    "collectGameStateInvariantViolations",
    "computeView",
    "createInitialState",
    "enterMainPhase",
    "evaluateEffectBlockRuntimeSupport",
    "filterStateForPlayer",
    "getLegalActions",
    "hashCanonicalStateValue",
    "initializeRng",
    "resolveSupportedVanillaBattle",
    "respondToMulliganDecision",
    "startMulliganFlow",
  ]);
  assert.equal(engineCorePackage.advanceRefreshPhase, advanceRefreshPhase);
  assert.equal(engineCorePackage.advanceDrawPhase, advanceDrawPhase);
  assert.equal(engineCorePackage.advanceDonPhase, advanceDonPhase);
  assert.equal(engineCorePackage.enterMainPhase, enterMainPhase);
  assert.equal(engineCorePackage.advanceEndPhase, advanceEndPhase);
  assert.equal(engineCorePackage.initializeRng, initializeRng);
  assert.equal(engineCorePackage.advanceRngUint32, advanceRngUint32);
  assert.equal(engineCorePackage.advanceRngFloat01, advanceRngFloat01);
  assert.equal(engineCorePackage.getLegalActions, getLegalActions);
  assert.equal(engineCorePackage.applyAction, applyAction);
  assert.equal(
    engineCorePackage.resolveSupportedVanillaBattle,
    resolveSupportedVanillaBattle,
  );
  assert.equal(
    engineCorePackage.canonicalSerializeStateValue,
    canonicalSerializeStateValue,
  );
  assert.equal(
    engineCorePackage.hashCanonicalStateValue,
    hashCanonicalStateValue,
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
});

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

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

test("package boundary allows plain representative manifest fixture data", async () => {
  const fixturePath = path.join(
    repoRoot,
    "fixtures/cards/representative-match-card-manifest.json",
  );
  const parsed = JSON.parse(await readFile(fixturePath, "utf8")) as unknown;

  assert.ok(
    isPlainManifestFixture(parsed),
    "engine-core tests may load plain manifest JSON without importing @optcg/cards",
  );
  assert.ok(
    Object.keys(parsed.cards).length > 0,
    "representative manifest fixture should contain card data",
  );
});

test("production engine-core source files do not import @optcg/cards", async () => {
  const srcDirectoryPath = path.join(repoRoot, "packages/engine-core/src");
  const productionSourcePaths =
    await listProductionSourcePaths(srcDirectoryPath);
  const cardsImportPattern =
    /(?:\bimport(?:\s+type)?\b[\s\S]*?\bfrom\s*["']@optcg\/cards(?:\/[^"']*)?["']|\bimport\s*["']@optcg\/cards(?:\/[^"']*)?["']|\bexport(?:\s+type)?\b[\s\S]*?\bfrom\s*["']@optcg\/cards(?:\/[^"']*)?["']|\bimport\s*\(\s*["']@optcg\/cards(?:\/[^"']*)?["']\s*\))/u;

  assert.ok(productionSourcePaths.length > 0);
  for (const sourcePath of productionSourcePaths) {
    const source = await readFile(sourcePath, "utf8");

    assert.equal(
      cardsImportPattern.test(source),
      false,
      `engine-core production source must not import @optcg/cards: ${sourcePath}`,
    );
  }
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
