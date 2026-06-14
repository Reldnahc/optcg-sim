import { strict as assert } from "node:assert";
import { test } from "vitest";
import type { MatchId, PlayerId } from "@optcg/types";

import { snapshotWithConnectionStatuses } from "./dev-match-connection-state.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

test("snapshot connection statuses treat virtual players as connected", () => {
  const snapshot = {
    stateSeq: 1,
    playerLabels: {
      [p2]: { displayName: "Bot" },
    },
    players: {},
  } as Parameters<typeof snapshotWithConnectionStatuses>[0];
  const match = {
    state: {
      players: {
        [p1]: {},
        [p2]: {},
      },
    },
  } as Parameters<typeof snapshotWithConnectionStatuses>[1];

  const result = snapshotWithConnectionStatuses(
    snapshot,
    match,
    "match-with-bot" as MatchId,
    new Set(),
    new Set([p2]),
  );

  const labels = result.playerLabels;
  assert.ok(labels !== undefined);
  const p1Label = labels[p1];
  const p2Label = labels[p2];
  assert.ok(p1Label !== undefined);
  assert.ok(p2Label !== undefined);
  assert.equal(p1Label.connectionStatus, "disconnected");
  assert.equal(p2Label.connectionStatus, "connected");
  assert.equal(p2Label.displayName, "Bot");
});
