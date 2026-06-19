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
          "92d65a78ca2bd042f7896bf467bbe2220d6b43aedae8849734366a01b7c8a346",
      },
      {
        id: "stage-replacement",
        finalStateHash:
          "d43a52b53c22db016b7a32d329efbae04d85fc6d915e4d2564b89ea7165a339b",
      },
      {
        id: "character-overflow",
        finalStateHash:
          "4d3214733b056221997bcc9c61991341e49d42852366e0feb56b8176f509f493",
      },
      {
        id: "paid-event",
        finalStateHash:
          "23f71b9aa7a9b81effac49e0067702a48e8cca2b822906b76a8e8aa6a814cdf5",
      },
    ],
  );
});
