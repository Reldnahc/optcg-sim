import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardRef, DecisionId } from "@optcg/types";

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
  assertRejectsWithoutMutation,
  cardRef,
  effectDefinition,
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
    "42d15e4d79663614651e08b19d02c7bd7cd564439037fc821da160789b6229b8",
  );
  assert.equal(result.stateHash, replay.stateHash);
  assert.deepEqual(result.events, replay.events);
});

test("rested, stale, non-blocker, and attacker-controlled cards do not open block-step decision", () => {
  const runNoDecision = (
    mutate: (state: ReturnType<typeof setupAttackState>) => void,
  ) => {
    const state = setupAttackState();
    const p1State = must(state.players[p1], "p1");
    const p2State = must(state.players[p2], "p2");
    mutate(state);
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
    assert.equal(result.state.pendingDecision, undefined);
    assert.equal(result.state.battle, undefined);
    assert.equal(
      result.events.some((event) => event.type === "decisionCreated"),
      false,
    );
  };

  runNoDecision((state) => {
    const p2State = must(state.players[p2], "p2");
    const blocker = must(p2State.characters[0], "rested blocker");
    blocker.state = "rested";
    state.cardManifest.cards[blocker.cardId] = {
      ...resolvedCard({
        cardId: blocker.cardId,
        category: "character",
        power: 3000,
      }),
      printedKeywords: ["blocker"],
    };
  });
  runNoDecision((state) => {
    const p2State = must(state.players[p2], "p2");
    const blocker = must(p2State.characters[0], "stale blocker");
    blocker.state = "active";
    state.cardManifest.cards[blocker.cardId] = {
      ...resolvedCard({
        cardId: blocker.cardId,
        category: "character",
        power: 3000,
      }),
      printedKeywords: ["blocker"],
    };
    p2State.characters = [];
  });
  runNoDecision((state) => {
    const p2State = must(state.players[p2], "p2");
    const nonBlocker = must(p2State.characters[0], "non blocker");
    nonBlocker.state = "active";
    state.cardManifest.cards[nonBlocker.cardId] = resolvedCard({
      cardId: nonBlocker.cardId,
      category: "character",
      power: 3000,
      printedKeywords: [],
    });
  });
  runNoDecision((state) => {
    const p1State = must(state.players[p1], "p1");
    const attackerControlled = must(
      p1State.characters[0],
      "attacker controlled blocker",
    );
    attackerControlled.state = "active";
    state.cardManifest.cards[attackerControlled.cardId] = {
      ...resolvedCard({
        cardId: attackerControlled.cardId,
        category: "character",
        power: 3000,
      }),
      printedKeywords: ["blocker"],
    };
  });
});

test("ineligible printed blocker does not open block-step decision", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attackerControlledBlocker = must(
    p1State.characters[0],
    "attacker controlled blocker",
  );
  attackerControlledBlocker.state = "rested";
  state.cardManifest.cards[attackerControlledBlocker.cardId] = {
    ...resolvedCard({
      cardId: attackerControlledBlocker.cardId,
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
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.battle, undefined);
  assert.equal(
    result.events.some((event) => event.type === "damageDealt"),
    true,
  );
});

test("invalid blocker selections reject without mutation or events", () => {
  const run = (
    mutate: (context: ReturnType<typeof setupOpenedBlockStepDecision>) => void,
    choose: (context: ReturnType<typeof setupOpenedBlockStepDecision>) => {
      decisionId: DecisionId;
      cards: CardRef[];
    } = (context) => ({
      decisionId: context.decision.id,
      cards: [cardRef(context.defenderBlocker, p2)],
    }),
  ) => {
    const context = setupOpenedBlockStepDecision();
    mutate(context);
    const selected = choose(context);
    assertRejectsWithoutMutation(context.openedState, {
      type: "respondToDecision",
      decisionId: selected.decisionId,
      response: { type: "cards", cards: selected.cards },
    });
  };

  run((context) => {
    const p2Characters = must(context.openedState.players[p2], "p2").characters;
    p2Characters[0] = {
      ...must(p2Characters[0], "blocker"),
      state: "rested",
    };
  });
  run((context) => {
    must(context.openedState.players[p2], "p2").characters = [];
  });
  run((context) => {
    context.openedState.cardManifest.cards[context.defenderBlocker.cardId] =
      resolvedCard({
        cardId: context.defenderBlocker.cardId,
        category: "character",
        power: 3000,
      });
  });
  run(
    () => undefined,
    (context) => ({
      decisionId: context.decision.id,
      cards: [cardRef(must(context.p1State.characters[0], "p1 character"), p1)],
    }),
  );
  run((context) => {
    const battle = must(context.openedState.battle, "battle");
    context.openedState.battle = { ...battle, step: "attack" };
  });
  run((context) => {
    const battle = must(context.openedState.battle, "battle");
    context.openedState.battle = {
      ...battle,
      blocker: cardRef(context.defenderBlocker, p2),
    };
  });
  run(
    () => undefined,
    (context) => ({
      decisionId: context.decision.id,
      cards: [
        {
          instanceId: "forged-blocker" as never,
          cardId: context.defenderBlocker.cardId,
          playerId: p2,
        },
      ],
    }),
  );
  run(
    () => undefined,
    (context) => ({
      decisionId: context.decision.id,
      cards: [
        cardRef(context.defenderBlocker, p2),
        cardRef(context.defenderBlocker, p2),
      ],
    }),
  );
  run(
    () => undefined,
    (context) => ({
      decisionId: "decision:stale" as never,
      cards: [cardRef(context.defenderBlocker, p2)],
    }),
  );
  run((context) => {
    delete context.openedState.battle;
  });
});

test("unsupported blocker activation states reject without mutation or events", () => {
  const run = (
    mutate: (context: ReturnType<typeof setupOpenedBlockStepDecision>) => void,
  ) => {
    const context = setupOpenedBlockStepDecision();
    mutate(context);
    assertRejectsWithoutMutation(context.openedState, {
      type: "respondToDecision",
      decisionId: context.decision.id,
      response: {
        type: "cards",
        cards: [cardRef(context.defenderBlocker, p2)],
      },
    });
  };

  run((context) => {
    context.openedState.effectQueue = [{ id: "queued-effect" } as never];
  });
  run((context) => {
    context.openedState.deferredTriggers = [
      { timingWindowId: "window-1" } as never,
    ];
  });
  run((context) => {
    const p2State = must(context.openedState.players[p2], "p2");
    const counterEvent = must(p2State.hand[0], "counter event");
    context.openedState.cardManifest.cards[counterEvent.cardId] = resolvedCard({
      cardId: counterEvent.cardId,
      category: "event",
      effectText: "[Counter] Draw 1 card.",
    });
  });
  run((context) => {
    const p2State = must(context.openedState.players[p2], "p2");
    const counterEvent = must(p2State.hand[0], "counter event");
    context.openedState.cardManifest.cards[counterEvent.cardId] = resolvedCard({
      cardId: counterEvent.cardId,
      category: "event",
    });
    context.openedState.cardManifest.effectDefinitions = {
      counterEvent: effectDefinition(counterEvent.cardId, { type: "counter" }),
    };
  });
  run((context) => {
    context.openedState.replacementState.push({
      processId: "replacement-process-1",
      type: "damage",
      usedReplacementIds: [],
      payload: { hidden: "contents" },
    });
  });
  run((context) => {
    context.openedState.cardManifest.cards[toCardId("leader-red")] = {
      ...resolvedCard({
        cardId: toCardId("leader-red"),
        category: "leader",
        power: 5000,
      }),
      printedKeywords: ["unblockable"],
    };
  });
  run((context) => {
    context.openedState.cardManifest.cards[toCardId("leader-red")] = {
      ...resolvedCard({
        cardId: toCardId("leader-red"),
        category: "leader",
        power: 5000,
      }),
      printedKeywords: ["banish", "doubleAttack"],
    };
  });
  run((context) => {
    context.openedState.cardManifest.cards[context.defenderBlocker.cardId] = {
      ...resolvedCard({
        cardId: context.defenderBlocker.cardId,
        category: "character",
        power: 3000,
        effectText: "[On Block] Draw 1 card.",
      }),
      printedKeywords: ["blocker"],
    };
  });
  run((context) => {
    context.openedState.cardManifest.effectDefinitions = {
      onBlock: effectDefinition(context.defenderBlocker.cardId, {
        type: "onBlock",
      }),
    };
  });
  run((context) => {
    context.openedState.cardManifest.effectDefinitions = {
      onKo: effectDefinition(context.defenderBlocker.cardId, {
        type: "onKO",
      }),
    };
  });
  run((context) => {
    context.openedState.cardManifest.effectDefinitions = {
      endOfBattle: effectDefinition(context.defenderBlocker.cardId, {
        type: "endOfBattle",
      }),
    };
  });
  run((context) => {
    context.openedState.cardManifest.effectDefinitions = {
      protectFromKo: effectDefinition(
        context.defenderBlocker.cardId,
        { type: "onPlay" },
        {
          type: "protectFromKO",
          target: { type: "self" },
          duration: { type: "thisTurn" },
        },
      ),
    };
  });
  run((context) => {
    context.openedState.cardManifest.effectDefinitions = {
      cannotBeBlockedBy: effectDefinition(
        toCardId("leader-red"),
        { type: "onPlay" },
        {
          type: "cannotBeBlockedBy",
          target: { type: "self" },
          filter: { categories: ["character"] },
          duration: { type: "thisTurn" },
        },
      ),
    };
  });
  run((context) => {
    context.openedState.cardManifest.effectDefinitions = {
      giveUnblockable: effectDefinition(
        toCardId("leader-red"),
        { type: "onPlay" },
        {
          type: "giveKeyword",
          target: { type: "self" },
          keyword: "unblockable",
          duration: { type: "thisTurn" },
        },
      ),
    };
  });
  run((context) => {
    context.openedState.cardManifest.effectDefinitions = {
      nestedProtection: effectDefinition(
        context.defenderBlocker.cardId,
        { type: "onPlay" },
        {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "custom",
                handler: "noop",
                operation: {
                  type: "protection",
                  protection: { process: "ko" },
                },
              } as never,
            },
          ],
        },
      ),
    };
  });
  run((context) => {
    context.openedState.continuousEffects = [
      { duration: { type: "thisBattle" } } as never,
    ];
  });
  run((context) => {
    context.openedState.continuousEffects = [
      {
        duration: { type: "thisTurn" },
        modifier: {
          layer: "rules",
          operation: {
            type: "protection",
            protection: { process: "ko" },
          },
        },
      } as never,
    ];
  });
  run((context) => {
    const battle = must(context.openedState.battle, "battle");
    context.openedState.battle = {
      ...battle,
      currentTarget: {
        instanceId: "stale-current-target" as never,
        cardId: context.p2State.leader.cardId,
        playerId: p2,
      },
    };
  });
  run((context) => {
    context.openedState.cardManifest.cards[context.defenderBlocker.cardId] = {
      ...resolvedCard({
        cardId: context.defenderBlocker.cardId,
        category: "character",
        power: 3000,
      }),
      printedKeywords: ["blocker"],
      support: {
        cardId: context.defenderBlocker.cardId,
        status: "unsupported",
        tested: false,
        rulesVersion: "r1",
        cardDataVersion: "fixture",
        sourceTextHash: "source-hash",
        behaviorHash: "behavior-hash",
      },
    };
  });
  run((context) => {
    const metadata = {
      ...resolvedCard({
        cardId: context.defenderBlocker.cardId,
        category: "character",
        power: 3000,
      }),
      printedKeywords: ["blocker"],
    };
    delete (metadata as Partial<typeof metadata>).support;
    context.openedState.cardManifest.cards[context.defenderBlocker.cardId] =
      metadata as never;
  });
});

test("legal blocker with unsupported continuation rejects declareAttack without mutation or events", () => {
  const run = (
    mutate: (state: ReturnType<typeof setupAttackState>) => void,
  ) => {
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
    mutate(state);
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
  };

  run((state) => {
    const p2State = must(state.players[p2], "p2");
    const counterEvent = must(p2State.hand[0], "counter event");
    state.cardManifest.cards[counterEvent.cardId] = resolvedCard({
      cardId: counterEvent.cardId,
      category: "event",
      effectText: "[Counter] Draw 1 card.",
    });
  });
  run((state) => {
    state.effectQueue = [{ id: "queued-effect" } as never];
  });
  run((state) => {
    state.deferredTriggers = [{ timingWindowId: "window-1" } as never];
  });
  run((state) => {
    state.replacementState.push({
      processId: "replacement-process-1",
      type: "damage",
      usedReplacementIds: [],
      payload: { hidden: "contents" },
    });
  });
  run((state) => {
    state.cardManifest.cards[toCardId("leader-red")] = {
      ...resolvedCard({
        cardId: toCardId("leader-red"),
        category: "leader",
        power: 5000,
      }),
      printedKeywords: ["doubleAttack"],
    };
  });
  run((state) => {
    state.cardManifest.cards[toCardId("leader-red")] = {
      ...resolvedCard({
        cardId: toCardId("leader-red"),
        category: "leader",
        power: 5000,
      }),
      printedKeywords: ["banish", "doubleAttack"],
    };
  });
  run((state) => {
    state.cardManifest.cards[toCardId("leader-red")] = resolvedCard({
      cardId: toCardId("leader-red"),
      category: "leader",
      power: 5000,
      printedKeywords: [],
    });
    state.cardManifest.cards[toCardId("leader-blue")] = {
      ...resolvedCard({
        cardId: toCardId("leader-blue"),
        category: "leader",
        power: 5000,
      }),
      support: {
        cardId: toCardId("leader-blue"),
        status: "unsupported",
        tested: false,
        rulesVersion: "r1",
        cardDataVersion: "fixture",
        sourceTextHash: "source-hash",
        behaviorHash: "behavior-hash",
      },
    };
  });
  run((state) => {
    const p2State = must(state.players[p2], "p2");
    const topLife = must(p2State.life[0], "top life");
    p2State.life[0] = {
      ...topLife,
      card: { ...topLife.card, cardId: toCardId("trigger-life-block-step") },
    };
    state.cardManifest.cards[toCardId("trigger-life-block-step")] = {
      ...resolvedCard({
        cardId: toCardId("trigger-life-block-step"),
        category: "character",
        power: 1000,
      }),
      triggerText: "TRIGGER: draw 1",
    };
  });
});
