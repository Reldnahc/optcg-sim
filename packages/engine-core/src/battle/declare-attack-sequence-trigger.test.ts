import assert from "node:assert/strict";
import { test } from "vitest";

import type { PlayerId } from "@optcg/types";

import { applyAction, getLegalActions } from "../actions.js";
import { applyDeclareAttack } from "./actions.js";
import {
  setupAttackState,
  withWhenAttackingDrawEffect,
} from "./test-fixtures.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import { filterStateForPlayer } from "../filter-state-for-player.js";
import { must, p1, p2 } from "../action-test-fixtures.js";

const ensureDeckHasAtLeast = (
  state: ReturnType<typeof setupAttackState>,
  playerId: PlayerId,
  count: number,
) => {
  const player = must(state.players[playerId], "deck owner");
  if (player.deck.length >= count) {
    return;
  }
  const needed = count - player.deck.length;
  const moved = player.hand.slice(0, needed).map((card, index) => ({
    ...card,
    zone: {
      zone: "deck" as const,
      playerId,
      slot: "deck" as const,
      index: player.deck.length + index,
    },
  }));
  player.deck = [...player.deck, ...moved];
  player.hand = player.hand.slice(needed).map((card, index) => ({
    ...card,
    zone: { zone: "hand" as const, playerId, slot: "hand" as const, index },
  }));
};

test("CARD-009D: attacker When Attacking draw-then-trash queues and opens private trash decision after draw", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const definition = withWhenAttackingDrawEffect(state, p1State.leader);
  const effect = must(definition.effects[0], "When Attacking effect");
  effect.oncePerTurn = true;
  effect.effect = {
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "draw",
          count: 2,
          player: "self",
        },
      },
      {
        connector: "then",
        effect: {
          type: "trashFromHand",
          count: 1,
          player: "self",
          chooser: "self",
        },
      },
    ],
  };
  ensureDeckHasAtLeast(state, p1, 3);
  const beforeP1Hand = p1State.hand.length;
  const beforeP1Deck = p1State.deck.length;

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

  assert.equal(result.errors, undefined);
  const decision = must(result.state.pendingDecision, "trash decision");
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.playerId, p1);
  assert.equal(decision.visibility.type, "private");
  assert.equal(decision.visibility.playerId, p1);
  assert.equal(
    must(result.state.players[p1], "result p1").hand.length,
    beforeP1Hand + 2,
  );
  assert.equal(
    must(result.state.players[p1], "result p1").deck.length,
    beforeP1Deck - 2,
  );
  assert.equal(result.state.effectQueue.length, 1);
  const queued = must(result.state.effectQueue[0], "queued effect");
  assert.equal(queued.effectBlockId, effect.id);
  assert.equal(queued.controllerId, p1);
  assert.equal(queued.source.instanceId, p1State.leader.instanceId);
  assert.equal(queued.sourcePresencePolicy, "mustRemainInSameZone");
  assert.equal(queued.orderingGroup, "turnPlayer");
  const attackDeclaredIndex = result.events.findIndex(
    (event) => event.type === "attackDeclared",
  );
  const effectQueuedIndex = result.events.findIndex(
    (event) => event.type === "effectQueued",
  );
  const drawIndex = result.events.findIndex(
    (event) => event.type === "cardDrawn",
  );
  const decisionIndex = result.events.findIndex(
    (event) => event.type === "decisionCreated",
  );
  assert.notEqual(attackDeclaredIndex, -1);
  assert.notEqual(effectQueuedIndex, -1);
  assert.notEqual(drawIndex, -1);
  assert.notEqual(decisionIndex, -1);
  assert.ok(attackDeclaredIndex < effectQueuedIndex);
  assert.ok(effectQueuedIndex < drawIndex);
  assert.ok(drawIndex < decisionIndex);
});

test("CARD-009D: draw-then-trash trash decision response trashes selected card and remains deterministic", () => {
  const run = () => {
    const state = setupAttackState();
    const p1State = must(state.players[p1], "p1");
    const p2State = must(state.players[p2], "p2");
    const definition = withWhenAttackingDrawEffect(
      state,
      p1State.leader,
      "def-card-009d-deterministic",
    );
    const effect = must(definition.effects[0], "When Attacking effect");
    effect.effect = {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: { type: "draw", count: 1, player: "self" },
        },
        {
          connector: "then",
          effect: {
            type: "trashFromHand",
            count: 1,
            player: "self",
            chooser: "self",
          },
        },
      ],
    };
    ensureDeckHasAtLeast(state, p1, 2);
    const declared = applyDeclareAttack(state, {
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
    assert.equal(declared.errors, undefined);
    const decision = must(declared.state.pendingDecision, "trash decision");
    assert.equal(decision.type, "selectCards");
    const card = must(decision.candidates[0], "trash candidate").card;
    const resolved = applyAction(declared.state, {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [card] },
    });
    assert.equal(resolved.errors, undefined);
    assert.equal(resolved.state.effectQueue.length, 0);
    assert.notEqual(resolved.state.battle?.step, "attack");
    if (resolved.state.battle !== undefined) {
      assert.ok(
        resolved.state.battle.step === "block" ||
          resolved.state.battle.step === "counter",
      );
      assert.equal(resolved.state.pendingDecision?.type, "selectCards");
      assert.equal(
        getLegalActions(resolved.state, p2).some(
          (legalAction) => legalAction.type === "respondToDecision",
        ),
        true,
      );
    } else {
      assert.equal(resolved.state.pendingDecision, undefined);
      assert.equal(
        getLegalActions(resolved.state, p1).some(
          (legalAction) => legalAction.type !== "concede",
        ),
        true,
      );
    }
    assert.equal(
      resolved.events.some((event) => event.type === "cardTrashed"),
      true,
    );
    return {
      declared,
      resolved,
      declaredHash: hashCanonicalStateValue(declared.state),
      resolvedHash: hashCanonicalStateValue(resolved.state),
    };
  };

  const first = run();
  const second = run();
  assert.deepEqual(
    first.declared.events.map((event) => event.type),
    second.declared.events.map((event) => event.type),
  );
  assert.deepEqual(
    first.resolved.events.map((event) => event.type),
    second.resolved.events.map((event) => event.type),
  );
  assert.equal(first.declared.stateHash, first.declaredHash);
  assert.equal(second.declared.stateHash, second.declaredHash);
  assert.equal(first.resolved.stateHash, first.resolvedHash);
  assert.equal(second.resolved.stateHash, second.resolvedHash);
  assert.equal(first.resolvedHash, second.resolvedHash);
});

test("CARD-009D: non-chooser filtered view hides private trash decision details", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const definition = withWhenAttackingDrawEffect(state, p1State.leader);
  const effect = must(definition.effects[0], "When Attacking effect");
  effect.effect = {
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: { type: "draw", count: 1, player: "self" },
      },
      {
        connector: "then",
        effect: {
          type: "trashFromHand",
          count: 1,
          player: "self",
          chooser: "self",
        },
      },
    ],
  };
  ensureDeckHasAtLeast(state, p1, 2);

  const declared = applyDeclareAttack(state, {
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

  assert.equal(declared.errors, undefined);
  const chooserView = filterStateForPlayer(declared.state, p1);
  const nonChooserView = filterStateForPlayer(declared.state, p2);
  assert.equal(chooserView.pendingDecision?.type, "selectCards");
  assert.equal(nonChooserView.pendingDecision, undefined);
});

test("CARD-009D: unsupported whenAttacking sequence shape still fails closed", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const definition = withWhenAttackingDrawEffect(state, p1State.leader);
  const effect = must(definition.effects[0], "When Attacking effect");
  effect.effect = {
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: { type: "draw", count: 1, player: "self" },
      },
      {
        connector: "then",
        effect: {
          type: "trashFromHand",
          count: 1,
          player: "self",
          chooser: "opponent",
        },
      },
    ],
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

  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "when-attacking-trigger-queueing",
      details: { reason: "unsupported-when-attacking-definition" },
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("CARD-009D: zero-draw whenAttacking sequence still fails closed", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const definition = withWhenAttackingDrawEffect(state, p1State.leader);
  const effect = must(definition.effects[0], "When Attacking effect");
  effect.effect = {
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: { type: "draw", count: 0, player: "self" },
      },
      {
        connector: "then",
        effect: {
          type: "trashFromHand",
          count: 1,
          player: "self",
          chooser: "self",
        },
      },
    ],
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

  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "when-attacking-trigger-queueing",
      details: { reason: "unsupported-when-attacking-definition" },
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});
