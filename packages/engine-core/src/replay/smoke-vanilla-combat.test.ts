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
          "29402322bfea15d85a6dd11f9dea910de21619a94e18b8833aebda977ceb7941",
      },
      {
        id: "character-ko",
        finalStateHash:
          "bf9a88f5e4b78c05a07f29171bcef561dd8afbfa9202427595b45a7fafa0ebc5",
      },
      {
        id: "leader-zero-life-defeat",
        finalStateHash:
          "3ed8458af737c4e1568d1557238c89e1ee2025aafbe019576e0ae9a19800384e",
      },
      {
        id: "deck-out-defeat",
        finalStateHash:
          "bb79b35a963012adb263ecc337386d0d8f01fcdf2c37dff90feadb83d3437018",
      },
    ],
  );
});
