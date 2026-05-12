import assert from "node:assert/strict";
import { test } from "vitest";

import {
  applyDeclareAttack,
  resolveSupportedVanillaBattle,
} from "./battle-actions.js";
import { must, p1, p2, resolvedCard } from "./action-test-fixtures.js";
import { setupAttackState } from "./battle-actions-test-fixtures.js";

const setupLeaderBattleWithDamageCount = (damageCount: number) => {
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
    damageCount,
  };
  return state;
};

test("double attack leader damage processes two life cards sequentially", () => {
  const state = setupLeaderBattleWithDamageCount(2);
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life").card.instanceId;
  const secondLife = must(p2State.life[1], "second life").card.instanceId;
  const beforeLife = p2State.life.length;
  const beforeHand = p2State.hand.length;

  const result = resolveSupportedVanillaBattle(state);

  assert.equal(result.errors, undefined);
  const nextP2 = must(result.state.players[p2], "p2");
  assert.equal(nextP2.life.length, beforeLife - 2);
  assert.equal(nextP2.hand.length, beforeHand + 2);
  assert.equal(nextP2.hand[0]?.instanceId, secondLife);
  assert.equal(nextP2.hand[1]?.instanceId, topLife);
  const movementEvents = result.events.filter(
    (event) =>
      event.type === "cardMoved" && event.visibility.type === "private",
  );
  assert.equal(movementEvents.length >= 2, true);
  const firstMove = movementEvents[0];
  const secondMove = movementEvents[1];
  assert.equal(
    (firstMove?.payload as { instanceId: string }).instanceId,
    topLife,
  );
  assert.equal(
    (secondMove?.payload as { instanceId: string }).instanceId,
    secondLife,
  );
  const damageAndLifeEvents = result.events
    .filter(
      (event) => event.type === "damageDealt" || event.type === "lifeTaken",
    )
    .map((event) => event.type);
  assert.deepEqual(damageAndLifeEvents, [
    "damageDealt",
    "lifeTaken",
    "damageDealt",
    "lifeTaken",
  ]);
});

test("damageCount values other than one or two fail closed without mutation", () => {
  for (const damageCount of [0, 3]) {
    const state = setupLeaderBattleWithDamageCount(damageCount);
    const before = JSON.stringify(state);

    const result = resolveSupportedVanillaBattle(state);

    assert.deepEqual(result.errors, [
      {
        type: "illegalAction",
        reason:
          "Battle requires unsupported blocker, step, or multi-damage behavior.",
      },
    ]);
    assert.deepEqual(result.events, []);
    assert.equal(JSON.stringify(state), before);
    assert.equal(JSON.stringify(result.state), before);
  }
});

test("supported doubleAttack declareAttack against leader applies two damage points", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const target = p2State.leader;
  const doubleAttackCard = resolvedCard({
    cardId: attacker.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[attacker.cardId] = {
    ...doubleAttackCard,
    support: {
      ...doubleAttackCard.support,
      status: "implemented-dsl",
    },
    printedKeywords: ["doubleAttack"],
  };
  const beforeLife = p2State.life.length;

  const result = applyDeclareAttack(state, {
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

  assert.equal(result.errors, undefined);
  const nextP2 = must(result.state.players[p2], "p2");
  assert.equal(nextP2.life.length, beforeLife - 2);
  assert.equal(
    result.events.filter((event) => event.type === "damageDealt").length,
    2,
  );
});
