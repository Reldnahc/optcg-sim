import assert from "node:assert/strict";
import { test } from "vitest";

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
import { passCounterStep, setupAttackState } from "./test-fixtures.js";
import {
  addTrashMarker,
  continuousKeywordEffectRecord,
} from "./test-fixtures.js";

test("banish attacker dealing leader damage moves top life to trash instead of hand", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const expectedLifeCard = must(p2State.life[0], "top life").card.instanceId;
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    printedKeywords: ["banish"],
  };

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
    must(result.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === expectedLifeCard,
    ),
    true,
  );
  assert.equal(
    must(result.state.players[p2], "p2").hand.some(
      (card) => card.instanceId === expectedLifeCard,
    ),
    false,
  );
});

test("conditional continuous banish grant moves leader damage life to trash", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const expectedLifeCard = must(p2State.life[0], "top life").card.instanceId;
  addTrashMarker(state, p1);
  state.continuousEffects = [
    continuousKeywordEffectRecord(
      state,
      "conditional-banish-grant",
      attacker,
      "banish",
      {
        condition: { type: "trashCount", player: "self", op: "gte", value: 1 },
      },
    ),
  ];

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
  const result = passCounterStep(opened.state, p2);
  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === expectedLifeCard,
    ),
    true,
  );
  assert.equal(
    must(result.state.players[p2], "p2").hand.some(
      (card) => card.instanceId === expectedLifeCard,
    ),
    false,
  );
});

test("banish leader damage reindexes life and trash zones deterministically", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    printedKeywords: ["banish"],
  };

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
  const nextP2 = must(result.state.players[p2], "next p2");
  assert.deepEqual(
    nextP2.life.map((lifeCard) => lifeCard.card.zone),
    nextP2.life.map((_, index) => ({
      zone: "life",
      playerId: p2,
      slot: "life",
      index,
    })),
  );
  assert.deepEqual(
    nextP2.trash.map((card) => card.zone),
    nextP2.trash.map((_, index) => ({
      zone: "trash",
      playerId: p2,
      slot: "trash",
      index,
    })),
  );
});

test("banish public cardMoved event does not expose life card identity and private event does", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    printedKeywords: ["banish"],
  };

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
  assert.equal(
    "cardId" in (publicCardMoved.payload as Record<string, unknown>),
    false,
  );
  assert.ok(privateCardMoved !== undefined);
  assert.equal(privateCardMoved.visibility.type, "private");
  assert.equal(privateCardMoved.visibility.playerId, p2);
  assert.equal(
    "instanceId" in (privateCardMoved.payload as Record<string, unknown>),
    true,
  );
});

test("banish damage on trigger life card does not create life trigger decision", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  p2State.life[0] = {
    ...topLife,
    card: { ...topLife.card, cardId: toCardId("trigger-life") },
  };
  state.cardManifest.cards[toCardId("trigger-life")] = {
    ...resolvedCard({
      cardId: toCardId("trigger-life"),
      category: "character",
      power: 1000,
    }),
    triggerText: "TRIGGER: do a thing",
  };
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    printedKeywords: ["banish"],
  };

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
  assert.equal(result.decisions, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(
    must(result.state.players[p2], "p2").trash.some(
      (card) => card.cardId === toCardId("trigger-life"),
    ),
    true,
  );
});

test("banish attacker with pending runtime queue or deferred trigger fails closed without mutation", () => {
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
    state.cardManifest.cards[p1State.leader.cardId] = {
      ...resolvedCard({
        cardId: p1State.leader.cardId,
        category: "leader",
        power: 5000,
      }),
      printedKeywords: ["banish"],
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
    state.effectQueue = [{ id: "queued-effect-banish" } as never];
  });
  run((state) => {
    state.deferredTriggers = [{ timingWindowId: "window-banish" } as never];
  });
});

test("banish attacker with replacement metadata fails closed without mutation", () => {
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
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    printedKeywords: ["banish"],
  };
  state.replacementState.push({
    processId: "replacement-process-banish",
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

test("banish attacker with unsupported blocker metadata fails closed without mutation", () => {
  const runBlockStep = () => {
    const state = setupAttackState();
    const p1State = must(state.players[p1], "p1");
    const p2State = must(state.players[p2], "p2");
    state.cardManifest.cards[p1State.leader.cardId] = {
      ...resolvedCard({
        cardId: p1State.leader.cardId,
        category: "leader",
        power: 5000,
      }),
      printedKeywords: ["banish"],
    };
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
    const before = JSON.stringify(state);

    const result = resolveSupportedVanillaBattle(state);

    assert.equal(result.errors?.[0]?.type, "illegalAction");
    assert.deepEqual(result.events, []);
    assert.equal(JSON.stringify(state), before);
    assert.equal(JSON.stringify(result.state), before);
  };

  const runBlockerMetadata = () => {
    const state = setupAttackState();
    const p1State = must(state.players[p1], "p1");
    const p2State = must(state.players[p2], "p2");
    state.cardManifest.cards[p1State.leader.cardId] = {
      ...resolvedCard({
        cardId: p1State.leader.cardId,
        category: "leader",
        power: 5000,
      }),
      printedKeywords: ["banish"],
    };
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
      blocker: {
        instanceId: p2State.leader.instanceId,
        cardId: p2State.leader.cardId,
        playerId: p2,
      },
    };
    const before = JSON.stringify(state);

    const result = resolveSupportedVanillaBattle(state);

    assert.equal(result.errors?.[0]?.type, "illegalAction");
    assert.deepEqual(result.events, []);
    assert.equal(JSON.stringify(state), before);
    assert.equal(JSON.stringify(result.state), before);
  };

  runBlockStep();
  runBlockerMetadata();
});
