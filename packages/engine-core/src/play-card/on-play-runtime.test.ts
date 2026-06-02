import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Action,
  CardInstance,
  EffectDefinition,
  EngineResult,
  GameState,
} from "@optcg/types";

import { hashCanonicalStateValue } from "../canonical-state.js";
import {
  applyPlayCard,
  applyPlayCardDecisionResponse,
  getPlayCardLegalActions,
} from "./core.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "../action-test-fixtures.js";
import { filterStateForPlayer } from "../filter-state-for-player.js";
import {
  hasPlayCardAction,
  setupMainPlayState,
  toTestCardRef,
} from "./test-fixtures.js";

const applyPlayCardTestAction = (
  state: GameState,
  action:
    | Extract<Action, { type: "playCard" }>
    | Extract<Action, { type: "respondToDecision" }>,
): EngineResult => {
  if (action.type === "playCard") {
    return applyPlayCard(state, action);
  }
  const result = applyPlayCardDecisionResponse(state, action);
  assert.ok(result !== null, "expected play-card decision response");
  return result;
};

const setupImplementedDslOnPlayDraw = (
  state: GameState,
  card: CardInstance,
  effectDefinitionId = "def-play-card-on-play-draw",
  cost = 0,
) => {
  const resolved = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost,
    power: 2000,
    effectText: "[On Play] Draw 1 card.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "r1",
      sourceTextHash: "source-hash",
    },
  });
  const definition = reviewedOnPlayDrawDefinition(
    card.cardId,
    resolved.support,
  );
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[card.cardId] = resolved;
  return definition;
};

const setupImplementedDslOnPlayDrawUpTo = (
  state: GameState,
  card: CardInstance,
  effectDefinitionId = "def-play-card-on-play-draw-upto",
  count = 2,
) => {
  const resolved = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 0,
    power: 2000,
    effectText: "[On Play] Draw up to 2 cards.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "r1",
      sourceTextHash: "source-hash",
    },
  });
  const base = reviewedOnPlayDrawDefinition(card.cardId, resolved.support);
  state.cardManifest.effectDefinitionsVersion =
    base.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: {
      ...base,
      effects: [
        {
          ...must(base.effects[0], "draw effect"),
          effect: { type: "drawUpTo", count, player: "self" },
        },
      ],
    },
  };
  state.cardManifest.cards[card.cardId] = resolved;
};

const addExtraDeckCard = (state: GameState): void => {
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[1], "extra deck source");
  p1State.deck = [
    ...p1State.deck,
    {
      ...source,
      instanceId:
        `${String(source.instanceId)}:extra-deck` as CardInstance["instanceId"],
      zone: {
        zone: "deck",
        playerId: p1,
        slot: "deck",
        index: p1State.deck.length,
      },
    },
  ];
};

const payFirstTwoDon = (state: GameState): EngineResult => {
  const player = must(state.players[p1], "p1");
  return applyPlayCardTestAction(state, {
    type: "respondToDecision",
    decisionId: must(state.pendingDecision, "pay decision").id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [
        must(player.costArea[0], "don0").instanceId,
        must(player.costArea[1], "don1").instanceId,
      ],
    },
  });
};

test("implemented-dsl payCost playCard continuation rejects pending runtime work without mutation", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  setupImplementedDslOnPlayDraw(state, card, "def-paycost-runtime-work", 2);
  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  const openedP1 = must(opened.state.players[p1], "opened p1");
  const don0 = must(openedP1.costArea[0], "don0");
  const don1 = must(openedP1.costArea[1], "don1");
  const withRuntimeWork: GameState = {
    ...opened.state,
    deferredTriggers: [
      {
        timingWindowId:
          "timing-window:unrelated-runtime-work" as GameState["deferredTriggers"][number]["timingWindowId"],
        generation: 0,
        triggerIds: ["unrelated-trigger"],
        releasePolicy: "afterCurrentProcess",
      },
    ],
  };
  const before = JSON.stringify(withRuntimeWork);

  const result = applyPlayCardTestAction(withRuntimeWork, {
    type: "respondToDecision",
    decisionId: must(withRuntimeWork.pendingDecision, "decision").id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [don0.instanceId, don1.instanceId],
    },
  });

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "playCard requires no pending runtime work.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(withRuntimeWork), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("getLegalActions exposes supported implemented-dsl Character On Play draw and rejects unsupported definitions", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const supported = must(p1State.hand[0], "supported on-play character");
  const unsupported = must(p1State.hand[1], "unsupported on-play character");
  setupImplementedDslOnPlayDraw(state, supported);
  state.cardManifest.cards[unsupported.cardId] = resolvedCard({
    cardId: unsupported.cardId,
    category: "character",
    cost: 0,
    power: 2000,
    effectText: "[On Play] Draw 1 card.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "missing-definition",
      rulesVersion: "r1",
      sourceTextHash: "source-hash",
    },
  });

  const legal = getPlayCardLegalActions(state, p1);

  assert.equal(hasPlayCardAction(legal, supported), true);
  assert.equal(hasPlayCardAction(legal, unsupported), false);
  const before = JSON.stringify(state);
  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: unsupported.instanceId,
  });
  assert.deepEqual(result.errors, [
    { type: "illegalAction", reason: "playCard card is unsupported." },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("zero-cost Character On Play draw resolves through playCard and mutates hand deck and field", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.hand[0], "on-play character");
  const topDeck = must(p1State.deck[0], "top deck");
  setupImplementedDslOnPlayDraw(state, character);
  addExtraDeckCard(state);
  const beforeDeckLength = p1State.deck.length;
  const beforeHandLength = p1State.hand.length;

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: character.instanceId,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  const resultP1 = must(result.state.players[p1], "result p1");
  assert.equal(resultP1.deck.length, beforeDeckLength - 1);
  assert.equal(resultP1.hand.length, beforeHandLength);
  assert.equal(
    resultP1.hand.some((card) => card.instanceId === character.instanceId),
    false,
  );
  assert.equal(
    must(resultP1.characters[0], "played").instanceId,
    character.instanceId,
  );
  assert.equal(
    must(resultP1.hand[resultP1.hand.length - 1], "drawn card").instanceId,
    topDeck.instanceId,
  );
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
});

test("Character On Play draw events are deterministic after card play events", () => {
  const run = () => {
    const state = setupMainPlayState();
    const p1State = must(state.players[p1], "p1");
    const character = must(p1State.hand[0], "on-play character");
    setupImplementedDslOnPlayDraw(state, character);
    addExtraDeckCard(state);
    return applyPlayCardTestAction(state, {
      type: "playCard",
      cardInstanceId: character.instanceId,
    });
  };

  const first = run();
  const second = run();

  assert.deepEqual(
    first.events.map((event) => event.type),
    [
      "cardRevealed",
      "cardMoved",
      "cardPlayed",
      "ruleProcessingChecked",
      "effectQueued",
      "cardDrawn",
      "cardMoved",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
    ],
  );
  assert.deepEqual(first.events, second.events);
  assert.equal(first.stateHash, second.stateHash);
  assert.equal(first.stateHash, hashCanonicalStateValue(first.state));
  assert.equal(second.stateHash, hashCanonicalStateValue(second.state));
  assert.equal(first.state.pendingDecision, undefined);
  assert.equal(second.state.pendingDecision, undefined);
  assert.equal(
    first.events.some((event) => event.type === "decisionCreated"),
    false,
  );
  assert.equal(
    first.events.every(
      (event, index, events) =>
        index === 0 || event.seq > must(events[index - 1], "previous").seq,
    ),
    true,
  );
});

test("supported implemented-dsl Character On Play drawUpTo playCard reachability creates chooseQuantity with hidden-info-safe legal actions", () => {
  const state = setupMainPlayState();
  addExtraDeckCard(state);
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.hand[0], "on-play character");
  setupImplementedDslOnPlayDrawUpTo(
    state,
    character,
    "def-on-play-draw-upto",
    2,
  );

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: character.instanceId,
  });

  assert.equal(result.errors, undefined);
  const decision = must(result.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "chooseQuantity");
  assert.equal(decision.playerId, p1);
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "cardRevealed",
      "cardMoved",
      "cardPlayed",
      "ruleProcessingChecked",
      "effectQueued",
      "decisionCreated",
    ],
  );
  assert.equal(
    result.events.every(
      (event, index, events) =>
        index === 0 || event.seq > must(events[index - 1], "prev").seq,
    ),
    true,
  );
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
  const ownerView = filterStateForPlayer(result.state, p1);
  const opponentView = filterStateForPlayer(result.state, p2);
  assert.equal(ownerView.pendingDecision?.type, "chooseQuantity");
  assert.equal(opponentView.pendingDecision, undefined);
  assert.equal(
    opponentView.legalActions.some((action) => action.type === "playCard"),
    false,
  );
});

test("false On Play life condition silently drains queued deck-to-life effect after playCard", () => {
  const state = setupMainPlayState();
  addExtraDeckCard(state);
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.hand[0], "conditional on-play character");
  const extraLife = must(p1State.deck[0], "extra life");
  p1State.deck = p1State.deck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "deck", playerId: p1, slot: "deck", index },
  }));
  p1State.life = [
    ...p1State.life,
    {
      card: {
        ...extraLife,
        zone: {
          zone: "life",
          playerId: p1,
          slot: "life",
          index: p1State.life.length,
        },
      },
      faceUp: false,
    },
  ];
  const beforeDeck = p1State.deck.map((card) => card.instanceId);
  const beforeLife = p1State.life.map((life) => life.card.instanceId);
  const resolved = resolvedCard({
    cardId: character.cardId,
    category: "character",
    cost: 0,
    power: 2000,
    effectText:
      "[On Play] If you have 2 or less Life cards, add up to 1 card from the top of your deck to the top of your Life cards.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-on-play-false-life-deck-to-life",
      rulesVersion: "r1",
      sourceTextHash: "source-hash",
    },
  });
  const base = reviewedOnPlayDrawDefinition(character.cardId, resolved.support);
  state.cardManifest.effectDefinitionsVersion =
    base.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-on-play-false-life-deck-to-life": {
      ...base,
      effects: [
        {
          ...must(base.effects[0], "base effect"),
          id: "on-play-false-life-deck-to-life" as EffectDefinition["effects"][number]["id"],
          condition: {
            type: "lifeCount",
            player: "self",
            op: "lte",
            value: 2,
          },
          effect: {
            type: "moveCards",
            count: 1,
            min: 0,
            from: { player: "self", zone: "deck", position: "top" },
            to: { player: "self", zone: "life", position: "top" },
            order: "original",
          },
        },
      ],
    },
  };
  state.cardManifest.cards[character.cardId] = resolved;

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: character.instanceId,
  });
  const resultP1 = must(result.state.players[p1], "result p1");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(result.state.status.type, "active");
  assert.deepEqual(
    resultP1.deck.map((card) => card.instanceId),
    beforeDeck,
  );
  assert.deepEqual(
    resultP1.life.map((life) => life.card.instanceId),
    beforeLife,
  );
  assert.equal(
    result.events.some((event) => event.type === "decisionCreated"),
    false,
  );
  assert.equal(
    result.events.filter((event) => event.type === "effectQueued").length,
    1,
  );
});

test("choice custom Event and unsupported On Play effects fail closed without mutation", () => {
  const cases: Array<{
    name: string;
    mutate: (definition: EffectDefinition) => EffectDefinition;
  }> = [
    {
      name: "choice",
      mutate: (
        definition: ReturnType<typeof reviewedOnPlayDrawDefinition>,
      ) => ({
        ...definition,
        effects: [
          {
            ...must(definition.effects[0], "effect"),
            effect: {
              type: "choice" as const,
              chooser: "self" as const,
              options: [],
              min: 0,
              max: 0,
            },
          },
        ],
      }),
    },
    {
      name: "custom",
      mutate: (
        definition: ReturnType<typeof reviewedOnPlayDrawDefinition>,
      ) => ({
        ...definition,
        effects: [
          {
            ...must(definition.effects[0], "effect"),
            effect: { type: "custom" as const, handler: "custom-handler" },
          },
        ],
      }),
    },
    {
      name: "optional-draw-upto",
      mutate: (
        definition: ReturnType<typeof reviewedOnPlayDrawDefinition>,
      ) => ({
        ...definition,
        effects: [
          {
            ...must(definition.effects[0], "effect"),
            optional: true,
            effect: { type: "drawUpTo" as const, count: 2, player: "self" },
          },
        ],
      }),
    },
    {
      name: "cost-bearing-draw-upto",
      mutate: (
        definition: ReturnType<typeof reviewedOnPlayDrawDefinition>,
      ) => ({
        ...definition,
        effects: [
          {
            ...must(definition.effects[0], "effect"),
            cost: { type: "restDon", count: 1 },
            effect: { type: "drawUpTo" as const, count: 2, player: "self" },
          },
        ],
      }),
    },
    {
      name: "unsupported",
      mutate: (
        definition: ReturnType<typeof reviewedOnPlayDrawDefinition>,
      ) => ({
        ...definition,
        effects: [
          {
            ...must(definition.effects[0], "effect"),
            effect: { type: "drawUpTo" as const, count: -1, player: "self" },
          },
        ],
      }),
    },
    {
      name: "replacement",
      mutate: (
        definition: ReturnType<typeof reviewedOnPlayDrawDefinition>,
      ) => ({
        ...definition,
        effects: [
          {
            ...must(definition.effects[0], "effect"),
            effect: {
              type: "replacement" as const,
              when: {
                type: "wouldMoveZone",
                target: { type: "self" },
              },
              instead: { type: "draw", count: 1, player: "self" },
            },
          },
        ],
      }),
    },
    {
      name: "battle-timing-trigger",
      mutate: (
        definition: ReturnType<typeof reviewedOnPlayDrawDefinition>,
      ) => ({
        ...definition,
        effects: [
          {
            ...must(definition.effects[0], "effect"),
            trigger: { type: "endOfBattle" },
          },
        ],
      }),
    },
  ];

  for (const testCase of cases) {
    const state = setupMainPlayState();
    const p1State = must(state.players[p1], "p1");
    const character = must(p1State.hand[0], `${testCase.name} character`);
    const definition = setupImplementedDslOnPlayDraw(
      state,
      character,
      `def-${testCase.name}`,
    );
    state.cardManifest.effectDefinitions = {
      [`def-${testCase.name}`]: testCase.mutate(definition),
    };
    const before = JSON.stringify(state);

    assert.equal(
      hasPlayCardAction(getPlayCardLegalActions(state, p1), character),
      false,
      testCase.name,
    );
    const result = applyPlayCardTestAction(state, {
      type: "playCard",
      cardInstanceId: character.instanceId,
    });

    assert.deepEqual(
      result.errors,
      [{ type: "illegalAction", reason: "playCard card is unsupported." }],
      testCase.name,
    );
    assert.deepEqual(result.events, [], testCase.name);
    assert.equal(JSON.stringify(state), before, testCase.name);
    assert.equal(JSON.stringify(result.state), before, testCase.name);
  }

  const eventState = setupMainPlayState();
  const eventP1 = must(eventState.players[p1], "event p1");
  const eventCard = must(eventP1.hand[0], "event card");
  const definition = setupImplementedDslOnPlayDraw(
    eventState,
    eventCard,
    "def-event-on-play",
  );
  eventState.cardManifest.cards[eventCard.cardId] = {
    ...must(eventState.cardManifest.cards[eventCard.cardId], "event manifest"),
    category: "event",
    effectText: "[Main]",
  };
  eventState.cardManifest.effectDefinitions = {
    "def-event-on-play": definition,
  };
  const before = JSON.stringify(eventState);

  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(eventState, p1), eventCard),
    false,
  );
  const result = applyPlayCardTestAction(eventState, {
    type: "playCard",
    cardInstanceId: eventCard.instanceId,
  });
  assert.deepEqual(result.errors, [
    { type: "illegalAction", reason: "playCard card is unsupported." },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(eventState), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("On Play text without supported implemented-dsl definition fails closed without mutation", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.hand[0], "on-play character");
  state.cardManifest.cards[character.cardId] = resolvedCard({
    cardId: character.cardId,
    category: "character",
    cost: 0,
    power: 2000,
    effectText: "[On Play] draw 1 card.",
  });
  const before = JSON.stringify(state);

  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(state, p1), character),
    false,
  );
  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: character.instanceId,
  });

  assert.deepEqual(result.errors, [
    { type: "illegalAction", reason: "playCard card is unsupported." },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("Event payment responses reject stale, wrong-player, wrong-decision, malformed, duplicate, wrong-player-DON, rested, attached, and insufficient without mutation", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const eventCard = must(p1State.hand[0], "event");
  state.cardManifest.cards[eventCard.cardId] = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 2,
    effectText: "[Main]",
  });
  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: eventCard.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "decision");
  const openedP1 = must(opened.state.players[p1], "opened p1");
  const openedP2 = must(opened.state.players[p2], "opened p2");
  const don0 = must(openedP1.costArea[0], "don0");
  const don1 = must(openedP1.costArea[1], "don1");
  const p2Don0 = must(openedP2.costArea[0], "p2 don0");
  const before = JSON.stringify(opened.state);
  const runInvalid = (
    action: Extract<Action, { type: "respondToDecision" }>,
    overrideState = opened.state,
  ) => {
    const snapshot = JSON.stringify(overrideState);
    const result = applyPlayCardTestAction(overrideState, action);
    assert.equal(result.errors?.[0]?.type, "illegalAction");
    assert.equal(JSON.stringify(overrideState), snapshot);
  };

  runInvalid({
    type: "respondToDecision",
    decisionId: `${String(decision.id)}:stale` as typeof decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [don0.instanceId, don1.instanceId],
    },
  });
  runInvalid({
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [toTestCardRef(don0, p1)] },
  });
  runInvalid({
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [don0.instanceId],
    },
  });
  runInvalid({
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [don0.instanceId, don0.instanceId],
    },
  });
  runInvalid({
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [don0.instanceId, p2Don0.instanceId],
    },
  });

  const wrongPlayerState = {
    ...opened.state,
    pendingDecision: { ...decision, playerId: p2 },
  };
  runInvalid(
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "payment",
        optionId: "restDon",
        selectedDonInstanceIds: [don0.instanceId, don1.instanceId],
      },
    },
    wrongPlayerState,
  );

  const restedState = {
    ...opened.state,
    players: {
      ...opened.state.players,
      [p1]: {
        ...openedP1,
        costArea: openedP1.costArea.map((card) =>
          card.instanceId === don0.instanceId
            ? { ...card, state: "rested" }
            : card,
        ),
      },
    },
  };
  runInvalid(
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "payment",
        optionId: "restDon",
        selectedDonInstanceIds: [don0.instanceId, don1.instanceId],
      },
    },
    restedState,
  );

  const attachedState = {
    ...opened.state,
    players: {
      ...opened.state.players,
      [p1]: {
        ...openedP1,
        leader: { ...openedP1.leader, attachedDon: [don0.instanceId] },
        costArea: openedP1.costArea
          .filter((card) => card.instanceId !== don0.instanceId)
          .map((card, index) => ({
            ...card,
            zone: { zone: "costArea", playerId: p1, slot: "cost", index },
          })),
      },
    },
  };
  runInvalid(
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "payment",
        optionId: "restDon",
        selectedDonInstanceIds: [don0.instanceId, don1.instanceId],
      },
    },
    attachedState,
  );

  assert.equal(JSON.stringify(opened.state), before);
});

test("Event play rejects stale and forged event card refs without mutation", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const eventCard = must(p1State.hand[0], "event");
  state.cardManifest.cards[eventCard.cardId] = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 1,
    effectText: "[Main]",
  });
  const before = JSON.stringify(state);
  const forged = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: "forged-event-instance" as CardInstance["instanceId"],
  });
  assert.equal(forged.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);

  const staleState = setupMainPlayState();
  const staleP1 = must(staleState.players[p1], "stale p1");
  const staleEvent = must(staleP1.hand[0], "stale event");
  staleState.cardManifest.cards[staleEvent.cardId] = resolvedCard({
    cardId: staleEvent.cardId,
    category: "event",
    cost: 1,
    effectText: "[Main]",
  });
  staleP1.hand = staleP1.hand
    .filter((card) => card.instanceId !== staleEvent.instanceId)
    .map((card, index) => ({
      ...card,
      zone: { zone: "hand", playerId: p1, slot: "hand", index },
    }));
  const staleBefore = JSON.stringify(staleState);
  const stale = applyPlayCardTestAction(staleState, {
    type: "playCard",
    cardInstanceId: staleEvent.instanceId,
  });
  assert.equal(stale.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(staleState), staleBefore);
});

test("Event play repeated execution is stable for event sequence and state hash", () => {
  const runScript = () => {
    const state = setupMainPlayState();
    const p1State = must(state.players[p1], "p1");
    const eventCard = must(p1State.hand[0], "event");
    state.cardManifest.cards[eventCard.cardId] = resolvedCard({
      cardId: eventCard.cardId,
      category: "event",
      cost: 2,
      effectText: "[Main]",
    });
    const opened = applyPlayCardTestAction(state, {
      type: "playCard",
      cardInstanceId: eventCard.instanceId,
    });
    const resolved = payFirstTwoDon(opened.state);
    return {
      openTypes: opened.events.map((event) => event.type),
      resolveTypes: resolved.events.map((event) => event.type),
      stateHash: resolved.stateHash,
    };
  };
  const first = runScript();
  const second = runScript();
  assert.deepEqual(first.openTypes, second.openTypes);
  assert.deepEqual(first.resolveTypes, second.resolveTypes);
  assert.equal(first.stateHash, second.stateHash);
});
