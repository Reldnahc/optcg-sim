import assert from "node:assert/strict";
import { test } from "vitest";

import { bootFixtureMatch } from "./boot.js";

test("bootFixtureMatch reaches the first mulligan decision deterministically", () => {
  const first = bootFixtureMatch();
  const second = bootFixtureMatch();

  assert.equal(first.stateHash, second.stateHash);
  assert.equal(first.state.seq, 1);
  assert.equal(first.state.status.type, "setup");
  assert.equal(first.state.pendingDecision?.type, "mulligan");
  assert.equal(first.summary.stateSeq, 1);
  assert.equal(first.summary.phase, "refresh");
  assert.equal(first.summary.status, "setup");
  assert.equal(first.summary.hasPendingDecision, true);
  assert.equal(first.summary.stateHash, first.stateHash);
});
