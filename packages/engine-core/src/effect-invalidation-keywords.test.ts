import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  ContinuousEffectRecord,
  EffectEntryPointFilter,
  GameState,
  Keyword,
  PlayerId,
} from "@optcg/types";

import { applyAction, getLegalActions } from "./actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "./action-test-fixtures.js";
import {
  cardRef,
  effectDefinition,
  installSupportedCounterEvent,
  passCounterStep,
  setupAttackState,
} from "./battle/test-fixtures.js";
import { applyDeclareAttack } from "./battle/actions.js";
import { computeView } from "./view/compute-view.js";
import { filterStateForPlayer } from "./view/filter-state-for-player.js";
import { getSupportedLifeTriggerDecision } from "./life-trigger/actions.js";

const sourceSnapshot = (
  source: CardInstance,
  playerId: PlayerId,
): ContinuousEffectRecord["sourceSnapshot"] => ({
  instanceId: source.instanceId,
  cardId: source.cardId,
  ownerId: source.owner,
  controllerId: playerId,
  zone: source.zone,
  category: source.zone.zone === "leaderArea" ? "leader" : "character",
  colors: ["red"],
  power: source.zone.zone === "leaderArea" ? 5000 : 3000,
  keywords: [],
});

const invalidateCardEffectsRecord = (
  state: GameState,
  target: CardInstance,
  controller: PlayerId = p2,
): ContinuousEffectRecord => {
  const source = must(
    state.players[controller],
    "invalidation controller",
  ).leader;
  return {
    id: `continuous:invalidate-card:${String(target.instanceId)}`,
    source: cardRef(source, controller),
    sourceSnapshot: sourceSnapshot(source, controller),
    controller,
    modifier: {
      layer: "effectInvalidation",
      target: {
        type: "exactCard",
        card: cardRef(target, target.controller),
        binding: {
          family: "selectedTargets",
          saveResultAs: "selected:negated-card",
        },
        createdAtStateSeq: state.seq,
      },
      operation: { type: "invalidateEffects" },
    },
    duration: { type: "thisTurn" },
    createdBy: { type: "ruleProcess", name: "test-negate-card" },
    createdAtStateSeq: state.seq,
  };
};

const invalidateEntryPointRecord = (
  state: GameState,
  controller: PlayerId,
  targetPlayer: "self" | "opponent",
  entryPoint: EffectEntryPointFilter["type"],
): ContinuousEffectRecord => {
  const source = must(
    state.players[controller],
    "entry-point controller",
  ).leader;
  return {
    id: `continuous:invalidate-entry:${entryPoint}`,
    source: cardRef(source, controller),
    sourceSnapshot: sourceSnapshot(source, controller),
    controller,
    modifier: {
      layer: "effectInvalidation",
      target: { type: "player", player: targetPlayer },
      operation: {
        type: "invalidateEffectEntryPoint",
        effectEntryPoint: { type: entryPoint },
      },
    },
    duration: { type: "thisTurn" },
    createdBy: { type: "ruleProcess", name: "test-negate-entry-point" },
    createdAtStateSeq: state.seq,
  };
};

const exactKeywordGrantRecord = (
  state: GameState,
  source: CardInstance,
  target: CardInstance,
  keyword: Keyword,
): ContinuousEffectRecord => ({
  id: `continuous:grant:${keyword}:${String(target.instanceId)}`,
  source: cardRef(source, source.controller),
  sourceSnapshot: sourceSnapshot(source, source.controller),
  controller: source.controller,
  modifier: {
    layer: "keywordAdd",
    target: {
      type: "exactCard",
      card: cardRef(target, target.controller),
      binding: {
        family: "selectedTargets",
        saveResultAs: "selected:keyword-grant-target",
      },
      createdAtStateSeq: state.seq,
    },
    operation: { type: "addKeyword", keyword },
  },
  duration: { type: "thisTurn" },
  createdBy: { type: "ruleProcess", name: "test-keyword-grant" },
  createdAtStateSeq: state.seq,
});

test("card-level negation removes printed combat keywords but not later external keyword grants", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  attacker.turnPlayed = state.turn.globalTurn;
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
    printedKeywords: ["rush", "doubleAttack", "banish", "unblockable"],
  });
  state.continuousEffects = [invalidateCardEffectsRecord(state, attacker)];

  const negatedView = computeView(state);

  assert.deepEqual(negatedView.cards[attacker.instanceId]?.keywords, []);
  assert.equal(
    negatedView.cards[attacker.instanceId]?.effectsInvalidated,
    true,
  );
  assert.deepEqual(negatedView.legalAttackTargets[attacker.instanceId], []);

  state.continuousEffects.push(
    exactKeywordGrantRecord(state, p1State.leader, attacker, "rush"),
  );
  const grantedView = computeView(state);

  assert.deepEqual(grantedView.cards[attacker.instanceId]?.keywords, ["rush"]);
  assert.deepEqual(grantedView.legalAttackTargets[attacker.instanceId], [
    p2State.leader.instanceId,
    must(p2State.characters[0], "rested target").instanceId,
  ]);
});

test("card-level negation suppresses printed Blocker and printed Unblockable", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const blocker = must(p2State.characters[0], "blocker");
  blocker.state = "active";
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[blocker.cardId] = resolvedCard({
    cardId: blocker.cardId,
    category: "character",
    power: 3000,
    printedKeywords: ["blocker"],
  });
  state.battle = {
    attacker: cardRef(attacker, p1),
    originalTarget: cardRef(p2State.leader, p2),
    currentTarget: cardRef(p2State.leader, p2),
    step: "block",
    damageCount: 1,
  };
  state.continuousEffects = [invalidateCardEffectsRecord(state, blocker)];

  const blockerNegatedView = computeView(state);

  assert.equal(blockerNegatedView.cards[blocker.instanceId]?.canBlock, false);

  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "leader",
    power: 5000,
    printedKeywords: ["unblockable"],
  });
  state.continuousEffects = [invalidateCardEffectsRecord(state, attacker, p2)];
  const unblockableNegatedView = computeView(state);

  assert.equal(
    unblockableNegatedView.cards[blocker.instanceId]?.canBlock,
    true,
  );
});

test("negated printed Double Attack and Banish resolve as one normal leader damage", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "leader",
    power: 5000,
    printedKeywords: ["doubleAttack", "banish"],
  });
  state.continuousEffects = [invalidateCardEffectsRecord(state, attacker, p2)];
  const lifeBefore = p2State.life.length;
  const handBefore = p2State.hand.length;
  const trashBefore = p2State.trash.length;

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(attacker, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.equal(opened.errors, undefined);
  assert.equal(opened.state.battle?.damageCount, 1);

  const resolved = passCounterStep(opened.state, p2);

  assert.equal(resolved.errors, undefined);
  const resolvedP2 = must(resolved.state.players[p2], "resolved p2");
  assert.equal(resolvedP2.life.length, lifeBefore - 1);
  assert.equal(resolvedP2.hand.length, handBefore + 1);
  assert.equal(resolvedP2.trash.length, trashBefore);
});

test("printed Double Attack negated after declaration resolves as one normal leader damage", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "leader",
    power: 5000,
    printedKeywords: ["doubleAttack"],
  });
  const lifeBefore = p2State.life.length;
  const handBefore = p2State.hand.length;

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(attacker, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.equal(opened.errors, undefined);
  assert.equal(opened.state.battle?.damageCount, 2);
  const negatedDuringBattle: GameState = {
    ...opened.state,
    continuousEffects: [
      ...opened.state.continuousEffects,
      invalidateCardEffectsRecord(opened.state, attacker, p2),
    ],
  };

  const resolved = passCounterStep(negatedDuringBattle, p2);

  assert.equal(resolved.errors, undefined);
  const resolvedP2 = must(resolved.state.players[p2], "resolved p2");
  assert.equal(resolvedP2.life.length, lifeBefore - 1);
  assert.equal(resolvedP2.hand.length, handBefore + 1);
  assert.equal(
    resolved.events.filter((event) => event.type === "damageDealt").length,
    1,
  );
});

test("entry-point invalidation suppresses Counter effect activation", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterEvent = must(p2State.hand[0], "counter event");
  installSupportedCounterEvent(state, counterEvent, 2000);
  state.continuousEffects = [
    invalidateEntryPointRecord(state, p1, "opponent", "counter"),
  ];

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
  const rejected = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterEvent.instanceId,
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(rejected.errors?.[0]?.type, "illegalAction");
});

test("entry-point invalidation leaves damaged life trigger available only as add-to-hand", () => {
  const state = setupAttackState();
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const cardId = toCardId("negated-trigger-life");
  const definition = effectDefinition(cardId, { type: "trigger" });
  const effect = must(definition.effects[0], "trigger effect");
  const supported = {
    ...definition,
    effects: [
      {
        ...effect,
        sourcePresencePolicy: "resolveFromLastKnownInformation" as const,
      },
    ],
  };
  topLife.card.cardId = cardId;
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "character",
    power: 1000,
    triggerText: "TRIGGER: draw 1",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-negated-trigger-life",
      rulesVersion: supported.metadata.rulesVersion,
      sourceTextHash: supported.metadata.sourceTextHash,
    },
  });
  state.cardManifest.effectDefinitionsVersion =
    supported.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-negated-trigger-life": supported,
  };
  state.continuousEffects = [
    invalidateEntryPointRecord(state, p1, "opponent", "trigger"),
  ];

  const supportedDecision = getSupportedLifeTriggerDecision(
    state,
    p2,
    topLife.card,
  );
  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(must(state.players[p1], "p1").leader, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.equal(supportedDecision, undefined);
  assert.equal(opened.errors, undefined);
  const damaged = passCounterStep(opened.state, p2);

  assert.equal(damaged.errors, undefined);
  assert.equal(damaged.state.pendingDecision?.type, "confirmLifeTrigger");
  assert.deepEqual(damaged.state.pendingDecision.options, ["addToHand"]);
});

test("player views expose card-level negation as a public board-card status", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const target = must(p1State.characters[0], "target");
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
    printedKeywords: ["rush", "blocker"],
  });
  state.continuousEffects = [invalidateCardEffectsRecord(state, target)];

  const view = filterStateForPlayer(state, p1);
  const publicTarget = must(view.self.characters[0], "public target");

  assert.equal(publicTarget.effectsInvalidated, true);
  assert.deepEqual(publicTarget.keywords, []);
  assert.equal("effectsInvalidated" in must(view.self.hand[0], "hand"), false);
});
