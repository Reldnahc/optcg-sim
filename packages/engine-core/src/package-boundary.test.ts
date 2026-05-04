import assert from "node:assert/strict";
import { test } from "vitest";

import * as engineCorePackage from "@optcg/engine-core";
import {
  advanceRngFloat01,
  advanceRngUint32,
  assertGameStateInvariants,
  canonicalSerializeStateValue,
  collectGameStateInvariantViolations,
  createInitialState,
  GameStateInvariantError,
  hashCanonicalStateValue,
  initializeRng,
  respondToMulliganDecision,
  startMulliganFlow,
} from "./index.js";

test("package runtime boundary exposes engine-core helpers", () => {
  assert.deepEqual(Object.keys(engineCorePackage).sort(), [
    "GameStateInvariantError",
    "advanceRngFloat01",
    "advanceRngUint32",
    "assertGameStateInvariants",
    "canonicalSerializeStateValue",
    "collectGameStateInvariantViolations",
    "createInitialState",
    "hashCanonicalStateValue",
    "initializeRng",
    "respondToMulliganDecision",
    "startMulliganFlow",
  ]);
  assert.equal(engineCorePackage.initializeRng, initializeRng);
  assert.equal(engineCorePackage.advanceRngUint32, advanceRngUint32);
  assert.equal(engineCorePackage.advanceRngFloat01, advanceRngFloat01);
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
