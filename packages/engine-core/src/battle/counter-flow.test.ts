import assert from "node:assert/strict";
import { test } from "vitest";

import type { SelectionId } from "@optcg/types";

import { applyAction, getLegalActions } from "../actions.js";
import { computeView } from "../view/compute-view.js";
import { applyDeclareAttack } from "./actions.js";
type EngineInternalBattleState = NonNullable<
  ReturnType<typeof setupAttackState>["battle"]
> & { counterPower?: number };
const battleCounterPower = (
  battle: ReturnType<typeof setupAttackState>["battle"],
): number | undefined =>
  (battle as EngineInternalBattleState | undefined)?.counterPower;

import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "../action-test-fixtures.js";
import {
  cardRef,
  continuousEffectRecord,
  ensureActiveDonInCostArea,
  installSupportedCounterEvent,
  resolveNoTriggerLifeDamageDecisionsForTests,
  setupAttackState,
  setupOpenedCounterStepPassDecision,
} from "./test-fixtures.js";

test("banish attacker with defender Character Counter metadata opens counter-step pass decision", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterCard = must(p2State.hand[0], "counter card");
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    printedKeywords: ["banish"],
  };
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 1000,
  });

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
  assert.equal(result.state.battle?.step, "counter");
  assert.equal(result.state.pendingDecision?.playerId, p2);
});

test("Character Counter metadata in defender hand opens counter-step pass decision", () => {
  const { opened, p2State, decision } = setupOpenedCounterStepPassDecision();

  assert.equal(opened.state.battle?.step, "counter");
  assert.equal(
    must(opened.state.players[p2], "p2").life.length,
    p2State.life.length,
  );
  assert.deepEqual(decision, {
    id: decision.id,
    type: "selectCards",
    playerId: p2,
    prompt: "Use counter or end step.",
    causedBy: decision.causedBy,
    visibility: { type: "public" },
    request: {
      timing: "onActivation",
      chooser: "nonTurnPlayer",
      player: "nonTurnPlayer",
      zone: "hand",
      filter: { categories: ["character"] },
      min: 0,
      max: 0,
      allowFewerIfUnavailable: true,
      visibility: "privateToChooser",
    },
    candidates: [],
    defaultResponse: { type: "cards", cards: [] },
  });
  assert.deepEqual(
    opened.events
      .filter((event) => event.type === "decisionCreated")
      .map((event) => event.payload),
    [
      {
        decisionId: decision.id,
        decisionType: "selectCards",
        playerId: p2,
      },
    ],
  );
});

test("counter-step legal actions expose defender pass and Character Counters without leaking to attacker", () => {
  const { opened, counterCard, decision } =
    setupOpenedCounterStepPassDecision();
  opened.state.continuousEffects = [
    continuousEffectRecord(opened.state, "legal-actions-supported-continuous", {
      type: "thisBattle",
    }),
  ];

  assert.deepEqual(getLegalActions(opened.state, p2), [
    { type: "concede", playerId: p2 },
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [] },
    },
    {
      type: "useCounter",
      cardInstanceId: counterCard.instanceId,
      target: must(opened.state.battle, "battle").currentTarget,
    },
  ]);
  assert.deepEqual(getLegalActions(opened.state, p1), [
    { type: "concede", playerId: p1 },
  ]);
});

test("counter-step legal actions keep pass for unsupported damage continuation", () => {
  const context = setupOpenedCounterStepPassDecision();
  const p2State = must(context.openedState.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  p2State.life[0] = {
    ...topLife,
    card: {
      ...topLife.card,
      cardId: toCardId("counter-legal-trigger-life"),
    },
  };
  context.openedState.cardManifest.cards[
    toCardId("counter-legal-trigger-life")
  ] = {
    ...resolvedCard({
      cardId: toCardId("counter-legal-trigger-life"),
      category: "character",
      power: 1000,
    }),
    triggerText: "TRIGGER: draw 1 card",
  };
  const before = JSON.stringify(context.openedState);

  assert.deepEqual(getLegalActions(context.openedState, p2), [
    { type: "concede", playerId: p2 },
    {
      type: "respondToDecision",
      decisionId: context.decision.id,
      response: { type: "cards", cards: [] },
    },
    {
      type: "useCounter",
      cardInstanceId: context.counterCard.instanceId,
      target: must(context.openedState.battle, "battle").currentTarget,
    },
  ]);
  assert.equal(JSON.stringify(context.openedState), before);
  assert.equal(context.openedState.pendingDecision?.id, context.decision.id);
  assert.equal(context.openedState.battle?.step, "counter");
});

test("counter-step legal actions suppress Character Counter during replacement processing", () => {
  const context = setupOpenedCounterStepPassDecision();
  context.openedState.replacementState.push({
    processId: "legal-counter-replacement-process",
    type: "damage",
    usedReplacementIds: [],
    payload: { hidden: "replacement" },
  });
  const before = JSON.stringify(context.openedState);

  assert.deepEqual(getLegalActions(context.openedState, p2), [
    { type: "concede", playerId: p2 },
  ]);
  assert.equal(JSON.stringify(context.openedState), before);
  assert.equal(context.openedState.pendingDecision?.id, context.decision.id);
  assert.equal(context.openedState.battle?.step, "counter");
});

test("counter-step legal actions suppress Character Counter for active Character current target", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const counterCard = must(p2State.hand[0], "counter card");
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 1000,
  });
  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(attacker, p1),
    target: cardRef(target, p2),
  });
  assert.equal(opened.errors, undefined);
  const decision = must(opened.state.pendingDecision, "pending decision");
  const openedTarget = must(
    must(opened.state.players[p2], "opened p2").characters.find(
      (character) => character.instanceId === target.instanceId,
    ),
    "opened target",
  );
  openedTarget.state = "active";
  const before = JSON.stringify(opened.state);

  assert.deepEqual(getLegalActions(opened.state, p2), [
    { type: "concede", playerId: p2 },
  ]);
  assert.equal(JSON.stringify(opened.state), before);
  assert.equal(opened.state.pendingDecision?.id, decision.id);
  assert.equal(opened.state.battle?.step, "counter");
});

test("counter-step pass emits deterministic decisionResolved sequence and resumes damage", () => {
  const { opened, p2State, decision } = setupOpenedCounterStepPassDecision();
  const beforeLife = p2State.life.length;

  const result = resolveNoTriggerLifeDamageDecisionsForTests(
    applyAction(opened.state, {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [] },
    }),
  );

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.battle, undefined);
  assert.equal(result.state.actionSeq, opened.state.actionSeq + 2);
  assert.equal(
    must(result.state.players[p2], "p2").life.length,
    beforeLife - 1,
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "decisionResolved",
      "damageDealt",
      "spotlightEntryCreated",
      "lifeTaken",
      "decisionCreated",
      "battleEnded",
      "effectResolved",
      "ruleProcessingChecked",
      "decisionResolved",
      "cardMoved",
      "cardMoved",
    ],
  );
  assert.deepEqual(result.events[0]?.payload, {
    decisionId: decision.id,
    playerId: p2,
  });
  const replay = resolveNoTriggerLifeDamageDecisionsForTests(
    applyAction(structuredClone(opened.state), {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [] },
    }),
  );
  assert.equal(result.stateHash, replay.stateHash);
  assert.deepEqual(result.events, replay.events);
});

test("counter-step pass applies supported continuous power before damage", () => {
  const { opened, p2State, decision } = setupOpenedCounterStepPassDecision();
  opened.state.continuousEffects = [
    {
      ...continuousEffectRecord(opened.state, "leader-power-this-battle", {
        type: "thisBattle",
      }),
      modifier: {
        layer: "powerAdd",
        target: {
          type: "all",
          player: "opponent",
          zone: "leaderArea",
        },
        operation: { type: "addPower", value: 1000 },
      },
    },
  ];

  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [] },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.battle, undefined);
  assert.equal(
    must(result.state.players[p2], "p2").life.length,
    p2State.life.length,
  );
  assert.ok(!result.events.some((event) => event.type === "damageDealt"));
  assert.ok(
    !result.state.continuousEffects.some(
      (effect) => effect.id === "leader-power-this-battle",
    ),
  );
});

test("Character Counter moves from hand to trash, emits deterministic events, and keeps Counter Step open", () => {
  const { opened, counterCard, decision } =
    setupOpenedCounterStepPassDecision();
  const target = must(opened.state.battle, "battle").currentTarget;
  opened.state.continuousEffects = [
    continuousEffectRecord(opened.state, "use-counter-supported-continuous", {
      type: "thisBattle",
    }),
  ];

  const result = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision?.id, decision.id);
  assert.equal(result.state.battle?.step, "counter");
  assert.equal(result.state.actionSeq, opened.state.actionSeq + 1);
  assert.equal(
    must(result.state.players[p2], "p2").hand.some(
      (card) => card.instanceId === counterCard.instanceId,
    ),
    false,
  );
  assert.equal(
    must(result.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === counterCard.instanceId,
    ),
    true,
  );
  assert.deepEqual(
    result.events
      .filter((event) => event.type !== "spotlightEntryCreated")
      .map((event) => ({
        type: event.type,
        payload: event.payload,
        visibility: event.visibility,
      })),
    [
      {
        type: "counterUsed",
        payload: {
          playerId: p2,
          instanceId: counterCard.instanceId,
          cardId: counterCard.cardId,
          target,
          value: 1000,
          targetPower: 5000,
        },
        visibility: { type: "public" },
      },
      {
        type: "cardMoved",
        payload: {
          instanceId: counterCard.instanceId,
          cardId: counterCard.cardId,
          from: counterCard.zone,
          to: { zone: "trash", playerId: p2, slot: "trash", index: 0 },
          reason: "counter",
        },
        visibility: { type: "public" },
      },
      {
        type: "cardTrashed",
        payload: {
          playerId: p2,
          instanceId: counterCard.instanceId,
          cardId: counterCard.cardId,
          reason: "counter",
        },
        visibility: { type: "public" },
      },
    ],
  );

  const replay = applyAction(structuredClone(opened.state), {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target,
  });
  assert.equal(result.stateHash, replay.stateHash);
  assert.deepEqual(result.events, replay.events);
});

test("live Character Counter can omit engine result state hash", () => {
  const { opened, counterCard } = setupOpenedCounterStepPassDecision();
  const target = must(opened.state.battle, "battle").currentTarget;
  opened.state.continuousEffects = [
    continuousEffectRecord(opened.state, "live-use-counter-continuous", {
      type: "thisBattle",
    }),
  ];

  const result = applyAction(
    opened.state,
    {
      type: "useCounter",
      cardInstanceId: counterCard.instanceId,
      target,
    },
    {
      includeStateHash: false,
      validateInvariants: false,
    },
  );

  assert.equal(result.errors, undefined);
  assert.equal(result.stateHash, "");
});

test("Character Counter power changes Damage Step outcome after pass", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const counterCard = must(p2State.hand[0], "counter card");
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 5000,
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 4000,
  });
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 2000,
  });
  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(attacker, p1),
    target: cardRef(target, p2),
  });
  assert.equal(opened.errors, undefined);
  const countered = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target: cardRef(target, p2),
  });
  assert.equal(countered.errors, undefined);
  assert.equal(battleCounterPower(countered.state.battle), 2000);

  const result = applyAction(countered.state, {
    type: "respondToDecision",
    decisionId: must(countered.state.pendingDecision, "pending decision").id,
    response: { type: "cards", cards: [] },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.battle, undefined);
  assert.equal(battleCounterPower(result.state.battle), undefined);
  assert.equal(
    must(result.state.players[p2], "p2").characters.some(
      (character) => character.instanceId === target.instanceId,
    ),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "cardKOd"),
    false,
  );
});

test("multiple Character Counters stack before pass", () => {
  const { opened, counterCard } = setupOpenedCounterStepPassDecision();
  const p2State = must(opened.state.players[p2], "p2");
  const secondCounter = must(p2State.hand[1], "second counter");
  opened.state.cardManifest.cards[secondCounter.cardId] = resolvedCard({
    cardId: secondCounter.cardId,
    category: "character",
    power: 3000,
    counter: 2000,
  });
  const target = must(opened.state.battle, "battle").currentTarget;

  const first = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target,
  });
  assert.equal(first.errors, undefined);
  const second = applyAction(first.state, {
    type: "useCounter",
    cardInstanceId: secondCounter.instanceId,
    target,
  });

  assert.equal(second.errors, undefined);
  assert.equal(battleCounterPower(second.state.battle), 3000);
  assert.equal(
    second.state.pendingDecision?.id,
    opened.state.pendingDecision?.id,
  );
  assert.equal(
    must(second.state.players[p2], "p2").trash.filter((card) =>
      [counterCard.instanceId, secondCounter.instanceId].includes(
        card.instanceId,
      ),
    ).length,
    2,
  );
});

test("conditional Counter Event can apply choose-from-leader-or-character power to current battle target", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterEvent = must(p2State.hand[0], "counter event");
  installSupportedCounterEvent(state, counterEvent, 4000);
  const definitionId = `${String(counterEvent.cardId)}:counter`;
  const definition = must(
    state.cardManifest.effectDefinitions?.[definitionId],
    "counter definition",
  );
  const counterEffect = must(definition.effects[0], "counter effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [definitionId]: {
      ...definition,
      effects: [
        {
          ...counterEffect,
          condition: {
            type: "hasCardInZone",
            player: "self",
            zone: "leaderArea",
            filter: { categories: ["leader"], names: ["leader-blue"] },
          },
          effect: {
            type: "modifyPower",
            target: {
              type: "chooseFromZones",
              request: {
                timing: "onResolution",
                chooser: "self",
                player: "self",
                zones: ["leaderArea", "characterArea"],
                min: 0,
                max: 1,
                allowFewerIfUnavailable: true,
                visibility: "public",
                filter: { categories: ["leader", "character"] },
              },
            },
            value: 4000,
            duration: { type: "thisBattle" },
          },
        },
      ],
    },
  };

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);

  assert.equal(
    getLegalActions(opened.state, p2).some(
      (action) =>
        action.type === "useCounter" &&
        action.cardInstanceId === counterEvent.instanceId,
    ),
    true,
  );
  const used = applyAction(
    opened.state,
    must(
      getLegalActions(opened.state, p2).find(
        (action) =>
          action.type === "useCounter" &&
          action.cardInstanceId === counterEvent.instanceId,
      ),
      "counter action",
    ),
  );
  assert.equal(used.errors, undefined);
  const targetDecision = must(used.state.pendingDecision, "target decision");
  assert.equal(targetDecision.type, "selectTargets");
  const selected = applyAction(used.state, {
    type: "respondToDecision",
    decisionId: targetDecision.id,
    response: { type: "targets", targets: [cardRef(p2State.leader, p2)] },
  });

  assert.equal(selected.errors, undefined);
  assert.equal(
    computeView(selected.state).cards[p2State.leader.instanceId]?.currentPower,
    9000,
  );
});

test("Counter Event sequence resolves power then conditional trash-to-hand selection", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const baseCounterEvent = must(p2State.hand[0], "counter event");
  const counterEvent = {
    ...baseCounterEvent,
    cardId: toCardId("counter-event-sequence"),
  };
  p2State.hand = [
    counterEvent,
    ...p2State.hand.slice(1).map((card, index) => ({
      ...card,
      zone: {
        zone: "hand" as const,
        playerId: p2,
        slot: "hand" as const,
        index: index + 1,
      },
    })),
  ];
  const trashTemplate = must(p2State.deck[0], "trash template");
  const trashCards = Array.from({ length: 10 }, (_, index) => ({
    ...trashTemplate,
    instanceId:
      `${String(trashTemplate.instanceId)}:counter-trash:${String(index)}` as typeof trashTemplate.instanceId,
    ...(index === 0 ? { cardId: toCardId("eligible-black-trash") } : {}),
    zone: {
      zone: "trash" as const,
      playerId: p2,
      slot: "trash" as const,
      index,
    },
  }));
  const eligible = must(trashCards[0], "eligible trash card");
  p2State.trash = trashCards;
  state.cardManifest.cards[eligible.cardId] = {
    ...resolvedCard({
      cardId: eligible.cardId,
      category: "character",
      cost: 3,
    }),
    colors: ["black"],
  };
  installSupportedCounterEvent(state, counterEvent, 1000);
  const definitionId = `${String(counterEvent.cardId)}:counter`;
  const trashSelectionId = "trashSelection:addToHand" as SelectionId;
  const definition = must(
    state.cardManifest.effectDefinitions?.[definitionId],
    "counter definition",
  );
  const counterEffect = must(definition.effects[0], "counter effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [definitionId]: {
      ...definition,
      effects: [
        {
          ...counterEffect,
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: {
                  type: "modifyPower",
                  target: {
                    type: "chooseFromZones",
                    request: {
                      timing: "onResolution",
                      chooser: "self",
                      player: "self",
                      zones: ["leaderArea", "characterArea"],
                      min: 0,
                      max: 1,
                      allowFewerIfUnavailable: true,
                      visibility: "public",
                      filter: { categories: ["leader", "character"] },
                    },
                  },
                  value: 1000,
                  duration: { type: "thisBattle" },
                },
              },
              {
                connector: "then",
                effect: {
                  type: "conditional",
                  if: {
                    type: "trashCount",
                    player: "self",
                    op: "gte",
                    value: 10,
                  },
                  then: {
                    type: "sequence",
                    effects: [
                      {
                        connector: "always",
                        effect: {
                          type: "selectCards",
                          zone: "trash",
                          player: "self",
                          chooser: "self",
                          min: 0,
                          max: 1,
                          filter: {
                            colorsAny: ["black"],
                            categories: ["character"],
                            cost: { max: 3 },
                          },
                          saveAs: trashSelectionId,
                          visibility: "bothPlayers",
                        },
                      },
                      {
                        connector: "then",
                        effect: {
                          type: "moveSelected",
                          selection: trashSelectionId,
                          from: "trash",
                          to: "hand",
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);

  assert.equal(
    opened.state.battle?.step,
    "counter",
    JSON.stringify(opened.state.battle),
  );
  const used = applyAction(
    opened.state,
    must(
      getLegalActions(opened.state, p2).find(
        (action) =>
          action.type === "useCounter" &&
          action.cardInstanceId === counterEvent.instanceId,
      ),
      "counter action",
    ),
  );
  assert.equal(used.errors, undefined);
  const powerTargetDecision = must(
    used.state.pendingDecision,
    "power target decision",
  );
  assert.equal(powerTargetDecision.type, "selectTargets");
  const targeted = applyAction(used.state, {
    type: "respondToDecision",
    decisionId: powerTargetDecision.id,
    response: { type: "targets", targets: [cardRef(p2State.leader, p2)] },
  });
  assert.equal(targeted.errors, undefined);
  const selectionDecision = must(
    targeted.state.pendingDecision,
    "trash-to-hand selection decision",
  );

  assert.equal(
    computeView(targeted.state).cards[p2State.leader.instanceId]?.currentPower,
    6000,
  );
  assert.equal(selectionDecision.type, "selectCards");
  assert.deepEqual(
    selectionDecision.candidates.map((candidate) => candidate.card.instanceId),
    [eligible.instanceId],
  );

  const selectedCandidate = must(
    selectionDecision.candidates[0],
    "trash-to-hand candidate",
  );
  const selected = applyAction(targeted.state, {
    type: "respondToDecision",
    decisionId: selectionDecision.id,
    response: { type: "cards", cards: [selectedCandidate.card] },
  });
  const afterP2 = must(selected.state.players[p2], "after p2");

  assert.equal(selected.errors, undefined);
  assert.equal(
    afterP2.hand.some((card) => card.instanceId === eligible.instanceId),
    true,
  );
  assert.equal(
    afterP2.trash.some((card) => card.instanceId === eligible.instanceId),
    false,
  );
});

test("supported nonzero-cost Counter Event rests printed cost DON without a payment prompt", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  ensureActiveDonInCostArea(state, p2, 1);
  const counterEvent = must(p2State.hand[0], "counter event");
  installSupportedCounterEvent(state, counterEvent, 1000);
  state.cardManifest.cards[counterEvent.cardId] = resolvedCard({
    cardId: counterEvent.cardId,
    category: "event",
    cost: 1,
    effectText: "[Counter] +1000.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: `${String(counterEvent.cardId)}:counter`,
    },
  });

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  const use = applyAction(
    opened.state,
    must(
      getLegalActions(opened.state, p2).find(
        (action) =>
          action.type === "useCounter" &&
          action.cardInstanceId === counterEvent.instanceId,
      ),
      "counter action",
    ),
  );
  assert.equal(use.errors, undefined);
  assert.equal(
    use.state.pendingDecision?.type === "payCost" &&
      String(use.state.pendingDecision.id).startsWith(
        "decision:counterStep:payCost:",
      ),
    false,
  );
  assert.equal(use.state.pendingDecision?.type, "selectCards");
  assert.deepEqual(
    use.events.map((event) => event.type),
    [
      "costPaid",
      "counterUsed",
      "spotlightEntryCreated",
      "cardMoved",
      "cardTrashed",
      "effectQueued",
      "effectResolved",
      "ruleProcessingChecked",
      "decisionCreated",
    ],
  );
  const paidDon = must(
    use.events.find((event) => event.type === "costPaid")?.payload,
    "cost paid payload",
  ) as { selectedDonInstanceIds?: readonly string[] };
  const paidDonIds = must(paidDon.selectedDonInstanceIds, "paid DON ids");
  assert.equal(paidDonIds.length, 1);
  const restedDonId = must(paidDonIds[0], "rested DON id");
  assert.equal(
    must(use.state.players[p2], "p2").costArea.some(
      (don) => String(don.instanceId) === restedDonId && don.state === "rested",
    ),
    true,
  );
  assert.equal(
    computeView(use.state).cards[p2State.leader.instanceId]?.currentPower,
    6000,
  );
  const replay = applyAction(
    structuredClone(opened.state),
    must(
      getLegalActions(opened.state, p2).find(
        (action) =>
          action.type === "useCounter" &&
          action.cardInstanceId === counterEvent.instanceId,
      ),
      "counter replay action",
    ),
  );
  assert.equal(use.stateHash, replay.stateHash);
  assert.deepEqual(use.events, replay.events);
});

test("nonzero-cost Counter Event is unavailable without enough active DON", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterEvent = must(p2State.hand[0], "counter event");
  installSupportedCounterEvent(state, counterEvent, 1000);
  state.cardManifest.cards[counterEvent.cardId] = resolvedCard({
    cardId: counterEvent.cardId,
    category: "event",
    cost: 1,
    effectText: "[Counter] +1000.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: `${String(counterEvent.cardId)}:counter`,
    },
  });
  p2State.costArea = p2State.costArea.map((card) => ({
    ...card,
    state: "rested",
  }));

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  assert.equal(
    getLegalActions(opened.state, p2).some(
      (action) =>
        action.type === "useCounter" &&
        action.cardInstanceId === counterEvent.instanceId,
    ),
    false,
  );
});
