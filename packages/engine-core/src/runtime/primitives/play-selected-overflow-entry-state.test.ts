import assert from "node:assert/strict";

import type {
  CardId,
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
  HandSelectionId,
} from "@optcg/types";
import { test } from "vitest";

import {
  applyAction,
  createActiveState,
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
} from "../../effect-runtime-queue/test-support.js";

const reindexHand = (cards: readonly CardInstance[]): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));

const playSelectedSequence = (params: {
  enterRested?: boolean;
  sourceZone?: "hand" | "trash";
}): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: `select-character-from-${params.sourceZone ?? "trash"}`,
      connector: "always",
      saveResultAs:
        params.sourceZone === "hand"
          ? "handSelection:play"
          : "trashSelection:play",
      effect: {
        type: "selectCards",
        zone: params.sourceZone ?? "trash",
        player: "self",
        chooser: "self",
        min: 1,
        max: 1,
        filter: { categories: ["character"] },
        saveAs:
          params.sourceZone === "hand"
            ? ("handSelection:play" as HandSelectionId)
            : ("trashSelection:play" as HandSelectionId),
        visibility:
          params.sourceZone === "hand" ? "chooserOnly" : "bothPlayers",
      },
    },
    {
      id: `play-character-from-${params.sourceZone ?? "trash"}`,
      connector: "ifPossible",
      effect: {
        type: "playSelected",
        selection:
          params.sourceZone === "hand"
            ? ("handSelection:play" as HandSelectionId)
            : ("trashSelection:play" as HandSelectionId),
        ignoreCost: true,
        ...(params.enterRested === undefined
          ? {}
          : { enterRested: params.enterRested }),
      },
    },
  ],
});

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-play-selected-overflow-entry-state";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "play-selected-overflow-entry-state-rules",
      sourceTextHash: "play-selected-overflow-entry-state-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-play-selected-overflow-entry-state"),
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
  p1State.hand = reindexHand(p1State.hand.slice(1));
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-play-selected-overflow-entry-state"),
      timingWindowId: toTimingWindowId(
        "window-play-selected-overflow-entry-state",
      ),
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

const moveSupportedCharacterToTrash = (state: GameState): CardInstance => {
  const player = must(state.players[p1], "p1");
  const card = must(player.hand[0], "character source");
  const trashCharacter: CardInstance = {
    ...card,
    cardId: "trash-character-overflow-entry-state" as CardId,
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

const makeSupportedHandCharacterCandidate = (
  state: GameState,
): CardInstance => {
  const player = must(state.players[p1], "p1");
  const handCharacter: CardInstance = {
    ...must(player.hand[0], "hand character"),
    cardId: "hand-character-overflow-entry-state" as CardId,
    state: "active",
    attachedDon: [],
  };
  player.hand = reindexHand([handCharacter, ...player.hand.slice(1)]);
  state.cardManifest.cards[handCharacter.cardId] = resolvedCard({
    cardId: handCharacter.cardId,
    category: "character",
    cost: 1,
    power: 1000,
  });
  return player.hand[0] ?? handCharacter;
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
        `${String(source.instanceId)}:overflow-entry-state:${String(index)}` as CardInstance["instanceId"],
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

const resolveOverflowingPlaySelected = (params: {
  enterRested?: boolean;
  mutateOverflowState?: (state: GameState) => void;
  sourceZone?: "hand" | "trash";
}): {
  played: CardInstance | undefined;
  result: ReturnType<typeof applyAction>;
} => {
  const state = sequenceQueueState(playSelectedSequence(params));
  const selectedCharacter =
    params.sourceZone === "hand"
      ? makeSupportedHandCharacterCandidate(state)
      : moveSupportedCharacterToTrash(state);
  fillCharacterAreaToFive(state);
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
  params.mutateOverflowState?.(opened.state);
  const overflowTarget = must(overflow.candidates[0], "overflow target").card;
  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: overflow.id,
    response: { type: "cards", cards: [overflowTarget] },
  });
  const played = must(result.state.players[p1], "p1").characters.find(
    (card) => card.instanceId === selectedCharacter.instanceId,
  );
  return { played, result };
};

test("playSelected without enterRested stays active after overflow", () => {
  const { played, result } = resolveOverflowingPlaySelected({});

  assert.equal(result.errors, undefined);
  assert.equal(played?.state, "active");
});

test("hand-origin playSelected without enterRested stays active after overflow", () => {
  const { played, result } = resolveOverflowingPlaySelected({
    sourceZone: "hand",
  });

  assert.equal(result.errors, undefined);
  assert.equal(played?.state, "active");
});

test("playSelected overflow without decision entry-state metadata stays active", () => {
  const { played, result } = resolveOverflowingPlaySelected({
    mutateOverflowState: (state) => {
      const pendingDecision = must(state.pendingDecision, "overflow decision");
      assert.equal(pendingDecision.type, "selectCards");
      const decisionWithoutRuntime = { ...pendingDecision };
      delete decisionWithoutRuntime.runtime;
      state.pendingDecision = decisionWithoutRuntime;
    },
  });

  assert.equal(result.errors, undefined);
  assert.equal(played?.state, "active");
});

test("playSelected with enterRested stays rested after overflow", () => {
  const { played, result } = resolveOverflowingPlaySelected({
    enterRested: true,
  });

  assert.equal(result.errors, undefined);
  assert.equal(played?.state, "rested");
});
