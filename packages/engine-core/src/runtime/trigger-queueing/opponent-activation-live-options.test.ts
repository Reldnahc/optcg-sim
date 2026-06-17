import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  processEffectRuntime,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toCardId,
  toEngineEventId,
  withCardInZone,
} from "../../effect-runtime-queue/test-support.js";

test("live opponent activation queueing preserves omitted state hash", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  state.eventJournal = [];
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  p1State.hand = p1State.hand.filter(
    (card) => card.instanceId !== source.instanceId,
  );
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-live-opponent-activation",
      rulesVersion: "live-opponent-activation-rules",
      sourceTextHash: "live-opponent-activation-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = {
    "def-live-opponent-activation": {
      ...base,
      effects: [
        {
          ...must(base.effects[0], "draw effect"),
          id: "live-opponent-activation-draw" as EffectDefinition["effects"][number]["id"],
          category: "auto",
          trigger: { type: "opponentActivated", activations: ["event"] },
          sourcePresencePolicy: "mustRemainInSameZone",
        },
      ],
    },
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  const opponentEventCardId = toCardId("opponent-event");
  state.cardManifest.cards[opponentEventCardId] = resolvedCard({
    cardId: opponentEventCardId,
    category: "event",
  });
  state.eventJournal.push({
    id: toEngineEventId("event:live-opponent-event-played"),
    seq: 1,
    type: "cardPlayed",
    payload: {
      playerId: p2,
      instanceId: "opponent-event-instance",
      cardId: opponentEventCardId,
      category: "event",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "test:opponent-event" },
    createdAtStateSeq: state.seq,
  });

  const result = processEffectRuntime(state, {
    includeStateHash: false,
    validateInvariants: false,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.stateHash, "");
});
