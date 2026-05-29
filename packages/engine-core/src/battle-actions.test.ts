import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import { applyAction } from "./actions.js";
import {
  applyDeclareAttack,
  resolveSupportedVanillaBattle,
} from "./battle-actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "./action-test-fixtures.js";
import { cardRef, setupAttackState } from "./battle-actions-test-fixtures.js";

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

test("resolveSupportedVanillaBattle rejects when no active battle", () => {
  const state = setupAttackState();
  const before = JSON.stringify(state);
  const result = resolveSupportedVanillaBattle(state);
  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
});

test("unsupported trigger/blocker/counter windows fail closed without mutation", () => {
  const run = (
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
    assert.equal(result.errors?.[0]?.type, "illegalAction");
    assert.equal(JSON.stringify(state), before);
  };
  run((state) => {
    must(state.players[p2], "p2").life[0] = {
      ...must(must(state.players[p2], "p2").life[0], "life"),
      card: {
        ...must(must(state.players[p2], "p2").life[0], "life").card,
        cardId: toCardId("trigger-life"),
      },
    };
    state.cardManifest.cards[toCardId("trigger-life")] = {
      ...resolvedCard({
        cardId: toCardId("trigger-life"),
        category: "character",
        power: 1000,
      }),
      triggerText: "TRIGGER: do a thing",
    };
  });
  run((state) => {
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

test("banish combined with doubleAttack fails closed without mutation", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    printedKeywords: ["banish", "doubleAttack"],
  };
  const before = JSON.stringify(state);

  const result = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.deepEqual(result.events, []);
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
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.battle, undefined);
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
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.battle, undefined);
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
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.battle, undefined);
});
