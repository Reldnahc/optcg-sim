import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  ContinuousEffectRecord,
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

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-field-object-activation-restriction";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "field-object-activation-restriction-rules",
      sourceTextHash: "field-object-activation-restriction-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-field-object-activation-restriction"),
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

const sequenceQueueState = (
  effect: Effect,
): { state: GameState; source: CardInstance } => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      id: toQueueEntryId("queue-entry-field-object-activation-restriction"),
      state: "pending",
      timingWindowId: toTimingWindowId(
        "window-field-object-activation-restriction",
      ),
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
      causedBy: {
        type: "ruleProcess",
        name: "field-object-activation-restriction-test",
      },
    },
  ];
  return { state, source };
};

const selectRestedCharacterThenActivateSavedTargetSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "select-character",
      connector: "always",
      saveResultAs: "savedCharacter",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          zone: "characterArea",
          player: "self",
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
          filter: { categories: ["character"], currentPower: { max: 7000 } },
        },
      },
    },
    {
      id: "activate-character",
      connector: "then",
      effect: {
        type: "activate",
        target: {
          type: "savedFieldObject",
          binding: {
            family: "selectedTargets",
            saveResultAs: "savedCharacter",
          },
          zone: "characterArea",
          player: "self",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
      },
    },
  ],
});

const ensureCombatMetadata = (state: GameState): void => {
  for (const player of Object.values(state.players)) {
    state.cardManifest.cards[player.leader.cardId] = resolvedCard({
      cardId: player.leader.cardId,
      category: "leader",
      power: 5000,
    });
    for (const character of player.characters) {
      const existing = state.cardManifest.cards[character.cardId];
      state.cardManifest.cards[character.cardId] = resolvedCard({
        cardId: character.cardId,
        category: "character",
        power: 5000,
        ...(existing?.support === undefined
          ? {}
          : { support: existing.support }),
      });
    }
  }
};

const cannotBecomeActiveRestriction = (
  state: GameState,
  source: CardInstance,
): ContinuousEffectRecord => ({
  id: "continuous:cannot-become-active",
  source: {
    instanceId: source.instanceId,
    cardId: source.cardId,
    playerId: p1,
    zone: source.zone,
  },
  sourceSnapshot: toSourceSnapshot(source, p1, p1),
  controller: p1,
  modifier: {
    layer: "restriction",
    target: {
      type: "all",
      player: "self",
      zone: "characterArea",
      filter: {
        categories: ["character"],
        cost: { min: 4, max: 4 },
      },
    },
    operation: {
      type: "restriction",
      restriction: "cannotBecomeActive",
    },
  },
  duration: { type: "thisTurn" },
  createdBy: { type: "ruleProcess", name: "test" },
  createdAtStateSeq: state.seq,
});

test("cannot-become-active restriction blocks direct Character activation", () => {
  const { state, source } = sequenceQueueState(
    selectRestedCharacterThenActivateSavedTargetSequence(),
  );
  const p1State = must(state.players[p1], "p1");
  const target = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(p1State.hand[1], "target"),
      cardId: toCardId("activation-locked-character"),
    },
    zone: "characterArea",
  });
  target.state = "rested";
  ensureCombatMetadata(state);
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    cost: 4,
    power: 5000,
  });
  state.continuousEffects = [cannotBecomeActiveRestriction(state, source)];

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "target selection");
  assert.equal(decision.type, "selectTargets");
  const targetCandidate = must(
    decision.candidates.find(
      (candidate) => candidate.card.instanceId === target.instanceId,
    ),
    "target candidate",
  );
  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: [targetCandidate.card],
    },
  });

  assert.equal(resolved.errors, undefined);
  const afterCharacter = must(
    resolved.state.players[p1],
    "after p1",
  ).characters.find((card) => card.instanceId === target.instanceId);
  assert.equal(afterCharacter?.state, "rested");
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("cannot-become-active restriction blocks matching all-target activation only", () => {
  const { state, source } = sequenceQueueState({
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "activate",
          target: {
            type: "all",
            player: "self",
            zone: "characterArea",
            filter: { categories: ["character"] },
          },
        },
      },
    ],
  });
  const p1State = must(state.players[p1], "p1");
  const extra = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(p1State.hand[1], "extra"),
      cardId: toCardId("activation-free-character"),
    },
    zone: "characterArea",
  });
  source.state = "rested";
  extra.state = "rested";
  const sourceSupport = state.cardManifest.cards[source.cardId]?.support;
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    cost: 4,
    power: 5000,
    ...(sourceSupport === undefined ? {} : { support: sourceSupport }),
  });
  state.cardManifest.cards[extra.cardId] = resolvedCard({
    cardId: extra.cardId,
    category: "character",
    cost: 5,
    power: 5000,
  });
  state.continuousEffects = [cannotBecomeActiveRestriction(state, source)];

  const resolved = processEffectRuntime(state);

  assert.equal(resolved.errors, undefined);
  const afterP1 = must(resolved.state.players[p1], "resolved p1");
  const locked = must(
    afterP1.characters.find((card) => card.instanceId === source.instanceId),
    "locked character",
  );
  const free = must(
    afterP1.characters.find((card) => card.instanceId === extra.instanceId),
    "free character",
  );
  assert.equal(locked.state, "rested");
  assert.equal(free.state, "active");
});
