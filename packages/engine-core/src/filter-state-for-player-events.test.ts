import assert from "node:assert/strict";
import { test } from "vitest";

import type { EngineEvent, InstanceId } from "@optcg/types";

import {
  createActiveState,
  p1,
  p2,
  toCardId,
  toEngineEventId,
  toStateSeq,
} from "./action-test-fixtures.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

test("preserves safe visible card identity in player event payloads", () => {
  const state = createActiveState();
  const cardId = toCardId("OP13-089");
  const instanceId = "visible-card-1" as InstanceId;
  const events: EngineEvent[] = [
    {
      id: toEngineEventId("event:visible-card-played"),
      seq: 1,
      type: "cardPlayed",
      actor: p1,
      payload: {
        playerId: p1,
        instanceId,
        cardId,
        category: "character",
        hiddenDeckIndex: 12,
      },
      visibility: { type: "public" },
      createdAtStateSeq: toStateSeq(state.seq),
    },
    {
      id: toEngineEventId("event:visible-card-trashed"),
      seq: 2,
      type: "cardTrashed",
      actor: p1,
      payload: {
        playerId: p1,
        instanceId,
        cardId,
        reason: "trashFromHand",
        hiddenDeckIndex: 13,
      },
      visibility: { type: "public" },
      createdAtStateSeq: toStateSeq(state.seq),
    },
    {
      id: toEngineEventId("event:visible-card-moved"),
      seq: 3,
      type: "cardMoved",
      actor: p1,
      payload: {
        playerId: p1,
        instanceId,
        cardId,
        from: {
          zone: "characterArea",
          playerId: p1,
          slot: "character",
          index: 0,
          faceDownCardId: toCardId("SECRET"),
        },
        to: {
          zone: "trash",
          playerId: p1,
          slot: "trash",
          index: 0,
          faceDownCardId: toCardId("SECRET"),
        },
        reason: "effect",
        hiddenDeckIndex: 14,
      },
      visibility: { type: "public" },
      createdAtStateSeq: toStateSeq(state.seq),
    },
  ];
  state.eventJournal = events;

  const view = filterStateForPlayer(state, p2);

  assert.deepEqual(
    view.events.map((event) => event.payload),
    [
      {
        playerId: p1,
        instanceId,
        cardId,
        category: "character",
      },
      {
        playerId: p1,
        instanceId,
        cardId,
        reason: "trashFromHand",
      },
      {
        playerId: p1,
        instanceId,
        cardId,
        from: {
          zone: "characterArea",
          playerId: p1,
          slot: "character",
          index: 0,
        },
        to: {
          zone: "trash",
          playerId: p1,
          slot: "trash",
          index: 0,
        },
        reason: "effect",
      },
    ],
  );
  assert.equal(JSON.stringify(view.events).includes("hiddenDeckIndex"), false);
  assert.equal(JSON.stringify(view.events).includes("faceDownCardId"), false);
});
