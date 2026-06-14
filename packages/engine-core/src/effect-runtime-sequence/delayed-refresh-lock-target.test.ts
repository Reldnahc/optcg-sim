import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
  PlayerId,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  must,
  p1,
  p2,
  processEffectRuntime,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toCardId,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";

const reindexHand = (
  cards: readonly CardInstance[],
  playerId: PlayerId,
): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId, slot: "hand", index },
  }));

const installSequenceQueue = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): void => {
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-delayed-refresh-lock",
      rulesVersion: "delayed-refresh-lock-rules",
      sourceTextHash: "delayed-refresh-lock-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-delayed-refresh-lock"),
        effect,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-delayed-refresh-lock": definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  state.effectQueue = [
    {
      id: toQueueEntryId("queue-entry-delayed-refresh-lock"),
      state: "pending",
      timingWindowId: toTimingWindowId("window-delayed-refresh-lock"),
      generation: 0,
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "sequence effect").id,
      orderingGroup: "turnPlayer",
      createdAtEventSeq: 0,
      queuedAtStateSeq: state.seq,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "delayed-refresh-lock-test" },
    },
  ];
};

test("delayed end-of-turn sequence selects and resolves refresh-lock Character target", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  p1State.hand = reindexHand(
    p1State.hand.filter((card) => card.instanceId !== source.instanceId),
    p1,
  );
  installSequenceQueue(state, source, {
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "delayed",
          timing: { type: "endOfTurn", turn: "current" },
          effect: {
            type: "cannotBecomeActive",
            target: {
              type: "choose",
              request: {
                timing: "onResolution",
                chooser: "self",
                player: "anyPlayer",
                zone: "characterArea",
                min: 0,
                max: 1,
                allowFewerIfUnavailable: true,
                visibility: "public",
                filter: {
                  categories: ["character"],
                  state: "rested",
                  attachedDon: { min: 3 },
                },
              },
            },
            duration: { type: "untilStartOfNextTurn", player: "opponent" },
          },
        } as unknown as Effect,
      },
    ],
  });

  const p2State = must(state.players[p2], "p2");
  const attachedDon = p2State.donDeck.slice(0, 3);
  const target = withCardInZone({
    state,
    playerId: p2,
    card: {
      ...must(p2State.hand[0], "target"),
      cardId: toCardId("delayed-refresh-lock-target"),
    },
    zone: "characterArea",
  });
  p2State.hand = reindexHand(
    p2State.hand.filter((card) => card.instanceId !== target.instanceId),
    p2,
  );
  target.state = "rested";
  target.attachedDon = attachedDon.map((card) => card.instanceId);
  p2State.costArea = attachedDon.map((card, index) => ({
    ...card,
    zone: { zone: "costArea", playerId: p2, slot: "cost", index },
    state: "rested",
  }));
  p2State.donDeck = p2State.donDeck.slice(3).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p2, slot: "donDeck", index },
  }));
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 5000,
  });

  const scheduled = processEffectRuntime(state);

  assert.equal(scheduled.errors, undefined);
  assert.equal(scheduled.state.pendingDecision, undefined);
  assert.equal(scheduled.state.delayedEffects?.length, 1);

  const beforeEnd = scheduled.state;
  beforeEnd.turn.phase = "main";
  const endTurn = applyAction(beforeEnd, { type: "endMainPhase" });

  assert.equal(endTurn.errors, undefined);
  const decision = must(
    endTurn.state.pendingDecision,
    "delayed refresh lock decision",
  );
  assert.equal(decision.type, "selectTargets");
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.card.instanceId),
    [target.instanceId],
  );
  assert.equal(endTurn.state.delayedEffects?.length ?? 0, 0);

  const resolved = applyAction(endTurn.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: [must(decision.candidates[0], "refresh lock candidate").card],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.effectQueue.length, 0);
  assert.equal(resolved.state.continuousEffects.length, 1);
});
