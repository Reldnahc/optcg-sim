import assert from "node:assert/strict";
import { test } from "vitest";

import type { EngineResult } from "@optcg/types";

import { applyDeclareAttack } from "./actions.js";
import { applyAction, getLegalActions } from "../actions.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import {
  addTrashMarker,
  cardRef,
  continuousKeywordEffectRecord,
  effectDefinition,
  passCounterStep,
  setupAttackState,
} from "./test-fixtures.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";

const installSupportedDoubleAttackLeader = (
  state: ReturnType<typeof setupAttackState>,
) => {
  const p1State = must(state.players[p1], "p1");
  const attacker = p1State.leader;
  const doubleAttackCard = resolvedCard({
    cardId: attacker.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[attacker.cardId] = {
    ...doubleAttackCard,
    printedKeywords: ["doubleAttack"],
  };
};

const installWhenAttackingDoubleAttackGrant = (
  state: ReturnType<typeof setupAttackState>,
) => {
  const p1State = must(state.players[p1], "p1");
  const attacker = p1State.leader;
  const definition = effectDefinition(
    attacker.cardId,
    { type: "whenAttacking" },
    {
      type: "giveKeyword",
      target: { type: "self" },
      keyword: "doubleAttack",
      duration: { type: "thisTurn" },
    },
  );
  const effectDefinitionId = "def-when-attacking-double-attack";
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "leader",
    power: 5000,
    effectText:
      "[When Attacking] This Leader gains [Double Attack] during this turn.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
};

const assertAcceptedHash = (result: EngineResult): void => {
  assert.equal(result.errors, undefined);
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
};

const resolveNoTriggerLifeDamageDecisions = (
  result: EngineResult,
): EngineResult => {
  let current = result;
  let events = [...result.events];
  for (let guard = 0; guard < 5; guard += 1) {
    const decision = current.state.pendingDecision;
    if (decision?.type !== "confirmLifeTrigger") {
      return { ...current, events };
    }
    const triggerText =
      current.state.cardManifest.cards[decision.card.cardId]?.triggerText;
    if (triggerText !== undefined && triggerText.trim().length > 0) {
      return { ...current, events };
    }
    const next = applyAction(current.state, {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "lifeTrigger", choice: "addToHand" },
    });
    assertAcceptedHash(next);
    events = [...events, ...next.events];
    current = next;
  }
  assert.fail("too many no-trigger life damage decisions");
};

test("supported doubleAttack declareAttack against leader applies two damage points", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const target = p2State.leader;
  installSupportedDoubleAttackLeader(state);
  const beforeLife = p2State.life.length;

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });

  assert.equal(opened.errors, undefined);
  const result = resolveNoTriggerLifeDamageDecisions(
    passCounterStep(opened.state, p2),
  );
  assertAcceptedHash(result);
  const nextP2 = must(result.state.players[p2], "p2");
  assert.equal(nextP2.life.length, beforeLife - 2);
  assert.equal(
    result.events.filter((event) => event.type === "damageDealt").length,
    2,
  );
});

test("conditional continuous doubleAttack grant applies two leader damage points", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  addTrashMarker(state, p1);
  state.continuousEffects = [
    continuousKeywordEffectRecord(
      state,
      "conditional-double-attack-grant",
      attacker,
      "doubleAttack",
      {
        condition: { type: "trashCount", player: "self", op: "gte", value: 1 },
      },
    ),
  ];
  const beforeLife = p2State.life.length;

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });

  assert.equal(opened.errors, undefined);
  const result = resolveNoTriggerLifeDamageDecisions(
    passCounterStep(opened.state, p2),
  );
  assert.equal(result.errors, undefined);
  assertAcceptedHash(result);
  assert.equal(
    must(result.state.players[p2], "p2").life.length,
    beforeLife - 2,
  );
  assert.equal(
    result.events.filter((event) => event.type === "damageDealt").length,
    2,
  );
});

test("When Attacking doubleAttack grant applies two leader damage points", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const target = p2State.leader;
  installWhenAttackingDoubleAttackGrant(state);
  const beforeLife = p2State.life.length;

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });

  assert.equal(opened.errors, undefined);
  assert.equal(opened.state.battle?.damageCount, 1);
  const result = resolveNoTriggerLifeDamageDecisions(
    passCounterStep(opened.state, p2),
  );
  assert.equal(result.errors, undefined);
  assertAcceptedHash(result);
  assert.equal(
    must(result.state.players[p2], "p2").life.length,
    beforeLife - 2,
  );
  assert.equal(
    result.events.filter((event) => event.type === "damageDealt").length,
    2,
  );
});

test("getLegalActions exposes supported doubleAttack declareAttack against leader", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  installSupportedDoubleAttackLeader(state);

  const legal = getLegalActions(state, p1);

  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === p1State.leader.instanceId &&
        action.target.instanceId === p2State.leader.instanceId,
    ),
    true,
  );
});

test("supported doubleAttack attack can be redirected by blocker and resolves as character battle", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const blocker = must(p2State.characters[0], "p2 blocker");
  blocker.state = "active";
  state.cardManifest.cards[blocker.cardId] = {
    ...resolvedCard({
      cardId: blocker.cardId,
      category: "character",
      power: 3000,
    }),
    printedKeywords: ["blocker"],
  };
  installSupportedDoubleAttackLeader(state);
  const beforeLife = p2State.life.length;

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.equal(opened.errors, undefined);
  const decision = must(opened.state.pendingDecision, "block decision");
  assert.equal(decision.type, "selectCards");
  assert.deepEqual(decision.candidates, [
    {
      card: cardRef(blocker, p2),
      visibility: { type: "public" },
    },
  ]);

  const blocked = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [cardRef(blocker, p2)] },
  });

  assert.equal(blocked.errors, undefined);
  assert.equal(
    blocked.events.some((event) => event.type === "blockerActivated"),
    true,
  );
  const result = passCounterStep(blocked.state, p2);
  assertAcceptedHash(result);
  const nextP2 = must(result.state.players[p2], "p2 result");
  assert.equal(nextP2.life.length, beforeLife);
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === blocker.instanceId),
    true,
  );
});

test("getLegalActions exposes supported doubleAttack leader attack even when blocker is available", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const blocker = must(p2State.characters[0], "p2 blocker");
  blocker.state = "active";
  state.cardManifest.cards[blocker.cardId] = {
    ...resolvedCard({
      cardId: blocker.cardId,
      category: "character",
      power: 3000,
    }),
    printedKeywords: ["blocker"],
  };
  installSupportedDoubleAttackLeader(state);

  const legal = getLegalActions(state, p1);

  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === p1State.leader.instanceId &&
        action.target.instanceId === p2State.leader.instanceId,
    ),
    true,
  );
});
