import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  EngineResult,
  GameState,
  HandSelectionId,
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
} from "../effect-runtime-queue-processing-test-support.js";

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-resumable-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "resumable-sequence-rules",
      sourceTextHash: "resumable-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-resumable-sequence"),
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
): { state: GameState; definition: EffectDefinition } => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const remainingHand = p1State.hand.slice(1);
  const secondDrawCard = must(
    remainingHand[remainingHand.length - 1],
    "deck refill",
  );
  p1State.hand = remainingHand.slice(0, -1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  p1State.deck = [
    ...p1State.deck,
    {
      ...secondDrawCard,
      zone: {
        zone: "deck",
        playerId: p1,
        slot: "deck",
        index: p1State.deck.length,
      },
    },
  ];
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-resumable-sequence"),
      timingWindowId: toTimingWindowId("window-resumable-sequence"),
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
      causedBy: { type: "ruleProcess", name: "resumable-sequence-test" },
    },
  ];
  return { state, definition };
};

const drawUpToThenKoSavedFieldObjectSequence = (
  family: "selectedTargets" | "producedObjects" = "selectedTargets",
): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "draw-up-to",
      connector: "always",
      effect: { type: "drawUpTo", player: "self", count: 1 },
    },
    {
      id: "ko-saved-target",
      connector: "then",
      effect: {
        type: "ko",
        target: {
          type: "savedFieldObject",
          binding: { family, saveResultAs: "savedTarget" },
          zone: "characterArea",
          player: "opponent",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
      },
    },
  ],
});

const playSelectedThenKoSavedProducedObjectSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "prelude-draw",
      connector: "always",
      effect: { type: "draw", player: "self", count: 0 },
    },
    {
      id: "select-character-from-hand",
      connector: "always",
      effect: {
        type: "selectCards",
        zone: "hand",
        player: "self",
        chooser: "self",
        min: 1,
        max: 1,
        filter: { categories: ["character"] },
        saveAs: "handSelection:play" as HandSelectionId,
        visibility: "chooserOnly",
      },
    },
    {
      id: "play-selected",
      connector: "ifPreviousSucceeded",
      saveResultAs: "playedObject",
      effect: {
        type: "playSelected",
        selection: "handSelection:play" as HandSelectionId,
        enterRested: true,
        ignoreCost: true,
      },
    },
    {
      id: "ko-produced-object",
      connector: "ifPreviousSucceeded",
      effect: {
        type: "ko",
        target: {
          type: "savedFieldObject",
          binding: { family: "producedObjects", saveResultAs: "playedObject" },
          zone: "characterArea",
          player: "self",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
      },
    },
  ],
});

const selectTargetsThenKoSavedSelectedTargetSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "prelude-draw",
      connector: "always",
      effect: { type: "draw", player: "self", count: 0 },
    },
    {
      id: "select-target",
      connector: "always",
      saveResultAs: "savedTarget",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          zone: "characterArea",
          player: "opponent",
          min: 1,
          max: 1,
          allowFewerIfUnavailable: false,
          visibility: "public",
        },
      },
    },
    {
      id: "ko-selected-target",
      connector: "ifPreviousSucceeded",
      effect: {
        type: "ko",
        target: {
          type: "savedFieldObject",
          binding: { family: "selectedTargets", saveResultAs: "savedTarget" },
          zone: "characterArea",
          player: "opponent",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
      },
    },
  ],
});

const selectTargetsThenRestAndLockSavedTargetSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "select-target",
      connector: "always",
      saveResultAs: "savedTarget",
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
          filter: { categories: ["character"] },
        },
      },
    },
    {
      id: "rest-selected-target",
      connector: "then",
      effect: {
        type: "rest",
        target: {
          type: "savedFieldObject",
          binding: { family: "selectedTargets", saveResultAs: "savedTarget" },
          zone: "characterArea",
          player: "opponent",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
      },
    },
    {
      id: "lock-selected-target",
      connector: "then",
      effect: {
        type: "cannotBecomeActive",
        target: {
          type: "savedFieldObject",
          binding: { family: "selectedTargets", saveResultAs: "savedTarget" },
          zone: "characterArea",
          player: "opponent",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
        duration: { type: "untilStartOfNextTurn", player: "opponent" },
      },
    },
  ],
});

const markHandCharactersSupported = (state: GameState): void => {
  const player = must(state.players[p1], "p1");
  for (const card of player.hand) {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "character",
      cost: 0,
      power: 1000,
    });
  }
};

const setupReviewedKoReplacementDefinition = (
  state: GameState,
  target: CardInstance,
): void => {
  const support = {
    cardId: target.cardId,
    status: "implemented-dsl" as const,
    tested: true,
    rulesVersion: "r1",
    cardDataVersion: state.cardManifest.cardDataVersion,
    sourceTextHash: "replacement-source-hash",
    behaviorHash: "replacement-behavior-hash",
    effectDefinitionId: `definition:${String(target.cardId)}`,
  };
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
    support,
  });
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [support.effectDefinitionId]: {
      cardId: target.cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: toEffectId("replacement:would-be-ko-draw-1"),
          category: "replacement",
          trigger: {
            type: "replacement",
            replacement: { type: "wouldBeKOd", target: { type: "self" } },
          },
          optional: true,
          sourcePresencePolicy: "resolveFromLastKnownInformation",
          effect: {
            type: "replacement",
            when: { type: "wouldBeKOd", target: { type: "self" } },
            instead: { type: "draw", count: 1, player: "self" },
          },
        },
      ],
      metadata: {
        sourceTextHash: support.sourceTextHash,
        rulesVersion: support.rulesVersion,
        effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
        tested: true,
        reviewedBy: "engine-reviewer",
        reviewedAt: "2026-05-11T00:00:00.000Z",
      },
    },
  };
};

const setupPausedSavedTargetKoFrame = (
  effect: Effect = drawUpToThenKoSavedFieldObjectSequence(),
) => {
  const { state } = sequenceQueueState(effect);
  const p2State = must(state.players[p2], "p2");
  const target = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "target source"),
    zone: "characterArea",
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 4000,
  });
  const paused = processEffectRuntime(state);
  return {
    target,
    pausedState: paused.state,
    quantityDecisionId: must(paused.state.pendingDecision, "quantity").id,
  };
};

const resolveWithSavedReference = (
  pausedState: GameState,
  quantityDecisionId: NonNullable<GameState["pendingDecision"]>["id"],
  savedRef: unknown,
): EngineResult =>
  applyAction(
    {
      ...pausedState,
      effectExecutionFrames: [
        {
          ...must(pausedState.effectExecutionFrames[0], "execution frame"),
          savedReferences: {
            ...must(pausedState.effectExecutionFrames[0], "execution frame")
              .savedReferences,
            savedTarget: savedRef as never,
          },
        },
      ],
    },
    {
      type: "respondToDecision",
      decisionId: quantityDecisionId,
      response: { type: "chooseQuantity", quantity: 0 },
    },
  );

test("end-to-end producedObjects saved reference is consumed by later KO segment deterministically", () => {
  const state = sequenceQueueState(
    playSelectedThenKoSavedProducedObjectSequence(),
  ).state;
  markHandCharactersSupported(state);

  const paused = processEffectRuntime(state);
  const selection = must(paused.state.pendingDecision, "selection");
  assert.equal(selection.type, "selectCards");
  const selected = must(selection.candidates[0], "selected").card;

  const first = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: selection.id,
    response: { type: "cards", cards: [selected] },
  });
  const second = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: selection.id,
    response: { type: "cards", cards: [selected] },
  });

  assert.equal(first.errors, undefined);
  assert.equal(first.state.pendingDecision, undefined);
  assert.equal(
    must(first.state.players[p1], "p1").characters.some(
      (card) => card.instanceId === selected.instanceId,
    ),
    false,
  );
  const eventTypes = first.events.map((event) => event.type);
  assert.deepEqual(eventTypes[0], "decisionResolved");
  assert.equal(eventTypes.includes("cardPlayed"), true);
  assert.equal(eventTypes.includes("cardKOd"), true);
  assert.equal(
    eventTypes.findIndex((type) => type === "cardPlayed") <
      eventTypes.findIndex((type) => type === "cardKOd"),
    true,
  );
  assert.equal(eventTypes.at(-1), "effectResolved");
  assert.equal(first.state.seq > paused.state.seq, true);
  assert.equal(first.stateHash, second.stateHash);
  assert.equal(first.stateHash, hashCanonicalStateValue(first.state));
});

test("selectTargets saved reference is consumed by later KO segment deterministically", () => {
  const { state } = sequenceQueueState(
    selectTargetsThenKoSavedSelectedTargetSequence(),
  );
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
    power: 2000,
  });

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "target selection");
  assert.equal(decision.type, "selectTargets");

  const first = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: [must(decision.candidates[0], "candidate").card],
    },
  });
  const second = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: [must(decision.candidates[0], "candidate").card],
    },
  });

  assert.equal(first.errors, undefined);
  assert.equal(first.state.pendingDecision, undefined);
  assert.equal(
    must(first.state.players[p2], "p2").characters.some(
      (card) => card.instanceId === target.instanceId,
    ),
    false,
  );
  const eventTypes = first.events.map((event) => event.type);
  assert.equal(eventTypes[0], "decisionResolved");
  assert.equal(eventTypes.includes("cardKOd"), true);
  assert.equal(eventTypes.at(-1), "effectResolved");
  assert.equal(first.state.seq > paused.state.seq, true);
  assert.equal(first.stateHash, second.stateHash);
  assert.equal(first.stateHash, hashCanonicalStateValue(first.state));
});

test("selectTargets saved reference can feed rest and refresh-lock sequence children", () => {
  const { state } = sequenceQueueState(
    selectTargetsThenRestAndLockSavedTargetSequence(),
  );
  const p2State = must(state.players[p2], "p2");
  const target = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "target"),
    zone: "characterArea",
  });
  target.state = "active";
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 2000,
  });

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
  const restedTarget = must(resolved.state.players[p2], "p2").characters.find(
    (card) => card.instanceId === target.instanceId,
  );
  assert.equal(restedTarget?.state, "rested");
  assert.equal(
    resolved.state.continuousEffects.some(
      (effect) =>
        effect.modifier.layer === "restriction" &&
        effect.modifier.operation.type === "restriction" &&
        effect.modifier.operation.restriction === "cannotBecomeActive",
    ),
    true,
  );
});

test.each([
  {
    name: "unsupported selectedCards family",
    buildRef: (target: CardInstance) => ({
      kind: "selectedCards" as const,
      cards: [
        {
          instanceId: target.instanceId,
          cardId: target.cardId,
          playerId: p2,
          zone: target.zone,
        },
      ],
    }),
  },
  {
    name: "unsupported paidCost family",
    buildRef: () => ({ kind: "paidCost" as const, paidCost: true }),
  },
  {
    name: "unsupported hand-selection-style saved selectedCards under referenced key",
    buildRef: (target: CardInstance) => ({
      kind: "selectedCards" as const,
      cards: [
        {
          instanceId: target.instanceId,
          cardId: target.cardId,
          playerId: p2,
          zone: target.zone,
        },
      ],
    }),
  },
  {
    name: "gone/missing saved object",
    buildRef: (target: CardInstance) => ({
      kind: "selectedTargets" as const,
      targets: [
        {
          binding: {
            family: "selectedTargets" as const,
            saveResultAs: "savedTarget",
            objectIndex: 0,
          },
          capturedAtStateSeq: 0 as GameState["seq"],
          object: {
            instanceId:
              `missing:${target.instanceId}` as typeof target.instanceId,
            cardId: target.cardId,
            playerId: p2,
            zone: target.zone,
          },
          visibility: "public" as const,
        },
      ],
    }),
  },
  {
    name: "hidden saved object zone",
    buildRef: (target: CardInstance) => ({
      kind: "selectedTargets" as const,
      targets: [
        {
          binding: {
            family: "selectedTargets" as const,
            saveResultAs: "savedTarget",
            objectIndex: 0,
          },
          capturedAtStateSeq: 0 as GameState["seq"],
          object: {
            instanceId: target.instanceId,
            cardId: target.cardId,
            playerId: p2,
            zone: { zone: "hand", playerId: p2, slot: "hand", index: 0 },
          },
          visibility: "public" as const,
        },
      ],
    }),
  },
  {
    name: "illegal saved object wrong zone",
    buildRef: (target: CardInstance) => ({
      kind: "selectedTargets" as const,
      targets: [
        {
          binding: {
            family: "selectedTargets" as const,
            saveResultAs: "savedTarget",
            objectIndex: 0,
          },
          capturedAtStateSeq: 0 as GameState["seq"],
          object: {
            instanceId: target.instanceId,
            cardId: target.cardId,
            playerId: p2,
            zone: { zone: "stageArea", playerId: p2, slot: "stage", index: 0 },
          },
          visibility: "public" as const,
        },
      ],
    }),
  },
  {
    name: "illegal saved object wrong player",
    buildRef: (target: CardInstance) => ({
      kind: "selectedTargets" as const,
      targets: [
        {
          binding: {
            family: "selectedTargets" as const,
            saveResultAs: "savedTarget",
            objectIndex: 0,
          },
          capturedAtStateSeq: 0 as GameState["seq"],
          object: {
            instanceId: target.instanceId,
            cardId: target.cardId,
            playerId: p1,
            zone: target.zone,
          },
          visibility: "public" as const,
        },
      ],
    }),
  },
  {
    name: "illegal saved object mismatched card id",
    buildRef: (target: CardInstance) => ({
      kind: "selectedTargets" as const,
      targets: [
        {
          binding: {
            family: "selectedTargets" as const,
            saveResultAs: "savedTarget",
            objectIndex: 0,
          },
          capturedAtStateSeq: 0 as GameState["seq"],
          object: {
            instanceId: target.instanceId,
            cardId: `wrong:${target.cardId}` as typeof target.cardId,
            playerId: p2,
            zone: target.zone,
          },
          visibility: "public" as const,
        },
      ],
    }),
  },
] as const)(
  "sequence resume fail-closes saved field-object KO consumer for $name",
  ({ buildRef }) => {
    const { pausedState, quantityDecisionId, target } =
      setupPausedSavedTargetKoFrame();
    const resolved = resolveWithSavedReference(
      pausedState,
      quantityDecisionId,
      buildRef(target),
    );
    assert.equal(resolved.errors, undefined);
    assert.equal(
      must(resolved.state.players[p2], "after p2").characters.some(
        (card) => card.instanceId === target.instanceId,
      ),
      true,
    );
    assert.equal(hashCanonicalStateValue(resolved.state), resolved.stateHash);
  },
);

test("saved-field-object KO consumer pauses for chooseReplacement and resumes after acceptance", () => {
  const { pausedState, quantityDecisionId, target } =
    setupPausedSavedTargetKoFrame();
  setupReviewedKoReplacementDefinition(pausedState, target);

  const resolved = resolveWithSavedReference(pausedState, quantityDecisionId, {
    kind: "selectedTargets",
    targets: [
      {
        binding: {
          family: "selectedTargets",
          saveResultAs: "savedTarget",
          objectIndex: 0,
        },
        capturedAtStateSeq: pausedState.seq,
        object: {
          instanceId: target.instanceId,
          cardId: target.cardId,
          playerId: p2,
          zone: target.zone,
        },
        visibility: "public",
      },
    ],
  });

  assert.equal(resolved.errors, undefined);
  const decision = must(resolved.state.pendingDecision, "replacement decision");
  assert.equal(decision.type, "chooseReplacement");
  assert.equal(
    resolved.events.some((event) => event.type === "decisionCreated"),
    true,
  );
  assert.equal(
    resolved.events.some((event) => event.type === "cardKOd"),
    false,
  );
  assert.equal(
    must(resolved.state.players[p2], "p2").characters.some(
      (card) => card.instanceId === target.instanceId,
    ),
    true,
  );

  const accepted = applyAction(resolved.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "replacement",
      replacementId: must(decision.replacementIds[0], "replacement id"),
    },
  });

  assert.equal(accepted.errors, undefined);
  assert.equal(accepted.state.pendingDecision, undefined);
  assert.equal(
    accepted.events.some((event) => event.type === "replacementApplied"),
    true,
  );
  assert.equal(
    accepted.events.some((event) => event.type === "cardKOd"),
    false,
  );
  assert.equal(
    must(accepted.state.players[p2], "accepted p2").characters.some(
      (card) => card.instanceId === target.instanceId,
    ),
    true,
  );
  assert.equal(accepted.state.effectExecutionFrames.length, 0);
  assert.equal(accepted.stateHash, hashCanonicalStateValue(accepted.state));
});

test("sequence resume fail-closes sourceSegmentId mismatch and invalid objectIndex", () => {
  const sourceSegmentMismatch = {
    type: "sequence",
    effects: [
      {
        id: "draw-up-to",
        connector: "always" as const,
        effect: {
          type: "drawUpTo" as const,
          player: "self" as const,
          count: 1,
        },
      },
      {
        id: "ko-saved-target",
        connector: "then" as const,
        effect: {
          type: "ko" as const,
          target: {
            type: "savedFieldObject" as const,
            binding: {
              family: "selectedTargets" as const,
              saveResultAs: "savedTarget",
              sourceSegmentId: "expected-source",
            },
            zone: "characterArea" as const,
            player: "opponent" as const,
            visibility: "publicOnly" as const,
            onFailure: "failClosed" as const,
          },
        },
      },
    ],
  } as Extract<Effect, { type: "sequence" }>;
  const { pausedState, quantityDecisionId, target } =
    setupPausedSavedTargetKoFrame(sourceSegmentMismatch);
  const resolvedMismatch = resolveWithSavedReference(
    pausedState,
    quantityDecisionId,
    {
      kind: "selectedTargets",
      targets: [
        {
          binding: {
            family: "selectedTargets",
            saveResultAs: "savedTarget",
            objectIndex: 0,
            sourceSegmentId: "other-source",
          },
          capturedAtStateSeq: 0 as GameState["seq"],
          object: {
            instanceId: target.instanceId,
            cardId: target.cardId,
            playerId: p2,
            zone: target.zone,
          },
          visibility: "public",
        },
      ],
    },
  );
  assert.equal(
    must(resolvedMismatch.state.players[p2], "p2").characters.some(
      (card) => card.instanceId === target.instanceId,
    ),
    true,
  );

  const invalidObjectIndex = {
    type: "sequence",
    effects: [
      {
        id: "draw-up-to",
        connector: "always",
        effect: { type: "drawUpTo", player: "self", count: 1 },
      },
      {
        id: "ko-saved-target",
        connector: "then",
        effect: {
          type: "ko",
          target: {
            type: "savedFieldObject",
            binding: {
              family: "selectedTargets",
              saveResultAs: "savedTarget",
              objectIndex: 1,
            },
            zone: "characterArea",
            player: "opponent",
            visibility: "publicOnly",
            onFailure: "failClosed",
          },
        },
      },
    ],
  } as Extract<Effect, { type: "sequence" }>;
  const second = setupPausedSavedTargetKoFrame(invalidObjectIndex);
  const resolvedIndex = resolveWithSavedReference(
    second.pausedState,
    second.quantityDecisionId,
    {
      kind: "selectedTargets",
      targets: [
        {
          binding: {
            family: "selectedTargets",
            saveResultAs: "savedTarget",
            objectIndex: 0,
          },
          capturedAtStateSeq: 0 as GameState["seq"],
          object: {
            instanceId: second.target.instanceId,
            cardId: second.target.cardId,
            playerId: p2,
            zone: second.target.zone,
          },
          visibility: "public",
        },
      ],
    },
  );
  assert.equal(
    must(resolvedIndex.state.players[p2], "p2").characters.some(
      (card) => card.instanceId === second.target.instanceId,
    ),
    true,
  );
});

test("unsupported modifier/restriction saved-field-object target use remains unsupported/fail-closed", () => {
  const unsupportedState = sequenceQueueState({
    type: "sequence",
    effects: [
      {
        id: "draw-up-to",
        connector: "always",
        effect: { type: "drawUpTo", player: "self", count: 1 },
      },
      {
        id: "unsupported-saved-target-modifier",
        connector: "then",
        effect: {
          type: "modifyPower",
          value: 1000,
          duration: { type: "thisTurn" },
          target: {
            type: "savedFieldObject",
            binding: { family: "selectedTargets", saveResultAs: "savedTarget" },
            zone: "characterArea",
            player: "opponent",
            visibility: "publicOnly",
            onFailure: "failClosed",
          },
        },
      },
    ],
  }).state;
  const before = structuredClone(unsupportedState);
  const result = processEffectRuntime(unsupportedState);
  assert.deepEqual(result.state, before);
  assert.deepEqual(result.events, []);
  assert.equal(must(result.errors, "errors")[0]?.type, "effectRuntimeError");
});

test("unsupported saved-field-object KO target shape outside supported field zones fails closed", () => {
  const unsupportedState = sequenceQueueState({
    type: "sequence",
    effects: [
      {
        id: "draw-up-to",
        connector: "always",
        effect: { type: "drawUpTo", player: "self", count: 1 },
      },
      {
        id: "ko-saved-target-leader",
        connector: "then",
        effect: {
          type: "ko",
          target: {
            type: "savedFieldObject",
            binding: { family: "selectedTargets", saveResultAs: "savedTarget" },
            zone: "leaderArea",
            player: "self",
            visibility: "publicOnly",
            onFailure: "failClosed",
          },
        },
      },
    ],
  }).state;
  const before = structuredClone(unsupportedState);
  const result = processEffectRuntime(unsupportedState);
  assert.deepEqual(result.state, before);
  assert.deepEqual(result.events, []);
  assert.equal(must(result.errors, "errors")[0]?.type, "effectRuntimeError");
});
