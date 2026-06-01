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
          "b29ec4560d3cf19f7eba8bb01af2beca61370c2b515a87af3ea3efe9d3f15ee7",
      },
      {
        id: "character-ko",
        finalStateHash:
          "bfd02428c1ffab961a6ed9c185e747858e7da5d7bb81874fb156af81b261132f",
      },
      {
        id: "leader-zero-life-defeat",
        finalStateHash:
          "ca8eabc63b12214d85c7259a31a4249fbbaef1fc946a1e932bee30373b15ff0a",
      },
      {
        id: "deck-out-defeat",
        finalStateHash:
          "bb79b35a963012adb263ecc337386d0d8f01fcdf2c37dff90feadb83d3437018",
      },
    ],
  );
});
