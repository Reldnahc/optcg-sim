import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  CardRef,
  Effect,
  EffectDefinition,
  EffectTextSpanId,
  EngineResult,
  GameState,
  HandSelectionId,
} from "@optcg/types";

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

type EffectResolvedPresentation = {
  readonly targetLinks?: readonly {
    readonly cards: readonly CardRef[];
    readonly relation: "candidateTarget" | "selectedTarget" | "affectedCard";
    readonly spanId: EffectTextSpanId;
  }[];
};

const reindexHand = (cards: readonly CardInstance[]): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));

const playSelectedSequence = (): Extract<Effect, { type: "sequence" }> => ({
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
        zone: "hand",
        player: "self",
        chooser: "self",
        min: 0,
        max: 1,
        filter: { categories: ["character"] },
        saveAs: "handSelection:play" as HandSelectionId,
        visibility: "chooserOnly",
      },
    },
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
  ],
});

const nestedPlaySelectedSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "wrapped-play-selected-body",
      connector: "always",
      effect: {
        type: "sequence",
        effects: [
          {
            id: "select-character-from-hand",
            connector: "always",
            effect: {
              type: "selectCards",
              zone: "hand",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              filter: { categories: ["character"] },
              saveAs: "handSelection:play" as HandSelectionId,
              visibility: "chooserOnly",
            },
          },
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
        ],
      },
    },
  ],
});

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-play-selected-presentation";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "play-selected-presentation-rules",
      sourceTextHash: "play-selected-presentation-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-play-selected-presentation"),
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
      id: toQueueEntryId("queue-entry-play-selected-presentation"),
      timingWindowId: toTimingWindowId("window-play-selected-presentation"),
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
      causedBy: { type: "ruleProcess", name: "play-selected-presentation" },
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

const resolvedPresentation = (
  result: EngineResult,
): EffectResolvedPresentation | undefined => {
  const effectResolved = must(
    result.events.find((event) => event.type === "effectResolved"),
    "effectResolved event",
  );
  return (
    effectResolved.payload as {
      readonly presentation?: EffectResolvedPresentation;
    }
  ).presentation;
};

const resolveSelectedCard = (state: GameState): EngineResult => {
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "selection");
  assert.equal(decision.type, "selectCards");
  const selected = must(decision.candidates[0], "candidate").card;
  return applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [selected] },
  });
};

const playedCharacter = (
  result: EngineResult,
): Pick<CardRef, "cardId" | "instanceId" | "playerId" | "zone"> => {
  const cardPlayed = must(
    result.events.find((event) => event.type === "cardPlayed"),
    "cardPlayed event",
  );
  const payload = cardPlayed.payload as {
    readonly cardId: CardRef["cardId"];
    readonly instanceId: CardRef["instanceId"];
    readonly playerId: CardRef["playerId"];
  };
  const character = must(
    must(result.state.players[p1], "p1").characters.find(
      (card) => card.instanceId === payload.instanceId,
    ),
    "played character",
  );
  return {
    instanceId: character.instanceId,
    cardId: character.cardId,
    playerId: p1,
    zone: character.zone,
  };
};

test("playSelected resolved presentation links the played field object", () => {
  const state = sequenceQueueState(playSelectedSequence());
  markHandCharactersSupported(state, 10);
  const queuedEntry = must(state.effectQueue[0], "queued entry");
  state.effectQueue = [
    {
      ...queuedEntry,
      presentation: {
        source: queuedEntry.source,
        textKind: "effect",
        activeSpanIds: [
          "span:sequence:0:body",
          "span:sequence:1:body",
          "span:sequence:2:body",
        ] as EffectTextSpanId[],
      },
    },
  ];

  const resolved = resolveSelectedCard(state);

  assert.equal(resolved.errors, undefined);
  assert.deepEqual(resolvedPresentation(resolved)?.targetLinks, [
    {
      spanId: "span:sequence:1:body",
      relation: "affectedCard",
      cards: [playedCharacter(resolved)],
    },
  ]);
});

test("nested playSelected resolved presentation links the played field object to the wrapper body", () => {
  const state = sequenceQueueState(nestedPlaySelectedSequence());
  markHandCharactersSupported(state, 10);
  const queuedEntry = must(state.effectQueue[0], "queued entry");
  state.effectQueue = [
    {
      ...queuedEntry,
      presentation: {
        source: queuedEntry.source,
        textKind: "effect",
        activeSpanIds: ["span:body"] as EffectTextSpanId[],
      },
    },
  ];

  const resolved = resolveSelectedCard(state);

  assert.equal(resolved.errors, undefined);
  assert.deepEqual(resolvedPresentation(resolved)?.targetLinks, [
    {
      spanId: "span:body",
      relation: "affectedCard",
      cards: [playedCharacter(resolved)],
    },
  ]);
});
