import assert from "node:assert/strict";
import { test } from "vitest";

import * as engineCorePackage from "@optcg/engine-core";
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
