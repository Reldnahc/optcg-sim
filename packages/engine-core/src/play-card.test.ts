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
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "./action-test-fixtures.js";
import {
  hasPlayCardAction,
  respondToDecisionActions,
  setupMainPlayState,
  toTestCardRef,
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

test("getLegalActions includes supported [Main] vanilla Event play only under main-phase turn-player constraints", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const eventCard = must(p1State.hand[0], "event");
  const unsupported = must(p1State.hand[1], "unsupported");

  state.cardManifest.cards[eventCard.cardId] = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 1,
    effectText: " [Main] ",
  });
  state.cardManifest.cards[unsupported.cardId] = resolvedCard({
    cardId: unsupported.cardId,
    category: "event",
    cost: 1,
    effectText: "[Main] draw 1",
  });

  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(state, p1), eventCard),
    true,
  );
  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(state, p1), unsupported),
    false,
  );
  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(state, p2), eventCard),
    false,
  );

  state.turn.phase = "don";
  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(state, p1), eventCard),
    false,
  );
});

test("getLegalActions omits Event play for invalid timing text, trigger text, missing manifest, and unsupported status", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const missingMain = must(p1State.hand[0], "missing-main");
  const counter = must(p1State.hand[1], "counter");
  const trigger = must(p1State.hand[2], "trigger");
  const missingManifest = must(p1State.hand[3], "missing-manifest");
  const unsupported = must(p1State.hand[4], "unsupported");

  state.cardManifest.cards[missingMain.cardId] = resolvedCard({
    cardId: missingMain.cardId,
    category: "event",
    cost: 1,
    effectText: "",
  });
  state.cardManifest.cards[counter.cardId] = resolvedCard({
    cardId: counter.cardId,
    category: "event",
    cost: 1,
    effectText: "[Counter]",
  });
  state.cardManifest.cards[trigger.cardId] = resolvedCard({
    cardId: trigger.cardId,
    category: "event",
    cost: 1,
    effectText: "[Main]",
    triggerText: "[Trigger] something",
  });
  state.cardManifest.cards[unsupported.cardId] = {
    ...resolvedCard({
      cardId: unsupported.cardId,
      category: "event",
      cost: 1,
      effectText: "[Main]",
    }),
    support: {
      ...resolvedCard({
        cardId: unsupported.cardId,
        category: "event",
      }).support,
      status: "unsupported",
    },
  };

  const legal = getPlayCardLegalActions(state, p1);
  assert.equal(hasPlayCardAction(legal, missingMain), false);
  assert.equal(hasPlayCardAction(legal, counter), false);
  assert.equal(hasPlayCardAction(legal, trigger), false);
  assert.equal(hasPlayCardAction(legal, missingManifest), false);
  assert.equal(hasPlayCardAction(legal, unsupported), false);
});

test("Event effect execution remains unsupported and fails closed without mutation", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const eventCard = must(p1State.hand[0], "event with effect text");
  state.cardManifest.cards[eventCard.cardId] = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 1,
    effectText: "[Main] draw 1 card.",
  });
  const before = JSON.stringify(state);

  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(state, p1), eventCard),
    false,
  );
  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: eventCard.instanceId,
  });

  assert.deepEqual(result.errors, [
    { type: "illegalAction", reason: "playCard card is unsupported." },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
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

test("nonzero [Main] Event play creates payCost and valid payment moves card hand->trash with expected events", () => {
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
  assert.equal(opened.state.pendingDecision?.type, "payCost");
  assert.deepEqual(
    opened.events.map((event) => event.type),
    ["cardRevealed", "decisionCreated"],
  );
  assert.deepEqual(
    respondToDecisionActions(getPlayCardLegalActions(opened.state, p1)).map(
      (action) => action.response,
    ),
    [
      {
        type: "payment",
        optionId: "restDon",
        selectedDonInstanceIds: [
          must(p1State.costArea[0], "legal don0").instanceId,
          must(p1State.costArea[1], "legal don1").instanceId,
        ],
      },
      {
        type: "payment",
        optionId: "restDon",
        selectedDonInstanceIds: [
          must(p1State.costArea[0], "legal don0").instanceId,
          must(p1State.costArea[2], "legal don2").instanceId,
        ],
      },
      {
        type: "payment",
        optionId: "restDon",
        selectedDonInstanceIds: [
          must(p1State.costArea[1], "legal don1").instanceId,
          must(p1State.costArea[2], "legal don2").instanceId,
        ],
      },
    ],
  );
  assert.equal(
    respondToDecisionActions(getPlayCardLegalActions(opened.state, p2)).length,
    0,
  );

  const p1Opened = must(opened.state.players[p1], "p1 opened");
  const don0 = must(p1Opened.costArea[0], "don0");
  const don1 = must(p1Opened.costArea[1], "don1");
  const resolved = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: must(opened.state.pendingDecision, "decision").id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [don0.instanceId, don1.instanceId],
    },
  });
  assert.equal(resolved.errors, undefined);
  const resolvedP1 = must(resolved.state.players[p1], "resolved p1");
  assert.equal(
    resolvedP1.hand.some((card) => card.instanceId === eventCard.instanceId),
    false,
  );
  assert.equal(
    must(resolvedP1.trash[0], "trash 0").instanceId,
    eventCard.instanceId,
  );
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    [
      "costPaid",
      "decisionResolved",
      "cardMoved",
      "cardTrashed",
      "cardPlayed",
      "ruleProcessingChecked",
    ],
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("zero-cost [Main] Event play resolves directly to trash with expected events", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const eventCard = must(p1State.hand[0], "event");
  state.cardManifest.cards[eventCard.cardId] = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 0,
    effectText: "[Main]",
  });

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: eventCard.instanceId,
  });
  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  const resultP1 = must(result.state.players[p1], "result p1");
  assert.equal(
    resultP1.hand.some((card) => card.instanceId === eventCard.instanceId),
    false,
  );
  assert.equal(
    must(resultP1.trash[0], "trash 0").instanceId,
    eventCard.instanceId,
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "cardRevealed",
      "cardMoved",
      "cardTrashed",
      "cardPlayed",
      "ruleProcessingChecked",
    ],
  );
  assert.deepEqual(
    result.events.map((event) => [event.type, event.visibility.type]),
    [
      ["cardRevealed", "public"],
      ["cardMoved", "public"],
      ["cardTrashed", "public"],
      ["cardPlayed", "public"],
      ["ruleProcessingChecked", "replayOnly"],
    ],
  );
});

test("Event legal actions are omitted during pending decision, active battle, and non-Event manifest category", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const eventCard = must(p1State.hand[0], "event");
  const costCard = must(p1State.hand[1], "cost card");
  state.cardManifest.cards[eventCard.cardId] = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 1,
    effectText: "[Main]",
  });
  state.cardManifest.cards[costCard.cardId] = resolvedCard({
    cardId: costCard.cardId,
    category: "character",
    cost: 1,
    power: 2000,
  });
  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(state, p1), eventCard),
    true,
  );

  const withPending = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: costCard.instanceId,
  }).state;
  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(withPending, p1), eventCard),
    false,
  );

  const p1Leader = must(withPending.players[p1], "p1").leader;
  const withBattle = {
    ...state,
    battle: {
      attacker: {
        instanceId: p1Leader.instanceId,
        cardId: p1Leader.cardId,
        playerId: p1,
      },
      originalTarget: {
        instanceId: p1Leader.instanceId,
        cardId: p1Leader.cardId,
        playerId: p1,
      },
      currentTarget: {
        instanceId: p1Leader.instanceId,
        cardId: p1Leader.cardId,
        playerId: p1,
      },
      step: "counter" as const,
      damageCount: 1,
    },
  };
  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(withBattle, p1), eventCard),
    false,
  );

  state.cardManifest.cards[eventCard.cardId] = resolvedCard({
    cardId: eventCard.cardId,
    category: "leader",
    power: 5000,
  });
  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(state, p1), eventCard),
    false,
  );
});

test("Event nonzero open and resolve emitted events are public except existing replay-only rule-processing", () => {
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
  assert.deepEqual(
    opened.events.map((event) => [event.type, event.visibility.type]),
    [
      ["cardRevealed", "public"],
      ["decisionCreated", "public"],
    ],
  );

  const openedP1 = must(opened.state.players[p1], "opened p1");
  const don0 = must(openedP1.costArea[0], "don0");
  const don1 = must(openedP1.costArea[1], "don1");
  const resolved = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: must(opened.state.pendingDecision, "decision").id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [don0.instanceId, don1.instanceId],
    },
  });
  assert.deepEqual(
    resolved.events.map((event) => [event.type, event.visibility.type]),
    [
      ["costPaid", "public"],
      ["decisionResolved", "public"],
      ["cardMoved", "public"],
      ["cardTrashed", "public"],
      ["cardPlayed", "public"],
      ["ruleProcessingChecked", "replayOnly"],
    ],
  );
});

test("Event paid and zero-cost plays reindex hand and trash zone refs", () => {
  const assertReindexed = (cards: CardInstance[], zone: "hand" | "trash") => {
    cards.forEach((card, index) => {
      assert.equal(card.zone.zone, zone);
      assert.equal(card.zone.slot, zone);
      assert.equal(card.zone.playerId, p1);
      assert.equal(card.zone.index, index);
    });
  };

  const paidState = setupMainPlayState();
  const paidP1 = must(paidState.players[p1], "paid p1");
  const paidEvent = must(paidP1.hand[0], "paid event");
  paidState.cardManifest.cards[paidEvent.cardId] = resolvedCard({
    cardId: paidEvent.cardId,
    category: "event",
    cost: 2,
    effectText: "[Main]",
  });
  const paidOpened = applyPlayCardTestAction(paidState, {
    type: "playCard",
    cardInstanceId: paidEvent.instanceId,
  });
  const paidOpenedP1 = must(paidOpened.state.players[p1], "paid opened p1");
  const paidResolved = applyPlayCardTestAction(paidOpened.state, {
    type: "respondToDecision",
    decisionId: must(paidOpened.state.pendingDecision, "decision").id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [
        must(paidOpenedP1.costArea[0], "don0").instanceId,
        must(paidOpenedP1.costArea[1], "don1").instanceId,
      ],
    },
  });
  const paidResolvedP1 = must(
    paidResolved.state.players[p1],
    "paid resolved p1",
  );
  assertReindexed(paidResolvedP1.hand, "hand");
  assertReindexed(paidResolvedP1.trash, "trash");
  assert.equal(
    must(paidResolvedP1.trash[0], "paid trash 0").instanceId,
    paidEvent.instanceId,
  );

  const zeroState = setupMainPlayState();
  const zeroP1 = must(zeroState.players[p1], "zero p1");
  const zeroEvent = must(zeroP1.hand[0], "zero event");
  zeroState.cardManifest.cards[zeroEvent.cardId] = resolvedCard({
    cardId: zeroEvent.cardId,
    category: "event",
    cost: 0,
    effectText: "[Main]",
  });
  const zeroResolved = applyPlayCardTestAction(zeroState, {
    type: "playCard",
    cardInstanceId: zeroEvent.instanceId,
  });
  const zeroResolvedP1 = must(
    zeroResolved.state.players[p1],
    "zero resolved p1",
  );
  assertReindexed(zeroResolvedP1.hand, "hand");
  assertReindexed(zeroResolvedP1.trash, "trash");
  assert.equal(
    must(zeroResolvedP1.trash[0], "zero trash 0").instanceId,
    zeroEvent.instanceId,
  );
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
    const openedP1 = must(opened.state.players[p1], "opened p1");
    const resolved = applyPlayCardTestAction(opened.state, {
      type: "respondToDecision",
      decisionId: must(opened.state.pendingDecision, "decision").id,
      response: {
        type: "payment",
        optionId: "restDon",
        selectedDonInstanceIds: [
          must(openedP1.costArea[0], "don0").instanceId,
          must(openedP1.costArea[1], "don1").instanceId,
        ],
      },
    });
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
