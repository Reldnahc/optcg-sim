import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
