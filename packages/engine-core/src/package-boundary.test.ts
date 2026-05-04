import assert from "node:assert/strict";
import { test } from "vitest";

import * as engineCorePackage from "@optcg/engine-core";
import {
  advanceRngFloat01,
  advanceRngUint32,
  assertGameStateInvariants,
  canonicalSerializeStateValue,
  collectGameStateInvariantViolations,
  GameStateInvariantError,
  hashCanonicalStateValue,
  initializeRng,
} from "./index.js";

test("package runtime boundary exposes engine-core helpers", () => {
  assert.deepEqual(Object.keys(engineCorePackage).sort(), [
    "GameStateInvariantError",
    "advanceRngFloat01",
    "advanceRngUint32",
    "assertGameStateInvariants",
    "canonicalSerializeStateValue",
    "collectGameStateInvariantViolations",
    "hashCanonicalStateValue",
    "initializeRng",
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
  assert.equal(
    engineCorePackage.assertGameStateInvariants,
    assertGameStateInvariants,
  );
  assert.equal(
    engineCorePackage.GameStateInvariantError,
    GameStateInvariantError,
  );
});
