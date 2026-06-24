import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { replayFramesFromDetail } from "./replay-match-client.js";

const snapshot = {
  players: {
    p1: {
      leader: {
        instanceId: "leader-1",
        cardId: "OP01-001",
        owner: "p1",
        controller: "p1",
        zone: { zone: "leader", playerId: "p1", slot: "leader", index: 0 },
        attachedDon: [],
      },
    },
  },
};

describe("replayFramesFromDetail", () => {
  test("creates frame-backed playback entries from saved snapshots", () => {
    const frames = replayFramesFromDetail({
      matchId: "match-1",
      manifestSnapshot: {
        cards: {
          "OP01-001": {
            cardId: "OP01-001",
            name: "Leader",
            category: "leader",
          },
        },
      },
      deterministicEntries: [
        { type: "submitAction" },
        {
          envelope: { request: { type: "playCard" } },
          result: { snapshot },
        },
      ],
    });

    assert.equal(frames.length, 1);
    const [frame] = frames;
    assert.ok(frame !== undefined);
    assert.equal(frame.index, 1);
    assert.equal(frame.label, "playCard");
    assert.equal(frame.clientState.matchId, "match-1");
  });

  test("keeps action-only entries out of board playback frames", () => {
    const frames = replayFramesFromDetail({
      matchId: "match-1",
      manifestSnapshot: { cards: {} },
      deterministicEntries: [
        { envelope: { request: { type: "concede" } } },
        { type: "auditOnly" },
      ],
    });

    assert.deepEqual(frames, []);
  });
});
