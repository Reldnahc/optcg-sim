import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardRef, ContinuousEffectRecord, DecisionId } from "@optcg/types";

import { applyAction, getLegalActions } from "../actions.js";
import { applyDeclareAttack } from "./actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "../action-test-fixtures.js";
import {
  assertRejectsWithoutMutation,
  cardRef,
  continuousKeywordEffectRecord,
  effectDefinition,
  passCounterStep,
  setupAttackState,
  setupOpenedBlockStepDecision,
} from "./test-fixtures.js";

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
    assert.equal(
      result.state.pendingDecision?.prompt,
      "Use counter or end step.",
    );
    const passed = passCounterStep(result.state, p2);
    assert.equal(passed.errors, undefined);
    assert.equal(passed.state.pendingDecision, undefined);
    assert.equal(passed.state.battle, undefined);
    assert.equal(
      result.events.some(
        (event) =>
          event.type === "decisionCreated" &&
          (event.payload as { decisionType?: string }).decisionType ===
            "selectCards",
      ),
      true,
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

test("implemented On Play unblockable keyword grant suppresses blockers without suppressing counter step", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const blocker = must(p2State.characters[0], "blocker");
  const counterCard = must(p2State.hand[0], "counter card");
  blocker.state = "active";
  state.cardManifest.cards[blocker.cardId] = {
    ...resolvedCard({
      cardId: blocker.cardId,
      category: "character",
      power: 3000,
    }),
    printedKeywords: ["blocker"],
  };
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 1000,
  });
  const effectDefinitionId = "def:on-play-unblockable";
  const definition = effectDefinition(
    attacker.cardId,
    { type: "onPlay" },
    {
      type: "giveKeyword",
      target: {
        type: "all",
        zone: "characterArea",
        player: "self",
        filter: { categories: ["character"] },
      },
      keyword: "unblockable",
      duration: { type: "thisTurn" },
    },
  );
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
    effectText:
      "[On Play] Up to 1 of your Characters gains [Unblockable] during this turn. (This card cannot be blocked.)",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
  state.continuousEffects = [
    continuousKeywordEffectRecord(
      state,
      "continuous:on-play-unblockable",
      attacker,
      "unblockable",
      { duration: { type: "thisTurn" } },
    ),
  ];

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(attacker, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.equal(opened.errors, undefined);
  assert.equal(
    opened.state.pendingDecision?.prompt,
    "Use counter or end step.",
  );
  assert.equal(opened.state.battle?.step, "counter");
  assert.equal(
    getLegalActions(opened.state, p2).some(
      (action) =>
        action.type === "useCounter" &&
        action.cardInstanceId === counterCard.instanceId,
    ),
    true,
  );
  const countered = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(countered.errors, undefined);
});

test("implemented On Play cannotBlock restriction suppresses blockers without suppressing counter step", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const blocker = must(p2State.characters[0], "blocker");
  const counterCard = must(p2State.hand[0], "counter card");
  blocker.state = "active";
  state.cardManifest.cards[blocker.cardId] = {
    ...resolvedCard({
      cardId: blocker.cardId,
      category: "character",
      power: 3000,
    }),
    printedKeywords: ["blocker"],
  };
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 1000,
  });
  const effectDefinitionId = "def:on-play-cannot-block";
  const definition = effectDefinition(
    attacker.cardId,
    { type: "onPlay" },
    {
      type: "cannotBlock",
      target: {
        type: "all",
        zone: "characterArea",
        player: "opponent",
        filter: { categories: ["character"] },
      },
      duration: { type: "thisTurn" },
    },
  );
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
    effectText:
      "[On Play] Up to 1 of your opponent's Characters cannot block during this turn.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
  const restriction: ContinuousEffectRecord = {
    id: "continuous:on-play-cannot-block",
    source: cardRef(attacker, p1),
    sourceSnapshot: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      ownerId: attacker.owner,
      controllerId: attacker.controller,
      zone: attacker.zone,
      category: "character",
      colors: ["red"],
      power: 7000,
      keywords: [],
    },
    controller: p1,
    modifier: {
      layer: "restriction",
      target: {
        type: "all",
        zone: "characterArea",
        player: "opponent",
      },
      operation: { type: "restriction", restriction: "cannotBlock" },
    },
    duration: { type: "thisTurn" },
    createdBy: { type: "ruleProcess", name: "test-cannot-block" },
    createdAtStateSeq: state.seq,
  };
  state.continuousEffects = [restriction];

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(attacker, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.equal(opened.errors, undefined);
  assert.equal(
    opened.state.pendingDecision?.prompt,
    "Use counter or end step.",
  );
  assert.equal(opened.state.battle?.step, "counter");
  assert.equal(
    getLegalActions(opened.state, p2).some(
      (action) =>
        action.type === "useCounter" &&
        action.cardInstanceId === counterCard.instanceId,
    ),
    true,
  );
  const countered = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(countered.errors, undefined);
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
  assert.equal(
    result.state.pendingDecision?.prompt,
    "Use counter or end step.",
  );
  const passed = passCounterStep(result.state, p2);
  assert.equal(passed.errors, undefined);
  assert.equal(passed.state.pendingDecision, undefined);
  assert.equal(passed.state.battle, undefined);
  assert.equal(
    passed.events.some((event) => event.type === "damageDealt"),
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
    if (result.errors !== undefined) {
      assert.equal(result.errors[0]?.type, "illegalAction");
      assert.equal(JSON.stringify(state), before);
      assert.equal(JSON.stringify(result.state), before);
      assert.deepEqual(result.events, []);
      return;
    }
    const decision = must(result.state.pendingDecision, "block decision");
    const declined = applyAction(result.state, {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [] },
    });
    assert.equal(declined.errors?.[0]?.type, "illegalAction");
    assert.equal(JSON.stringify(state), before);
    assert.equal(JSON.stringify(declined.state), JSON.stringify(result.state));
    assert.deepEqual(declined.events, []);
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
