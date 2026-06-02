import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
  HandSelectionId,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  hashCanonicalStateValue,
  must,
  p1,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "./effect-runtime-queue-processing-test-support.js";

const handPlaySelection = "handSelection:play-from-hand" as HandSelectionId;

const reindexHand = (cards: readonly CardInstance[]): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));

const playThenRestrictCharactersSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      connector: "always",
      effect: {
        type: "sequence",
        effects: [
          {
            id: "select-hand-play",
            connector: "always",
            saveResultAs: handPlaySelection,
            effect: {
              type: "selectCards",
              zone: "hand",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              filter: {
                categories: ["character"],
                typesAny: ["Alabasta", "Straw Hat Crew"],
                cost: { max: 5 },
              },
              saveAs: handPlaySelection,
              visibility: "chooserOnly",
            },
          },
          {
            id: "play-selected",
            connector: "ifPossible",
            effect: {
              type: "playSelected",
              selection: handPlaySelection,
              ignoreCost: true,
            },
          },
        ],
      },
    },
    {
      connector: "then",
      effect: {
        type: "preventPlay",
        player: "self",
        filter: { categories: ["character"] },
        duration: { type: "thisTurn" },
      },
    },
  ],
});

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-play-restriction-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "play-restriction-rules",
      sourceTextHash: "play-restriction-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-play-restriction-sequence"),
        effect,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const playRestrictionState = (): {
  selectedCard: CardInstance;
  state: GameState;
} => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const player = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "source"),
    zone: "characterArea",
  });
  player.hand = reindexHand(player.hand.slice(1));
  const selectedCard = must(player.hand[0], "selected card");
  state.cardManifest.cards[selectedCard.cardId] = {
    ...resolvedCard({
      cardId: selectedCard.cardId,
      category: "character",
      cost: 5,
      power: 5000,
    }),
    types: ["Alabasta"],
  };
  const definition = setupSequenceDefinition(
    state,
    source,
    playThenRestrictCharactersSequence(),
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-play-restriction"),
      timingWindowId: toTimingWindowId("window-play-restriction"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "sequence effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "play-restriction-test" },
    },
  ];
  return { selectedCard, state };
};

test("playSelected sequence materializes reusable same-turn character play restriction", () => {
  const { selectedCard, state } = playRestrictionState();

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "hand play selection");
  assert.equal(decision.type, "selectCards");

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "cards",
      cards: [must(decision.candidates[0], "candidate").card],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(
    must(resolved.state.players[p1], "p1").characters.some(
      (card) => card.instanceId === selectedCard.instanceId,
    ),
    true,
  );
  assert.equal(
    resolved.state.continuousEffects.some(
      (effect) =>
        effect.modifier.layer === "restriction" &&
        effect.modifier.operation.type === "restriction" &&
        effect.modifier.operation.restriction === "cannotPlay" &&
        effect.modifier.target.type === "allMatching" &&
        effect.modifier.target.zone === "hand" &&
        effect.modifier.target.player === "self" &&
        effect.modifier.target.filter?.categories?.[0] === "character",
    ),
    true,
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});
