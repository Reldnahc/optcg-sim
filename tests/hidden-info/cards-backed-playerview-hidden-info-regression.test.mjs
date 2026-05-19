import assert from "node:assert/strict";
import { test } from "vitest";

import { loadRepresentativeMatchCardManifestFixture } from "../../packages/cards/src/index.ts";
import {
  createInitialState,
  filterStateForPlayer,
} from "../../packages/engine-core/src/index.ts";
import { processEffectRuntime } from "../../packages/engine-core/src/effect-runtime.ts";

const p1 = "card-002f-p1";
const p2 = "card-002f-p2";
const leaderCardId = "OP01-060";
const templateCardId = "OP05-091";

const hiddenIds = {
  manifestCard: "CARD-002F-MANIFEST-ONLY",
  p2Hand: "CARD-002F-P2-HIDDEN-HAND",
  p2Life: "CARD-002F-P2-FACE-DOWN-LIFE",
  p2DeckTop: "CARD-002F-P2-DECK-TOP",
  p2DeckBottom: "CARD-002F-P2-DECK-BOTTOM",
  p2Trash: "CARD-002F-P2-PUBLIC-TRASH",
  p1Deck: "CARD-002F-P1-HIDDEN-DECK",
  privateEffectDefinition: "CARD-002F-PRIVATE-EFFECT-DEFINITION",
  privateEffectBlock: "CARD-002F-PRIVATE-EFFECT-BLOCK",
  privateQueueEntry: "CARD-002F-PRIVATE-QUEUE-ENTRY",
  privateCandidate: "CARD-002F-PRIVATE-DECISION-CANDIDATE",
};

const plainDataClone = (value) => JSON.parse(JSON.stringify(value));

const must = (value, label) => {
  assert.notEqual(value, undefined, `missing ${label}`);
  return value;
};

const cloneCardAs = (card, cardId) => ({
  ...plainDataClone(card),
  cardId,
  name: `${card.name} ${cardId}`,
  support: {
    ...card.support,
    cardId,
  },
});

const createManifestWithSentinelCards = async () => {
  const baseManifest = plainDataClone(
    await loadRepresentativeMatchCardManifestFixture(),
  );
  const templateCard = must(baseManifest.cards[templateCardId], templateCardId);

  for (const cardId of Object.values(hiddenIds).filter((id) =>
    id.startsWith("CARD-002F-"),
  )) {
    baseManifest.cards[cardId] = cloneCardAs(templateCard, cardId);
  }

  baseManifest.effectDefinitions = {
    [hiddenIds.privateEffectDefinition]: {
      id: hiddenIds.privateEffectDefinition,
      cardId: hiddenIds.privateCandidate,
      effects: [
        {
          id: hiddenIds.privateEffectBlock,
          trigger: { type: "main" },
          effect: { type: "custom", handler: "card-002f-private-handler" },
        },
      ],
      metadata: {
        effectDefinitionsVersion: "card-002f-private-version",
      },
    },
  };

  return baseManifest;
};

const createCardsBackedState = async () => {
  const cardManifest = await createManifestWithSentinelCards();
  const state = createInitialState({
    matchId: "card-002f-cards-backed-playerview-hidden-info",
    playerOrder: [p1, p2],
    firstPlayerId: p1,
    leaderCardIds: {
      [p1]: leaderCardId,
      [p2]: leaderCardId,
    },
    leaderLifeCounts: {
      [p1]: 1,
      [p2]: 1,
    },
    deckCardIds: {
      [p1]: [
        templateCardId,
        templateCardId,
        templateCardId,
        templateCardId,
        templateCardId,
        templateCardId,
        hiddenIds.p1Deck,
      ],
      [p2]: [
        hiddenIds.p2Hand,
        hiddenIds.p2Hand,
        hiddenIds.p2Hand,
        hiddenIds.p2Hand,
        hiddenIds.p2Hand,
        hiddenIds.p2Life,
        hiddenIds.p2DeckTop,
        hiddenIds.p2DeckBottom,
        hiddenIds.p2Trash,
      ],
    },
    donDeckCardIds: {
      [p1]: [],
      [p2]: [],
    },
    cardManifest,
    rngSeed: "card-002f-hidden-info",
    shuffleDecks: false,
  });

  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  const hiddenOpponentHandCard = must(p2State.hand[0], "p2 hidden hand");

  state.effectQueue = [
    {
      id: hiddenIds.privateQueueEntry,
      state: "pending",
      timingWindowId: "CARD-002F-PRIVATE-TIMING-WINDOW",
      generation: 1,
      controllerId: p1,
      source: {
        instanceId: hiddenOpponentHandCard.instanceId,
        cardId: hiddenOpponentHandCard.cardId,
        playerId: p2,
        zone: hiddenOpponentHandCard.zone,
      },
      sourceSnapshot: {
        instanceId: hiddenOpponentHandCard.instanceId,
        cardId: hiddenOpponentHandCard.cardId,
        ownerId: p2,
        controllerId: p2,
        zone: hiddenOpponentHandCard.zone,
        category: "character",
        colors: ["black"],
        keywords: [],
      },
      effectBlockId: hiddenIds.privateEffectBlock,
      orderingGroup: "turnPlayer",
      createdAtEventSeq: 1,
      queuedAtStateSeq: state.seq,
      sourcePresencePolicy: "resolveFromLastKnownInformation",
      causedBy: { type: "ruleProcess", name: "card-002f-private-effect" },
    },
  ];
  state.pendingDecision = {
    id: "CARD-002F-PRIVATE-DECISION",
    type: "selectTargets",
    playerId: p1,
    prompt: "Select a target.",
    causedBy: {
      type: "effect",
      queueEntryId: hiddenIds.privateQueueEntry,
      effectId: hiddenIds.privateEffectBlock,
    },
    visibility: { type: "private", playerId: p1 },
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "opponent",
      zone: "hand",
      min: 1,
      max: 1,
      allowFewerIfUnavailable: false,
      visibility: "privateToChooser",
    },
    candidates: [
      {
        card: {
          instanceId: hiddenOpponentHandCard.instanceId,
          cardId: hiddenIds.privateCandidate,
          playerId: p2,
          zone: hiddenOpponentHandCard.zone,
        },
        visibility: { type: "private", playerId: p1 },
      },
    ],
  };

  return { state, p1State, p2State };
};

const assertSerializedViewExcludes = (view, forbiddenValues) => {
  const serialized = JSON.stringify(view);
  for (const forbidden of forbiddenValues) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      `PlayerView leaked ${forbidden}`,
    );
  }
};

test("cards-backed PlayerView excludes manifest internals and hidden opponent state", async () => {
  const { state, p1State, p2State } = await createCardsBackedState();

  const view = filterStateForPlayer(state, p1);
  const rawView = view;

  assert.equal(rawView.cardManifest, undefined);
  assert.equal(rawView.effectQueue, undefined);
  assert.equal(rawView.pendingDecision?.type, "selectTargets");
  assert.deepEqual(view.pendingDecision, {
    id: "CARD-002F-PRIVATE-DECISION",
    type: "selectTargets",
    playerId: p1,
    prompt: "Select a target.",
    causedBy: { type: "ruleProcess", name: "privateCausality" },
  });
  assert.equal(view.legalActions.length, 0);

  assert.equal(view.opponent.handCount, p2State.hand.length);
  assert.equal(view.opponent.hand, undefined);
  assert.equal(view.opponent.deckCount, p2State.deck.length);
  assert.equal(view.opponent.deck, undefined);
  assert.equal(view.opponent.life.count, p2State.life.length);
  assert.deepEqual(view.opponent.life.faceUpCards, []);

  assertSerializedViewExcludes(view, [
    hiddenIds.manifestCard,
    hiddenIds.p2Hand,
    hiddenIds.p2Life,
    hiddenIds.p2DeckTop,
    hiddenIds.p2DeckBottom,
    hiddenIds.p1Deck,
    hiddenIds.privateEffectDefinition,
    hiddenIds.privateEffectBlock,
    hiddenIds.privateQueueEntry,
    hiddenIds.privateCandidate,
    "card-002f-private-handler",
    "card-002f-private-version",
    "effectDefinitions",
    "sourceSnapshot",
    "queueEntryId",
    "candidates",
    "request",
  ]);

  assert.equal(p1State.deck[0]?.cardId, hiddenIds.p1Deck);
  assert.deepEqual(
    p2State.deck.map((card) => card.cardId),
    [hiddenIds.p2DeckTop, hiddenIds.p2DeckBottom, hiddenIds.p2Trash],
  );
  assert.equal(p2State.life[0]?.faceUp, false);
  assert.equal(p2State.life[0]?.card.cardId, hiddenIds.p2Life);
});

test("hand/life count conditions do not leak hidden opponent card identities", async () => {
  const { state, p2State } = await createCardsBackedState();
  const p1State = must(state.players[p1], "p1 state");
  const source = p1State.leader;
  const effectDefinitionId = "CARD-002F-HAND-LIFE-CONDITION-DEF";
  const effectBlockId = "CARD-002F-HAND-LIFE-CONDITION-BLOCK";
  const rulesVersion = "card-002f-condition-rules";
  const sourceTextHash = "card-002f-condition-source";
  const cardDataVersion = state.cardManifest.cardDataVersion;
  const effectDefinitionsVersion = state.cardManifest.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: {
      cardId: source.cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: effectBlockId,
          category: "auto",
          trigger: { type: "onPlay" },
          optional: false,
          oncePerTurn: false,
          sourcePresencePolicy: "mustRemainInSameZone",
          condition: {
            type: "and",
            conditions: [
              { type: "handCount", player: "opponent", op: "gte", value: 1 },
              { type: "lifeCount", player: "opponent", op: "gte", value: 1 },
            ],
          },
          effect: { type: "draw", count: 1, player: "self" },
        },
      ],
      metadata: {
        sourceTextHash,
        rulesVersion,
        effectDefinitionsVersion,
        tested: true,
        reviewer: "hidden-info",
      },
    },
  };
  const sourceManifest = must(
    state.cardManifest.cards[source.cardId],
    "source manifest",
  );
  state.cardManifest.cards[source.cardId] = {
    ...sourceManifest,
    category: "leader",
    support: {
      cardId: source.cardId,
      status: "implemented-dsl",
      tested: true,
      rulesVersion,
      cardDataVersion,
      sourceTextHash,
      behaviorHash: "card-002f-condition-behavior",
      effectDefinitionId,
    },
  };
  delete state.pendingDecision;
  state.effectQueue = [
    {
      id: "CARD-002F-HAND-LIFE-QUEUE-ENTRY",
      state: "pending",
      timingWindowId: "CARD-002F-HAND-LIFE-WINDOW",
      generation: 1,
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        ownerId: p1,
        controllerId: p1,
        zone: source.zone,
        category: "leader",
        colors: ["red"],
        keywords: [],
      },
      effectBlockId,
      orderingGroup: "turnPlayer",
      createdAtEventSeq: 1,
      queuedAtStateSeq: state.seq,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "card-002f-hand-life-condition" },
    },
  ];

  const result = processEffectRuntime(state);
  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(
    result.events.some((event) => event.type === "effectResolved"),
    true,
  );

  const playerView = filterStateForPlayer(result.state, p1);
  const serializedPublicEvents = JSON.stringify(result.events);
  const serializedPlayerView = JSON.stringify(playerView);
  const forbidden = [
    hiddenIds.p2Hand,
    hiddenIds.p2Life,
    must(p2State.hand[0], "hidden p2 hand").instanceId,
    must(p2State.life[0], "hidden p2 life").card.instanceId,
  ];
  for (const secret of forbidden) {
    assert.equal(serializedPublicEvents.includes(secret), false);
    assert.equal(serializedPlayerView.includes(secret), false);
  }
  assert.equal(playerView.opponent.handCount, p2State.hand.length);
  assert.equal(playerView.opponent.life.count, p2State.life.length);
});

test("trash count conditions read public trash count without leaking private zones", async () => {
  const { state, p2State } = await createCardsBackedState();
  const p1State = must(state.players[p1], "p1 state");
  const source = p1State.leader;
  const publicTrashCard = must(
    p2State.deck.find((card) => card.cardId === hiddenIds.p2Trash),
    "p2 public trash card",
  );
  p2State.deck = p2State.deck.filter(
    (card) => card.instanceId !== publicTrashCard.instanceId,
  );
  p2State.trash.push({
    ...publicTrashCard,
    zone: { zone: "trash", playerId: p2, slot: "trash", index: 0 },
  });
  const effectDefinitionId = "CARD-002F-TRASH-CONDITION-DEF";
  const effectBlockId = "CARD-002F-TRASH-CONDITION-BLOCK";
  const rulesVersion = "card-002f-trash-condition-rules";
  const sourceTextHash = "card-002f-trash-condition-source";
  const cardDataVersion = state.cardManifest.cardDataVersion;
  const effectDefinitionsVersion = state.cardManifest.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: {
      cardId: source.cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: effectBlockId,
          category: "auto",
          trigger: { type: "onPlay" },
          optional: false,
          oncePerTurn: false,
          sourcePresencePolicy: "mustRemainInSameZone",
          condition: {
            type: "trashCount",
            player: "opponent",
            op: "gte",
            value: 1,
          },
          effect: { type: "draw", count: 1, player: "self" },
        },
      ],
      metadata: {
        sourceTextHash,
        rulesVersion,
        effectDefinitionsVersion,
        tested: true,
        reviewer: "hidden-info",
      },
    },
  };
  const sourceManifest = must(
    state.cardManifest.cards[source.cardId],
    "source manifest",
  );
  state.cardManifest.cards[source.cardId] = {
    ...sourceManifest,
    category: "leader",
    support: {
      cardId: source.cardId,
      status: "implemented-dsl",
      tested: true,
      rulesVersion,
      cardDataVersion,
      sourceTextHash,
      behaviorHash: "card-002f-trash-condition-behavior",
      effectDefinitionId,
    },
  };
  delete state.pendingDecision;
  state.effectQueue = [
    {
      id: "CARD-002F-TRASH-QUEUE-ENTRY",
      state: "pending",
      timingWindowId: "CARD-002F-TRASH-WINDOW",
      generation: 1,
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        ownerId: p1,
        controllerId: p1,
        zone: source.zone,
        category: "leader",
        colors: ["red"],
        keywords: [],
      },
      effectBlockId,
      orderingGroup: "turnPlayer",
      createdAtEventSeq: 1,
      queuedAtStateSeq: state.seq,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "card-002f-trash-condition" },
    },
  ];

  const result = processEffectRuntime(state);
  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(
    result.events.some((event) => event.type === "effectResolved"),
    true,
  );

  const playerView = filterStateForPlayer(result.state, p1);
  const serializedPublicEvents = JSON.stringify(result.events);
  const serializedPlayerView = JSON.stringify(playerView);
  const forbidden = [
    hiddenIds.p2Hand,
    hiddenIds.p2Life,
    hiddenIds.p2DeckTop,
    hiddenIds.p2DeckBottom,
    must(p2State.hand[0], "hidden p2 hand").instanceId,
    must(p2State.life[0], "hidden p2 life").card.instanceId,
  ];
  for (const secret of forbidden) {
    assert.equal(serializedPublicEvents.includes(secret), false);
    assert.equal(serializedPlayerView.includes(secret), false);
  }
  assert.equal(playerView.opponent.trash.length, p2State.trash.length);
  assert.equal(playerView.opponent.trash[0]?.cardId, hiddenIds.p2Trash);
});
