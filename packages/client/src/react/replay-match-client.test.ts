import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { CardId, PlayerId } from "@optcg/types";

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
  test("creates playback frames from server-provided frame snapshots", () => {
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
      frameReconstruction: {
        status: "ready",
        frames: [
          {
            index: 0,
            actionIndex: 0,
            label: "Initial state",
            snapshot,
          },
        ],
      },
      deterministicEntries: [],
    });

    assert.equal(frames.length, 1);
    assert.equal(frames[0]?.label, "Initial state");
  });

  test("uses compact replay manifest image urls for frame card catalogs", () => {
    const frames = replayFramesFromDetail({
      matchId: "match-1",
      manifestSnapshot: {
        cards: {
          "OP01-001": {
            cardId: "OP01-001",
            name: "Leader",
            category: "leader",
            imageUrl: "https://cdn.example/OP01-001.png",
          },
        },
      },
      frameReconstruction: {
        status: "ready",
        frames: [
          {
            index: 0,
            actionIndex: 0,
            label: "Initial state",
            snapshot,
          },
        ],
      },
      deterministicEntries: [],
    });

    assert.equal(
      frames[0]?.clientState.cards.players["p1" as PlayerId]?.cards[
        "OP01-001" as CardId
      ]?.imageUrl,
      "https://cdn.example/OP01-001.png",
    );
  });

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
