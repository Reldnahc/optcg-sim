import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Action,
  CardInstance,
  EngineResult,
  GameState,
  ResolvedCard,
} from "@optcg/types";

import { applyAction } from "./actions.js";
import { hashCanonicalStateValue } from "./canonical-state.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";
import {
  applyPlayCard,
  applyPlayCardDecisionResponse,
  getPlayCardLegalActions,
} from "./play-card.js";
import {
  addExtraDeckCard,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedMainEventDrawDefinition,
  valueContainsScalar,
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

test("getLegalActions includes reviewed implemented-dsl Main Event play only under main-phase controller constraints", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const eventCard = must(p1State.hand[0], "event");
  const implemented = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 1,
    effectText: "[Main] Draw 1 card.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-main-event-draw",
    },
  });
  state.cardManifest.cards[eventCard.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = {
    "def-main-event-draw": reviewedMainEventDrawDefinition(
      implemented.cardId,
      implemented.support,
    ),
  };

  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(state, p1), eventCard),
    true,
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

test("getLegalActions omits implemented-dsl Events outside the narrow reviewed Main Event gate", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const supported = must(p1State.hand[0], "supported");
  const optional = must(p1State.hand[1], "optional");
  const counter = must(p1State.hand[2], "counter");
  const untested = must(p1State.hand[3], "untested");
  const filteredKo = must(p1State.hand[4], "filtered ko");

  const install = (
    card: CardInstance,
    effect: ReturnType<
      typeof reviewedMainEventDrawDefinition
    >["effects"][number],
    supportOverride: Partial<ResolvedCard["support"]> = {},
  ) => {
    const resolved = resolvedCard({
      cardId: card.cardId,
      category: "event",
      cost: 1,
      effectText: "[Main] Draw 1 card.",
      support: {
        status: "implemented-dsl",
        effectDefinitionId: `def-${String(card.cardId)}`,
        ...supportOverride,
      },
    });
    state.cardManifest.cards[card.cardId] = resolved;
    state.cardManifest.effectDefinitionsVersion = "0.1.0";
    state.cardManifest.effectDefinitions = {
      ...state.cardManifest.effectDefinitions,
      [`def-${String(card.cardId)}`]: {
        ...reviewedMainEventDrawDefinition(resolved.cardId, resolved.support),
        effects: [effect],
      },
    };
  };
  const baseDefinition = reviewedMainEventDrawDefinition(
    supported.cardId,
    resolvedCard({ cardId: supported.cardId, category: "event", cost: 1 })
      .support,
  );
  const baseEffect = must(baseDefinition.effects[0], "base effect");
  install(supported, baseEffect);
  install(optional, { ...baseEffect, optional: true });
  install(counter, { ...baseEffect, trigger: { type: "counter" } });
  install(untested, baseEffect, { tested: false });
  install(filteredKo, {
    ...baseEffect,
    id: "OP01-040:event-filtered-main-ko-1" as typeof baseEffect.id,
    effect: {
      type: "ko",
      target: {
        type: "choose",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "opponent",
          zone: "characterArea",
          filter: { cost: { op: "lte", value: 3 } },
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
        },
      },
    },
  });

  const legal = getPlayCardLegalActions(state, p1);
  assert.equal(hasPlayCardAction(legal, supported), true);
  assert.equal(hasPlayCardAction(legal, optional), false);
  assert.equal(hasPlayCardAction(legal, counter), false);
  assert.equal(hasPlayCardAction(legal, untested), false);
  assert.equal(hasPlayCardAction(legal, filteredKo), false);
});

test("paid reviewed target KO Main Event keeps replay event order through target resolution", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const eventCard = must(p1State.hand[0], "event");
  const targetSource = must(p2State.hand[0], "target source");
  const target: CardInstance = {
    ...targetSource,
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
    turnPlayed: state.turn.globalTurn,
  };
  p2State.characters = [target];
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    cost: 3,
    power: 4000,
  });
  const implemented = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 2,
    effectText: "[Main] K.O. up to 1 of your opponent's Characters.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-main-event-ko",
    },
  });
  const definition = reviewedMainEventDrawDefinition(
    implemented.cardId,
    implemented.support,
  );
  const targetRequest = {
    timing: "onResolution" as const,
    chooser: "self" as const,
    player: "opponent" as const,
    zone: "characterArea" as const,
    min: 0,
    max: 1,
    allowFewerIfUnavailable: true,
    visibility: "public" as const,
  };
  state.cardManifest.cards[eventCard.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = {
    "def-main-event-ko": {
      ...definition,
      effects: [
        {
          ...must(definition.effects[0], "main effect"),
          id: "OP01-040:event-main-ko-1" as (typeof definition.effects)[number]["id"],
          effect: {
            type: "ko",
            target: { type: "choose", request: targetRequest },
          },
        },
      ],
    },
  };
  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: eventCard.instanceId,
  });
  assert.equal(opened.errors, undefined);
  assert.equal(opened.state.pendingDecision?.type, "payCost");

  const paid = payFirstTwoDon(opened.state);

  assert.equal(paid.errors, undefined);
  assert.equal(paid.state.pendingDecision?.type, "selectTargets");
  assert.deepEqual(
    paid.events.map((event) => event.type),
    [
      "costPaid",
      "decisionResolved",
      "cardMoved",
      "cardTrashed",
      "cardPlayed",
      "ruleProcessingChecked",
      "effectQueued",
      "decisionCreated",
    ],
  );

  const targetDecision = must(paid.state.pendingDecision, "target decision");
  assert.equal(targetDecision.type, "selectTargets");
  assert.deepEqual(targetDecision.request, targetRequest);
  const publicCandidate = must(
    targetDecision.candidates[0],
    "public target candidate",
  );
  assert.equal(publicCandidate.card.instanceId, target.instanceId);

  const resolved = applyAction(paid.state, {
    type: "respondToDecision",
    decisionId: targetDecision.id,
    response: { type: "targets", targets: [publicCandidate.card] },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.deepEqual(
    must(resolved.state.players[p2], "resolved p2").characters,
    [],
  );
  assert.equal(
    must(must(resolved.state.players[p2], "resolved p2").trash[0], "ko trash")
      .instanceId,
    target.instanceId,
  );
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardKOd",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
    ],
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
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
  const [don0Id, don1Id, don2Id] = p1State.costArea.map(
    (card) => card.instanceId,
  );
  assert.deepEqual(
    respondToDecisionActions(getPlayCardLegalActions(opened.state, p1)).map(
      (action) =>
        action.response.type === "payment"
          ? action.response.selectedDonInstanceIds
          : [],
    ),
    [
      [don0Id, don1Id],
      [don0Id, don2Id],
      [don1Id, don2Id],
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

test("nonzero implemented-dsl Main Event draw uses existing DON payment and moves hand to trash", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const eventCard = must(p1State.hand[0], "event");
  const implemented = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 2,
    effectText: "[Main] Draw 1 card.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-main-event-payment",
    },
  });
  state.cardManifest.cards[eventCard.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = {
    "def-main-event-payment": reviewedMainEventDrawDefinition(
      implemented.cardId,
      implemented.support,
    ),
  };

  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: eventCard.instanceId,
  });
  assert.equal(opened.errors, undefined);
  assert.equal(opened.state.pendingDecision?.type, "payCost");

  const resolved = payFirstTwoDon(opened.state);

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
  assert.equal(must(resolvedP1.costArea[0], "paid don0").state, "rested");
  assert.equal(must(resolvedP1.costArea[1], "paid don1").state, "rested");
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

test("implemented-dsl Main Event draw keeps event sequencing, state hash, and opponent PlayerView safe", () => {
  const run = () => {
    const state = setupMainPlayState();
    addExtraDeckCard(state);
    const p1State = must(state.players[p1], "p1");
    const eventCard = must(p1State.hand[0], "event");
    const drawnCard = must(p1State.deck[0], "drawn card");
    const implemented = resolvedCard({
      cardId: eventCard.cardId,
      category: "event",
      cost: 0,
      effectText: "[Main] Draw 1 card.",
      support: {
        status: "implemented-dsl",
        effectDefinitionId: "def-main-event-view",
      },
    });
    state.cardManifest.cards[eventCard.cardId] = implemented;
    state.cardManifest.effectDefinitionsVersion = "0.1.0";
    state.cardManifest.effectDefinitions = {
      "def-main-event-view": reviewedMainEventDrawDefinition(
        implemented.cardId,
        implemented.support,
      ),
    };

    const result = applyPlayCardTestAction(state, {
      type: "playCard",
      cardInstanceId: eventCard.instanceId,
    });
    return { result, eventCard, drawnCard };
  };

  const first = run();
  const second = run();
  assert.equal(first.result.errors, undefined);
  assert.equal(
    first.result.stateHash,
    hashCanonicalStateValue(first.result.state),
  );
  assert.deepEqual(
    first.result.events.map((event) => event.seq),
    first.result.events
      .map((event) => event.seq)
      .slice()
      .sort((left, right) => left - right),
  );
  assert.deepEqual(
    first.result.events.map((event) => event.type),
    second.result.events.map((event) => event.type),
  );
  assert.equal(first.result.stateHash, second.result.stateHash);

  const opponentView = filterStateForPlayer(first.result.state, p2);
  assert.equal(
    valueContainsScalar(opponentView, first.eventCard.instanceId),
    true,
  );
  assert.equal(
    valueContainsScalar(opponentView, first.drawnCard.instanceId),
    false,
  );
  assert.equal(opponentView.opponent.handCount, 5);
  assert.equal(
    opponentView.legalActions.some((action) => action.type === "playCard"),
    false,
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

  const resolved = payFirstTwoDon(opened.state);
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
  const paidResolved = payFirstTwoDon(paidOpened.state);
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
