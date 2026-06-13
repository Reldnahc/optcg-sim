import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  ContinuousEffectRecord,
  EngineEvent,
  Effect,
  EffectDefinition,
  GameState,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  getLegalActions,
  hashCanonicalStateValue,
  must,
  p1,
  p2,
  processEffectRuntime,
  resolvedCard,
  toCardId,
  toInstanceId,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toEngineEventId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";
import { filterStateForPlayer } from "../view/filter-state-for-player.js";

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-don-activation-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "don-activation-sequence-rules",
      sourceTextHash: "don-activation-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-don-activation-sequence"),
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
      id: toQueueEntryId("queue-entry-don-activation-sequence"),
      state: "pending",
      timingWindowId: toTimingWindowId("window-don-activation-sequence"),
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
      causedBy: { type: "ruleProcess", name: "don-activation-sequence-test" },
    },
  ];
  return { state, source };
};

const selectRestedDonThenActivateSavedTargetSequence = (
  max = 1,
): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "select-don",
      connector: "always",
      saveResultAs: "savedDon",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          zone: "costArea",
          player: "self",
          min: 0,
          max,
          allowFewerIfUnavailable: true,
          visibility: "public",
          filter: { categories: ["don"], state: "rested" },
        },
      },
    },
    {
      id: "activate-don",
      connector: "then",
      effect: {
        type: "activate",
        target: {
          type: "savedFieldObject",
          binding: { family: "selectedTargets", saveResultAs: "savedDon" },
          zone: "costArea",
          player: "self",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
      },
    },
  ],
});

const drawTrashThenSelectRestedDonSequence = (): Extract<
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
            connector: "always",
            effect: { type: "draw", count: 2, player: "self" },
          },
          {
            connector: "then",
            effect: {
              type: "trashFromHand",
              count: 1,
              player: "self",
              chooser: "self",
            },
          },
        ],
      },
    },
    {
      connector: "then",
      effect: selectRestedDonThenActivateSavedTargetSequence(),
    },
  ],
});

test("selectTargets saved reference can feed activate for rested DON in cost area", () => {
  const { state } = sequenceQueueState(
    selectRestedDonThenActivateSavedTargetSequence(),
  );
  const p1State = must(state.players[p1], "p1");
  const restedDon = must(p1State.donDeck[0], "rested don");
  p1State.donDeck = p1State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  p1State.costArea = [
    {
      ...restedDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "rested",
    },
  ];
  state.cardManifest.cards[restedDon.cardId] = resolvedCard({
    cardId: restedDon.cardId,
    category: "don",
  });

  const paused = processEffectRuntime(state);
  assert.equal(paused.errors, undefined);
  const decision = must(paused.state.pendingDecision, "target selection");
  assert.equal(decision.type, "selectTargets");
  assert.equal(decision.candidates.length, 1);

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
  const afterDon = must(resolved.state.players[p1], "after p1").costArea.find(
    (card) => card.instanceId === restedDon.instanceId,
  );
  assert.equal(afterDon?.state, "active");
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("sequence resumes from trash-from-hand before accepting later rested DON targets", () => {
  const { state } = sequenceQueueState(drawTrashThenSelectRestedDonSequence());
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.characters[0], "source");
  p1State.hand = p1State.hand
    .filter((card) => card.instanceId !== source.instanceId)
    .map((card, index) => ({
      ...card,
      zone: { zone: "hand", playerId: p1, slot: "hand", index },
    }));
  const restedDon = must(p1State.donDeck[0], "rested don");
  p1State.donDeck = p1State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  p1State.costArea = [
    {
      ...restedDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "rested",
    },
  ];
  state.cardManifest.cards[restedDon.cardId] = resolvedCard({
    cardId: restedDon.cardId,
    category: "don",
  });

  const pausedForTrash = processEffectRuntime(state);
  assert.equal(pausedForTrash.errors, undefined);
  const trashDecision = must(
    pausedForTrash.state.pendingDecision,
    "trash decision",
  );
  assert.equal(trashDecision.type, "selectCards");

  const afterTrash = applyAction(pausedForTrash.state, {
    type: "respondToDecision",
    decisionId: trashDecision.id,
    response: {
      type: "cards",
      cards: [must(trashDecision.candidates[0], "trash candidate").card],
    },
  });
  assert.equal(afterTrash.errors, undefined);
  const targetDecision = must(
    afterTrash.state.pendingDecision,
    "DON target decision",
  );
  assert.equal(targetDecision.type, "selectTargets");
  const targetCandidate = must(
    targetDecision.candidates.find(
      (candidate) => candidate.card.instanceId === restedDon.instanceId,
    ),
    "rested DON target candidate",
  );
  must(
    getLegalActions(afterTrash.state, p1).find(
      (action) => action.type === "respondToDecision",
    ),
    "legal target action",
  );

  const resolved = applyAction(afterTrash.state, {
    type: "respondToDecision",
    decisionId: targetDecision.id,
    response: {
      type: "targets",
      targets: [targetCandidate.card],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  const afterDon = must(resolved.state.players[p1], "after p1").costArea.find(
    (card) => card.instanceId === restedDon.instanceId,
  );
  assert.equal(afterDon?.state, "active");
});

test("delayed end-of-turn sequence schedules DON activation and selects DON at end of turn", () => {
  const { state } = sequenceQueueState({
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "delayed",
          timing: { type: "endOfTurn", turn: "current" },
          effect: selectRestedDonThenActivateSavedTargetSequence(5),
        } as unknown as Effect,
      },
    ],
  });
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.characters[0], "source");
  p1State.hand = p1State.hand
    .filter((card) => card.instanceId !== source.instanceId)
    .map((card, index) => ({
      ...card,
      zone: { zone: "hand", playerId: p1, slot: "hand", index },
    }));
  const don = must(p1State.donDeck[0], "DON");
  p1State.donDeck = p1State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  p1State.costArea = [
    {
      ...don,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "active",
    },
  ];
  state.cardManifest.cards[don.cardId] = resolvedCard({
    cardId: don.cardId,
    category: "don",
  });

  const scheduled = processEffectRuntime(state);

  assert.equal(scheduled.errors, undefined);
  assert.equal(scheduled.state.pendingDecision, undefined);
  assert.equal(scheduled.state.effectQueue.length, 0);
  assert.equal(scheduled.state.players[p1]?.costArea[0]?.state, "active");
  assert.equal(scheduled.state.delayedEffects?.length, 1);

  const beforeEnd = scheduled.state;
  beforeEnd.turn.phase = "main";
  const beforeEndP1 = must(beforeEnd.players[p1], "before end p1");
  beforeEndP1.costArea = beforeEndP1.costArea.map((card) =>
    card.instanceId === don.instanceId ? { ...card, state: "rested" } : card,
  );

  const endTurn = applyAction(beforeEnd, { type: "endMainPhase" });

  assert.equal(endTurn.errors, undefined);
  const decision = must(endTurn.state.pendingDecision, "delayed DON decision");
  assert.equal(decision.type, "selectTargets");
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.card.instanceId),
    [don.instanceId],
  );
  assert.equal(endTurn.state.delayedEffects?.length ?? 0, 0);

  const resolved = applyAction(endTurn.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: [must(decision.candidates[0], "rested DON candidate").card],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.players[p1]?.costArea[0]?.state, "active");
  assert.equal(resolved.state.delayedEffects?.length ?? 0, 0);
});

test("event-timed delayed sequence queues from a matching attack event and expires from delayed records", () => {
  const { state, source } = sequenceQueueState({
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "delayed",
          timing: {
            type: "event",
            trigger: {
              type: "attackDeclared",
              role: "attacker",
              player: "self",
              filter: { categories: ["character"] },
              targetPlayer: "opponent",
              targetFilter: { categories: ["character"] },
            },
            expires: { type: "endOfTurn", turn: "current" },
          },
          effect: {
            type: "activate",
            target: { type: "self" },
          },
        },
      },
    ],
  });
  const p2State = must(state.players[p2], "p2");
  const target = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "target"),
    zone: "characterArea",
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
  });
  const scheduled = processEffectRuntime(state);
  assert.equal(scheduled.errors, undefined);
  assert.equal(scheduled.state.delayedEffects?.length, 1);
  assert.equal(scheduled.state.effectQueue.length, 0);

  const attackDeclared: EngineEvent = {
    id: toEngineEventId("event:event-delayed-attack-declared"),
    seq: scheduled.state.eventJournal.length + 1,
    type: "attackDeclared",
    payload: {
      attacker: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      target: {
        instanceId: target.instanceId,
        cardId: target.cardId,
        playerId: p2,
        zone: target.zone,
      },
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "test:eventDelayedEffect" },
    createdAtStateSeq: scheduled.state.seq,
  };
  const afterAttack = {
    ...scheduled.state,
    eventJournal: [...scheduled.state.eventJournal, attackDeclared],
  };

  const queued = processEffectRuntime(afterAttack);

  assert.equal(queued.errors, undefined);
  assert.equal(queued.state.effectQueue.length, 1);
  assert.equal(
    queued.state.effectQueue[0]?.effectBlockOverride?.effect.type,
    "activate",
  );
  assert.equal(queued.state.delayedEffects?.length ?? 0, 0);
});

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

test("selectTargets saved reference can feed activate for rested Character in character area", () => {
  const { state } = sequenceQueueState(
    selectRestedCharacterThenActivateSavedTargetSequence(),
  );
  const p1State = must(state.players[p1], "p1");
  const target = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(p1State.hand[0], "target"),
      cardId: toCardId("activatable-character"),
    },
    zone: "characterArea",
  });
  target.state = "rested";
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 5000,
  });
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

  const paused = processEffectRuntime(state);
  assert.equal(paused.errors, undefined);
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
  assert.equal(resolved.state.pendingDecision, undefined);
  const afterCharacter = must(
    resolved.state.players[p1],
    "after p1",
  ).characters.find((card) => card.instanceId === target.instanceId);
  assert.equal(afterCharacter?.state, "active");
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("DON activation restriction blocks Character-source DON activation through saved target path", () => {
  const { source, state } = sequenceQueueState(
    selectRestedDonThenActivateSavedTargetSequence(),
  );
  const p1State = must(state.players[p1], "p1");
  const restedDon = must(p1State.donDeck[0], "rested don");
  p1State.donDeck = p1State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  p1State.costArea = [
    {
      ...restedDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "rested",
    },
  ];
  state.cardManifest.cards[restedDon.cardId] = resolvedCard({
    cardId: restedDon.cardId,
    category: "don",
  });
  state.continuousEffects = [
    {
      id: "continuous:don-activation-restriction",
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
        target: { type: "player", player: "self" },
        operation: {
          type: "restriction",
          restriction: "cannotActivateDon",
          sourceCategories: ["character"],
        },
      },
      duration: { type: "thisTurn" },
      createdBy: { type: "ruleProcess", name: "test" },
      createdAtStateSeq: state.seq,
    } satisfies ContinuousEffectRecord,
  ];

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
  const afterDon = must(resolved.state.players[p1], "after p1").costArea.find(
    (card) => card.instanceId === restedDon.instanceId,
  );
  assert.equal(afterDon?.state, "rested");
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("DON activation restriction materializes as source-category-scoped continuous restriction", () => {
  const { state } = sequenceQueueState({
    type: "preventDonActivation",
    player: "self",
    sourceCategories: ["character"],
    duration: { type: "thisTurn" },
  });

  const resolved = processEffectRuntime(state);
  const restriction = must(
    resolved.state.continuousEffects.find(
      (effect) =>
        effect.modifier.layer === "restriction" &&
        effect.modifier.operation.type === "restriction" &&
        effect.modifier.operation.restriction === "cannotActivateDon",
    ),
    "DON activation restriction",
  );

  assert.equal(resolved.errors, undefined);
  assert.equal(restriction.modifier.target.type, "player");
  const operation = restriction.modifier.operation;
  assert.equal(operation.type, "restriction");
  assert.deepEqual(operation.sourceCategories, ["character"]);
  assert.deepEqual(restriction.duration, { type: "thisTurn" });
});

test("play restriction materializes as filtered hand continuous restriction", () => {
  const { state } = sequenceQueueState({
    type: "preventPlay",
    player: "self",
    filter: { categories: ["character"], cost: { min: 7 } },
    duration: { type: "thisTurn" },
  });

  const resolved = processEffectRuntime(state);
  const restriction = must(
    resolved.state.continuousEffects.find(
      (effect) =>
        effect.modifier.layer === "restriction" &&
        effect.modifier.operation.type === "restriction" &&
        effect.modifier.operation.restriction === "cannotPlay",
    ),
    "play restriction",
  );

  assert.equal(resolved.errors, undefined);
  assert.deepEqual(restriction.modifier.target, {
    type: "allMatching",
    zone: "hand",
    player: "self",
    filter: { categories: ["character"], cost: { min: 7 } },
  });
  assert.deepEqual(restriction.duration, { type: "thisTurn" });
});

test("DON activation restriction remains safe for player snapshots", () => {
  const { state } = sequenceQueueState({
    type: "preventDonActivation",
    player: "self",
    sourceCategories: ["character"],
    duration: { type: "thisTurn" },
  });
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
        ...(existing === undefined ? {} : { support: existing.support }),
      });
    }
  }

  const resolved = processEffectRuntime(state);
  const restriction = resolved.state.continuousEffects.find(
    (effect) =>
      effect.modifier.layer === "restriction" &&
      effect.modifier.operation.type === "restriction" &&
      effect.modifier.operation.restriction === "cannotActivateDon",
  );

  assert.equal(resolved.errors, undefined);
  assert.notEqual(restriction, undefined);
  assert.doesNotThrow(() => filterStateForPlayer(resolved.state, p1));
  assert.doesNotThrow(() => filterStateForPlayer(resolved.state, p2));
});

test("DON activation restriction materialization keeps source category as data", () => {
  const { state } = sequenceQueueState({
    type: "preventDonActivation",
    player: "self",
    sourceCategories: ["event"],
    duration: { type: "thisTurn" },
  });

  const resolved = processEffectRuntime(state);
  const restriction = must(
    resolved.state.continuousEffects.find(
      (effect) =>
        effect.modifier.layer === "restriction" &&
        effect.modifier.operation.type === "restriction" &&
        effect.modifier.operation.restriction === "cannotActivateDon",
    ),
    "DON activation restriction",
  );

  assert.equal(resolved.errors, undefined);
  const operation = restriction.modifier.operation;
  assert.equal(operation.type, "restriction");
  assert.deepEqual(operation.sourceCategories, ["event"]);
});

test("DON activation restriction does not block non-matching source categories", () => {
  const { source, state } = sequenceQueueState(
    selectRestedDonThenActivateSavedTargetSequence(),
  );
  const entry = must(state.effectQueue[0], "queue entry");
  entry.sourceSnapshot = {
    ...entry.sourceSnapshot,
    category: "event",
  };
  const p1State = must(state.players[p1], "p1");
  const restedDon = must(p1State.donDeck[0], "rested don");
  p1State.donDeck = p1State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  p1State.costArea = [
    {
      ...restedDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "rested",
    },
  ];
  state.cardManifest.cards[restedDon.cardId] = resolvedCard({
    cardId: restedDon.cardId,
    category: "don",
  });
  state.continuousEffects = [
    {
      id: "continuous:don-activation-restriction",
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
        target: { type: "player", player: "self" },
        operation: {
          type: "restriction",
          restriction: "cannotActivateDon",
          sourceCategories: ["character"],
        },
      },
      duration: { type: "thisTurn" },
      createdBy: { type: "ruleProcess", name: "test" },
      createdAtStateSeq: state.seq,
    } satisfies ContinuousEffectRecord,
  ];

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
  const afterDon = must(resolved.state.players[p1], "after p1").costArea.find(
    (card) => card.instanceId === restedDon.instanceId,
  );

  assert.equal(resolved.errors, undefined);
  assert.equal(afterDon?.state, "active");
});

test("inactive DON activation restriction does not block saved target activation", () => {
  const { source, state } = sequenceQueueState(
    selectRestedDonThenActivateSavedTargetSequence(),
  );
  const p1State = must(state.players[p1], "p1");
  const restedDon = must(p1State.donDeck[0], "rested don");
  p1State.donDeck = p1State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  p1State.costArea = [
    {
      ...restedDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "rested",
    },
  ];
  state.cardManifest.cards[restedDon.cardId] = resolvedCard({
    cardId: restedDon.cardId,
    category: "don",
  });
  state.continuousEffects = [
    {
      id: "continuous:inactive-don-activation-restriction",
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
        target: { type: "player", player: "self" },
        operation: {
          type: "restriction",
          restriction: "cannotActivateDon",
          sourceCategories: ["character"],
        },
      },
      duration: { type: "thisBattle" },
      createdBy: { type: "ruleProcess", name: "test" },
      createdAtStateSeq: state.seq,
    } satisfies ContinuousEffectRecord,
  ];

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
  const afterDon = must(resolved.state.players[p1], "after p1").costArea.find(
    (card) => card.instanceId === restedDon.instanceId,
  );

  assert.equal(resolved.errors, undefined);
  assert.equal(afterDon?.state, "active");
});

test("sequence support admits selecting up to 10 DON in cost area", () => {
  const { state } = sequenceQueueState(
    selectRestedDonThenActivateSavedTargetSequence(10),
  );
  const p1State = must(state.players[p1], "p1");
  const donTemplate = must(p1State.donDeck[0], "don template");
  const restedDon = Array.from({ length: 10 }, (_, index) => ({
    ...donTemplate,
    instanceId: toInstanceId(`don-activation:${String(index)}`),
  }));
  p1State.donDeck = [];
  p1State.costArea = restedDon.map((card, index) => {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "don",
    });
    return {
      ...card,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index },
      state: "rested" as const,
    };
  });

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "target selection");

  assert.equal(paused.errors, undefined);
  assert.equal(decision.type, "selectTargets");
  assert.equal(decision.candidates.length, 10);
  assert.equal(decision.request.max, 10);
});

test("saved target DON activation applies to every selected DON", () => {
  const { state } = sequenceQueueState(
    selectRestedDonThenActivateSavedTargetSequence(2),
  );
  const p1State = must(state.players[p1], "p1");
  const donTemplate = must(p1State.donDeck[0], "don template");
  const restedDon = Array.from({ length: 2 }, (_, index) => ({
    ...donTemplate,
    instanceId: toInstanceId(`multi-don-activation:${String(index)}`),
  }));
  p1State.donDeck = p1State.donDeck.slice(2).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  p1State.costArea = restedDon.map((card, index) => {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "don",
    });
    return {
      ...card,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index },
      state: "rested" as const,
    };
  });

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "target selection");
  assert.equal(decision.type, "selectTargets");
  assert.equal(decision.candidates.length, 2);

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: decision.candidates.map((candidate) => candidate.card),
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  const activeSelectedDon = must(
    resolved.state.players[p1],
    "after p1",
  ).costArea.filter((card) =>
    restedDon.some((selected) => selected.instanceId === card.instanceId),
  );
  assert.equal(activeSelectedDon.length, 2);
  assert.deepEqual(
    activeSelectedDon.map((card) => card.state),
    ["active", "active"],
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});
