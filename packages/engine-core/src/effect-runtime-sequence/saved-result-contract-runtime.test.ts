import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  CardRef,
  EngineResult,
  Effect,
  GameState,
  PlayerId,
  SelectCardsDecision,
  SelectTargetsDecision,
  SelectionId,
  SelectionSetId,
} from "@optcg/types";

import {
  installActivateMainDrawDefinition,
  makeMainPhaseLegalActionState,
} from "../action-dispatcher-test-support.js";
import {
  applyAction,
  createActiveState,
  must,
  p1,
  p2,
  processEffectRuntime,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEngineEventId,
  toEffectId,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";
import { sequenceQueueState as queuedSequenceState } from "./search-reveal-test-support.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegment = SequenceEffect["effects"][number];

const setupSequence = (
  state: GameState,
  effect: SequenceEffect,
): {
  readonly effectId: ReturnType<typeof toEffectId>;
  readonly source: NonNullable<GameState["players"][PlayerId]>["leader"];
} => {
  const p1State = must(state.players[p1], "p1");
  const source = p1State.leader;
  const effectId = toEffectId("effect-saved-result-contract-runtime");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: source.cardId,
    category: "leader",
    definitionId: "def-saved-result-contract-runtime",
    effectId,
  });
  must(definition.effects[0], "activate main effect").effect = effect;
  return { effectId, source };
};

const moveDonToCostArea = (state: GameState, playerId: PlayerId) => {
  const player = must(state.players[playerId], "player");
  const don = must(player.donDeck[0], "DON!!");
  state.cardManifest.cards[don.cardId] = resolvedCard({
    cardId: don.cardId,
    category: "don",
  });
  player.donDeck = player.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId, slot: "donDeck", index },
  }));
  const placed = {
    ...don,
    zone: {
      zone: "costArea" as const,
      playerId,
      slot: "cost" as const,
      index: player.costArea.length,
    },
    state: "active" as const,
  };
  player.costArea = [placed];
  return placed;
};

const pendingFrame = (state: GameState) =>
  must(state.effectExecutionFrames[0], "pending effect execution frame");

const savedReference = (state: GameState, id: string) =>
  must(pendingFrame(state).savedReferences[id], `saved reference ${id}`);

const assertSavedKind = (state: GameState, id: string, kind: string): void => {
  assert.equal(savedReference(state, id).kind, kind);
};

const assertPauseDecision = (state: GameState): void => {
  assert.equal(
    must(state.pendingDecision, "pause decision").type,
    "selectTargets",
  );
};

const pauseKeeper = (saveResultAs = "pauseTarget"): SequenceSegment => ({
  connector: "then",
  saveResultAs,
  effect: {
    type: "selectTargets",
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "self",
      zone: "leaderArea",
      filter: { categories: ["leader"] },
      min: 1,
      max: 1,
      allowFewerIfUnavailable: false,
      visibility: "public",
    },
  },
});

const selectHandCards = (saveResultAs: string): SequenceSegment => ({
  connector: "always",
  saveResultAs,
  effect: {
    type: "selectCards",
    player: "self",
    zone: "hand",
    chooser: "self",
    visibility: "chooserOnly",
    min: 1,
    max: 1,
    saveAs: saveResultAs as SelectionId,
  },
});

const selectTrashCards = (saveResultAs: string): SequenceSegment => ({
  connector: "always",
  saveResultAs,
  effect: {
    type: "selectCards",
    player: "self",
    zone: "trash",
    chooser: "self",
    visibility: "bothPlayers",
    min: 1,
    max: 1,
    saveAs: saveResultAs as SelectionId,
  },
});

const selectOwnLeader = (saveResultAs: string): SequenceSegment => ({
  connector: "always",
  saveResultAs,
  effect: {
    type: "selectTargets",
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "self",
      zone: "leaderArea",
      filter: { categories: ["leader"] },
      min: 1,
      max: 1,
      allowFewerIfUnavailable: false,
      visibility: "public",
    },
  },
});

const selectOwnCostAreaDon = (
  saveResultAs: string,
  connector: SequenceSegment["connector"] = "always",
): SequenceSegment => ({
  connector,
  saveResultAs,
  effect: {
    type: "selectTargets",
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "self",
      zone: "costArea",
      filter: { categories: ["don"] },
      min: 1,
      max: 1,
      allowFewerIfUnavailable: false,
      visibility: "public",
    },
  },
});

const selectCharacters = (
  saveResultAs: string,
  options: {
    readonly connector?: SequenceSegment["connector"];
    readonly ownerConstraint?: Extract<
      Effect,
      { type: "selectTargets" }
    >["ownerConstraint"];
    readonly player?: "self" | "opponent" | "anyPlayer";
  } = {},
): SequenceSegment => ({
  connector: options.connector ?? "always",
  saveResultAs,
  effect: {
    type: "selectTargets",
    ...(options.ownerConstraint === undefined
      ? {}
      : { ownerConstraint: options.ownerConstraint }),
    request: {
      timing: "onResolution",
      chooser: "self",
      player: options.player ?? "self",
      zone: "characterArea",
      filter: { categories: ["character"] },
      min: 1,
      max: 1,
      allowFewerIfUnavailable: false,
      visibility: "public",
    },
  },
});

const selectAllCharacters = (saveResultAs: string): SequenceSegment => ({
  connector: "always",
  saveResultAs,
  effect: {
    type: "selectAllTargets",
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "self",
      zone: "characterArea",
      filter: { categories: ["character"] },
      visibility: "public",
    },
  },
});

const revealTop = (saveAs: string): SequenceSegment => ({
  connector: "always",
  saveResultAs: saveAs,
  effect: {
    type: "revealTop",
    player: "self",
    zone: "deck",
    count: 3,
    saveAs: saveAs as SelectionSetId,
    visibility: "bothPlayers",
  },
});

const selectFromSet = (
  set: string,
  saveAs: string,
  connector: SequenceSegment["connector"] = "then",
): SequenceSegment => ({
  connector,
  effect: {
    type: "selectFromSet",
    set: set as SelectionSetId,
    chooser: "self",
    min: 0,
    max: 1,
    saveAs: saveAs as SelectionId,
  },
});

const optionalPayCostThenPause = (): SequenceEffect => ({
  type: "sequence",
  effects: [
    {
      connector: "always",
      saveResultAs: "paidCost",
      effect: {
        type: "payCost",
        cost: { type: "restDon", count: 1, optional: true },
      },
    },
    { ...pauseKeeper(), connector: "always" },
  ],
});

const activateSequence = (state: GameState, effect: SequenceEffect) => {
  const { effectId, source } = setupSequence(state, effect);
  return applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    effectId,
  });
};

const startSequence = (
  state: GameState,
  effect: SequenceEffect,
): EngineResult => {
  const activated = activateSequence(state, effect);
  if (
    activated.errors !== undefined ||
    activated.state.pendingDecision !== undefined
  ) {
    return activated;
  }
  return processEffectRuntime(activated.state);
};

const respondWithCards = (
  state: GameState,
  cards: readonly CardRef[],
): EngineResult =>
  applyAction(state, {
    type: "respondToDecision",
    decisionId: must(state.pendingDecision, "pending decision").id,
    response: { type: "cards", cards: [...cards] },
  });

const respondWithFirstCard = (state: GameState): EngineResult => {
  const decision = must(
    state.pendingDecision,
    "pending selectCards decision",
  ) as SelectCardsDecision;
  assert.equal(decision.type, "selectCards");
  return respondWithCards(state, [
    must(decision.candidates[0], "card candidate").card,
  ]);
};

const respondWithFirstTarget = (state: GameState) => {
  const decision = must(
    state.pendingDecision,
    "pending selectTargets decision",
  ) as SelectTargetsDecision;
  assert.equal(decision.type, "selectTargets");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: [must(decision.candidates[0], "target candidate").card],
    },
  });
};

const payWithFirstActiveDon = (state: GameState): EngineResult => {
  const decision = must(state.pendingDecision, "pending payment decision");
  const player = must(state.players[decision.playerId], "decision player");
  const don = must(
    player.costArea.find((card) => card.state === "active"),
    "active DON",
  );
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [don.instanceId],
    },
  });
};

const declinePayment = (state: GameState): EngineResult => {
  const decision = must(state.pendingDecision, "pending payment decision");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "paymentDeclined" },
  });
};

const respondWithQuantity = (
  state: GameState,
  quantity: number,
): EngineResult => {
  const decision = must(state.pendingDecision, "pending quantity decision");
  assert.equal(decision.type, "chooseQuantity");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "chooseQuantity", quantity },
  });
};

const takeFixtureCard = (
  state: GameState,
  playerId: PlayerId,
  label: string,
): CardInstance => {
  const player = must(state.players[playerId], "player");
  const handCard = player.hand[0];
  if (handCard !== undefined) {
    player.hand = player.hand.slice(1).map((card, index) => ({
      ...card,
      zone: { zone: "hand", playerId, slot: "hand", index },
    }));
    return handCard;
  }
  const deckCard = must(player.deck[0], label);
  player.deck = player.deck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "deck", playerId, slot: "deck", index },
  }));
  return deckCard;
};

const addHandCardToTrash = (state: GameState): CardInstance => {
  const p1State = must(state.players[p1], "p1");
  const card = takeFixtureCard(state, p1, "trash source");
  const trashed: CardInstance = {
    ...card,
    zone: { zone: "trash", playerId: p1, slot: "trash", index: 0 },
  };
  p1State.trash = [trashed];
  return trashed;
};

const addCharacter = (state: GameState, playerId: PlayerId): CardInstance => {
  const player = must(state.players[playerId], "player");
  const card = takeFixtureCard(state, playerId, "character source");
  const character: CardInstance = {
    ...card,
    zone: {
      zone: "characterArea",
      playerId,
      slot: "character",
      index: player.characters.length,
    },
    state: "active",
    attachedDon: [],
    turnPlayed: state.turn.globalTurn,
  };
  player.characters = [...player.characters, character];
  state.cardManifest.cards[character.cardId] = resolvedCard({
    cardId: character.cardId,
    category: "character",
  });
  return character;
};

const registerLeader = (state: GameState, playerId: PlayerId) => {
  const leader = must(state.players[playerId], "player").leader;
  state.cardManifest.cards[leader.cardId] = resolvedCard({
    cardId: leader.cardId,
    category: "leader",
    power: 5000,
  });
};

const markHandCardsAsCharacters = (state: GameState, playerId: PlayerId) => {
  const player = must(state.players[playerId], "player");
  for (const card of player.hand) {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "character",
      cost: 1,
      power: 1000,
    });
  }
};

const appendCardPlayedFromTrashEvent = (
  state: GameState,
  card: CardInstance,
): void => {
  state.eventJournal.push({
    id: toEngineEventId(`event:${String(state.seq)}:1:cardPlayed`),
    seq: state.eventJournal.length + 1,
    type: "cardPlayed",
    payload: {
      playerId: card.zone.playerId,
      instanceId: card.instanceId,
      cardId: card.cardId,
      category: "character",
      sourceZone: "trash",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "card-played-reaction-test" },
    createdAtStateSeq: state.seq,
  });
};

const cardPlayedTriggerSequenceState = (): GameState => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const player = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "source"),
    zone: "characterArea",
  });
  const played = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(player.hand[1], "played"),
      cardId: "runtime-card-played-seed" as CardInstance["cardId"],
    },
    zone: "characterArea",
    index: 1,
  });
  const effectDefinitionId = "def-card-played-runtime-seed";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "card-played-runtime-seed-rules",
      sourceTextHash: "card-played-runtime-seed-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-card-played-runtime-seed"),
        category: "auto" as const,
        trigger: {
          type: "cardPlayed" as const,
          player: "self" as const,
          sourceZone: "trash" as const,
          filter: { categories: ["character" as const] },
        },
        sourcePresencePolicy: "mustRemainInSameZone" as const,
        effect: {
          type: "sequence" as const,
          effects: [{ ...pauseKeeper(), connector: "always" as const }],
        },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.cards[played.cardId] = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  registerLeader(state, p1);
  appendCardPlayedFromTrashEvent(state, played);
  return state;
};

test("runtime saved result harness opens an inspectable sequence frame", () => {
  const state = makeMainPhaseLegalActionState();
  moveDonToCostArea(state, p1);

  const activated = startSequence(state, {
    type: "sequence",
    effects: [selectOwnLeader("savedLeader"), pauseKeeper()],
  });
  assert.equal(activated.errors, undefined);

  const selected = respondWithFirstTarget(activated.state);
  assert.equal(selected.errors, undefined);
  assertSavedKind(selected.state, "savedLeader", "selectedTargets");
  assertPauseDecision(selected.state);
});

test("selectCards hand saves selectedCards in the runtime ledger", () => {
  const state = makeMainPhaseLegalActionState();
  const selection = "handSelection:saved-result-contract";
  const activated = startSequence(state, {
    type: "sequence",
    effects: [selectHandCards(selection), pauseKeeper()],
  });
  assert.equal(activated.errors, undefined);

  const selected = respondWithFirstCard(activated.state);
  assert.equal(selected.errors, undefined);
  assertSavedKind(selected.state, selection, "selectedCards");
  assertPauseDecision(selected.state);
});

test("selectCards trash saves selectedCards in the runtime ledger", () => {
  const state = makeMainPhaseLegalActionState();
  const selection = "trashSelection:saved-result-contract";
  addHandCardToTrash(state);
  const activated = startSequence(state, {
    type: "sequence",
    effects: [selectTrashCards(selection), pauseKeeper()],
  });
  assert.equal(activated.errors, undefined);

  const selected = respondWithFirstCard(activated.state);
  assert.equal(selected.errors, undefined);
  assertSavedKind(selected.state, selection, "selectedCards");
  assertPauseDecision(selected.state);
});

test("costArea DON selectTargets saves selectedTargets and attaches as selected DON", () => {
  const state = makeMainPhaseLegalActionState();
  moveDonToCostArea(state, p1);
  const beforeAttached = must(state.players[p1], "p1").leader.attachedDon
    .length;
  const activated = startSequence(state, {
    type: "sequence",
    effects: [
      selectOwnLeader("leaderTarget"),
      selectOwnCostAreaDon("donSelection", "then"),
      {
        connector: "then",
        effect: {
          type: "attachSelectedDon",
          selection: "donSelection" as SelectionId,
          target: {
            type: "savedFieldObject",
            binding: {
              family: "selectedTargets",
              saveResultAs: "leaderTarget",
            },
            zone: "leaderArea",
            player: "self",
            filter: { categories: ["leader"] },
            visibility: "publicOnly",
            onFailure: "failClosed",
          },
        },
      },
      pauseKeeper(),
    ],
  });
  assert.equal(activated.errors, undefined);

  const leaderSelected = respondWithFirstTarget(activated.state);
  assert.equal(leaderSelected.errors, undefined);
  const donSelected = respondWithFirstTarget(leaderSelected.state);
  assert.equal(donSelected.errors, undefined);
  assertSavedKind(donSelected.state, "donSelection", "selectedTargets");
  assert.equal(
    must(donSelected.state.players[p1], "p1").leader.attachedDon.length,
    beforeAttached + 1,
  );
  assertPauseDecision(donSelected.state);
});

test("selectFromSet saves selectedCards in the runtime ledger", () => {
  const state = makeMainPhaseLegalActionState();
  const activated = startSequence(state, {
    type: "sequence",
    effects: [
      revealTop("lookedSet"),
      selectFromSet("lookedSet", "setSelection"),
      pauseKeeper(),
    ],
  });
  assert.equal(activated.errors, undefined);

  const selected = respondWithFirstCard(activated.state);
  assert.equal(selected.errors, undefined);
  assertSavedKind(selected.state, "setSelection", "selectedCards");
  assertPauseDecision(selected.state);
});

test("revealTop saves selectedCards in the runtime ledger", () => {
  const state = makeMainPhaseLegalActionState();
  const activated = startSequence(state, {
    type: "sequence",
    effects: [revealTop("revealedSet"), pauseKeeper()],
  });
  assert.equal(activated.errors, undefined);

  assertSavedKind(activated.state, "revealedSet", "selectedCards");
  assertPauseDecision(activated.state);
});

test("selectTargets saves selectedTargets in the runtime ledger", () => {
  const { state } = queuedSequenceState(
    {
      type: "sequence",
      effects: [selectCharacters("targetSelection"), pauseKeeper()],
    },
    5,
  );
  addCharacter(state, p1);
  registerLeader(state, p1);
  const activated = processEffectRuntime(state);
  assert.equal(activated.errors, undefined);

  const selected = respondWithFirstTarget(activated.state);
  assert.equal(selected.errors, undefined);
  assertSavedKind(selected.state, "targetSelection", "selectedTargets");
  assertPauseDecision(selected.state);
});

test("selectAllTargets saves selectedTargets in the runtime ledger", () => {
  const { state } = queuedSequenceState(
    {
      type: "sequence",
      effects: [selectAllCharacters("allCharacters"), pauseKeeper()],
    },
    5,
  );
  addCharacter(state, p1);
  registerLeader(state, p1);
  const activated = processEffectRuntime(state);
  assert.equal(activated.errors, undefined);

  assertSavedKind(activated.state, "allCharacters", "selectedTargets");
  assertPauseDecision(activated.state);
});

test("forEachSavedTarget current item feeds savedFieldObject in the loop body", () => {
  const { state } = queuedSequenceState(
    {
      type: "sequence",
      effects: [
        selectAllCharacters("loopTargets"),
        {
          connector: "then",
          effect: {
            type: "forEachSavedTarget",
            selection: "loopTargets",
            saveCurrentAs: "currentLoopTarget",
            effect: {
              type: "rest",
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "forEachSavedTarget",
                  saveResultAs: "currentLoopTarget",
                },
                zone: "characterArea",
                player: "self",
                visibility: "publicOnly",
                onFailure: "failClosed",
              },
            },
          },
        },
      ],
    },
    5,
  );
  const source = must(state.effectQueue[0], "source queue entry").source;
  const sourceManifest = must(
    state.cardManifest.cards[source.cardId],
    "source manifest",
  );
  const character = addCharacter(state, p1);
  state.cardManifest.cards[source.cardId] = sourceManifest;
  registerLeader(state, p1);
  const activated = processEffectRuntime(state);
  assert.equal(activated.errors, undefined);

  assert.equal(
    must(activated.state.players[p1], "p1").characters.find(
      (candidate) => candidate.instanceId === character.instanceId,
    )?.state,
    "rested",
  );
});

test("ownerConstraint uses selectedCards owner", () => {
  const ownerSelection = "trashSelection:owner-source";
  const { state } = queuedSequenceState(
    {
      type: "sequence",
      effects: [
        selectTrashCards(ownerSelection),
        selectCharacters("ownerConstrainedTarget", {
          connector: "then",
          ownerConstraint: {
            type: "sameAsSavedReferenceOwner",
            selection: ownerSelection as SelectionId,
          },
          player: "anyPlayer",
        }),
      ],
    },
    5,
  );
  addHandCardToTrash(state);
  const p1Character = addCharacter(state, p1);
  const p2Character = addCharacter(state, p2);
  const activated = processEffectRuntime(state);
  assert.equal(activated.errors, undefined);

  const selectedOwner = respondWithFirstCard(activated.state);
  assert.equal(selectedOwner.errors, undefined);
  const targetDecision = must(
    selectedOwner.state.pendingDecision,
    "owner-constrained target decision",
  ) as SelectTargetsDecision;
  assert.equal(targetDecision.type, "selectTargets");
  assert.ok(
    targetDecision.candidates.some(
      (candidate) => candidate.card.instanceId === p1Character.instanceId,
    ),
  );
  assert.equal(
    targetDecision.candidates.some(
      (candidate) => candidate.card.instanceId === p2Character.instanceId,
    ),
    false,
  );
});

test("ownerConstraint uses selectedTargets owner", () => {
  const ownerSelection = "ownerTargetSource";
  const { state } = queuedSequenceState(
    {
      type: "sequence",
      effects: [
        selectCharacters(ownerSelection, { player: "opponent" }),
        selectCharacters("ownerTargetConstrainedTarget", {
          connector: "then",
          ownerConstraint: {
            type: "sameAsSavedReferenceOwner",
            selection: ownerSelection as SelectionId,
          },
          player: "anyPlayer",
        }),
      ],
    },
    5,
  );
  const p1Character = addCharacter(state, p1);
  const p2Character = addCharacter(state, p2);
  const activated = processEffectRuntime(state);
  assert.equal(activated.errors, undefined);

  const selectedOwner = respondWithFirstTarget(activated.state);
  assert.equal(selectedOwner.errors, undefined);
  const targetDecision = must(
    selectedOwner.state.pendingDecision,
    "owner-constrained target decision",
  ) as SelectTargetsDecision;
  assert.equal(targetDecision.type, "selectTargets");
  assert.ok(
    targetDecision.candidates.some(
      (candidate) => candidate.card.instanceId === p2Character.instanceId,
    ),
  );
  assert.equal(
    targetDecision.candidates.some(
      (candidate) => candidate.card.instanceId === p1Character.instanceId,
    ),
    false,
  );
});

test("accepted payCost saves paidCost in the runtime ledger", () => {
  const { state } = queuedSequenceState(optionalPayCostThenPause(), 5);
  const don = moveDonToCostArea(state, p1);
  registerLeader(state, p1);
  const activated = processEffectRuntime(state);
  assert.equal(activated.errors, undefined);

  const paid = payWithFirstActiveDon(activated.state);
  assert.equal(paid.errors, undefined);
  assert.deepEqual(savedReference(paid.state, "paidCost"), {
    kind: "paidCost",
    paidCost: true,
    selectedDonInstanceIds: [don.instanceId],
  });
  assertPauseDecision(paid.state);
});

test("declined optional payCost does not save paidCost in the runtime ledger", () => {
  const { state } = queuedSequenceState(optionalPayCostThenPause(), 5);
  moveDonToCostArea(state, p1);
  registerLeader(state, p1);
  const activated = processEffectRuntime(state);
  assert.equal(activated.errors, undefined);

  const declined = declinePayment(activated.state);
  assert.equal(declined.errors, undefined);
  assert.equal(
    pendingFrame(declined.state).savedReferences["paidCost"],
    undefined,
  );
  assertPauseDecision(declined.state);
});

test("draw saveResultAs saves producedObjects in the runtime ledger", () => {
  const state = makeMainPhaseLegalActionState();
  registerLeader(state, p1);
  const activated = startSequence(state, {
    type: "sequence",
    effects: [
      {
        id: "draw-produced-object",
        connector: "always",
        saveResultAs: "drawnObject",
        effect: { type: "draw", player: "self", count: 1 },
      },
      pauseKeeper(),
    ],
  });
  assert.equal(activated.errors, undefined);

  assertSavedKind(activated.state, "drawnObject", "producedObjects");
  assertPauseDecision(activated.state);
});

test("drawUpTo saveAs saves chosenNumber in the runtime ledger", () => {
  const drawUpToEffect = {
    type: "drawUpTo",
    player: "self",
    count: 2,
    saveAs: "chosenNumber:draw-up-to",
  } as Extract<Effect, { type: "drawUpTo" }> & { saveAs: SelectionId };
  const { state } = queuedSequenceState(
    {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: drawUpToEffect,
        },
        pauseKeeper(),
      ],
    },
    5,
  );
  registerLeader(state, p1);
  const activated = processEffectRuntime(state);
  assert.equal(activated.errors, undefined);

  const chose = respondWithQuantity(activated.state, 1);
  assert.equal(chose.errors, undefined);
  assert.deepEqual(savedReference(chose.state, "chosenNumber:draw-up-to"), {
    kind: "chosenNumber",
    value: 1,
  });
  assertPauseDecision(chose.state);
});

test("playSelected saveResultAs saves producedObjects in the runtime ledger", () => {
  const state = makeMainPhaseLegalActionState();
  registerLeader(state, p1);
  markHandCardsAsCharacters(state, p1);
  const handSelection = "handSelection:play-produced";
  const activated = startSequence(state, {
    type: "sequence",
    effects: [
      selectHandCards(handSelection),
      {
        connector: "then",
        saveResultAs: "playedObject",
        effect: {
          type: "playSelected",
          selection: handSelection as SelectionId,
          enterRested: true,
          ignoreCost: true,
        },
      },
      pauseKeeper(),
    ],
  });
  assert.equal(activated.errors, undefined);

  const selected = respondWithFirstCard(activated.state);
  assert.equal(selected.errors, undefined);
  assertSavedKind(selected.state, "playedObject", "producedObjects");
  assertPauseDecision(selected.state);
});

test("cardPlayed trigger context creates producedObjects seed in the runtime ledger", () => {
  const state = cardPlayedTriggerSequenceState();

  const queued = processEffectRuntime(state);
  assert.equal(queued.errors, undefined);
  assert.equal(queued.state.effectQueue.length, 1);
  const activated = processEffectRuntime(queued.state);
  assert.equal(activated.errors, undefined);
  assertSavedKind(activated.state, "trigger:cardPlayed", "producedObjects");
  assertPauseDecision(activated.state);
});

test("chooseNumber saves chosenNumber in the runtime ledger", () => {
  const { state } = queuedSequenceState(
    {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: {
            type: "chooseNumber",
            chooser: "self",
            purpose: "cost",
            min: 0,
            max: 5,
            saveAs: "chosenNumber:manual" as SelectionId,
          },
        },
        pauseKeeper(),
      ],
    },
    5,
  );
  registerLeader(state, p1);
  const activated = processEffectRuntime(state);
  assert.equal(activated.errors, undefined);

  const chose = respondWithQuantity(activated.state, 3);
  assert.equal(chose.errors, undefined);
  assert.deepEqual(savedReference(chose.state, "chosenNumber:manual"), {
    kind: "chosenNumber",
    value: 3,
  });
  assertPauseDecision(chose.state);
});

test.each([
  ["selectedTargets", "missingSelectedTargets"],
  ["producedObjects", "missingProducedObjects"],
  ["paidCost", "missingPaidCost"],
] as const)(
  "missing %s savedFieldObject binding fails before mutation",
  (family, saveResultAs) => {
    const { state } = queuedSequenceState(
      {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "rest",
              target: {
                type: "savedFieldObject",
                binding: { family, saveResultAs },
                zone: "characterArea",
                player: "self",
                visibility: "publicOnly",
                onFailure: "failClosed",
              },
            },
          },
        ],
      },
      5,
    );
    const character = addCharacter(state, p1);

    const result = processEffectRuntime(state);

    assert.notEqual(result.errors, undefined);
    assert.equal(
      must(result.state.players[p1], "p1").characters.find(
        (candidate) => candidate.instanceId === character.instanceId,
      )?.state,
      "active",
    );
  },
);
