import assert from "node:assert/strict";
import { test } from "vitest";

import { loadFixtureV2, replayScenario } from "./smoke-test-support.js";

test("replay smoke fixture reproduces expected hashes for vanilla Leader damage, Character K.O., and terminal defeats", () => {
  const fixture = loadFixtureV2();
  for (const scenario of fixture.scenarios) {
    const replayed = replayScenario(fixture, scenario);
    assert.deepEqual(replayed.checkpoints, scenario.expected.checkpoints);
    assert.equal(replayed.finalStateHash, scenario.expected.finalStateHash);
    assert.deepEqual(replayed.finalStatus, scenario.expected.finalStatus);
  }
});

test("ENG-003E replay smoke final hashes remain pinned", () => {
  const fixture = loadFixtureV2();

  assert.deepEqual(
    fixture.scenarios.map((scenario) => ({
      id: scenario.id,
      finalStateHash: scenario.expected.finalStateHash,
    })),
    [
      {
        id: "leader-damage",
        finalStateHash:
          "3310d2a1c5bd937f4ea3254c951cc4dc68937dc3b225a6a0a83591acd9cbdfdc",
      },
      {
        id: "character-ko",
        finalStateHash:
          "a9c198885484536700ad6d5772fd03f9f50c6797c934386c4497e29f86ef7130",
      },
      {
        id: "leader-zero-life-defeat",
        finalStateHash:
          "334bad1dd7b1d51a1e9a6136a65910597b7be518abc3e679e87bf4ddba7874ad",
      },
      {
        id: "deck-out-defeat",
        finalStateHash:
          "bb79b35a963012adb263ecc337386d0d8f01fcdf2c37dff90feadb83d3437018",
      },
    ],
  );
});
