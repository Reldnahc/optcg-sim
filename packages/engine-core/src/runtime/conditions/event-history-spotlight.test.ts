import assert from "node:assert/strict";
import { test } from "vitest";

import type { EngineEvent, SpotlightEntryCreatedPayload } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  queueDrawForP1,
  toEngineEventId,
} from "../../effect-runtime-queue/test-support.js";
import { evaluateQueuedEffectCondition } from "./evaluator.js";

test("eventHistory condition ignores spotlightEntryCreated presentation events", () => {
  const state = createActiveState();
  const source = must(must(state.players[p1], "p1").leader, "leader");
  const payload: SpotlightEntryCreatedPayload = {
    entry: {
      id: "spotlight:event-history",
      key: "spotlight:event-history",
      semanticKey: "spotlight:event-history",
      mode: "resolved",
      status: "resolved",
      active: {
        source: {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: p1,
          zone: source.zone,
        },
        activeSpanIds: ["span:body"],
      },
    },
  };
  const spotlightEvent: EngineEvent = {
    id: toEngineEventId("event:event-history:spotlight"),
    seq: state.eventJournal.length + 1,
    type: "spotlightEntryCreated",
    payload,
    visibility: { type: "public" },
    createdAtStateSeq: state.seq,
  };
  state.eventJournal.push(spotlightEvent);

  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "eventHistory",
      event: "cardPlayed",
      player: "self",
      filter: { categories: ["event"] },
      window: "thisTurn",
      op: "gte",
      value: 1,
    }),
    { supported: true, passed: false },
  );
});
