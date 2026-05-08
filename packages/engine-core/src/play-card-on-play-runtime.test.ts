import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Action,
  CardInstance,
  EffectDefinition,
  EngineResult,
  GameState,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./canonical-state.js";
import {
  applyPlayCard,
  applyPlayCardDecisionResponse,
  getPlayCardLegalActions,
} from "./play-card.js";
import {
  must,
  p1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "./action-test-fixtures.js";
import {
  hasPlayCardAction,
  setupMainPlayState,
} from "./play-card-test-fixtures.js";

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
  assert.equal(
    first.events.every(
      (event, index, events) =>
        index === 0 || event.seq > must(events[index - 1], "previous").seq,
    ),
    true,
  );
});

test("choice optional custom Event and unsupported On Play effects fail closed without mutation", () => {
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
      name: "optional",
      mutate: (
        definition: ReturnType<typeof reviewedOnPlayDrawDefinition>,
      ) => ({
        ...definition,
        effects: [{ ...must(definition.effects[0], "effect"), optional: true }],
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
      name: "unsupported",
      mutate: (
        definition: ReturnType<typeof reviewedOnPlayDrawDefinition>,
      ) => ({
        ...definition,
        effects: [
          {
            ...must(definition.effects[0], "effect"),
            effect: { type: "drawUpTo" as const, count: 1, player: "self" },
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
      name: "continuous-battle-duration",
      mutate: (
        definition: ReturnType<typeof reviewedOnPlayDrawDefinition>,
      ) => ({
        ...definition,
        effects: [
          {
            ...must(definition.effects[0], "effect"),
            effect: {
              type: "modifyPower" as const,
              target: { type: "self" },
              value: 1000,
              duration: { type: "thisBattle" },
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
