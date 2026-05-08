import assert from "node:assert/strict";
import { test } from "vitest";

import { loadFixtureV2, replayScenario } from "./replay-smoke-test-support.js";

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
          "d3ee457413462fc735405186215c2626dac7f544e2bc6959670b814261102123",
      },
      {
        id: "character-ko",
        finalStateHash:
          "fd5a9f852195e450265f6b555a1eac0953957d11c2694b8d7a9c89b3f3de25c0",
      },
      {
        id: "leader-zero-life-defeat",
        finalStateHash:
          "884f88669c398876f2c1740c4f995afd0174d3cf2f1dab03714e652ff33cda93",
      },
      {
        id: "deck-out-defeat",
        finalStateHash:
          "fddb4a48956ac5e9cee14d99faeb9e51ba46c73cd943ab712a72f18f70adec1d",
      },
    ],
  );
});
