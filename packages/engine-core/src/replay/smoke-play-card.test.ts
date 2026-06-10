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
          "4347e21f9fff703d9ac247e0c3e7364cc4505d6369d5e471da223bcb8834ff71",
      },
      {
        id: "stage-replacement",
        finalStateHash:
          "87e9e68a6a273f333392fe33b3e86f57010cc30760d297992e24cb7d8753b700",
      },
      {
        id: "character-overflow",
        finalStateHash:
          "a6f50b5d14cc6fd4e8fde09442a215be4ddd53100032264324fbba1a9aa3d99a",
      },
      {
        id: "paid-event",
        finalStateHash:
          "c74317f832ce1174e4679b774d3a49afbb428c0ffe9b7547899859003ba9b487",
      },
    ],
  );
});
