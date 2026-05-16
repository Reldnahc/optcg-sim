import assert from "node:assert/strict";
import { test } from "vitest";

import { applyAction } from "./actions.js";
import { applyDeclareAttack } from "./battle-actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "./action-test-fixtures.js";
import {
  cardRef,
  setupAttackState,
  setupOpenedBlockStepDecision,
  setupOpenedCharacterTargetBlockStepDecision,
} from "./battle-actions-test-fixtures.js";

test("applyDeclareAttack enters block step and opens defender decline decision when defender has would-be legal blocker", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const defenderBlocker = must(p2State.characters[0], "defender blocker");
  defenderBlocker.state = "active";
  state.cardManifest.cards[defenderBlocker.cardId] = {
    ...resolvedCard({
      cardId: defenderBlocker.cardId,
      category: "character",
      power: 3000,
    }),
    printedKeywords: ["blocker"],
  };
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
  const battle = must(result.state.battle, "block step battle");
  assert.equal(battle.step, "block");
  assert.equal(battle.blocker, undefined);
  assert.deepEqual(result.state.pendingDecision, {
    id: must(result.state.pendingDecision, "pending decision").id,
    type: "selectCards",
    playerId: p2,
    prompt: "Choose blocker or decline.",
    causedBy: must(result.state.pendingDecision, "pending decision").causedBy,
    visibility: { type: "public" },
    request: {
      timing: "onActivation",
      chooser: "nonTurnPlayer",
      player: "nonTurnPlayer",
      zone: "characterArea",
      filter: { categories: ["character"] },
      min: 0,
      max: 1,
      allowFewerIfUnavailable: true,
      visibility: "public",
    },
    candidates: [
      {
        card: cardRef(defenderBlocker, p2),
        visibility: { type: "public" },
      },
    ],
    defaultResponse: { type: "cards", cards: [] },
  });
  assert.equal(
    must(result.state.pendingDecision, "pending decision").causedBy.type,
    "playerAction",
  );
  const decisionCreated = result.events.find(
    (event) => event.type === "decisionCreated",
  );
  const createdEvent = must(decisionCreated, "decisionCreated event");
  assert.deepEqual(createdEvent.visibility, { type: "public" });
  assert.deepEqual(createdEvent.payload, {
    decisionId: must(result.state.pendingDecision, "pending decision").id,
    decisionType: "selectCards",
    playerId: p2,
  });
  assert.deepEqual(
    result.events.map((event) => event.seq),
    [
      state.eventJournal.length + 1,
      state.eventJournal.length + 2,
      state.eventJournal.length + 3,
    ],
  );
  const replay = applyDeclareAttack(structuredClone(state), {
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
  assert.equal(result.stateHash, replay.stateHash);
  assert.deepEqual(result.events, replay.events);
});

test("empty block-step respondToDecision declines and resumes existing no-block battle resolution path", () => {
  const { opened, decision: pending } = setupOpenedBlockStepDecision();

  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: pending.id,
    response: { type: "cards", cards: [] },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.battle, undefined);
  assert.equal(result.state.actionSeq, opened.state.actionSeq + 1);
  assert.equal(
    result.events.some((event) => event.type === "decisionResolved"),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "damageDealt"),
    true,
  );
  const decisionResolved = result.events.find(
    (event) => event.type === "decisionResolved",
  );
  const resolvedEvent = must(decisionResolved, "decisionResolved event");
  assert.deepEqual(resolvedEvent.visibility, { type: "public" });
  assert.deepEqual(resolvedEvent.payload, {
    decisionId: pending.id,
    playerId: p2,
  });
  assert.equal(result.events[0]?.type, "decisionResolved");
  const replay = applyAction(structuredClone(opened.state), {
    type: "respondToDecision",
    decisionId: pending.id,
    response: { type: "cards", cards: [] },
  });
  assert.equal(result.stateHash, replay.stateHash);
  assert.deepEqual(result.events, replay.events);
});

test("blocker selection response K.O.s blocker, clears battle, and preserves original Leader life", () => {
  const { opened, p2State, defenderBlocker, decision } =
    setupOpenedBlockStepDecision();
  const originalTarget = cardRef(p2State.leader, p2);
  const blocker = cardRef(defenderBlocker, p2);
  const beforeLife = p2State.life.length;

  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [blocker] },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.actionSeq, opened.state.actionSeq + 1);
  assert.equal(result.state.battle, undefined);
  assert.equal(must(result.state.players[p2], "p2").life.length, beforeLife);
  assert.equal(
    must(result.state.players[p2], "p2").characters.some(
      (character) => character.instanceId === defenderBlocker.instanceId,
    ),
    false,
  );
  assert.equal(
    must(result.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === defenderBlocker.instanceId,
    ),
    true,
  );
  assert.deepEqual(
    result.events.map((event) => ({
      type: event.type,
      payload: event.payload,
      visibility: event.visibility,
    })),
    [
      {
        type: "decisionResolved",
        payload: { decisionId: decision.id, playerId: p2 },
        visibility: { type: "public" },
      },
      {
        type: "blockerActivated",
        payload: {
          blocker,
          previousTarget: originalTarget,
          currentTarget: blocker,
        },
        visibility: { type: "public" },
      },
      {
        type: "damageDealt",
        payload: {
          attacker: opened.state.battle?.attacker.instanceId,
          target: blocker.instanceId,
          amount: 1,
        },
        visibility: { type: "public" },
      },
      {
        type: "cardKOd",
        payload: { playerId: p2, instanceId: blocker.instanceId },
        visibility: { type: "public" },
      },
      {
        type: "cardMoved",
        payload: {
          from: defenderBlocker.zone,
          to: {
            zone: "trash",
            playerId: p2,
            slot: "trash",
            index: 0,
          },
          reason: "ko",
        },
        visibility: { type: "public" },
      },
      {
        type: "effectResolved",
        payload: { systemStep: "endBattle", battleCleared: true },
        visibility: { type: "replayOnly" },
      },
      {
        type: "ruleProcessingChecked",
        payload: { phase: "main", result: "ok" },
        visibility: { type: "replayOnly" },
      },
    ],
  );
});

test("attached DON!! returns rested when a blocker is K.O.'d", () => {
  const { opened, defenderBlocker, decision } = setupOpenedBlockStepDecision();
  const openedP2 = must(opened.state.players[p2], "opened p2");
  const don = must(openedP2.donDeck[0], "p2 don");
  openedP2.donDeck = openedP2.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p2, slot: "donDeck", index },
  }));
  openedP2.costArea = [
    {
      ...don,
      zone: { zone: "costArea", playerId: p2, slot: "cost", index: 0 },
      state: "active",
    },
  ];
  const openedBlocker = must(openedP2.characters[0], "opened blocker");
  openedP2.characters[0] = {
    ...openedBlocker,
    attachedDon: [don.instanceId],
  };
  const blocker = cardRef(defenderBlocker, p2);

  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [blocker] },
  });

  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p2], "p2").costArea.find(
      (card) => card.instanceId === don.instanceId,
    )?.state,
    "rested",
  );
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "donReturned" &&
        (event.payload as { donInstanceId?: unknown }).donInstanceId ===
          don.instanceId &&
        event.visibility.type === "replayOnly",
    ),
    true,
  );
});

test("original Character target is not K.O.'d after being blocked", () => {
  const { opened, originalTarget, defenderBlocker, decision } =
    setupOpenedCharacterTargetBlockStepDecision();
  const blocker = cardRef(defenderBlocker, p2);

  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [blocker] },
  });

  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p2], "p2").characters.some(
      (character) => character.instanceId === originalTarget.instanceId,
    ),
    true,
  );
  assert.equal(
    must(result.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === originalTarget.instanceId,
    ),
    false,
  );
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "cardKOd" &&
        (event.payload as { instanceId?: unknown }).instanceId ===
          originalTarget.instanceId,
    ),
    false,
  );
});

test("lower-power attack into blocker clears battle without K.O. or Life movement", () => {
  const context = setupOpenedBlockStepDecision();
  context.opened.state.cardManifest.cards[toCardId("leader-red")] =
    resolvedCard({
      cardId: toCardId("leader-red"),
      category: "leader",
      power: 2000,
    });
  context.opened.state.cardManifest.cards[context.defenderBlocker.cardId] = {
    ...resolvedCard({
      cardId: context.defenderBlocker.cardId,
      category: "character",
      power: 7000,
    }),
    printedKeywords: ["blocker"],
  };
  const blocker = cardRef(context.defenderBlocker, p2);
  const beforeLife = must(context.opened.state.players[p2], "p2").life.length;

  const result = applyAction(context.opened.state, {
    type: "respondToDecision",
    decisionId: context.decision.id,
    response: { type: "cards", cards: [blocker] },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.battle, undefined);
  assert.equal(must(result.state.players[p2], "p2").life.length, beforeLife);
  assert.equal(
    must(result.state.players[p2], "p2").characters.some(
      (character) => character.instanceId === blocker.instanceId,
    ),
    true,
  );
  assert.equal(
    result.events.some((event) =>
      ["damageDealt", "lifeTaken", "cardKOd", "cardMoved"].includes(event.type),
    ),
    false,
  );
});

test("Banish attacker blocked by Character causes no Life movement or Life trashing", () => {
  const { opened, defenderBlocker, decision } = setupOpenedBlockStepDecision();
  const openedP2 = must(opened.state.players[p2], "opened p2");
  const expectedLifeCards = openedP2.life.map((lifeCard) => lifeCard.card);
  opened.state.cardManifest.cards[toCardId("leader-red")] = {
    ...resolvedCard({
      cardId: toCardId("leader-red"),
      category: "leader",
      power: 5000,
    }),
    printedKeywords: ["banish"],
  };
  const blocker = cardRef(defenderBlocker, p2);

  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [blocker] },
  });

  const nextP2 = must(result.state.players[p2], "p2");
  assert.equal(result.errors, undefined);
  assert.equal(nextP2.life.length, expectedLifeCards.length);
  assert.deepEqual(
    nextP2.life.map((lifeCard) => lifeCard.card.instanceId),
    expectedLifeCards.map((card) => card.instanceId),
  );
  assert.equal(
    expectedLifeCards.some((lifeCard) =>
      nextP2.trash.some((card) => card.instanceId === lifeCard.instanceId),
    ),
    false,
  );
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === defenderBlocker.instanceId),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "lifeTaken"),
    false,
  );
});

test("supported blocked-battle resolution is deterministic", () => {
  const { opened, defenderBlocker, decision } = setupOpenedBlockStepDecision();
  const blocker = cardRef(defenderBlocker, p2);

  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [blocker] },
  });
  const replay = applyAction(structuredClone(opened.state), {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [blocker] },
  });

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "decisionResolved",
      "blockerActivated",
      "damageDealt",
      "cardKOd",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
    ],
  );
  assert.deepEqual(
    result.events.map((event) => event.visibility),
    [
      { type: "public" },
      { type: "public" },
      { type: "public" },
      { type: "public" },
      { type: "public" },
      { type: "replayOnly" },
      { type: "replayOnly" },
    ],
  );
  assert.deepEqual(
    result.events.map((event) => event.seq),
    result.events.map(
      (_, index) => opened.state.eventJournal.length + index + 1,
    ),
  );
  assert.deepEqual(
    result.state.eventJournal.slice(-result.events.length),
    result.events,
  );
  assert.equal(
    result.stateHash,
    "5a0f0632199e50fced2a19aaef865390ca6108f712b2dba1683ed1c90e694784",
  );
  assert.equal(result.stateHash, replay.stateHash);
  assert.deepEqual(result.events, replay.events);
});
