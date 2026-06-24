import assert from "node:assert/strict";
import { test } from "vitest";

import {
  assertPlayCardFinalState,
  loadPlayCardFixture,
  replayPlayCardScenario,
} from "./smoke-test-support.js";

test("ENG-005C/ENG-006 replay smoke fixture reproduces paid Character, Stage replacement, Character overflow, and Event play hashes", () => {
  const fixture = loadPlayCardFixture();
  for (const scenario of fixture.scenarios) {
    const replayed = replayPlayCardScenario(fixture, scenario);
    assert.deepEqual(replayed.checkpoints, scenario.expected.checkpoints);
    assert.equal(replayed.finalStateHash, scenario.expected.finalStateHash);
    assert.deepEqual(replayed.finalStatus, scenario.expected.finalStatus);
    assertPlayCardFinalState(replayed.finalState, scenario.expected.finalState);
  }
});

test("ENG-005C replay smoke final hashes remain pinned", () => {
  const fixture = loadPlayCardFixture();

  assert.deepEqual(
    fixture.scenarios.map((scenario) => ({
      id: scenario.id,
      finalStateHash: scenario.expected.finalStateHash,
    })),
    [
      {
        id: "paid-character",
        finalStateHash:
          "fa7cc7654118690b743a8b09219b104c184db51d9e6def83d2cc096553134f92",
      },
      {
        id: "stage-replacement",
        finalStateHash:
          "e564abaf277cc14e8523153086c4f41fdb1154287077a257d555ab644c05a7ec",
      },
      {
        id: "character-overflow",
        finalStateHash:
          "a93f7162bad7ec62ee6d69d4df077eac6ba2090187ed542d6a431a53bd9aa6aa",
      },
      {
        id: "paid-event",
        finalStateHash:
          "23f71b9aa7a9b81effac49e0067702a48e8cca2b822906b76a8e8aa6a814cdf5",
      },
    ],
  );
});
