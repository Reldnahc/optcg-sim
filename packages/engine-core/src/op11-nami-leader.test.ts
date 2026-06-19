import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  EffectDefinition,
  EffectId,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  PlayerId,
} from "@optcg/types";

import { appendEvent, toStateSeq } from "./action-results.js";
import { applyAction, getLegalActions } from "./actions.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "./action-test-fixtures.js";
import { computeView } from "./view/compute-view.js";
import { processEffectRuntime } from "./effect-runtime.js";
import { applyDeclareAttack } from "./battle/actions.js";
import {
  cardRef,
  passCounterStep,
  setupAttackState,
} from "./battle/test-fixtures.js";
import {
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "./effect-runtime-queue/test-support.js";

const op11NamiLifeEffectId = "op11-nami:life-removed-draw" as EffectId;
const op11NamiOpponentAttackEffectId =
  "op11-nami:opponent-attack-leader-power" as EffectId;

const op11NamiEffectText = [
  "[Your Turn] [Once Per Turn] This effect can be activated when a card is removed from your or your opponent's Life cards. If you have 7 or less cards in your hand, draw 1 card.",
  "[DON!!×1] [On Your Opponent's Attack] [Once Per Turn] You may trash 1 card from your hand: This Leader gains +2000 power during this turn.",
].join("\n");

const op11NamiDefinition = (
  leader: CardInstance,
  definitionId: string,
): EffectDefinition => ({
  cardId: leader.cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: op11NamiLifeEffectId,
      category: "activate",
      trigger: { type: "lifeRemoved", players: ["self", "opponent"] },
      oncePerTurn: true,
      condition: { type: "yourTurn" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "conditional",
              if: { type: "handCount", player: "self", op: "lte", value: 7 },
              then: { type: "draw", player: "self", count: 1 },
            },
          },
        ],
      },
    },
    {
      id: op11NamiOpponentAttackEffectId,
      category: "auto",
      trigger: { type: "onOpponentAttack" },
      oncePerTurn: true,
      condition: {
        type: "attachedDonCount",
        target: { type: "self" },
        op: "gte",
        value: 1,
      },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            id: "cost:trash-from-hand",
            connector: "always",
            saveResultAs: "paidCost:trashFromHand",
            effect: {
              type: "payCost",
              cost: {
                type: "trashFromHand",
                count: 1,
                chooser: "self",
                optional: true,
              },
            },
          },
          {
            id: "body:leader-power",
            connector: "ifYouDo",
            effect: {
              type: "modifyPower",
              target: { type: "myLeader" },
              value: 2000,
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
    },
  ],
  metadata: {
    sourceTextHash: `${definitionId}:source`,
    rulesVersion: `${definitionId}:rules`,
    effectDefinitionsVersion: "fixture",
    tested: true,
    reviewer: "qa-reviewer",
  },
});

const installOp11NamiLeader = (
  state: GameState,
  playerId: PlayerId,
): EffectDefinition => {
  const leader = must(state.players[playerId], "player").leader;
  const definitionId = `def:op11-nami:${String(playerId)}`;
  const definition = op11NamiDefinition(leader, definitionId);
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [definitionId]: definition,
  };
  state.cardManifest.cards[leader.cardId] = resolvedCard({
    cardId: leader.cardId,
    category: "leader",
    power: 5000,
    effectText: op11NamiEffectText,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: definitionId,
      sourceTextHash: definition.metadata.sourceTextHash,
      rulesVersion: definition.metadata.rulesVersion,
      cardDataVersion: state.cardManifest.cardDataVersion,
    },
  });
  return definition;
};

const appendLifeRemovedEvent = (state: GameState, playerId: PlayerId): void => {
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "cardMoved",
    {
      playerId,
      from: { zone: "life", playerId, slot: "life", index: 0 },
      to: { zone: "hand", playerId, slot: "hand", index: 0 },
      reason: "moveCards",
    },
    { type: "public" },
  );
  state.eventJournal = [...state.eventJournal, ...events];
};

const attachOneDonToLeader = (state: GameState, playerId: PlayerId): void => {
  const player = must(state.players[playerId], "player");
  const don = must(player.donDeck[0], "DON");
  player.leader.attachedDon = [don.instanceId];
};

const installSelfLifeMoveSource = (state: GameState): CardInstance => {
  const player = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "life move source"),
    zone: "characterArea",
  });
  player.hand = player.hand.filter(
    (card) => card.instanceId !== source.instanceId,
  );
  const definitionId = "def:op11-nami-test-life-move-source";
  const effectBlockId = "op11-nami-test:move-own-life-to-hand" as EffectId;
  const definition: EffectDefinition = {
    cardId: source.cardId,
    implementationStatus: "implemented-dsl",
    effects: [
      {
        id: effectBlockId,
        category: "auto",
        trigger: { type: "onPlay" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "moveCards",
          count: 1,
          from: { player: "self", zone: "life", position: "top" },
          to: { player: "self", zone: "hand" },
          order: "original",
        },
      },
    ],
    metadata: {
      sourceTextHash: `${definitionId}:source`,
      rulesVersion: `${definitionId}:rules`,
      effectDefinitionsVersion: "fixture",
      tested: true,
      reviewer: "qa-reviewer",
    },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [definitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    cost: 1,
    power: 1000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: definitionId,
      sourceTextHash: definition.metadata.sourceTextHash,
      rulesVersion: definition.metadata.rulesVersion,
      cardDataVersion: state.cardManifest.cardDataVersion,
    },
  });
  state.effectQueue = [
    {
      id: toQueueEntryId("queue-entry:op11-nami-test-life-move-source"),
      state: "pending",
      timingWindowId: toTimingWindowId(
        "timing-window:op11-nami-test-life-move-source",
      ),
      queueOrigin: { type: "activateMain" },
      generation: 0,
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId,
      orderingGroup: "turnPlayer",
      createdAtEventSeq: state.eventJournal.length,
      queuedAtStateSeq: state.seq,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "test:life-move-effect" },
    } satisfies EffectQueueEntry,
  ];
  return source;
};

const namiLifeActivationActions = (state: GameState, playerId: PlayerId) =>
  getLegalActions(state, playerId).filter(
    (action) =>
      action.type === "activateEffect" &&
      action.effectId === op11NamiLifeEffectId,
  );

test.each([
  { name: "own Life", removedLifePlayerId: p1 },
  { name: "opponent Life", removedLifePlayerId: p2 },
])(
  "OP11 Nami leader can activate once when $name is removed and draw at 7 or less hand",
  ({ removedLifePlayerId }) => {
    const state = createActiveState();
    state.turn.turnPlayerId = p1;
    state.turn.phase = "main";
    const p1State = must(state.players[p1], "p1");
    const definition = installOp11NamiLeader(state, p1);
    const beforeDeck = p1State.deck.length;
    const beforeHand = p1State.hand.length;
    appendLifeRemovedEvent(state, removedLifePlayerId);

    const actions = namiLifeActivationActions(state, p1);

    assert.equal(actions.length, 1);
    const activated = applyAction(state, must(actions[0], "Nami activation"));

    assert.equal(activated.errors, undefined);
    assert.equal(
      must(activated.state.players[p1], "after p1").deck.length,
      beforeDeck - 1,
    );
    assert.equal(
      must(activated.state.players[p1], "after p1").hand.length,
      beforeHand + 1,
    );
    assert.deepEqual(activated.state.oncePerTurn, [
      {
        cardInstanceId: p1State.leader.instanceId,
        effectId: must(definition.effects[0], "life effect").id,
        turnNumber: state.turn.globalTurn,
        usedAtStateSeq: activated.state.oncePerTurn[0]?.usedAtStateSeq,
      },
    ]);
    assert.deepEqual(namiLifeActivationActions(activated.state, p1), []);
  },
);

test("OP11 Nami leader can activate after combat damage removes opponent Life", () => {
  const state = setupAttackState();
  state.turn.turnPlayerId = p1;
  state.turn.phase = "main";
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  installOp11NamiLeader(state, p1);
  const beforeP1Deck = p1State.deck.length;
  const beforeP1Hand = p1State.hand.length;
  const beforeP2Life = p2State.life.length;

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);

  const damaged = passCounterStep(opened.state, p2);
  assert.equal(damaged.errors, undefined);
  assert.equal(
    must(damaged.state.players[p2], "damaged p2").life.length,
    beforeP2Life - 1,
  );
  assert.equal(
    damaged.events.some((event) => event.type === "damageDealt"),
    true,
  );
  assert.equal(
    damaged.events.some((event) => event.type === "cardMoved"),
    true,
  );

  const actions = namiLifeActivationActions(damaged.state, p1);
  assert.equal(actions.length, 1);

  const activated = applyAction(damaged.state, must(actions[0], "Nami draw"));
  assert.equal(activated.errors, undefined);
  assert.equal(
    must(activated.state.players[p1], "after p1").deck.length,
    beforeP1Deck - 1,
  );
  assert.equal(
    must(activated.state.players[p1], "after p1").hand.length,
    beforeP1Hand + 1,
  );
});

test("OP11 Nami leader can activate after an effect removes Life", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  state.turn.phase = "main";
  state.eventJournal = [];
  installOp11NamiLeader(state, p1);
  installSelfLifeMoveSource(state);
  const beforeP1 = must(state.players[p1], "p1 before");
  const beforeDeck = beforeP1.deck.length;
  const beforeHand = beforeP1.hand.length;
  const beforeLife = beforeP1.life.length;
  const topLife = must(beforeP1.life[0], "top life").card;

  const moved = processEffectRuntime(state);
  assert.equal(moved.errors, undefined);
  assert.equal(moved.state.effectQueue.length, 0);
  assert.equal(moved.state.pendingDecision, undefined);
  assert.equal(
    must(moved.state.players[p1], "after move").life.length,
    beforeLife - 1,
  );
  assert.equal(
    must(moved.state.players[p1], "after move").hand.at(-1)?.instanceId,
    topLife.instanceId,
  );

  const actions = namiLifeActivationActions(moved.state, p1);
  assert.equal(actions.length, 1);

  const activated = applyAction(moved.state, must(actions[0], "Nami draw"));
  assert.equal(activated.errors, undefined);
  assert.equal(
    must(activated.state.players[p1], "after p1").deck.length,
    beforeDeck - 1,
  );
  assert.equal(
    must(activated.state.players[p1], "after p1").hand.length,
    beforeHand + 2,
  );
});

test("OP11 Nami leader cannot activate when Life is removed on the opponent turn", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p2;
  state.turn.phase = "main";
  installOp11NamiLeader(state, p1);
  appendLifeRemovedEvent(state, p1);
  appendLifeRemovedEvent(state, p2);

  assert.deepEqual(namiLifeActivationActions(state, p1), []);
});

test("OP11 Nami leader life-removal activation remains once per turn across multiple Life removals", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  state.turn.phase = "main";
  installOp11NamiLeader(state, p1);
  appendLifeRemovedEvent(state, p1);

  const firstAction = must(
    namiLifeActivationActions(state, p1)[0],
    "first Nami activation",
  );
  const first = applyAction(state, firstAction);
  assert.equal(first.errors, undefined);
  appendLifeRemovedEvent(first.state, p2);

  assert.deepEqual(namiLifeActivationActions(first.state, p1), []);
  assert.equal(first.state.oncePerTurn.length, 1);

  const nextTurn = structuredClone(first.state);
  nextTurn.turn.globalTurn += 1;
  nextTurn.seq = toStateSeq(nextTurn.seq + 3);
  appendLifeRemovedEvent(nextTurn, p1);

  assert.equal(namiLifeActivationActions(nextTurn, p1).length, 1);
});

test("OP11 Nami leader opponent-attack effect trashes from hand and gains turn power with attached DON", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const definition = installOp11NamiLeader(state, p2);
  attachOneDonToLeader(state, p2);
  const costCard = must(p2State.hand[0], "Nami hand cost");

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.equal(opened.errors, undefined);
  assert.equal(opened.state.pendingDecision?.type, "payCost");
  assert.equal(opened.state.pendingDecision.playerId, p2);
  assert.equal(opened.state.pendingDecision.cost.type, "trashFromHand");

  const paid = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: opened.state.pendingDecision.id,
    response: {
      type: "payment",
      optionId: "trashFromHand",
      selectedCardInstanceIds: [costCard.instanceId],
    },
  });

  assert.equal(paid.errors, undefined);
  assert.equal(paid.state.battle?.step, "counter");
  assert.equal(paid.state.pendingDecision?.type, "selectCards");
  assert.equal(
    must(paid.state.players[p2], "after p2").trash[0]?.instanceId,
    costCard.instanceId,
  );
  assert.equal(
    computeView(paid.state).cards[p2State.leader.instanceId]?.currentPower,
    7000,
  );
  assert.deepEqual(paid.state.oncePerTurn, [
    {
      cardInstanceId: p2State.leader.instanceId,
      effectId: must(definition.effects[1], "opponent attack effect").id,
      turnNumber: state.turn.globalTurn,
      usedAtStateSeq: paid.state.oncePerTurn[0]?.usedAtStateSeq,
    },
  ]);
});

test("OP11 Nami leader opponent-attack effect can be declined without spending once per turn", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  installOp11NamiLeader(state, p2);
  attachOneDonToLeader(state, p2);

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  assert.equal(opened.state.pendingDecision?.type, "payCost");

  const declined = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: opened.state.pendingDecision.id,
    response: { type: "paymentDeclined" },
  });

  assert.equal(declined.errors, undefined);
  assert.equal(declined.state.battle?.step, "counter");
  assert.equal(declined.state.pendingDecision?.type, "selectCards");
  assert.deepEqual(declined.state.oncePerTurn, []);
  assert.equal(
    computeView(declined.state).cards[p2State.leader.instanceId]?.currentPower,
    5000,
  );
});

test("OP11 Nami leader opponent-attack effect is not offered without attached DON", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  installOp11NamiLeader(state, p2);

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.equal(opened.errors, undefined);
  assert.notEqual(opened.state.pendingDecision?.type, "payCost");
  assert.equal(
    opened.state.effectQueue.some(
      (entry) => entry.effectBlockId === op11NamiOpponentAttackEffectId,
    ),
    false,
  );
});

test("OP11 Nami leader opponent-attack effect is not offered after being used once this turn", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const definition = installOp11NamiLeader(state, p2);
  attachOneDonToLeader(state, p2);
  state.oncePerTurn = [
    {
      cardInstanceId: p2State.leader.instanceId,
      effectId: must(definition.effects[1], "opponent attack effect").id,
      turnNumber: state.turn.globalTurn,
      usedAtStateSeq: state.seq,
    },
  ];

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.equal(opened.errors, undefined);
  assert.notEqual(opened.state.pendingDecision?.type, "payCost");
  assert.equal(
    opened.state.effectQueue.some(
      (entry) => entry.effectBlockId === op11NamiOpponentAttackEffectId,
    ),
    false,
  );
});
