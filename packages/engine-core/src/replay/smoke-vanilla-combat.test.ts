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
          "d62563ed0ace9e448a11f3a3b74fe800b0a7b195deab109c26518e13b86512fe",
      },
      {
        id: "character-ko",
        finalStateHash:
          "e68e399cb69b986199a2895f9e0c429d59c11486852a294dd775fa7fa8b469c5",
      },
      {
        id: "leader-zero-life-defeat",
        finalStateHash:
          "5f731497851a27e84538b159b0791b0e5922551fc86665a8dc7f03e95f758ed1",
      },
      {
        id: "deck-out-defeat",
        finalStateHash:
          "bb79b35a963012adb263ecc337386d0d8f01fcdf2c37dff90feadb83d3437018",
      },
    ],
  );
});
