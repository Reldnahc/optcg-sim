import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, SelectionSetId } from "@optcg/types";

import { applyAction } from "../actions.js";
import { applyDeclareAttack } from "./actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "../action-test-fixtures.js";
import {
  addTrashMarker,
  cardRef,
  continuousKeywordEffectRecord,
  passCounterStep,
  setupAttackState,
  setupOpenedBlockStepDecision,
  setupOpenedCharacterTargetBlockStepDecision,
} from "./test-fixtures.js";

const recordSpanNames = (): {
  readonly names: string[];
  readonly profileSpan: <T>(name: string, fn: () => T) => T;
} => {
  const names: string[] = [];
  return {
    names,
    profileSpan(name, fn) {
      names.push(name);
      return fn();
    },
  };
};

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
      state.eventJournal.length + 4,
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

test("live block responses can omit engine result state hashes", () => {
  const { opened, defenderBlocker, decision } = setupOpenedBlockStepDecision();
  const spans = recordSpanNames();

  const blocked = applyAction(
    opened.state,
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [cardRef(defenderBlocker, p2)] },
    },
    {
      includeStateHash: false,
      validateInvariants: false,
      profileSpan: spans.profileSpan,
    },
  );

  assert.equal(blocked.errors, undefined);
  assert.equal(blocked.stateHash, "");
  assert.ok(spans.names.includes("engine:decision:battle"));
});

test("conditional continuous blocker grant opens Block Step decision and can be activated", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const defenderBlocker = must(p2State.characters[0], "defender blocker");
  defenderBlocker.state = "active";
  addTrashMarker(state, p2);
  state.continuousEffects = [
    continuousKeywordEffectRecord(
      state,
      "conditional-blocker-grant",
      defenderBlocker,
      "blocker",
      {
        condition: { type: "trashCount", player: "self", op: "gte", value: 1 },
      },
    ),
  ];
  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.equal(opened.errors, undefined);
  const pending = must(opened.state.pendingDecision, "block decision");
  assert.equal(pending.type, "selectCards");
  assert.deepEqual(pending.candidates, [
    {
      card: cardRef(defenderBlocker, p2),
      visibility: { type: "public" },
    },
  ]);

  const blocked = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: pending.id,
    response: { type: "cards", cards: [cardRef(defenderBlocker, p2)] },
  });

  assert.equal(blocked.errors, undefined);
  assert.equal(
    blocked.events.some((event) => event.type === "blockerActivated"),
    true,
  );
  const result = passCounterStep(blocked.state, p2);
  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p2], "p2 result").trash.some(
      (card) => card.instanceId === defenderBlocker.instanceId,
    ),
    true,
  );
});

test("implemented Opponent's Turn rest protection plus blocker grant opens Block Step decision", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const defenderBlocker = must(p2State.characters[0], "defender blocker");
  defenderBlocker.state = "active";
  const definitionId = "def-opponent-turn-rest-protection-blocker";
  const definition: EffectDefinition = {
    cardId: defenderBlocker.cardId,
    implementationStatus: "implemented-dsl",
    effects: [
      {
        id: "opponent-turn-rest-protection-blocker" as EffectDefinition["effects"][number]["id"],
        category: "permanent",
        trigger: { type: "permanent" },
        condition: { type: "opponentTurn" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "giveProtection",
                target: { type: "self" },
                protection: {
                  process: "rest",
                  sourceKind: "cardEffect",
                  sourceControllerRelation: "opponentControlled",
                  sourceCardCategories: ["leader", "character"],
                },
                duration: {
                  type: "whileConditionTrue",
                  condition: { type: "opponentTurn" },
                },
              },
            },
            {
              connector: "always",
              effect: {
                type: "giveKeyword",
                target: { type: "self" },
                keyword: "blocker",
                duration: {
                  type: "whileConditionTrue",
                  condition: { type: "opponentTurn" },
                },
              },
            },
          ],
        },
      },
    ],
    metadata: {
      sourceTextHash: "source-hash",
      rulesVersion: "r1",
      effectDefinitionsVersion: "fixture",
      tested: true,
      reviewer: "qa-reviewer",
    },
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [definitionId]: definition,
  };
  state.cardManifest.cards[defenderBlocker.cardId] = resolvedCard({
    cardId: defenderBlocker.cardId,
    category: "character",
    power: 3000,
    effectText:
      "[Opponent's Turn] This Character cannot be rested by your opponent's Leader and Character effects and gains [Blocker].",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: definitionId,
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.equal(opened.errors, undefined);
  const pending = must(opened.state.pendingDecision, "block decision");
  assert.equal(pending.type, "selectCards");
  assert.deepEqual(pending.candidates, [
    {
      card: cardRef(defenderBlocker, p2),
      visibility: { type: "public" },
    },
  ]);
});

test("blocker activation queues opponent activation reactions before battle resolves", () => {
  const { opened, p1State, defenderBlocker, decision } =
    setupOpenedBlockStepDecision();
  const source = must(p1State.characters[0], "reaction source");
  const topLife = must(p1State.life[0], "top life").card;
  const revealedTopLifeSet = "set:revealed-top-life" as SelectionSetId;
  opened.state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-blocker-opponent-activation",
      rulesVersion: "blocker-opponent-activation-rules",
      sourceTextHash: "blocker-opponent-activation-source",
    },
  });
  opened.state.cardManifest.cards[topLife.cardId] = resolvedCard({
    cardId: topLife.cardId,
    category: "character",
    cost: 4,
  });
  opened.state.cardManifest.effectDefinitionsVersion = "0.1.0";
  opened.state.cardManifest.effectDefinitions = {
    "def-blocker-opponent-activation": {
      cardId: source.cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: "blocker-opponent-activation-reaction" as EffectDefinition["effects"][number]["id"],
          category: "auto",
          trigger: {
            type: "opponentActivated",
            activations: ["event", "blocker"],
          },
          sourcePresencePolicy: "mustRemainInSameZone",
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: {
                  type: "revealTop",
                  player: "self",
                  zone: "life",
                  count: 1,
                  min: 0,
                  saveAs: revealedTopLifeSet,
                  visibility: "bothPlayers",
                },
              },
              {
                connector: "then",
                effect: {
                  type: "modifyPower",
                  target: { type: "self" },
                  value: {
                    type: "sumSelectedCardCosts",
                    selection: revealedTopLifeSet,
                    multiplier: 1000,
                  },
                  duration: { type: "thisTurn" },
                },
              },
            ],
          },
        },
      ],
      metadata: {
        sourceTextHash: "blocker-opponent-activation-source",
        rulesVersion: "blocker-opponent-activation-rules",
        effectDefinitionsVersion: "0.1.0",
        tested: true,
        reviewer: "qa-reviewer",
      },
    },
  };

  const blocked = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [cardRef(defenderBlocker, p2)] },
  });

  assert.equal(blocked.errors, undefined);
  assert.equal(
    blocked.events.some((event) => event.type === "blockerActivated"),
    true,
  );
  assert.equal(
    must(blocked.state.battle, "battle").blocker?.cardId,
    defenderBlocker.cardId,
  );
  const pending = must(blocked.state.pendingDecision, "reaction reveal");
  assert.equal(pending.type, "chooseQuantity");

  const resolved = applyAction(blocked.state, {
    type: "respondToDecision",
    decisionId: pending.id,
    response: { type: "chooseQuantity", quantity: 1 },
  });

  assert.equal(resolved.errors, undefined);
  const passed = passCounterStep(resolved.state, p2);
  assert.equal(passed.errors, undefined);
  assert.equal(passed.state.pendingDecision, undefined);
  assert.equal(passed.state.battle, undefined);
  assert.equal(
    passed.state.continuousEffects.some(
      (effect) =>
        effect.modifier.layer === "powerAdd" &&
        effect.modifier.operation.type === "addPower" &&
        effect.modifier.operation.value === 4000 &&
        effect.source.instanceId === source.instanceId,
    ),
    true,
  );
});

test("empty block-step respondToDecision declines and resumes existing no-block battle resolution path", () => {
  const { opened, decision: pending } = setupOpenedBlockStepDecision();

  const declined = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: pending.id,
    response: { type: "cards", cards: [] },
  });

  assert.equal(declined.errors, undefined);
  const result = passCounterStep(declined.state, p2);
  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.battle, undefined);
  assert.equal(result.state.actionSeq, opened.state.actionSeq + 3);
  assert.equal(
    result.events.some((event) => event.type === "decisionResolved"),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "damageDealt"),
    true,
  );
  const events = [...declined.events, ...result.events];
  const decisionResolved = events.find(
    (event) => event.type === "decisionResolved",
  );
  const resolvedEvent = must(decisionResolved, "decisionResolved event");
  assert.deepEqual(resolvedEvent.visibility, { type: "public" });
  assert.deepEqual(resolvedEvent.payload, {
    decisionId: pending.id,
    playerId: p2,
  });
  assert.equal(result.events[0]?.type, "decisionResolved");
  const replayDeclined = applyAction(structuredClone(opened.state), {
    type: "respondToDecision",
    decisionId: pending.id,
    response: { type: "cards", cards: [] },
  });
  const replay = passCounterStep(replayDeclined.state, p2);
  assert.equal(result.stateHash, replay.stateHash);
  assert.deepEqual(result.events, replay.events);
});

test("blocker selection response K.O.s blocker, clears battle, and preserves original Leader life", () => {
  const { opened, p2State, defenderBlocker, decision } =
    setupOpenedBlockStepDecision();
  const originalTarget = cardRef(p2State.leader, p2);
  const blocker = cardRef(defenderBlocker, p2);
  const beforeLife = p2State.life.length;

  const blocked = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [blocker] },
  });

  assert.equal(blocked.errors, undefined);
  const result = passCounterStep(blocked.state, p2);
  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.actionSeq, opened.state.actionSeq + 2);
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
  const events = [...blocked.events, ...result.events];
  assert.deepEqual(
    events.map((event) => ({
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
          attacker: cardRef(
            must(opened.state.players[p1], "opened p1").leader,
            p1,
          ),
          blocker,
          previousTarget: originalTarget,
          currentTarget: blocker,
          attackerPower: 5000,
          defenderPower: 3000,
        },
        visibility: { type: "public" },
      },
      {
        type: "cardRested",
        payload: {
          playerId: p2,
          instanceId: defenderBlocker.instanceId,
          cardId: defenderBlocker.cardId,
          category: "character",
          sourceKind: "blocker",
          sourceControllerId: p2,
        },
        visibility: { type: "public" },
      },
      {
        type: "decisionCreated",
        payload: {
          decisionId: must(blocked.state.pendingDecision, "counter decision")
            .id,
          decisionType: "selectCards",
          playerId: p2,
        },
        visibility: { type: "public" },
      },
      {
        type: "decisionResolved",
        payload: {
          decisionId: must(blocked.state.pendingDecision, "counter decision")
            .id,
          playerId: p2,
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
        type: "battleEnded",
        payload: {
          attacker: opened.state.battle?.attacker,
          target: blocker,
          originalTarget,
          blocker,
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

  const blocked = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [blocker] },
  });

  assert.equal(blocked.errors, undefined);
  const result = passCounterStep(blocked.state, p2);
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

  const blocked = applyAction(context.opened.state, {
    type: "respondToDecision",
    decisionId: context.decision.id,
    response: { type: "cards", cards: [blocker] },
  });

  assert.equal(blocked.errors, undefined);
  const result = passCounterStep(blocked.state, p2);
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

  const blocked = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [blocker] },
  });

  assert.equal(blocked.errors, undefined);
  const result = passCounterStep(blocked.state, p2);
  assert.equal(result.errors, undefined);
  const nextP2 = must(result.state.players[p2], "p2");
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

  const blocked = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [blocker] },
  });
  const replayBlocked = applyAction(structuredClone(opened.state), {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [blocker] },
  });

  assert.equal(blocked.errors, undefined);
  const result = passCounterStep(blocked.state, p2);
  assert.equal(result.errors, undefined);
  assert.equal(replayBlocked.errors, undefined);
  const replay = passCounterStep(replayBlocked.state, p2);
  const events = [...blocked.events, ...result.events];
  const replayEvents = [...replayBlocked.events, ...replay.events];
  assert.deepEqual(
    events.map((event) => event.type),
    [
      "decisionResolved",
      "blockerActivated",
      "cardRested",
      "decisionCreated",
      "decisionResolved",
      "damageDealt",
      "cardKOd",
      "cardMoved",
      "battleEnded",
      "effectResolved",
      "ruleProcessingChecked",
    ],
  );
  assert.deepEqual(
    events.map((event) => event.visibility),
    [
      { type: "public" },
      { type: "public" },
      { type: "public" },
      { type: "public" },
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
    events.map((event) => event.seq),
    events.map((_, index) => opened.state.eventJournal.length + index + 1),
  );
  assert.deepEqual(result.state.eventJournal.slice(-events.length), events);
  assert.equal(
    result.stateHash,
    "67830e7b52b3ec1ef8f59e369d3f88db74f3a11c00b84181c9b508a237570b84",
  );
  assert.equal(result.stateHash, replay.stateHash);
  assert.deepEqual(events, replayEvents);
});
