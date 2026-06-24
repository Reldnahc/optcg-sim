import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  EngineEvent,
  GameState,
  Trigger,
} from "@optcg/types";

import { createEvent } from "../../action-results.js";
import {
  createActiveState,
  must,
  p1,
  resolvedCard,
} from "../../action-test-fixtures.js";
import { isEventTriggerQueueAnchor, matchEventTrigger } from "./matcher.js";

const publicEvent = (
  state: GameState,
  type: EngineEvent["type"],
  payload: unknown,
): EngineEvent => createEvent(state, 1, type, payload, { type: "public" });

test("canonical event matcher treats spotlight entries as presentation-only", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const source: CardInstance = player.leader;
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    power: 5000,
  });
  const spotlight = publicEvent(state, "spotlightEntryCreated", {
    entry: {
      id: "spotlight:event-hooks",
      key: "spotlight:event-hooks",
      semanticKey: "spotlight:event-hooks",
      mode: "resolved",
      status: "resolved",
      active: {
        source: {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: source.controller,
          zone: source.zone,
        },
        activeSpanIds: ["span:body"],
      },
    },
  });
  const trigger: Trigger = {
    type: "anyOf",
    triggers: [
      { type: "cardPlayed", player: "self" },
      {
        type: "eventCount",
        trigger: { type: "cardPlayed", player: "self" },
        count: { op: "gte", value: 1 },
      },
      { type: "effectResolved", player: "self" },
    ],
  };

  assert.deepEqual(matchEventTrigger(state, source, trigger, spotlight), {
    matched: false,
    triggerTypes: [],
  });
  assert.equal(
    isEventTriggerQueueAnchor(state, source, trigger, spotlight, [spotlight]),
    false,
  );
});
