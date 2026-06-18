import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardCategory,
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  hashCanonicalStateValue,
  must,
  p1,
  p2,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";

const selectedTrashSequence = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "select-trash-target",
      connector: "always",
      saveResultAs: "selected:trash-target",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          zone: "characterArea",
          player: "opponent",
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
          filter: { categories: ["character"], currentPower: { max: 6000 } },
        },
      },
    },
    {
      id: "trash-selected-target",
      connector: "then",
      effect: {
        type: "trash",
        target: {
          type: "savedFieldObject",
          binding: {
            family: "selectedTargets",
            saveResultAs: "selected:trash-target",
          },
          zone: "characterArea",
          player: "opponent",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
      },
    },
  ],
});

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
  category: CardCategory = "character",
): EffectDefinition => {
  const effectDefinitionId = "def-selected-trash-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category,
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "selected-trash-rules",
      sourceTextHash: "selected-trash-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-selected-trash-sequence"),
        effect,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const registerBoardCombatMetadata = (state: GameState): void => {
  for (const playerId of [p1, p2]) {
    const player = must(state.players[playerId], String(playerId));
    const existingLeader = state.cardManifest.cards[player.leader.cardId];
    state.cardManifest.cards[player.leader.cardId] = {
      ...resolvedCard({
        cardId: player.leader.cardId,
        category: "leader",
        power: 5000,
      }),
      ...existingLeader,
      power: existingLeader?.power ?? 5000,
    };
    for (const character of player.characters) {
      const existing = state.cardManifest.cards[character.cardId];
      state.cardManifest.cards[character.cardId] = {
        ...resolvedCard({
          cardId: character.cardId,
          category: "character",
          power: 5000,
        }),
        ...existing,
        power: existing?.power ?? 5000,
      };
    }
  }
};

const selectedTrashState = (): { state: GameState; target: CardInstance } => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const target = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "target"),
    zone: "characterArea",
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 2000,
  });
  const definition = setupSequenceDefinition(
    state,
    source,
    selectedTrashSequence(),
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-selected-trash"),
      timingWindowId: toTimingWindowId("window-selected-trash"),
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
      causedBy: { type: "ruleProcess", name: "selected-trash-test" },
    },
  ];
  registerBoardCombatMetadata(state);
  return { state, target };
};

test("selectTargets saved reference is consumed by later trash segment without KO semantics", () => {
  const { state, target } = selectedTrashState();

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "target selection");
  assert.equal(decision.type, "selectTargets");

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: [must(decision.candidates[0], "candidate").card],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(
    must(resolved.state.players[p2], "p2").characters.some(
      (card) => card.instanceId === target.instanceId,
    ),
    false,
  );
  assert.equal(
    must(must(resolved.state.players[p2], "p2").trash[0], "top trash")
      .instanceId,
    target.instanceId,
  );
  const eventTypes = resolved.events.map((event) => event.type);
  assert.equal(eventTypes[0], "decisionResolved");
  assert.equal(eventTypes.includes("cardTrashed"), true);
  assert.equal(eventTypes.includes("cardKOd"), false);
  assert.equal(eventTypes.at(-1), "effectResolved");
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("self-target trash segment trashes the source Stage", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "stageArea",
  });
  p1State.hand = p1State.hand.filter(
    (card) => card.instanceId !== source.instanceId,
  );
  const effect: Extract<Effect, { type: "sequence" }> = {
    type: "sequence",
    effects: [
      {
        id: "trash-self-stage",
        connector: "always",
        effect: {
          type: "trash",
          target: { type: "self" },
        },
      },
    ],
  };
  const definition = setupSequenceDefinition(state, source, effect, "stage");
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-self-trash-stage"),
      timingWindowId: toTimingWindowId("window-self-trash-stage"),
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
      causedBy: { type: "ruleProcess", name: "self-trash-stage-test" },
    },
  ];

  const resolved = processEffectRuntime(state);

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(must(resolved.state.players[p1], "p1").stage, undefined);
  assert.equal(
    must(must(resolved.state.players[p1], "p1").trash[0], "top trash")
      .instanceId,
    source.instanceId,
  );
  const eventTypes = resolved.events.map((event) => event.type);
  assert.equal(eventTypes.includes("cardTrashed"), true);
  assert.equal(eventTypes.includes("cardKOd"), false);
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});
