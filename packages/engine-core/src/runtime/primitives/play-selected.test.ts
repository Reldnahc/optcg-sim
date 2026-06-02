import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  Effect,
  EffectDefinition,
  EngineResult,
  GameState,
  HandSelectionId,
  SelectionId,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  filterStateForPlayer,
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
} from "../../effect-runtime-queue/test-support.js";
import { applyRuntimePlaySelectedFromHand } from "../../play-card.js";
import { setupFullCharacterPlayState } from "../../play-card-test-fixtures.js";

const reindexHand = (cards: readonly CardInstance[]): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));

const playSelectedSequence = (params: {
  filter?: Extract<
    Extract<Effect, { type: "sequence" }>["effects"][number]["effect"],
    { type: "selectCards" }
  >["filter"];
  max: number;
  min: number;
  pauseAfter?: boolean;
  sourceZone?: "hand" | "trash";
}): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "draw-before-selection",
      connector: "always",
      effect: { type: "draw", player: "self", count: 1 },
    },
    {
      id: "select-character-from-hand",
      connector: "then",
      effect: {
        type: "selectCards",
        zone: params.sourceZone ?? "hand",
        player: "self",
        chooser: "self",
        min: params.min,
        max: params.max,
        filter: params.filter ?? { categories: ["character"] },
        saveAs: "handSelection:play" as HandSelectionId,
        visibility: "chooserOnly",
      },
    },
    ...(params.pauseAfter === true
      ? [
          {
            id: "optional-gate",
            connector: "ifPreviousSucceeded" as const,
            optional: true,
            effect: {
              type: "draw" as const,
              player: "self" as const,
              count: 1,
            },
          },
        ]
      : []),
    {
      id: "play-selected",
      connector: "ifPreviousSucceeded",
      effect: {
        type: "playSelected",
        selection: "handSelection:play" as HandSelectionId,
        enterRested: true,
        ignoreCost: true,
      },
    },
    ...(params.pauseAfter === true
      ? [
          {
            id: "pause-after-play-selected",
            connector: "always" as const,
            optional: true,
            effect: {
              type: "draw" as const,
              player: "self" as const,
              count: 0,
            },
          },
        ]
      : []),
  ],
});

const playStageFromTrashSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "select-stage-from-trash",
      connector: "always",
      saveResultAs: "trashSelection:play",
      effect: {
        type: "selectCards",
        zone: "trash",
        player: "self",
        chooser: "self",
        min: 0,
        max: 1,
        filter: {
          categories: ["stage"],
          typesAny: ["Mary Geoise"],
          cost: { op: "eq", value: 1 },
        },
        saveAs: "trashSelection:play" as SelectionId,
        visibility: "bothPlayers",
      },
    },
    {
      id: "play-stage-from-trash",
      connector: "ifPossible",
      effect: {
        type: "playSelected",
        selection: "trashSelection:play" as SelectionId,
        ignoreCost: true,
      },
    },
  ],
});

const playCharacterFromTrashSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "select-character-from-trash",
      connector: "always",
      saveResultAs: "trashSelection:play",
      effect: {
        type: "selectCards",
        zone: "trash",
        player: "self",
        chooser: "self",
        min: 1,
        max: 1,
        filter: {
          categories: ["character"],
        },
        saveAs: "trashSelection:play" as SelectionId,
        visibility: "bothPlayers",
      },
    },
    {
      id: "play-character-from-trash",
      connector: "ifPossible",
      effect: {
        type: "playSelected",
        selection: "trashSelection:play" as SelectionId,
        enterRested: true,
        ignoreCost: true,
      },
    },
  ],
});

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-play-selected-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "play-selected-rules",
      sourceTextHash: "play-selected-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-play-selected-sequence"),
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

const sequenceQueueState = (effect: Effect): GameState => {
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
  const refill = must(remainingHand[remainingHand.length - 1], "refill");
  p1State.hand = reindexHand(remainingHand.slice(0, -1));
  p1State.deck = [
    ...p1State.deck,
    {
      ...refill,
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
      id: toQueueEntryId("queue-entry-play-selected"),
      timingWindowId: toTimingWindowId("window-play-selected"),
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
      causedBy: { type: "ruleProcess", name: "play-selected-test" },
    },
  ];
  return state;
};

const markHandCharactersSupported = (state: GameState, cost = 1): void => {
  const player = must(state.players[p1], "p1");
  for (const card of player.hand) {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "character",
      cost,
      power: 1000,
    });
  }
};

const markCardWithOnPlayDraw = (state: GameState, card: CardInstance): void => {
  const effectDefinitionId = `def:${String(card.cardId)}:on-play-draw`;
  const supportCard = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 1,
    power: 1000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "play-selected-on-play-rules",
      sourceTextHash: "play-selected-on-play-source",
    },
  });
  state.cardManifest.cards[card.cardId] = supportCard;
  const definition = reviewedOnPlayDrawDefinition(
    card.cardId,
    supportCard.support,
  );
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
};

const moveSupportedStageToTrash = (state: GameState): CardInstance => {
  const player = must(state.players[p1], "p1");
  const card = must(player.hand[0], "stage source");
  const trashStage: CardInstance = {
    ...card,
    cardId: "trash-mary-stage" as CardId,
    zone: { zone: "trash", playerId: p1, slot: "trash", index: 0 },
    state: "active",
    attachedDon: [],
  };
  player.hand = reindexHand(player.hand.slice(1));
  player.trash = [trashStage, ...player.trash];
  state.cardManifest.cards[trashStage.cardId] = {
    ...resolvedCard({
      cardId: trashStage.cardId,
      category: "stage",
      cost: 1,
    }),
    types: ["Mary Geoise"],
  };
  return trashStage;
};

const moveSupportedCharacterToTrash = (state: GameState): CardInstance => {
  const player = must(state.players[p1], "p1");
  const card = must(player.hand[0], "character source");
  const trashCharacter: CardInstance = {
    ...card,
    cardId: "trash-character-play-selected" as CardId,
    zone: { zone: "trash", playerId: p1, slot: "trash", index: 0 },
    state: "active",
    attachedDon: [],
  };
  player.hand = reindexHand(player.hand.slice(1));
  player.trash = [trashCharacter, ...player.trash];
  state.cardManifest.cards[trashCharacter.cardId] = resolvedCard({
    cardId: trashCharacter.cardId,
    category: "character",
    cost: 1,
    power: 1000,
  });
  return trashCharacter;
};

const fillCharacterAreaToFive = (state: GameState): void => {
  const player = must(state.players[p1], "p1");
  const nextCharacters = [...player.characters];
  const source = player.leader;
  while (nextCharacters.length < 5) {
    const index = nextCharacters.length;
    const character: CardInstance = {
      ...source,
      instanceId:
        `${String(source.instanceId)}:play-selected-filler:${String(index)}` as CardInstance["instanceId"],
      zone: { zone: "characterArea", playerId: p1, slot: "character", index },
      state: "active",
      attachedDon: [],
      turnPlayed: state.turn.globalTurn,
    };
    state.cardManifest.cards[character.cardId] = resolvedCard({
      cardId: character.cardId,
      category: "character",
      cost: 0,
      power: 1000,
    });
    nextCharacters.push(character);
  }
  player.characters = nextCharacters;
};

const eventTypes = (result: EngineResult): string[] =>
  result.events.map((event) => event.type);

const chooseNonSelectedOverflowTarget = (
  result: EngineResult,
  selectedIds: ReadonlySet<CardInstance["instanceId"]>,
) => {
  const decision = must(result.state.pendingDecision, "overflow decision");
  assert.equal(decision.type, "selectCards");
  return must(
    decision.candidates.find(
      (candidate) => !selectedIds.has(candidate.card.instanceId),
    ),
    "non-selected overflow candidate",
  ).card;
};

test("Character playSelected plays selected hand card rested without cost payment", () => {
  const state = sequenceQueueState(playSelectedSequence({ min: 0, max: 1 }));
  markHandCharactersSupported(state, 10);

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "selection");
  assert.equal(decision.type, "selectCards");
  const selected = must(decision.candidates[0], "candidate").card;
  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [selected] },
  });
  const played = must(resolved.state.players[p1], "p1").characters.find(
    (card) => card.instanceId === selected.instanceId,
  );

  assert.equal(resolved.errors, undefined);
  assert.equal(played?.state, "rested");
  assert.equal(
    resolved.events.some((event) => event.type === "costPaid"),
    false,
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("hand playSelected filters out Events that match non-category predicates", () => {
  const state = sequenceQueueState(
    playSelectedSequence({
      min: 0,
      max: 1,
      filter: {
        categories: ["character"],
        colorsAny: ["black"],
        typesAny: ["Five Elders"],
        custom: "costLteSelfDonFieldCount",
      },
    }),
  );
  const player = must(state.players[p1], "p1");
  const event = {
    ...must(player.hand[0], "event candidate"),
    cardId: "play-filter-event" as CardId,
  };
  const character = {
    ...must(player.hand[1], "character candidate"),
    cardId: "play-filter-character" as CardId,
  };
  player.hand = [event, character, ...player.hand.slice(2)];
  player.costArea = Array.from({ length: 3 }, (_, index) => ({
    ...player.leader,
    instanceId: `don-for-filter-${String(index)}` as CardInstance["instanceId"],
    cardId: `don-for-filter-${String(index)}` as CardId,
    zone: {
      zone: "costArea",
      playerId: p1,
      slot: "cost" as const,
      index,
    },
    state: "active" as const,
    attachedDon: [],
  }));
  state.cardManifest.cards[event.cardId] = {
    ...resolvedCard({
      cardId: event.cardId,
      category: "event",
      cost: 1,
    }),
    colors: ["black"],
    types: ["Five Elders"],
  };
  state.cardManifest.cards[character.cardId] = {
    ...resolvedCard({
      cardId: character.cardId,
      category: "character",
      cost: 1,
      power: 1000,
    }),
    colors: ["black"],
    types: ["Five Elders"],
  };

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "selection");

  assert.equal(decision.type, "selectCards");
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.card.instanceId),
    [character.instanceId],
  );
});

test("Character playSelected triggers its On Play after the parent sequence resolves", () => {
  const state = sequenceQueueState(playSelectedSequence({ min: 0, max: 1 }));
  markHandCharactersSupported(state, 10);
  const selectedBefore = must(
    must(state.players[p1], "p1 before").hand[0],
    "selected hand card",
  );
  markCardWithOnPlayDraw(state, selectedBefore);
  const startingHandCount = must(state.players[p1], "p1 before count").hand
    .length;

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "selection");
  assert.equal(decision.type, "selectCards");
  const selected = must(decision.candidates[0], "candidate").card;
  assert.equal(selected.instanceId, selectedBefore.instanceId);
  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [selected] },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(
    eventTypes(resolved).filter((type) => type === "cardPlayed").length,
    1,
  );
  assert.equal(
    eventTypes(resolved).filter((type) => type === "effectQueued").length,
    1,
  );
  assert.equal(
    eventTypes(resolved).filter((type) => type === "cardDrawn").length,
    1,
  );
  assert.equal(
    must(resolved.state.players[p1], "p1 after").hand.length,
    startingHandCount + 1,
  );
});

test("Character playSelected allows zero-card up-to selection", () => {
  const state = sequenceQueueState(playSelectedSequence({ min: 0, max: 1 }));
  markHandCharactersSupported(state);
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "selection");
  assert.equal(decision.type, "selectCards");

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [] },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(must(resolved.state.players[p1], "p1").characters.length, 1);
  assert.deepEqual(
    eventTypes(resolved).filter((type) => type === "cardPlayed"),
    [],
  );
});

test("playSelected plays selected Stage card from trash without cost payment", () => {
  const state = sequenceQueueState(playStageFromTrashSequence());
  const trashStage = moveSupportedStageToTrash(state);

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "selection");
  assert.equal(decision.type, "selectCards");
  const selected = must(decision.candidates[0], "candidate").card;
  assert.equal(selected.instanceId, trashStage.instanceId);
  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [selected] },
  });
  const player = must(resolved.state.players[p1], "p1");

  assert.equal(resolved.errors, undefined);
  assert.equal(player.stage?.instanceId, trashStage.instanceId);
  assert.equal(
    player.trash.some((card) => card.instanceId === trashStage.instanceId),
    false,
  );
  assert.equal(
    resolved.events.some((event) => event.type === "costPaid"),
    false,
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("trash-origin Character playSelected resolves overflow then resumes play", () => {
  const state = sequenceQueueState(playCharacterFromTrashSequence());
  const trashCharacter = moveSupportedCharacterToTrash(state);
  fillCharacterAreaToFive(state);
  const originalCharacters = [
    ...must(state.players[p1], "p1").characters.map((card) => card.instanceId),
  ];

  const paused = processEffectRuntime(state);
  const selection = must(paused.state.pendingDecision, "selection");
  assert.equal(selection.type, "selectCards");
  const selected = must(selection.candidates[0], "candidate").card;
  const opened = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: selection.id,
    response: { type: "cards", cards: [selected] },
  });
  const overflow = must(opened.state.pendingDecision, "overflow");
  assert.equal(overflow.type, "selectCards");
  const overflowTarget = must(overflow.candidates[0], "overflow target").card;
  const resolved = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: overflow.id,
    response: { type: "cards", cards: [overflowTarget] },
  });
  const player = must(resolved.state.players[p1], "p1");

  assert.equal(opened.errors, undefined);
  assert.equal(resolved.errors, undefined);
  assert.equal(
    player.characters.some(
      (card) => card.instanceId === trashCharacter.instanceId,
    ),
    true,
  );
  assert.equal(
    player.trash.some((card) => card.instanceId === trashCharacter.instanceId),
    false,
  );
  assert.equal(
    player.trash.some((card) => card.instanceId === overflowTarget.instanceId),
    true,
  );
  assert.equal(player.characters.length, 5);
  assert.equal(originalCharacters.includes(overflowTarget.instanceId), true);
});

test("Character playSelected supports multiple selected Characters in order", () => {
  const run = (): EngineResult => {
    const state = sequenceQueueState(playSelectedSequence({ min: 0, max: 2 }));
    markHandCharactersSupported(state, 5);
    const paused = processEffectRuntime(state);
    const decision = must(paused.state.pendingDecision, "selection");
    assert.equal(decision.type, "selectCards");
    return applyAction(paused.state, {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "cards",
        cards: [
          must(decision.candidates[0], "first").card,
          must(decision.candidates[1], "second").card,
        ],
      },
    });
  };

  const first = run();
  const second = run();
  const played = must(first.state.players[p1], "p1").characters.slice(-2);
  assert.equal(first.errors, undefined);
  assert.equal(played[0]?.state, "rested");
  assert.equal(played[1]?.state, "rested");
  assert.equal(first.stateHash, second.stateHash);
});

test("multi-card Character playSelected resumes remaining selections after overflow", () => {
  const state = sequenceQueueState(
    playSelectedSequence({ min: 3, max: 3, pauseAfter: true }),
  );
  fillCharacterAreaToFive(state);
  markHandCharactersSupported(state, 5);
  const paused = processEffectRuntime(state);
  const selection = must(paused.state.pendingDecision, "selection");
  assert.equal(selection.type, "selectCards");
  const selected = [
    must(selection.candidates[0], "first selected").card,
    must(selection.candidates[1], "second selected").card,
    must(selection.candidates[2], "third selected").card,
  ];
  const selectedIds = new Set(selected.map((card) => card.instanceId));
  const afterSelection = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: selection.id,
    response: { type: "cards", cards: selected },
  });
  const prePlayGate = must(
    afterSelection.state.pendingDecision,
    "pre-play gate",
  );
  assert.equal(prePlayGate.type, "chooseOptionalActivation");

  const firstOverflow = applyAction(afterSelection.state, {
    type: "respondToDecision",
    decisionId: prePlayGate.id,
    response: { type: "optionalActivation", choice: "activate" },
  });
  const firstTarget = chooseNonSelectedOverflowTarget(
    firstOverflow,
    selectedIds,
  );
  const afterFirstOverflow = applyAction(firstOverflow.state, {
    type: "respondToDecision",
    decisionId: must(firstOverflow.state.pendingDecision, "first overflow").id,
    response: { type: "cards", cards: [firstTarget] },
  });
  assert.equal(afterFirstOverflow.errors, undefined);
  assert.equal(
    afterFirstOverflow.state.actionSeq,
    firstOverflow.state.actionSeq + 1,
  );
  assert.equal(afterFirstOverflow.state.pendingDecision?.type, "selectCards");
  assert.deepEqual(afterFirstOverflow.state.pendingDecision.causedBy, {
    type: "effect",
    queueEntryId: toQueueEntryId("queue-entry-play-selected"),
    effectId: toEffectId("effect-play-selected-sequence"),
  });
  assert.deepEqual(
    filterStateForPlayer(afterFirstOverflow.state, p1).pendingDecision
      ?.causedBy,
    { type: "ruleProcess", name: "privateCausality" },
  );
  assert.equal(
    must(
      afterFirstOverflow.state.players[p1],
      "after first p1",
    ).characters.some((card) => card.instanceId === selected[0]?.instanceId),
    true,
  );

  const secondTarget = chooseNonSelectedOverflowTarget(
    afterFirstOverflow,
    selectedIds,
  );
  const afterSecondOverflow = applyAction(afterFirstOverflow.state, {
    type: "respondToDecision",
    decisionId: must(
      afterFirstOverflow.state.pendingDecision,
      "second overflow",
    ).id,
    response: { type: "cards", cards: [secondTarget] },
  });
  assert.equal(afterSecondOverflow.errors, undefined);
  assert.equal(
    afterSecondOverflow.state.actionSeq,
    afterFirstOverflow.state.actionSeq + 1,
  );
  assert.equal(afterSecondOverflow.state.pendingDecision?.type, "selectCards");
  assert.deepEqual(
    filterStateForPlayer(afterSecondOverflow.state, p1).pendingDecision
      ?.causedBy,
    { type: "ruleProcess", name: "privateCausality" },
  );
  assert.equal(
    must(
      afterSecondOverflow.state.players[p1],
      "after second p1",
    ).characters.some((card) => card.instanceId === selected[1]?.instanceId),
    true,
  );

  const thirdTarget = chooseNonSelectedOverflowTarget(
    afterSecondOverflow,
    selectedIds,
  );
  const afterThirdOverflow = applyAction(afterSecondOverflow.state, {
    type: "respondToDecision",
    decisionId: must(
      afterSecondOverflow.state.pendingDecision,
      "third overflow",
    ).id,
    response: { type: "cards", cards: [thirdTarget] },
  });

  const finalPlayer = must(afterThirdOverflow.state.players[p1], "final p1");
  const frame = must(
    afterThirdOverflow.state.effectExecutionFrames[0],
    "frame",
  );
  const segment = must(frame.segmentResults["3"], "playSelected result");
  assert.equal(afterThirdOverflow.errors, undefined);
  assert.equal(
    afterThirdOverflow.state.actionSeq,
    afterSecondOverflow.state.actionSeq + 1,
  );
  assert.equal(
    afterThirdOverflow.state.pendingDecision?.type,
    "chooseOptionalActivation",
  );
  assert.deepEqual(
    selected.map((card) => card.instanceId),
    finalPlayer.characters.slice(-3).map((card) => card.instanceId),
  );
  assert.deepEqual(
    selected.map((card) => card.instanceId),
    segment.selectedCards.map((card) => card.instanceId),
  );
  assert.equal(segment.attempted, true);
  assert.equal(segment.succeeded, true);
  assert.equal(segment.changedState, true);
  assert.equal(
    [
      ...firstOverflow.events,
      ...afterFirstOverflow.events,
      ...afterSecondOverflow.events,
      ...afterThirdOverflow.events,
    ].some((event) => event.type === "costPaid"),
    false,
  );
  assert.equal(
    afterThirdOverflow.stateHash,
    hashCanonicalStateValue(afterThirdOverflow.state),
  );
});

test("runtime playSelected overflow response follows decision player during off-turn sequence resolution", () => {
  const state = sequenceQueueState(playSelectedSequence({ min: 1, max: 1 }));
  state.turn.turnPlayerId = p2;
  fillCharacterAreaToFive(state);
  markHandCharactersSupported(state, 5);
  const paused = processEffectRuntime(state);
  const selection = must(paused.state.pendingDecision, "selection");
  assert.equal(selection.type, "selectCards");
  const selected = must(selection.candidates[0], "selected").card;
  const opened = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: selection.id,
    response: { type: "cards", cards: [selected] },
  });
  const target = chooseNonSelectedOverflowTarget(
    opened,
    new Set([selected.instanceId]),
  );

  const resolved = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: must(opened.state.pendingDecision, "overflow").id,
    response: { type: "cards", cards: [target] },
  });

  const played = must(resolved.state.players[p1], "p1").characters.find(
    (card) => card.instanceId === selected.instanceId,
  );
  assert.equal(resolved.errors, undefined);
  assert.equal(played?.state, "rested");
});

test("full Character area creates forced-trash decision before play completion and resumes deterministically", () => {
  const { state, newCharacter } = setupFullCharacterPlayState(0);
  const opened = applyRuntimePlaySelectedFromHand({
    state,
    playerId: p1,
    cardInstanceId: newCharacter.instanceId,
    enterRested: true,
    ignoreCost: true,
  });
  const overflow = must(opened.state.pendingDecision, "overflow");
  assert.equal(opened.errors, undefined);
  assert.deepEqual(eventTypes(opened), ["decisionCreated"]);
  assert.equal(
    must(opened.state.players[p1], "p1").hand.some(
      (card) => card.instanceId === newCharacter.instanceId,
    ),
    true,
  );

  assert.equal(overflow.type, "selectCards");
  const target = must(must(overflow.candidates[0], "candidate").card, "target");
  const first = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: overflow.id,
    response: { type: "cards", cards: [target] },
  });
  const second = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: overflow.id,
    response: { type: "cards", cards: [target] },
  });
  const played = must(first.state.players[p1], "p1").characters.find(
    (card) => card.instanceId === newCharacter.instanceId,
  );
  assert.equal(first.errors, undefined);
  assert.equal(played?.state, "rested");
  assert.equal(
    first.events.some((event) => event.type === "costPaid"),
    false,
  );
  assert.equal(
    first.events.some((event) => event.type === "effectResolved"),
    false,
  );
  assert.equal(first.stateHash, second.stateHash);
});

test("Event playSelected fails closed without play or hand-to-field move", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const handCard = must(must(state.players[p1], "p1").hand[0], "hand card");
  state.cardManifest.cards[handCard.cardId] = resolvedCard({
    cardId: handCard.cardId,
    category: "event",
    cost: 0,
    effectText: "[Main]",
  });

  const result = applyRuntimePlaySelectedFromHand({
    state,
    playerId: p1,
    cardInstanceId: handCard.instanceId,
    enterRested: true,
    ignoreCost: true,
  });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(
    result.events.some((event) => event.type === "cardPlayed"),
    false,
  );
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "cardMoved" &&
        (event.payload as { reason?: string }).reason === "playCard",
    ),
    false,
  );
  assert.equal(
    filterStateForPlayer(result.state, p2).legalActions.some(
      (action) => action.type === "respondToDecision",
    ),
    false,
  );
});

test("stale, non-hand, and no-longer-legal playSelected references fail closed deterministically", () => {
  const build = () => {
    const state = sequenceQueueState(
      playSelectedSequence({ min: 1, max: 1, pauseAfter: true }),
    );
    markHandCharactersSupported(state);
    const paused = processEffectRuntime(state);
    const selection = must(paused.state.pendingDecision, "selection");
    assert.equal(selection.type, "selectCards");
    const selected = must(selection.candidates[0], "selected").card;
    const gated = applyAction(paused.state, {
      type: "respondToDecision",
      decisionId: selection.id,
      response: { type: "cards", cards: [selected] },
    });
    const gate = must(gated.state.pendingDecision, "optional gate");
    assert.equal(gate.type, "chooseOptionalActivation");
    return { gated, gate };
  };

  const scenarios: Array<{
    label: string;
    mutate: (state: GameState) => void;
  }> = [
    {
      label: "no-longer-in-hand",
      mutate: (state) => {
        const player = must(state.players[p1], "p1");
        const card = must(player.hand[0], "hand card");
        player.hand = reindexHand(player.hand.slice(1));
        player.trash = [
          {
            ...card,
            zone: { zone: "trash", playerId: p1, slot: "trash", index: 0 },
          },
          ...player.trash,
        ];
      },
    },
    {
      label: "no-longer-legal",
      mutate: (state) => {
        const player = must(state.players[p1], "p1");
        const card = must(player.hand[0], "hand card");
        state.cardManifest.cards[card.cardId] = resolvedCard({
          cardId: card.cardId,
          category: "leader",
        });
      },
    },
    {
      label: "stale-non-hand-reference",
      mutate: (state) => {
        const frame = must(state.effectExecutionFrames[0], "frame");
        const ref = frame.savedReferences["handSelection:play"];
        if (ref === undefined || ref.kind !== "selectedCards") {
          throw new Error("expected selectedCards reference");
        }
        const first = must(ref.cards[0], "saved card");
        ref.cards[0] = {
          ...first,
          zone: { zone: "trash", playerId: p1, slot: "trash", index: 0 },
        };
      },
    },
  ];

  for (const scenario of scenarios) {
    const { gated, gate } = build();
    const mutated = structuredClone(gated.state);
    scenario.mutate(mutated);
    const first = applyAction(mutated, {
      type: "respondToDecision",
      decisionId: gate.id,
      response: { type: "optionalActivation", choice: "activate" },
    });
    const second = applyAction(mutated, {
      type: "respondToDecision",
      decisionId: gate.id,
      response: { type: "optionalActivation", choice: "activate" },
    });
    const frame = must(first.state.effectExecutionFrames[0], "frame");
    const segment = must(frame.segmentResults["3"], "playSelected result");
    assert.equal(first.errors, undefined, scenario.label);
    assert.equal(segment.attempted, true, scenario.label);
    assert.equal(segment.succeeded, false, scenario.label);
    assert.equal(segment.changedState, false, scenario.label);
    assert.equal(
      first.events.some((event) => event.type === "cardPlayed"),
      false,
    );
    assert.equal(
      first.events.some(
        (event) =>
          event.type === "cardMoved" &&
          (event.payload as { reason?: string }).reason === "playCard",
      ),
      false,
      scenario.label,
    );
    assert.equal(
      filterStateForPlayer(first.state, p2).legalActions.some(
        (action) => action.type === "respondToDecision",
      ),
      false,
      scenario.label,
    );
    assert.equal(first.stateHash, second.stateHash, scenario.label);
    assert.equal(first.stateHash, hashCanonicalStateValue(first.state));
  }
});
