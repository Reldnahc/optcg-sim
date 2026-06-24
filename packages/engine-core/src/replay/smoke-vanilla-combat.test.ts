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
          "957d6fd1b635fb01ed4c007e958b5f2491b55041260959e3db9b6fa263524b4d",
      },
      {
        id: "character-ko",
        finalStateHash:
          "f01edba35f7c3872bc7e62bb548577d36ad700bd8addec4decb4d06ca0cbadd5",
      },
      {
        id: "leader-zero-life-defeat",
        finalStateHash:
          "5ac26ebc3970b63e8ead0b3a0d749d43b8f1a8ab012a3c0a1043683cc231b824",
      },
      {
        id: "deck-out-defeat",
        finalStateHash:
          "bb79b35a963012adb263ecc337386d0d8f01fcdf2c37dff90feadb83d3437018",
      },
    ],
  );
});
