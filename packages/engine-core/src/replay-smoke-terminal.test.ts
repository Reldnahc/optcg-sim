import assert from "node:assert/strict";
import { test } from "vitest";

import { loadFixtureV1, replayFixtureV1 } from "./replay-smoke-test-support.js";

test("ENG-002F replay smoke fixture reproduces expected checkpoint and final hashes", () => {
  const fixture = loadFixtureV1();
  const replayed = replayFixtureV1(fixture);
  assert.deepEqual(replayed.checkpoints, fixture.expected.checkpoints);
  assert.equal(replayed.finalStateHash, fixture.expected.finalStateHash);
});

test("ENG-002F replay smoke final hash remains pinned", () => {
  const fixture = loadFixtureV1();

  assert.equal(
    fixture.expected.finalStateHash,
    "0ed24bd8760c204979e86b80e975ddc012d262dafcd9c451ef11eb01c821291e",
  );
});
