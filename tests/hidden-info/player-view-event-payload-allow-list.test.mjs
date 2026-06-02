import assert from "node:assert/strict";
import { test } from "vitest";

import {
  createActiveState,
  p1,
  toCardId,
  toEngineEventId,
  toStateSeq,
} from "../../packages/engine-core/src/action-test-fixtures.ts";
import { filterStateForPlayer } from "../../packages/engine-core/src/view/filter-state-for-player.ts";

const visibleEventBase = (state, seq, type, payload) => ({
  id: toEngineEventId(`event:allow-list:${String(seq)}`),
  seq,
  type,
  actor: p1,
  payload,
  visibility: { type: "public" },
  createdAtStateSeq: toStateSeq(state.seq),
});

test("PlayerView event payload projection omits dangerous unexpected keys", () => {
  const state = createActiveState();
  const source = state.players[p1].leader;
  state.revealedCards = [
    {
      id: "reveal:event-allow-list",
      cards: [
        {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: p1,
        },
      ],
      visibility: { type: "public" },
      origin: "topOfDeck",
      createdAtStateSeq: toStateSeq(state.seq),
      cleanupPolicy: "none",
    },
  ];
  state.eventJournal = [
    visibleEventBase(state, 1, "decisionCreated", {
      decisionId: "decision:event-allow-list",
      decisionType: "selectCards",
      playerId: p1,
      prompt: "Resolve the pending choice.",
      hiddenCardIds: [toCardId("hidden-card-id")],
      rawProcessPayload: { secret: true },
      privateCandidates: [source.instanceId],
    }),
    visibleEventBase(state, 2, "ruleProcessingChecked", {
      hiddenCardIds: [toCardId("hidden-card-id-2")],
      rawProcessPayload: { secret: true },
      privateCandidates: [source.instanceId],
      safeish: "value",
    }),
    visibleEventBase(state, 3, "damageDealt", {
      amount: 1,
      hiddenCardIds: [toCardId("hidden-card-id-damage")],
      rawProcessPayload: { secret: true },
      privateCandidates: [source.instanceId],
    }),
    visibleEventBase(state, 4, "cardRevealed", {
      playerId: p1,
      instanceId: source.instanceId,
      cardId: source.cardId,
      hiddenCardIds: [toCardId("hidden-card-id-3")],
      rawProcessPayload: { secret: true },
      privateCandidates: [source.instanceId],
    }),
    visibleEventBase(state, 5, "cardRevealed", {
      revealId: "reveal:event-allow-list",
      cards: [
        {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: p1,
          zone: {
            ...source.zone,
            hiddenCardIds: [toCardId("hidden-card-id-4")],
          },
          privateCandidates: [source.instanceId],
        },
      ],
      origin: "topOfDeck",
      selectionSetId: "set:search-reveal:event-allow-list",
      hiddenCardIds: [toCardId("hidden-card-id-5")],
      rawProcessPayload: { secret: true },
      privateCandidates: [source.instanceId],
    }),
  ];

  const view = filterStateForPlayer(state, p1);

  assert.deepEqual(
    view.events.map((event) => event.payload),
    [
      {
        decisionId: "decision:event-allow-list",
        decisionType: "selectCards",
        playerId: p1,
        prompt: "Resolve the pending choice.",
      },
      {},
      {
        amount: 1,
      },
      {
        playerId: p1,
        instanceId: source.instanceId,
        cardId: source.cardId,
      },
      {
        revealId: "reveal:event-allow-list",
        cards: [
          {
            instanceId: source.instanceId,
            cardId: source.cardId,
            playerId: p1,
            zone: source.zone,
          },
        ],
        origin: "topOfDeck",
        selectionSetId: "set:search-reveal:event-allow-list",
      },
    ],
  );

  const serialized = JSON.stringify(view.events);
  for (const forbidden of [
    "hiddenCardIds",
    "rawProcessPayload",
    "privateCandidates",
    "safeish",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});
