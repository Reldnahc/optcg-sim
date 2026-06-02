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
          "1724467bac6eb80998a816a1722bd6c1eee75800d768dcc44b936874e0509205",
      },
      {
        id: "stage-replacement",
        finalStateHash:
          "fced6b05bbefb5f33fb3ce296502fdbaa07f81092eb35ca78dbd4450c6f998a7",
      },
      {
        id: "character-overflow",
        finalStateHash:
          "530fcfe88b092919906fc71ffb0bd353ffae41d84fdaa4d4cfb8fce95228d263",
      },
      {
        id: "paid-event",
        finalStateHash:
          "c06c2b8fcd2a6f59fcbf884ba35650144c60bf994cce96efbdceb0d31c6a3dc6",
      },
    ],
  );
});
