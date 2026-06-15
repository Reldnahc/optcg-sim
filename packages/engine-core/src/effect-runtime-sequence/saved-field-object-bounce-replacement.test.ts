import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  CardColor,
  Effect,
  EffectDefinition,
  EngineResult,
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

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-bounce-replacement-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "bounce-replacement-rules",
      sourceTextHash: "bounce-replacement-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-bounce-replacement-sequence"),
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

const selectTargetsThenBounceSavedSelectedTargetSequence = (
  destination: "deckBottom" | "hand" = "hand",
  maxTargets = 1,
): Extract<Effect, { type: "sequence" }> => ({
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
          max: maxTargets,
          allowFewerIfUnavailable: false,
          visibility: "public",
        },
      },
    },
    {
      id: "bounce-selected-target",
      connector: "ifPreviousSucceeded",
      effect: {
        type: "bounce",
        destination,
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

const bounceSelfToOwnerDeckBottomSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      connector: "always",
      effect: {
        type: "bounce",
        destination: "deckBottom",
        target: { type: "self" },
      },
    },
  ],
});

const drawUpToThenKoSavedFieldObjectSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "save-target",
      connector: "always",
      saveResultAs: "savedTarget",
      effect: {
        type: "selectAllTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "opponent",
          zone: "characterArea",
          filter: { categories: ["character"] },
          visibility: "public",
        },
      },
    },
    {
      id: "draw-up-to",
      connector: "then",
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
  p1State.hand = p1State.hand.slice(1);
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-bounce-replacement-sequence"),
      timingWindowId: toTimingWindowId("window-bounce-replacement-sequence"),
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
      causedBy: { type: "ruleProcess", name: "bounce-replacement-test" },
    },
  ];
  return { state, definition };
};

const setupReviewedFieldRemovalRestSelfReplacementDefinition = (
  state: GameState,
  source: CardInstance,
): void => {
  const support = {
    cardId: source.cardId,
    status: "implemented-dsl" as const,
    tested: true,
    rulesVersion: "r1",
    cardDataVersion: state.cardManifest.cardDataVersion,
    sourceTextHash: "replacement-rest-self-source-hash",
    behaviorHash: "replacement-rest-self-behavior-hash",
    effectDefinitionId: `definition:${String(source.cardId)}`,
  };
  state.cardManifest.cards[source.cardId] = {
    ...resolvedCard({
      cardId: source.cardId,
      category: "character",
      power: 3000,
      support,
    }),
    colors: ["green"],
    name: "Tashigi",
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [support.effectDefinitionId]: {
      cardId: source.cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: toEffectId("replacement:would-move-zone-rest-self"),
          category: "replacement",
          trigger: {
            type: "replacement",
            replacement: {
              type: "wouldMoveZone",
              from: "characterArea",
              sourceKind: "cardEffect",
              target: {
                type: "all",
                zone: "characterArea",
                player: "self",
                filter: {
                  categories: ["character"],
                  colorsAny: ["green"],
                  nameNot: ["Tashigi"],
                },
              },
            },
          },
          optional: true,
          sourcePresencePolicy: "resolveFromLastKnownInformation",
          effect: {
            type: "replacement",
            when: {
              type: "wouldMoveZone",
              from: "characterArea",
              sourceKind: "cardEffect",
              target: {
                type: "all",
                zone: "characterArea",
                player: "self",
                filter: {
                  categories: ["character"],
                  colorsAny: ["green"],
                  nameNot: ["Tashigi"],
                },
              },
            },
            instead: {
              type: "rest",
              target: { type: "self" },
            },
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

const setupReviewedFieldRemovalRestOwnCardsReplacementDefinition = (
  state: GameState,
  source: CardInstance,
): void => {
  const support = {
    cardId: source.cardId,
    status: "implemented-dsl" as const,
    tested: true,
    rulesVersion: "r1",
    cardDataVersion: state.cardManifest.cardDataVersion,
    sourceTextHash: "replacement-rest-own-cards-source-hash",
    behaviorHash: "replacement-rest-own-cards-behavior-hash",
    effectDefinitionId: `definition:${String(source.cardId)}`,
  };
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 7000,
    support,
  });
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [support.effectDefinitionId]: {
      cardId: source.cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: toEffectId("replacement:would-move-zone-rest-own-cards"),
          category: "replacement",
          trigger: {
            type: "replacement",
            replacement: {
              type: "wouldMoveZone",
              from: "characterArea",
              sourceKind: "cardEffect",
              target: {
                type: "all",
                zone: "characterArea",
                player: "self",
                filter: {
                  categories: ["character"],
                  power: { max: 7000 },
                },
              },
            },
          },
          optional: true,
          sourcePresencePolicy: "resolveFromLastKnownInformation",
          effect: {
            type: "replacement",
            when: {
              type: "wouldMoveZone",
              from: "characterArea",
              sourceKind: "cardEffect",
              target: {
                type: "all",
                zone: "characterArea",
                player: "self",
                filter: {
                  categories: ["character"],
                  power: { max: 7000 },
                },
              },
            },
            instead: {
              type: "rest",
              target: {
                type: "chooseFromZones",
                request: {
                  timing: "onResolution",
                  chooser: "self",
                  player: "self",
                  zones: [
                    "leaderArea",
                    "characterArea",
                    "stageArea",
                    "costArea",
                  ],
                  min: 2,
                  max: 2,
                  allowFewerIfUnavailable: false,
                  visibility: "public",
                },
              },
            },
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

const setupSelectedTargetBounceFrame = (): {
  state: GameState;
  target: CardInstance;
} => setupSelectedTargetBounceFrameForDestination("hand");

const setupSelectedTargetBounceFrameForDestination = (
  destination: "deckBottom" | "hand",
  maxTargets = 1,
): {
  state: GameState;
  target: CardInstance;
} => {
  const { state } = sequenceQueueState(
    selectTargetsThenBounceSavedSelectedTargetSequence(destination, maxTargets),
  );
  const p2State = must(state.players[p2], "p2");
  const target = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "target source"),
    zone: "characterArea",
  });
  p2State.hand = p2State.hand.filter(
    (card) => card.instanceId !== target.instanceId,
  );
  state.cardManifest.cards[target.cardId] = {
    ...resolvedCard({
      cardId: target.cardId,
      category: "character",
      power: 6000,
    }),
    colors: ["green"],
    name: "Green Ally",
  };
  return { state, target };
};

const addP2CharacterFromHand = (
  state: GameState,
  index: number,
  name: string,
  colors: CardColor[],
): CardInstance => {
  const p2State = must(state.players[p2], "p2");
  const source = must(p2State.hand[index], `p2 hand ${String(index)}`);
  const card = withCardInZone({
    state,
    playerId: p2,
    card: source,
    zone: "characterArea",
    index: p2State.characters.length,
  });
  p2State.hand = p2State.hand.filter(
    (candidate) => candidate.instanceId !== card.instanceId,
  );
  state.cardManifest.cards[card.cardId] = {
    ...resolvedCard({
      cardId: card.cardId,
      category: "character",
      power: 6000,
    }),
    colors,
    name,
  };
  return card;
};

const resolveSelectedTargetBounce = (
  state: GameState,
  target: CardInstance,
): EngineResult => {
  return resolveSelectedTargetsBounce(state, [target]);
};

const resolveSelectedTargetsBounce = (
  state: GameState,
  targets: readonly CardInstance[],
): EngineResult => {
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "target selection");
  assert.equal(decision.type, "selectTargets");
  return applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: targets.map((target) => ({
        instanceId: target.instanceId,
        cardId: target.cardId,
        playerId: p2,
        zone: target.zone,
      })),
    },
  });
};

const setupPausedSavedTargetKoFrame = () => {
  const { state } = sequenceQueueState(
    drawUpToThenKoSavedFieldObjectSequence(),
  );
  const p2State = must(state.players[p2], "p2");
  const target = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "target source"),
    zone: "characterArea",
  });
  p2State.hand = p2State.hand.filter(
    (card) => card.instanceId !== target.instanceId,
  );
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
  target: CardInstance,
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
            savedTarget: {
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
            },
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

test("saved-field-object KO consumer pauses for chooseReplacement and resumes after acceptance", () => {
  const { pausedState, quantityDecisionId, target } =
    setupPausedSavedTargetKoFrame();
  setupReviewedKoReplacementDefinition(pausedState, target);

  const resolved = resolveWithSavedReference(
    pausedState,
    quantityDecisionId,
    target,
  );

  assert.equal(resolved.errors, undefined);
  const decision = must(resolved.state.pendingDecision, "replacement decision");
  assert.equal(decision.type, "chooseReplacement");
  assert.equal(
    resolved.state.effectExecutionFrames.some(
      (frame) => frame.pendingDecision.decisionId === decision.id,
    ),
    true,
  );
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

test("saved-field-object bounce consumer pauses for field-removal rest-self replacement and resumes after acceptance", () => {
  const { state, target } = setupSelectedTargetBounceFrame();
  const p2State = must(state.players[p2], "p2");
  const replacementSource = withCardInZone({
    state,
    playerId: p2,
    card: {
      ...must(p2State.hand[0], "replacement source"),
      cardId: "replacement-rest-self-source" as CardInstance["cardId"],
    },
    zone: "characterArea",
    index: 1,
  });
  p2State.hand = p2State.hand.filter(
    (card) => card.instanceId !== replacementSource.instanceId,
  );
  setupReviewedFieldRemovalRestSelfReplacementDefinition(
    state,
    replacementSource,
  );

  const resolved = resolveSelectedTargetBounce(state, target);

  assert.equal(resolved.errors, undefined);
  const decision = must(resolved.state.pendingDecision, "replacement decision");
  assert.equal(decision.type, "chooseReplacement");
  assert.equal(
    resolved.state.effectExecutionFrames.some(
      (frame) => frame.pendingDecision.decisionId === decision.id,
    ),
    true,
  );
  assert.equal(
    resolved.events.some((event) => event.type === "cardMoved"),
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

  const acceptedP2 = must(accepted.state.players[p2], "accepted p2");
  const acceptedSource = must(
    acceptedP2.characters.find(
      (card) => card.instanceId === replacementSource.instanceId,
    ),
    "rested replacement source",
  );

  assert.equal(accepted.errors, undefined);
  assert.equal(accepted.state.pendingDecision, undefined);
  assert.equal(acceptedSource.state, "rested");
  assert.equal(
    acceptedP2.characters.some((card) => card.instanceId === target.instanceId),
    true,
  );
  assert.equal(accepted.state.effectExecutionFrames.length, 0);
  assert.equal(accepted.stateHash, hashCanonicalStateValue(accepted.state));
});

test("saved-field-object deck-bottom bounce moves through field-removal process", () => {
  const { state, target } =
    setupSelectedTargetBounceFrameForDestination("deckBottom");

  const resolved = resolveSelectedTargetBounce(state, target);
  const p2State = must(resolved.state.players[p2], "resolved p2");
  const bottomDeckCard = must(
    p2State.deck.at(-1),
    "bottom deck card after bounce",
  );

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(
    p2State.characters.some((card) => card.instanceId === target.instanceId),
    false,
  );
  assert.equal(bottomDeckCard.instanceId, target.instanceId);
  assert.equal(bottomDeckCard.zone.zone, "deck");
  assert.equal(
    resolved.events.some((event) => event.type === "cardMoved"),
    true,
  );
});

test("self deck-bottom bounce moves the effect source through field-removal process", () => {
  const { state } = sequenceQueueState(bounceSelfToOwnerDeckBottomSequence());
  const source = must(
    must(state.players[p1], "p1 before").characters[0],
    "source character",
  );

  const result = processEffectRuntime(state);
  const player = must(result.state.players[p1], "p1 after");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(
    player.characters.some((card) => card.instanceId === source.instanceId),
    false,
  );
  assert.equal(
    must(player.deck.at(-1), "bottom deck card").instanceId,
    source.instanceId,
  );
});

test("saved-field-object deck-bottom bounce moves two selected targets in selection order", () => {
  const { state, target } = setupSelectedTargetBounceFrameForDestination(
    "deckBottom",
    2,
  );
  const secondTarget = addP2CharacterFromHand(state, 0, "Second Target", [
    "red",
  ]);

  const resolved = resolveSelectedTargetsBounce(state, [target, secondTarget]);
  const p2State = must(resolved.state.players[p2], "resolved p2");
  const bottomTwo = p2State.deck.slice(-2);

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.deepEqual(
    bottomTwo.map((card) => card.instanceId),
    [target.instanceId, secondTarget.instanceId],
  );
  assert.equal(
    p2State.characters.some((card) => card.instanceId === target.instanceId),
    false,
  );
  assert.equal(
    p2State.characters.some(
      (card) => card.instanceId === secondTarget.instanceId,
    ),
    false,
  );
  assert.equal(
    resolved.events.filter((event) => event.type === "cardMoved").length,
    2,
  );
});

test("saved-field-object deck-bottom bounce resumes after replacement and moves remaining target", () => {
  const { state, target } = setupSelectedTargetBounceFrameForDestination(
    "deckBottom",
    2,
  );
  const p2State = must(state.players[p2], "p2");
  const replacementSource = withCardInZone({
    state,
    playerId: p2,
    card: {
      ...must(p2State.hand[0], "replacement source"),
      cardId: "replacement-rest-self-source" as CardInstance["cardId"],
    },
    zone: "characterArea",
    index: 1,
  });
  p2State.hand = p2State.hand.filter(
    (card) => card.instanceId !== replacementSource.instanceId,
  );
  const unprotectedTarget = addP2CharacterFromHand(state, 0, "Red Target", [
    "red",
  ]);
  setupReviewedFieldRemovalRestSelfReplacementDefinition(
    state,
    replacementSource,
  );

  const resolved = resolveSelectedTargetsBounce(state, [
    target,
    unprotectedTarget,
  ]);

  assert.equal(resolved.errors, undefined);
  const decision = must(resolved.state.pendingDecision, "replacement decision");
  assert.equal(decision.type, "chooseReplacement");
  assert.equal(
    resolved.events.some((event) => event.type === "cardMoved"),
    false,
  );

  const accepted = applyAction(resolved.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "replacement",
      replacementId: must(decision.replacementIds[0], "replacement id"),
    },
  });

  const acceptedP2 = must(accepted.state.players[p2], "accepted p2");
  const restedReplacementSource = must(
    acceptedP2.characters.find(
      (card) => card.instanceId === replacementSource.instanceId,
    ),
    "rested replacement source",
  );
  const protectedTarget = must(
    acceptedP2.characters.find((card) => card.instanceId === target.instanceId),
    "protected target",
  );
  const bottomDeckCard = must(
    acceptedP2.deck.at(-1),
    "remaining target moved to bottom deck",
  );

  assert.equal(accepted.errors, undefined);
  assert.equal(accepted.state.pendingDecision, undefined);
  assert.equal(restedReplacementSource.state, "rested");
  assert.equal(protectedTarget.instanceId, target.instanceId);
  assert.equal(bottomDeckCard.instanceId, unprotectedTarget.instanceId);
  assert.equal(accepted.state.effectExecutionFrames.length, 0);
  assert.equal(accepted.stateHash, hashCanonicalStateValue(accepted.state));
});

test("saved-field-object deck-bottom bounce pauses for field-removal replacement", () => {
  const { state, target } =
    setupSelectedTargetBounceFrameForDestination("deckBottom");
  const p2State = must(state.players[p2], "p2");
  const replacementSource = withCardInZone({
    state,
    playerId: p2,
    card: {
      ...must(p2State.hand[0], "replacement source"),
      cardId: "replacement-rest-self-source" as CardInstance["cardId"],
    },
    zone: "characterArea",
    index: 1,
  });
  p2State.hand = p2State.hand.filter(
    (card) => card.instanceId !== replacementSource.instanceId,
  );
  setupReviewedFieldRemovalRestSelfReplacementDefinition(
    state,
    replacementSource,
  );

  const resolved = resolveSelectedTargetBounce(state, target);

  assert.equal(resolved.errors, undefined);
  const decision = must(resolved.state.pendingDecision, "replacement decision");
  assert.equal(decision.type, "chooseReplacement");
  assert.equal(
    resolved.events.some((event) => event.type === "cardMoved"),
    false,
  );
  assert.equal(
    must(resolved.state.players[p2], "p2").characters.some(
      (card) => card.instanceId === target.instanceId,
    ),
    true,
  );
});

test("saved-field-object bounce consumer pauses for field-removal rest-own-cards replacement and resumes after acceptance", () => {
  const { state, target } = setupSelectedTargetBounceFrame();
  setupReviewedFieldRemovalRestOwnCardsReplacementDefinition(state, target);

  const resolved = resolveSelectedTargetBounce(state, target);

  assert.equal(resolved.errors, undefined);
  const decision = must(resolved.state.pendingDecision, "replacement decision");
  assert.equal(decision.type, "chooseReplacement");
  assert.equal(
    resolved.events.some((event) => event.type === "cardMoved"),
    false,
  );

  const accepted = applyAction(resolved.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "replacement",
      replacementId: must(decision.replacementIds[0], "replacement id"),
    },
  });
  const restDecision = must(
    accepted.state.pendingDecision,
    "replacement rest decision",
  );
  assert.equal(restDecision.type, "selectTargets");
  assert.equal(
    accepted.state.effectExecutionFrames.some(
      (frame) => frame.pendingDecision.decisionId === decision.id,
    ),
    true,
  );

  const acceptedP2 = must(accepted.state.players[p2], "accepted p2");
  const restResolved = applyAction(accepted.state, {
    type: "respondToDecision",
    decisionId: restDecision.id,
    response: {
      type: "targets",
      targets: [
        {
          instanceId: acceptedP2.leader.instanceId,
          cardId: acceptedP2.leader.cardId,
          playerId: p2,
          zone: acceptedP2.leader.zone,
        },
        {
          instanceId: target.instanceId,
          cardId: target.cardId,
          playerId: p2,
          zone: target.zone,
        },
      ],
    },
  });

  const nextP2 = must(restResolved.state.players[p2], "resolved p2");
  const protectedTarget = must(
    nextP2.characters.find((card) => card.instanceId === target.instanceId),
    "protected target",
  );

  assert.equal(restResolved.errors, undefined);
  assert.equal(restResolved.state.pendingDecision, undefined);
  assert.equal(
    restResolved.events.some((event) => event.type === "cardMoved"),
    false,
  );
  assert.equal(nextP2.leader.state, "rested");
  assert.equal(protectedTarget.state, "rested");
  assert.equal(restResolved.state.effectExecutionFrames.length, 0);
  assert.equal(
    restResolved.stateHash,
    hashCanonicalStateValue(restResolved.state),
  );
});
