import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  ContinuousEffectRecord,
  EffectDefinition,
  GameState,
  PlayerId,
} from "@optcg/types";

import { applyAction, getLegalActions } from "../actions.js";
import {
  applyDeclareAttack,
  resolveSupportedVanillaBattle,
} from "./actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "../action-test-fixtures.js";
import {
  cardRef,
  resolveNoTriggerLifeDamageDecisionsForTests,
  setupAttackState,
  withOnOpponentAttackDrawEffect,
} from "./test-fixtures.js";

const addTrashCards = (
  state: ReturnType<typeof setupAttackState>,
  count: number,
): void => {
  const player = must(state.players[p1], "p1");
  player.trash = Array.from({ length: count }, (_, index) => {
    const cardId = toCardId(`p1-trash-${String(index)}`);
    state.cardManifest.cards[cardId] = resolvedCard({
      cardId,
      category: "character",
      power: 1000,
    });
    return {
      instanceId: `p1:trash:${String(index)}` as never,
      cardId,
      owner: p1,
      controller: p1,
      zone: { zone: "trash", playerId: p1, slot: "trash", index },
      state: "active" as const,
      attachedDon: [],
    };
  });
};

const ensureDeckHasAtLeast = (
  state: ReturnType<typeof setupAttackState>,
  playerId: PlayerId,
  count: number,
): void => {
  const player = must(state.players[playerId], "deck owner");
  while (player.deck.length < count) {
    const index = player.deck.length;
    const cardId = toCardId(`${String(playerId)}-deck-extra-${String(index)}`);
    state.cardManifest.cards[cardId] = resolvedCard({
      cardId,
      category: "character",
      power: 1000,
    });
    player.deck.push({
      instanceId: `${String(playerId)}:deck:extra:${String(index)}` as never,
      cardId,
      owner: playerId,
      controller: playerId,
      zone: { zone: "deck", playerId, slot: "deck", index },
      state: "active",
      attachedDon: [],
    });
  }
};

const assertCounterPassDecision = (
  state: GameState,
  playerId: PlayerId,
): NonNullable<GameState["pendingDecision"]> => {
  const decision = must(state.pendingDecision, "counter decision");
  assert.equal(state.battle?.step, "counter");
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.playerId, playerId);
  assert.equal(decision.prompt, "Use counter or end step.");
  return decision;
};

const passCounterStep = (state: GameState, playerId: PlayerId) => {
  const decision = assertCounterPassDecision(state, playerId);
  return resolveNoTriggerLifeDamageDecisionsForTests(
    applyAction(state, {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [] },
    }),
  );
};

const installWhenAttackingConditionalPowerReduction = (
  state: ReturnType<typeof setupAttackState>,
): void => {
  const p1State = must(state.players[p1], "p1");
  const cardId = p1State.leader.cardId;
  const definition: EffectDefinition = {
    cardId,
    implementationStatus: "implemented-dsl",
    effects: [
      {
        id: "when-attacking-power-reduction" as never,
        category: "auto",
        trigger: { type: "whenAttacking" },
        condition: { type: "trashCount", player: "self", op: "gte", value: 10 },
        optional: false,
        oncePerTurn: false,
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "modifyPower",
          target: {
            type: "choose",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "opponent",
              zone: "characterArea",
              min: 0,
              max: 1,
              allowFewerIfUnavailable: true,
              visibility: "public",
              filter: { categories: ["character"] },
            },
          },
          value: -2000,
          duration: { type: "thisTurn" },
        },
      },
    ],
    metadata: {
      sourceTextHash: "when-attacking-power-reduction-source",
      rulesVersion: "r1",
      effectDefinitionsVersion: "test",
      tested: true,
      reviewer: "qa-reviewer",
    },
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-when-attacking-power-reduction": definition,
  };
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "leader",
    power: 5000,
    effectText:
      "[When Attacking] If you have 10 or more cards in your trash, give up to 1 of your opponent's Characters -2000 power during this turn.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-when-attacking-power-reduction",
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
};

const installAttackTrashCostRestriction = (
  state: ReturnType<typeof setupAttackState>,
  target: ReturnType<typeof cardRef>,
): void => {
  const p2State = must(state.players[p2], "p2");
  const source = p2State.leader;
  const record: ContinuousEffectRecord = {
    id: "attack-cost-trash-two",
    source: cardRef(source, p2),
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: source.owner,
      controllerId: source.controller,
      zone: source.zone,
      category: "leader",
      colors: ["red"],
      power: 5000,
      keywords: [],
    },
    controller: p2,
    modifier: {
      layer: "restriction",
      target: {
        type: "exactCard",
        card: target,
        createdAtStateSeq: state.seq,
        binding: {
          family: "selectedTargets",
          saveResultAs: "selected:attack-cost-targets",
          objectIndex: 0,
        },
      },
      operation: {
        type: "attackCost",
        cost: { type: "trashFromHand", count: 2 },
      } as never,
    },
    duration: { type: "untilEndOfNextTurn", player: "opponent" },
    createdBy: { type: "ruleProcess", name: "attack-cost-test" },
    createdAtStateSeq: state.seq,
  };
  state.continuousEffects.push(record);
};

const installWhenAttackingTopDeckPlacement = (
  state: ReturnType<typeof setupAttackState>,
): void => {
  const p1State = must(state.players[p1], "p1");
  const cardId = p1State.leader.cardId;
  const definition: EffectDefinition = {
    cardId,
    implementationStatus: "implemented-dsl",
    effects: [
      {
        id: "when-attacking-top-deck-placement" as never,
        category: "auto",
        trigger: { type: "whenAttacking" },
        optional: false,
        oncePerTurn: false,
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "placeTopDeckCards",
          player: "self",
          count: 2,
          destination: "topOrBottom",
          order: "ownerChoice",
        },
      },
    ],
    metadata: {
      sourceTextHash: "when-attacking-top-deck-placement-source",
      rulesVersion: "r1",
      effectDefinitionsVersion: "test",
      tested: true,
      reviewer: "qa-reviewer",
    },
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-when-attacking-top-deck-placement": definition,
  };
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "leader",
    power: 5000,
    effectText:
      "[When Attacking] Look at 2 cards from the top of your deck and place them at the top or bottom of your deck in any order.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-when-attacking-top-deck-placement",
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
};

const installWhenAttackingSearchReveal = (
  state: ReturnType<typeof setupAttackState>,
): void => {
  const p1State = must(state.players[p1], "p1");
  const topDeck = must(p1State.deck[0], "top deck");
  state.cardManifest.cards[topDeck.cardId] = resolvedCard({
    cardId: topDeck.cardId,
    category: "character",
    power: 1000,
  });
  const cardId = p1State.leader.cardId;
  const definition: EffectDefinition = {
    cardId,
    implementationStatus: "implemented-dsl",
    effects: [
      {
        id: "when-attacking-search-reveal" as never,
        category: "auto",
        trigger: { type: "whenAttacking" },
        optional: false,
        oncePerTurn: false,
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "revealTop",
                player: "self",
                zone: "deck",
                count: 1,
                saveAs: "set:when-attacking-search" as never,
                visibility: "chooserOnly",
              },
            },
            {
              connector: "then",
              effect: {
                type: "selectFromSet",
                set: "set:when-attacking-search" as never,
                chooser: "self",
                filter: { categories: ["character"] },
                min: 0,
                max: 1,
                saveAs: "selected:when-attacking-search" as never,
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "moveSelected",
                selection: "selected:when-attacking-search" as never,
                from: "set:when-attacking-search" as never,
                to: "hand",
              },
            },
          ],
        },
      },
    ],
    metadata: {
      sourceTextHash: "when-attacking-search-reveal-source",
      rulesVersion: "r1",
      effectDefinitionsVersion: "test",
      tested: true,
      reviewer: "qa-reviewer",
    },
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-when-attacking-search-reveal": definition,
  };
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "leader",
    power: 5000,
    effectText:
      "[When Attacking] Look at 1 card from the top of your deck; add up to 1 Character card to your hand.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-when-attacking-search-reveal",
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
};

test("resolveSupportedVanillaBattle rejects when no active battle", () => {
  const state = setupAttackState();
  const before = JSON.stringify(state);
  const result = resolveSupportedVanillaBattle(state);
  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
});

test("unsupported trigger damage opens add-to-hand fallback while unsupported battle windows fail closed", () => {
  const runFailClosed = (
    mutate: (state: ReturnType<typeof setupAttackState>) => void,
  ) => {
    const state = setupAttackState();
    const p1State = must(state.players[p1], "p1");
    const p2State = must(state.players[p2], "p2");
    state.battle = {
      attacker: {
        instanceId: p1State.leader.instanceId,
        cardId: p1State.leader.cardId,
        playerId: p1,
      },
      originalTarget: {
        instanceId: p2State.leader.instanceId,
        cardId: p2State.leader.cardId,
        playerId: p2,
      },
      currentTarget: {
        instanceId: p2State.leader.instanceId,
        cardId: p2State.leader.cardId,
        playerId: p2,
      },
      step: "attack",
      damageCount: 1,
    };
    mutate(state);
    const before = JSON.stringify(state);
    const result = resolveSupportedVanillaBattle(state);
    const finalResult =
      result.state.pendingDecision === undefined
        ? result
        : passCounterStep(result.state, p2);
    assert.equal(finalResult.errors?.[0]?.type, "illegalAction");
    assert.equal(JSON.stringify(state), before);
  };

  const triggerState = setupAttackState();
  const triggerP1State = must(triggerState.players[p1], "p1");
  const triggerP2State = must(triggerState.players[p2], "p2");
  triggerState.battle = {
    attacker: {
      instanceId: triggerP1State.leader.instanceId,
      cardId: triggerP1State.leader.cardId,
      playerId: p1,
    },
    originalTarget: {
      instanceId: triggerP2State.leader.instanceId,
      cardId: triggerP2State.leader.cardId,
      playerId: p2,
    },
    currentTarget: {
      instanceId: triggerP2State.leader.instanceId,
      cardId: triggerP2State.leader.cardId,
      playerId: p2,
    },
    step: "attack",
    damageCount: 1,
  };
  triggerP2State.life[0] = {
    ...must(triggerP2State.life[0], "life"),
    card: {
      ...must(triggerP2State.life[0], "life").card,
      cardId: toCardId("trigger-life"),
    },
  };
  triggerState.cardManifest.cards[toCardId("trigger-life")] = {
    ...resolvedCard({
      cardId: toCardId("trigger-life"),
      category: "character",
      power: 1000,
    }),
    triggerText: "TRIGGER: do a thing",
  };
  const beforeTriggerState = JSON.stringify(triggerState);
  const result = resolveSupportedVanillaBattle(triggerState);
  const triggerFallback =
    result.state.pendingDecision === undefined
      ? result
      : passCounterStep(result.state, p2);
  const pendingDecision = must(
    triggerFallback.state.pendingDecision,
    "life trigger fallback",
  );
  assert.equal(triggerFallback.errors, undefined);
  assert.equal(pendingDecision.type, "confirmLifeTrigger");
  assert.deepEqual(pendingDecision.options, ["addToHand"]);
  assert.deepEqual(
    getLegalActions(triggerFallback.state, p2)
      .filter((action) => action.type === "respondToDecision")
      .map((action) => action.response),
    [{ type: "lifeTrigger", choice: "addToHand" }],
  );
  assert.equal(JSON.stringify(triggerState), beforeTriggerState);

  runFailClosed((state) => {
    const p1State = must(state.players[p1], "p1");
    const p2State = must(state.players[p2], "p2");
    state.battle = {
      attacker: {
        instanceId: p1State.leader.instanceId,
        cardId: p1State.leader.cardId,
        playerId: p1,
      },
      originalTarget: {
        instanceId: p2State.leader.instanceId,
        cardId: p2State.leader.cardId,
        playerId: p2,
      },
      currentTarget: {
        instanceId: p2State.leader.instanceId,
        cardId: p2State.leader.cardId,
        playerId: p2,
      },
      step: "block",
      damageCount: 1,
    };
  });
});

test("counter-step pass remains legal even when damage continuation would fail closed", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterCard = must(p2State.hand[0], "counter card");
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 1000,
  });
  const unsupportedTriggerCardId = toCardId("unsupported-trigger-life");
  p2State.life[0] = {
    ...must(p2State.life[0], "top life"),
    card: {
      ...must(p2State.life[0], "top life").card,
      cardId: unsupportedTriggerCardId,
    },
  };
  state.cardManifest.cards[unsupportedTriggerCardId] = {
    ...resolvedCard({
      cardId: unsupportedTriggerCardId,
      category: "character",
      power: 1000,
    }),
    triggerText: "TRIGGER: unsupported",
  };

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.equal(opened.errors, undefined);
  const decision = must(opened.state.pendingDecision, "counter decision");
  const actions = getLegalActions(opened.state, p2);
  assert.equal(
    actions.some((action) => action.type === "useCounter"),
    true,
  );
  assert.equal(
    actions.some(
      (action) =>
        action.type === "respondToDecision" &&
        action.decisionId === decision.id &&
        action.response.type === "cards" &&
        action.response.cards.length === 0,
    ),
    true,
  );
});

test("counter-step pass decision opens even when defender has no legal counters", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  for (const card of p2State.hand) {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "character",
      power: 3000,
    });
  }

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.equal(opened.errors, undefined);
  const decision = must(opened.state.pendingDecision, "counter decision");
  assert.equal(decision.playerId, p2);
  assert.equal(decision.prompt, "Use counter or end step.");
  const actions = getLegalActions(opened.state, p2);
  assert.equal(
    actions.some((action) => action.type === "useCounter"),
    false,
  );
  assert.equal(
    actions.some(
      (action) =>
        action.type === "respondToDecision" &&
        action.decisionId === decision.id &&
        action.response.type === "cards" &&
        action.response.cards.length === 0,
    ),
    true,
  );
});

test("attack trash cost opens a hand selection before attack timing resolves", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  installAttackTrashCostRestriction(state, cardRef(attacker, p1));

  const selectedCards = p1State.hand
    .slice(0, 2)
    .map((card) => cardRef(card, p1));
  const beforeHand = p1State.hand.length;
  const beforeTrash = p1State.trash.length;

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(attacker, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.equal(opened.errors, undefined);
  assert.equal(opened.state.battle, undefined);
  assert.equal(
    opened.events.some((event) => event.type === "attackDeclared"),
    false,
  );
  const decision = must(opened.state.pendingDecision, "attack cost decision");
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.playerId, p1);
  assert.equal(decision.prompt, "Trash cards from hand to attack.");
  assert.equal(decision.request.zone, "hand");
  assert.equal(decision.request.min, 2);
  assert.equal(decision.request.max, 2);

  const paid = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: selectedCards },
  });

  assert.equal(paid.errors, undefined);
  const afterP1 = must(paid.state.players[p1], "p1 after payment");
  assert.equal(afterP1.hand.length, beforeHand - 2);
  assert.equal(afterP1.trash.length, beforeTrash + 2);
  assert.equal(paid.state.battle?.attacker.instanceId, attacker.instanceId);
  assert.equal(
    paid.events.some((event) => event.type === "decisionResolved"),
    true,
  );
  assert.equal(
    paid.events.some((event) => event.type === "attackDeclared"),
    true,
  );
});

test("banish combined with doubleAttack trashes two leader damage life cards", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const firstLife = must(p2State.life[0], "first life").card.instanceId;
  const secondLife = must(p2State.life[1], "second life").card.instanceId;
  const beforeLife = p2State.life.length;
  const beforeHand = p2State.hand.length;
  const beforeTrash = p2State.trash.length;
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    printedKeywords: ["banish", "doubleAttack"],
  };

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.equal(opened.errors, undefined);
  const result = passCounterStep(opened.state, p2);
  assert.equal(result.errors, undefined);
  const nextP2 = must(result.state.players[p2], "p2 result");
  assert.equal(nextP2.life.length, beforeLife - 2);
  assert.equal(nextP2.hand.length, beforeHand);
  assert.equal(nextP2.trash.length, beforeTrash + 2);
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === firstLife),
    true,
  );
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === secondLife),
    true,
  );
});

test("When Attacking target selection resumes battle after selecting no target", () => {
  const state = setupAttackState();
  installWhenAttackingConditionalPowerReduction(state);
  addTrashCards(state, 10);
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  assert.equal(opened.state.pendingDecision?.type, "selectTargets");

  const resolved = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: must(opened.state.pendingDecision, "pending decision").id,
    response: { type: "targets", targets: [] },
  });

  assert.equal(resolved.errors, undefined);
  const passed = passCounterStep(resolved.state, p2);
  assert.equal(passed.errors, undefined);
  assert.equal(passed.state.pendingDecision, undefined);
  assert.equal(passed.state.battle, undefined);
});

test("When Attacking target selection resumes into defender On Your Opponent's Attack timing", () => {
  const state = setupAttackState();
  installWhenAttackingConditionalPowerReduction(state);
  addTrashCards(state, 10);
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const defenderDefinition = withOnOpponentAttackDrawEffect(
    state,
    p2State.leader,
    "def-after-paused-when-attacking",
  );
  defenderDefinition.metadata.effectDefinitionsVersion = "test";
  state.cardManifest.effectDefinitionsVersion = "test";
  const defenderEffect = must(
    defenderDefinition.effects[0],
    "defender On Opponent Attack effect",
  );
  ensureDeckHasAtLeast(state, p2, 2);
  const beforeDefenderHand = p2State.hand.length;

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  assert.equal(opened.state.pendingDecision?.type, "selectTargets");

  const resolved = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: must(opened.state.pendingDecision, "pending decision").id,
    response: { type: "targets", targets: [] },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.battle?.step, "counter");
  assert.equal(resolved.state.pendingDecision?.type, "selectCards");
  assert.equal(resolved.state.pendingDecision.playerId, p2);
  assert.equal(
    must(resolved.state.players[p2], "resolved p2").hand.length,
    beforeDefenderHand + 1,
  );

  const attackerResolvedIndex = resolved.events.findIndex((event) => {
    const payload = event.payload as Partial<{ effectBlockId: string }>;
    return (
      event.type === "effectResolved" &&
      payload.effectBlockId === "when-attacking-power-reduction"
    );
  });
  const defenderQueuedIndex = resolved.events.findIndex((event) => {
    const payload = event.payload as Partial<{ effectBlockId: string }>;
    return (
      event.type === "effectQueued" &&
      payload.effectBlockId === defenderEffect.id
    );
  });
  const defenderResolvedIndex = resolved.events.findIndex((event) => {
    const payload = event.payload as Partial<{ effectBlockId: string }>;
    return (
      event.type === "effectResolved" &&
      payload.effectBlockId === defenderEffect.id
    );
  });
  const counterDecisionIndex = resolved.events.findIndex(
    (event) => event.type === "decisionCreated",
  );

  assert.notEqual(attackerResolvedIndex, -1);
  assert.notEqual(defenderQueuedIndex, -1);
  assert.notEqual(defenderResolvedIndex, -1);
  assert.notEqual(counterDecisionIndex, -1);
  assert.ok(attackerResolvedIndex < defenderQueuedIndex);
  assert.ok(defenderQueuedIndex < defenderResolvedIndex);
  assert.ok(defenderResolvedIndex < counterDecisionIndex);
});

test("When Attacking target selection resumes battle after selecting a target", () => {
  const state = setupAttackState();
  installWhenAttackingConditionalPowerReduction(state);
  addTrashCards(state, 10);
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const powerTarget = must(p2State.characters[0], "power target");

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  assert.equal(opened.state.pendingDecision?.type, "selectTargets");

  const resolved = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: must(opened.state.pendingDecision, "pending decision").id,
    response: { type: "targets", targets: [cardRef(powerTarget, p2)] },
  });

  assert.equal(resolved.errors, undefined);
  const passed = passCounterStep(resolved.state, p2);
  assert.equal(passed.errors, undefined);
  assert.equal(passed.state.pendingDecision, undefined);
  assert.equal(passed.state.battle, undefined);
});

test("When Attacking top-or-bottom placement resumes battle after ordering", () => {
  const state = setupAttackState();
  installWhenAttackingTopDeckPlacement(state);
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  while (p1State.deck.length < 2) {
    const base = must(p1State.deck.at(-1), "deck card");
    p1State.deck.push({
      ...base,
      instanceId:
        `${String(base.instanceId)}:${String(p1State.deck.length)}` as never,
      zone: { ...base.zone, index: p1State.deck.length },
    });
  }

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  assert.equal(opened.state.pendingDecision?.type, "orderCards");
  const decision = must(opened.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "orderCards");
  const first = must(decision.cards[0], "first looked card");
  const second = must(decision.cards[1], "second looked card");

  const resolved = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "topBottomPlacement",
      topIds: [],
      bottomIds: [String(second.instanceId), String(first.instanceId)],
    },
  });

  assert.equal(resolved.errors, undefined);
  const passed = passCounterStep(resolved.state, p2);
  assert.equal(passed.errors, undefined);
  assert.equal(passed.state.pendingDecision, undefined);
  assert.equal(passed.state.battle, undefined);
});

test("When Attacking search reveal resumes battle after choosing a card", () => {
  const state = setupAttackState();
  installWhenAttackingSearchReveal(state);
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  assert.equal(opened.state.pendingDecision?.type, "selectCards");
  const decision = must(opened.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectCards");
  const candidate = must(decision.candidates[0], "candidate").card;

  const resolved = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [candidate] },
  });

  assert.equal(resolved.errors, undefined);
  let afterSearch = resolved.state;
  if (afterSearch.pendingDecision?.type === "orderCards") {
    const order = afterSearch.pendingDecision;
    const ordered = applyAction(afterSearch, {
      type: "respondToDecision",
      decisionId: order.id,
      response: {
        type: "orderedIds",
        ids: order.cards.map((card) => String(card.instanceId)),
      },
    });
    assert.equal(ordered.errors, undefined);
    afterSearch = ordered.state;
  }
  const passed = passCounterStep(afterSearch, p2);
  assert.equal(passed.errors, undefined);
  assert.equal(passed.state.pendingDecision, undefined);
  assert.equal(passed.state.battle, undefined);
});
