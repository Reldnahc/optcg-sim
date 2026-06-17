import assert from "node:assert/strict";
import { test } from "vitest";

import { toEngineResult } from "./action-results.js";
import { createActiveState } from "./action-test-fixtures.js";

const recordSpanNames = (): {
  readonly names: string[];
  readonly profileSpan: <T>(name: string, fn: () => T) => T;
} => {
  const names: string[] = [];
  return {
    names,
    profileSpan(name, fn) {
      names.push(name);
      return fn();
    },
  };
};

test("toEngineResult defers state hash work until stateHash is read", () => {
  const spans = recordSpanNames();
  const result = toEngineResult(createActiveState(), [], undefined, {
    profileSpan: spans.profileSpan,
  });

  assert.deepEqual(spans.names, []);

  const firstHash = result.stateHash;

  assert.notEqual(firstHash, "");
  assert.deepEqual(spans.names, ["engine:toEngineResult:stateHash"]);
  assert.equal(result.stateHash, firstHash);
  assert.deepEqual(spans.names, ["engine:toEngineResult:stateHash"]);
});
