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
    "75efd0ce2db2d6f72ee3bd956592b22e5ecb7e0ed1a953d8863397e41946c0ef",
  );
});
