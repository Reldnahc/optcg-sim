import assert from "node:assert/strict";
import { test } from "vitest";

import {
  applyDeclareAttack,
  resolveSupportedVanillaBattle,
} from "./actions.js";
import { must, p1, p2 } from "../action-test-fixtures.js";
import {
  cardRef,
  continuousEffectRecord,
  passCounterStep,
  setupAttackState,
} from "./test-fixtures.js";
import { hashCanonicalStateValue } from "../canonical-state.js";

test("supported declareAttack resolves vanilla battle internally without continuation action", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const target = p2State.leader;

  const beforeLifeP1 = p1State.life.length;
  const beforeLifeP2 = p2State.life.length;
  const beforeTrashP1 = p1State.trash.length;
  const beforeTrashP2 = p2State.trash.length;
  const seqBefore = state.seq;
  const actionSeqBefore = state.actionSeq;

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
  assert.equal(opened.stateHash, hashCanonicalStateValue(opened.state));
  assert.equal(must(opened.state.players[p1], "p1").leader.state, "rested");
  assert.equal(opened.state.battle?.step, "counter");
  assert.equal(
    opened.state.pendingDecision?.prompt,
    "Use counter or end step.",
  );
  const result = passCounterStep(opened.state, p2);
  assert.equal(result.errors, undefined);
  assert.equal(result.state.battle, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.decisions, undefined);
  assert.equal(
    opened.events.some((event) => event.type === "attackDeclared"),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "damageDealt"),
    true,
  );
  assert.equal(must(result.state.players[p1], "p1").life.length, beforeLifeP1);
  assert.equal(
    must(result.state.players[p2], "p2").life.length,
    beforeLifeP2 - 1,
  );
  assert.equal(
    must(result.state.players[p1], "p1").trash.length,
    beforeTrashP1,
  );
  assert.equal(
    must(result.state.players[p2], "p2").trash.length,
    beforeTrashP2,
  );
  assert.deepEqual(
    result.state.eventJournal.slice(-result.events.length),
    result.events,
  );
  assert.deepEqual(
    result.events.map((event) => event.seq),
    [...new Set(result.events.map((event) => event.seq))],
  );
  assert.equal(
    opened.state.seq,
    ((seqBefore as number) + 1) as typeof state.seq,
  );
  assert.equal(result.state.actionSeq, actionSeqBefore + 3);
  assert.equal(
    result.events.every(
      (event) => Number(event.createdAtStateSeq) <= Number(result.state.seq),
    ),
    true,
  );
});

test("leader damage at 0 life completes the match for the attacker", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  p2State.life = [];
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
  const opened = resolveSupportedVanillaBattle(state);
  assert.equal(opened.errors, undefined);
  const result = passCounterStep(opened.state, p2);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.state.status, { type: "completed", winner: p1 });
  assert.equal(
    result.events.some((event) => event.type === "gameEnded"),
    true,
  );
});

test("rule-processing checkpoint decks out defending player after accepted mutation", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  p2State.deck = [];

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
  assert.deepEqual(result.state.status, { type: "completed", winner: p1 });
});

test("life orientation uses player.life[0] as next damage card", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const expectedLifeCard = must(p2State.life[0], "top life").card.instanceId;
  const opened = applyDeclareAttack(state, {
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
  assert.equal(opened.errors, undefined);
  const result = passCounterStep(opened.state, p2);
  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p2], "p2").hand.some(
      (card) => card.instanceId === expectedLifeCard,
    ),
    true,
  );
});

test("public life movement events do not expose life card ids, while private event includes details", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const opened = applyDeclareAttack(state, {
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
  assert.equal(opened.errors, undefined);
  const result = passCounterStep(opened.state, p2);
  assert.equal(result.errors, undefined);
  const publicCardMoved = result.events.find(
    (event) => event.type === "cardMoved" && event.visibility.type === "public",
  );
  const privateCardMoved = result.events.find(
    (event) =>
      event.type === "cardMoved" && event.visibility.type === "private",
  );
  assert.ok(publicCardMoved !== undefined);
  assert.equal(
    "instanceId" in (publicCardMoved.payload as Record<string, unknown>),
    false,
  );
  assert.ok(privateCardMoved !== undefined);
  assert.equal(privateCardMoved.visibility.type, "private");
  assert.equal(privateCardMoved.visibility.playerId, p2);
});

test("supported vanilla battle rejects pending runtime queues without mutation or appended events", () => {
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

    assert.deepEqual(result.errors, [
      {
        type: "illegalAction",
        reason:
          "Battle requires unsupported trigger or replacement processing.",
      },
    ]);
    assert.deepEqual(result.events, []);
    assert.equal(JSON.stringify(state), before);
    assert.equal(JSON.stringify(result.state), before);
  };

  run((state) => {
    state.effectQueue = [{ id: "queued-effect" } as never];
  });
  run((state) => {
    state.deferredTriggers = [{ timingWindowId: "window-1" } as never];
  });
});

test("supported continuous power modifiers affect vanilla battle resolution", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  state.cardManifest.cards[attacker.cardId] = {
    ...must(state.cardManifest.cards[attacker.cardId], "attacker metadata"),
    power: 3000,
  };
  state.cardManifest.cards[target.cardId] = {
    ...must(state.cardManifest.cards[target.cardId], "target metadata"),
    power: 5000,
  };
  state.battle = {
    attacker: cardRef(attacker, p1),
    originalTarget: cardRef(target, p2),
    currentTarget: cardRef(target, p2),
    step: "counter",
    damageCount: 1,
  };
  state.continuousEffects = [
    {
      ...continuousEffectRecord(state, "attacker-power-this-battle", {
        type: "thisBattle",
      }),
      source: cardRef(attacker, p1),
      modifier: {
        layer: "powerAdd",
        target: { type: "self" },
        operation: { type: "addPower", value: 3000 },
      },
    },
  ];

  const result = resolveSupportedVanillaBattle(state);

  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p2], "p2").characters.some(
      (card) => card.instanceId === target.instanceId,
    ),
    false,
  );
  assert.equal(
    result.state.continuousEffects.some(
      (effect) => effect.id === "attacker-power-this-battle",
    ),
    false,
  );
});

test("unsupported continuous modifier shapes still fail closed during vanilla battle resolution", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  state.battle = {
    attacker: cardRef(p1State.leader, p1),
    originalTarget: cardRef(p2State.leader, p2),
    currentTarget: cardRef(p2State.leader, p2),
    step: "counter",
    damageCount: 1,
  };
  state.continuousEffects = [
    {
      ...continuousEffectRecord(state, "unsupported-continuous-effect", {
        type: "thisBattle",
      }),
      condition: { type: "yourTurn" },
    },
  ];
  const before = JSON.stringify(state);

  const result = resolveSupportedVanillaBattle(state);

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "Battle requires unsupported combat metadata.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("supported vanilla battle preserves replacement fail-closed behavior", () => {
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
  state.replacementState.push({
    processId: "replacement-process-1",
    type: "damage",
    usedReplacementIds: [],
    payload: { hidden: "contents" },
  });
  const before = JSON.stringify(state);

  const result = resolveSupportedVanillaBattle(state);

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "Battle requires unsupported trigger or replacement processing.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});
