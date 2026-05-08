import assert from "node:assert/strict";
import { test } from "vitest";

import {
  assertPlayCardFinalState,
  loadPlayCardFixture,
  replayPlayCardScenario,
} from "./replay-smoke-test-support.js";

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
          "44b92fdbdc0fe5126a1cf835915ffaa983f1068e4c4909ae1e4dc37092f71902",
      },
      {
        id: "stage-replacement",
        finalStateHash:
          "47400b8386558c12b1285da9c026f74f16cb4d9fbccad331ebe31e24d7b8b993",
      },
      {
        id: "character-overflow",
        finalStateHash:
          "4e25f4b591af1f23c15f7c9983c79a6db68a5c09137bed3dc7906e143068bb5d",
      },
      {
        id: "paid-event",
        finalStateHash:
          "08ac1decd6cc538d110891bcb2ad6cd4510443bd7245b46a4bcb4bf7cd32469b",
      },
    ],
  );
});
