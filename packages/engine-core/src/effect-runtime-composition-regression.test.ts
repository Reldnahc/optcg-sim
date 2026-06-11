import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import type { EffectDefinition, EngineEvent } from "@optcg/types";

import { applyAction, getLegalActions } from "./actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "./action-test-fixtures.js";
import {
  effectDefinition,
  installSupportedCounterEvent,
  setupAttackState,
} from "./battle/test-fixtures.js";
import {
  processDefenderOpponentAttackTiming,
  processEffectRuntime,
  queueBattleKOTriggers,
} from "./effect-runtime.js";
import {
  attackQueueingState,
  opponentAttackQueueingState,
  queueingState,
  setupOnPlayDefinition,
} from "./runtime/trigger-queueing/test-support.js";
import { getSupportedLifeTriggerDecision } from "./life-trigger/actions.js";
import { reviewedOnPlayDrawDefinition } from "./action-test-fixtures.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const fullDefinitionSizeAuthorizationPattern =
  /\b(?:lookup\.)?definition\.effects\.length\s*(?:[!=]==?\s*(?!0\b)\d+|[<>]=?\s*(?!0\b)\d+)/;

test("source-shape pattern targets top-level full-definition-size authorization only", () => {
  const rejected = [
    "if (definition.effects.length === 1) return true;",
    "if (definition.effects.length !== 1) return false;",
    "if (definition.effects.length === 2) return true;",
    "if (definition.effects.length !== 2) return false;",
    "if (lookup.definition.effects.length === 3) return true;",
    "if (lookup.definition.effects.length !== 3) return false;",
    "if (lookup.definition.effects.length > 1) return false;",
    "if (lookup.definition.effects.length < 2) return false;",
    "if (definition.effects.length >= 2) return false;",
  ];
  for (const source of rejected) {
    assert.equal(
      fullDefinitionSizeAuthorizationPattern.test(source),
      true,
      `must catch full-definition-size authorization gate: ${source}`,
    );
  }

  const allowed = [
    "if (definition.effects.length === 0) return false;",
    "return definition.effects.length > 0;",
    "effectBlock.effect.effects.length === 0",
    "for (let index = 0; index < effect.effects.length; index += 1)",
  ];
  for (const source of allowed) {
    assert.equal(
      fullDefinitionSizeAuthorizationPattern.test(source),
      false,
      `must allow non-authorization arity check: ${source}`,
    );
  }
});

const reusableSequenceBody: EffectDefinition["effects"][number]["effect"] = {
  type: "sequence",
  effects: [
    { connector: "always", effect: { type: "draw", count: 1, player: "self" } },
    {
      connector: "then",
      effect: { type: "drawUpTo", count: 1, player: "self" },
    },
  ],
};

test("multi-effect trigger matrix keeps supported queueing across onPlay/whenAttacking/onOpponentAttack/main/onKO", () => {
  const onPlay = queueingState();
  const onPlayCard = resolvedCard({
    cardId: onPlay.played.cardId,
    category: "character",
  });
  const onPlayBase = reviewedOnPlayDrawDefinition(
    onPlay.played.cardId,
    onPlayCard.support,
  );
  const onPlayEffect = must(onPlayBase.effects[0], "onPlay effect");
  setupOnPlayDefinition(
    onPlay.state,
    onPlay.played,
    {
      ...onPlayBase,
      effects: [
        { ...onPlayEffect, effect: { type: "draw", count: 1, player: "self" } },
        {
          ...onPlayEffect,
          id: "matrix:onPlay:irrelevant" as typeof onPlayEffect.id,
          trigger: { type: "whenAttacking" },
        },
      ],
    },
    "def-matrix-on-play",
  );
  onPlay.state.cardManifest.cards[onPlay.played.cardId] = {
    ...onPlayCard,
    support: {
      ...onPlayCard.support,
      status: "implemented-dsl",
      effectDefinitionId: "def-matrix-on-play",
    },
  };
  assert.equal(processEffectRuntime(onPlay.state).state.effectQueue.length, 1);

  const attacking = attackQueueingState();
  const attackingEffect = must(
    attacking.definition.effects[0],
    "whenAttacking effect",
  );
  attacking.state.cardManifest.effectDefinitions = {
    "def-when-attacking": {
      ...attacking.definition,
      effects: [
        { ...attackingEffect, effect: reusableSequenceBody },
        {
          ...attackingEffect,
          id: "matrix:whenAttacking:irrelevant" as typeof attackingEffect.id,
          trigger: { type: "onPlay" },
        },
      ],
    },
  };
  assert.equal(
    processEffectRuntime(attacking.state).state.effectQueue.length,
    1,
  );

  const opponentAttack = opponentAttackQueueingState();
  const opponentAttackEffect = must(
    opponentAttack.definition.effects[0],
    "onOpponentAttack effect",
  );
  opponentAttack.state.cardManifest.effectDefinitions = {
    "def-on-opponent-attack": {
      ...opponentAttack.definition,
      effects: [
        {
          ...opponentAttackEffect,
          effect: { type: "draw", count: 1, player: "self" },
        },
        {
          ...opponentAttackEffect,
          id: "matrix:onOpponentAttack:irrelevant" as typeof opponentAttackEffect.id,
          trigger: { type: "onPlay" },
        },
      ],
    },
  };
  const opponentAttackResult = processDefenderOpponentAttackTiming(
    opponentAttack.state,
  );
  assert.equal(opponentAttackResult.errors, undefined);
  assert.equal(
    opponentAttackResult.events.some((event) => event.type === "effectQueued"),
    true,
  );

  const mainEventState = queueingState().state;
  const p1State = must(mainEventState.players[p1], "p1");
  const event = must(p1State.hand[0], "event source");
  const eventInTrash = {
    ...event,
    zone: { zone: "trash", playerId: p1, slot: "trash", index: 0 } as const,
  };
  p1State.hand = p1State.hand.slice(1);
  p1State.trash = [eventInTrash];
  mainEventState.eventJournal.push({
    id: "event:main:1:cardPlayed" as never,
    seq: mainEventState.eventJournal.length + 1,
    type: "cardPlayed",
    payload: {
      playerId: p1,
      instanceId: eventInTrash.instanceId,
      cardId: eventInTrash.cardId,
      category: "event",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "turnFlow" },
    createdAtStateSeq: mainEventState.seq,
  });
  const mainDefinition = effectDefinition(event.cardId, { type: "main" });
  const mainEffect = must(mainDefinition.effects[0], "main effect");
  mainEventState.cardManifest.cards[event.cardId] = resolvedCard({
    cardId: event.cardId,
    category: "event",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-main-matrix",
    },
  });
  mainEventState.cardManifest.effectDefinitions = {
    "def-main-matrix": {
      ...mainDefinition,
      effects: [
        {
          ...mainEffect,
          sourcePresencePolicy: "resolveFromDestinationZone",
          effect: { type: "draw", count: 1, player: "self" },
        },
        {
          ...mainEffect,
          id: "matrix:main:irrelevant" as typeof mainEffect.id,
          trigger: { type: "onPlay" },
        },
      ],
    },
  };
  assert.equal(
    processEffectRuntime(mainEventState).state.effectQueue.length,
    1,
  );

  const onKOState = setupAttackState();
  onKOState.turn.turnPlayerId = p1;
  const p2State = must(onKOState.players[p2], "p2");
  const source = must(p2State.hand[0], "onKO source");
  const sourceOnField = {
    ...source,
    zone: {
      zone: "characterArea",
      playerId: p2,
      slot: "character",
      index: 0,
    } as const,
    state: "active" as const,
    attachedDon: [],
    turnPlayed: onKOState.turn.globalTurn,
  };
  p2State.hand = p2State.hand.slice(1);
  p2State.characters = [sourceOnField];
  const koDefinition = effectDefinition(source.cardId, { type: "onKO" });
  const onKOEffect = must(koDefinition.effects[0], "onKO effect");
  onKOState.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-on-ko-matrix",
    },
  });
  onKOState.cardManifest.effectDefinitions = {
    "def-on-ko-matrix": {
      ...koDefinition,
      effects: [
        { ...onKOEffect, sourcePresencePolicy: "resolveFromDestinationZone" },
        {
          ...onKOEffect,
          id: "matrix:onKO:irrelevant" as typeof onKOEffect.id,
          trigger: { type: "onPlay" },
        },
      ],
    },
  };
  const trashed = {
    ...sourceOnField,
    zone: { zone: "trash", playerId: p2, slot: "trash", index: 0 } as const,
  };
  p2State.characters = [];
  p2State.trash = [trashed];
  const koEvents: EngineEvent[] = [
    {
      id: "event:matrix:onko:1:cardKOd" as never,
      seq: onKOState.eventJournal.length + 1,
      type: "cardKOd",
      payload: { playerId: p2, instanceId: sourceOnField.instanceId },
      visibility: { type: "public" },
      causedBy: { type: "ruleProcess", name: "battleResolution" },
      createdAtStateSeq: onKOState.seq,
    },
    {
      id: "event:matrix:onko:2:cardMoved" as never,
      seq: onKOState.eventJournal.length + 2,
      type: "cardMoved",
      payload: {
        instanceId: sourceOnField.instanceId,
        cardId: sourceOnField.cardId,
        from: sourceOnField.zone,
        to: trashed.zone,
        reason: "ko",
      },
      visibility: { type: "public" },
      causedBy: { type: "ruleProcess", name: "battleResolution" },
      createdAtStateSeq: onKOState.seq,
    },
  ];
  const queuedKO = queueBattleKOTriggers(onKOState, onKOState, koEvents);
  assert.equal(queuedKO.ok, true);
  assert.equal(queuedKO.state.effectQueue.length, 1);
  assert.equal(queuedKO.state.effectQueue[0]?.effectBlockId, onKOEffect.id);
});

test("cross-entry-point body matrix supports no-choice and sequence bodies only with adapter evidence", () => {
  const onPlay = queueingState();
  const supportCard = resolvedCard({
    cardId: onPlay.played.cardId,
    category: "character",
  });
  const onPlayDef = reviewedOnPlayDrawDefinition(
    onPlay.played.cardId,
    supportCard.support,
  );
  setupOnPlayDefinition(
    onPlay.state,
    onPlay.played,
    onPlayDef,
    "def-cross-on-play",
  );
  const onPlayQueued = processEffectRuntime(onPlay.state);
  assert.equal(onPlayQueued.errors, undefined);
  assert.equal(onPlayQueued.state.effectQueue.length, 1);

  const attacking = attackQueueingState();
  const attackEffect = must(
    attacking.definition.effects[0],
    "attacking effect",
  );
  attacking.state.cardManifest.effectDefinitions = {
    "def-when-attacking": {
      ...attacking.definition,
      effects: [{ ...attackEffect, effect: reusableSequenceBody }],
    },
  };
  const queued = processEffectRuntime(attacking.state);
  const paused = processEffectRuntime(queued.state);
  assert.equal(queued.errors, undefined);
  assert.equal(paused.errors, undefined);
  assert.equal(paused.state.pendingDecision?.type, "chooseQuantity");
});

test("negative adapter/body matrix fails closed for unsupported wrappers, unsupported body, and duplicate same-entrypoint ambiguity", () => {
  const attacking = attackQueueingState();
  const base = must(attacking.definition.effects[0], "whenAttacking effect");
  attacking.state.cardManifest.effectDefinitions = {
    "def-when-attacking": {
      ...attacking.definition,
      effects: [
        { ...base, effect: { type: "draw", count: 1, player: "self" } },
        {
          ...base,
          id: "matrix:unsupported-body" as typeof base.id,
          effect: { type: "ko", target: { type: "opponentLeader" } },
        },
      ],
    },
  };
  const unsupportedBody = processEffectRuntime(attacking.state);
  assert.deepEqual(unsupportedBody.events, []);
  assert.equal(unsupportedBody.errors?.[0]?.type, "effectRuntimeError");

  const ambiguous = queueingState();
  const ambiguousCard = resolvedCard({
    cardId: ambiguous.played.cardId,
    category: "character",
  });
  const ambiguousDef = effectDefinition(ambiguous.played.cardId, {
    type: "onPlay",
  });
  const ambiguousEffect = must(ambiguousDef.effects[0], "onPlay");
  setupOnPlayDefinition(
    ambiguous.state,
    ambiguous.played,
    {
      ...ambiguousDef,
      effects: [
        ambiguousEffect,
        {
          ...ambiguousEffect,
          id: "matrix:duplicate-on-play" as typeof ambiguousEffect.id,
        },
      ],
    },
    "def-ambiguous-on-play",
  );
  ambiguous.state.cardManifest.cards[ambiguous.played.cardId] = {
    ...ambiguousCard,
    support: {
      ...ambiguousCard.support,
      status: "implemented-dsl",
      effectDefinitionId: "def-ambiguous-on-play",
    },
  };
  const ambiguousResult = processEffectRuntime(ambiguous.state);
  assert.deepEqual(ambiguousResult.events, []);
  assert.equal(ambiguousResult.errors?.[0]?.type, "effectRuntimeError");

  const unsupportedAdapter = queueingState();
  const unsupportedAdapterCard = resolvedCard({
    cardId: unsupportedAdapter.played.cardId,
    category: "character",
  });
  const unsupportedAdapterDef = reviewedOnPlayDrawDefinition(
    unsupportedAdapter.played.cardId,
    unsupportedAdapterCard.support,
  );
  const supportedBody = must(
    unsupportedAdapterDef.effects[0],
    "supported onPlay body",
  );
  setupOnPlayDefinition(
    unsupportedAdapter.state,
    unsupportedAdapter.played,
    {
      ...unsupportedAdapterDef,
      effects: [
        {
          ...supportedBody,
          trigger: { type: "custom", event: "matrixUnsupportedAdapter" },
          sourcePresencePolicy: "mustRemainInSameZone",
        },
      ],
    },
    "def-unsupported-adapter",
  );
  unsupportedAdapter.state.cardManifest.cards[
    unsupportedAdapter.played.cardId
  ] = {
    ...unsupportedAdapterCard,
    support: {
      ...unsupportedAdapterCard.support,
      status: "implemented-dsl",
      effectDefinitionId: "def-unsupported-adapter",
    },
  };
  const beforeUnsupportedAdapter = structuredClone(unsupportedAdapter.state);
  const unsupportedAdapterResult = processEffectRuntime(
    unsupportedAdapter.state,
  );
  assert.deepEqual(unsupportedAdapterResult.events, []);
  assert.deepEqual(
    unsupportedAdapterResult.state.effectQueue,
    beforeUnsupportedAdapter.effectQueue,
  );
});

test("life-trigger and counter matrices preserve supported wrappers and fail closed on unsupported composition", () => {
  const lifeState = setupAttackState();
  const lifeTop = must(must(lifeState.players[p2], "p2").life[0], "life top");
  const lifeCardId = toCardId("matrix-life-trigger");
  lifeTop.card.cardId = lifeCardId;
  const lifeDef = effectDefinition(lifeCardId, { type: "trigger" });
  const trigger = must(lifeDef.effects[0], "trigger");
  const triggerWithoutFlags = { ...trigger };
  delete triggerWithoutFlags.optional;
  delete triggerWithoutFlags.oncePerTurn;
  lifeState.cardManifest.cards[lifeCardId] = resolvedCard({
    cardId: lifeCardId,
    category: "character",
    triggerText: "TRIGGER: draw 1",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-life-trigger",
    },
  });
  lifeState.cardManifest.effectDefinitions = {
    "def-life-trigger": {
      ...lifeDef,
      effects: [
        {
          ...triggerWithoutFlags,
          sourcePresencePolicy: "resolveFromLastKnownInformation",
        },
      ],
    },
  };
  assert.ok(getSupportedLifeTriggerDecision(lifeState, p2, lifeTop.card));

  lifeState.cardManifest.effectDefinitions = {
    "def-life-trigger": {
      ...lifeDef,
      effects: [
        {
          ...triggerWithoutFlags,
          sourcePresencePolicy: "resolveFromLastKnownInformation",
        },
        {
          ...triggerWithoutFlags,
          id: `${String(triggerWithoutFlags.id)}:second` as typeof triggerWithoutFlags.id,
          sourcePresencePolicy: "resolveFromLastKnownInformation",
          effect: { type: "draw", count: 2, player: "self" },
        },
      ],
    },
  };
  assert.ok(getSupportedLifeTriggerDecision(lifeState, p2, lifeTop.card));

  lifeState.cardManifest.effectDefinitions = {
    "def-life-trigger": {
      ...lifeDef,
      effects: [
        {
          ...triggerWithoutFlags,
          sourcePresencePolicy: "resolveFromLastKnownInformation",
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                saveResultAs: "saved-ref",
                effect: {
                  type: "selectTargets",
                  request: {
                    timing: "onResolution",
                    chooser: "self",
                    player: "opponent",
                    zone: "characterArea",
                    min: 1,
                    max: 1,
                    allowFewerIfUnavailable: false,
                    visibility: "public",
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };
  assert.ok(getSupportedLifeTriggerDecision(lifeState, p2, lifeTop.card));

  const counterState = setupAttackState();
  const attacker = must(counterState.players[p1], "p1").leader;
  const defender = must(counterState.players[p2], "p2").leader;
  const defenderHand = must(counterState.players[p2], "p2").hand;
  const counterCard = must(defenderHand[0], "counter card");
  installSupportedCounterEvent(counterState, counterCard, 1000);
  const opened = applyAction(counterState, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: defender.instanceId,
      cardId: defender.cardId,
      playerId: p2,
    },
  });
  assert.equal(opened.errors, undefined);
  const legal = getLegalActions(opened.state, p2);
  assert.equal(
    legal.some(
      (action) =>
        action.type === "useCounter" &&
        action.cardInstanceId === counterCard.instanceId,
    ),
    true,
  );
  const useCounter = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target: must(opened.state.battle, "opened battle").currentTarget,
  });
  assert.equal(useCounter.errors, undefined);
  assert.equal(
    useCounter.events.some((event) => event.type === "counterUsed"),
    true,
  );
  const counterDefId = `${String(counterCard.cardId)}:counter`;
  const counterDef = must(
    opened.state.cardManifest.effectDefinitions?.[counterDefId],
    "counter definition",
  );
  const counterEffect = must(counterDef.effects[0], "counter effect");
  opened.state.cardManifest.effectDefinitions = {
    ...opened.state.cardManifest.effectDefinitions,
    [counterDefId]: {
      ...counterDef,
      effects: [
        counterEffect,
        {
          ...counterEffect,
          id: `${String(counterEffect.id)}:irrelevant-main` as typeof counterEffect.id,
          trigger: { type: "main" },
        },
      ],
    },
  };
  const legalMultiEffect = getLegalActions(opened.state, p2);
  assert.equal(
    legalMultiEffect.some(
      (action) =>
        action.type === "useCounter" &&
        action.cardInstanceId === counterCard.instanceId,
    ),
    true,
  );
  const useCounterMultiEffect = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target: must(opened.state.battle, "opened battle").currentTarget,
  });
  assert.equal(useCounterMultiEffect.errors, undefined);
  assert.equal(
    useCounterMultiEffect.events.some((event) => event.type === "counterUsed"),
    true,
  );

  const unsupportedState = setupAttackState();
  const unsupportedAttacker = must(unsupportedState.players[p1], "p1").leader;
  const unsupportedDefender = must(unsupportedState.players[p2], "p2").leader;
  const unsupportedCard = must(
    must(unsupportedState.players[p2], "p2").hand[0],
    "unsupported counter card",
  );
  installSupportedCounterEvent(unsupportedState, unsupportedCard, 1000);
  const effectDefinitionId = `${String(unsupportedCard.cardId)}:counter`;
  const unsupportedCounterDef = must(
    unsupportedState.cardManifest.effectDefinitions?.[effectDefinitionId],
    "counter definition",
  );
  const unsupportedCounterEffect = must(
    unsupportedCounterDef.effects[0],
    "counter effect",
  );
  unsupportedState.cardManifest.effectDefinitions = {
    ...unsupportedState.cardManifest.effectDefinitions,
    [effectDefinitionId]: {
      ...unsupportedCounterDef,
      effects: [
        unsupportedCounterEffect,
        {
          ...unsupportedCounterEffect,
          id: `${String(unsupportedCounterEffect.id)}:duplicate` as typeof unsupportedCounterEffect.id,
          oncePerTurn: true,
        },
      ],
    },
  };
  const unsupportedOpened = applyAction(unsupportedState, {
    type: "declareAttack",
    attacker: {
      instanceId: unsupportedAttacker.instanceId,
      cardId: unsupportedAttacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: unsupportedDefender.instanceId,
      cardId: unsupportedDefender.cardId,
      playerId: p2,
    },
  });
  assert.equal(unsupportedOpened.errors, undefined);
  assert.equal(
    getLegalActions(unsupportedOpened.state, p2).some(
      (action) =>
        action.type === "useCounter" &&
        action.cardInstanceId === unsupportedCard.instanceId,
    ),
    false,
  );
  const directCounter = applyAction(unsupportedOpened.state, {
    type: "useCounter",
    cardInstanceId: unsupportedCard.instanceId,
    target: must(unsupportedOpened.state.battle, "battle").currentTarget,
  });
  assert.deepEqual(directCounter.errors, [
    {
      type: "illegalAction",
      reason: "Counter Events are unsupported in the Counter Step.",
    },
  ]);
});

test("activateMain adapter matrix supports reusable body only with activate-main evidence", () => {
  const state = setupAttackState();
  state.turn.phase = "main";
  state.turn.turnPlayerId = p1;
  const leader = must(state.players[p1], "p1").leader;
  const effectId = "matrix:activate-main:1" as never;
  const definition = effectDefinition(leader.cardId, { type: "activateMain" });
  const effect = must(definition.effects[0], "activateMain");
  state.cardManifest.cards[leader.cardId] = resolvedCard({
    cardId: leader.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-activate-main-matrix",
    },
  });
  state.cardManifest.effectDefinitions = {
    "def-activate-main-matrix": {
      ...definition,
      effects: [
        { ...effect, id: effectId, effect: reusableSequenceBody },
        {
          ...effect,
          id: "matrix:activate-main:irrelevant" as typeof effect.id,
          trigger: { type: "onPlay" },
          sourcePresencePolicy: "mustRemainInSameZone",
        },
      ],
    },
  };
  const legal = getLegalActions(state, p1).filter(
    (action) => action.type === "activateEffect",
  );
  assert.equal(legal.length > 0, true);
  const result = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });
  assert.equal(result.errors, undefined);
});

test("runtime production source keeps anti-shape/card-specific authorization branches out of support paths", async () => {
  const sourceFiles = [
    "packages/engine-core/src/effect-runtime.ts",
    "packages/engine-core/src/runtime/trigger-queueing/core.ts",
    "packages/engine-core/src/runtime/trigger-queueing/on-play.ts",
    "packages/engine-core/src/runtime/trigger-queueing/attack.ts",
    "packages/engine-core/src/runtime/trigger-queueing/ko.ts",
    "packages/engine-core/src/runtime/trigger-queueing/main-event.ts",
    "packages/engine-core/src/runtime/optional-activation/activate-main.ts",
    "packages/engine-core/src/effect-runtime-sequence/support.ts",
    "packages/engine-core/src/battle/actions.ts",
    "packages/engine-core/src/battle/support.ts",
    "packages/engine-core/src/play-card/support.ts",
    "packages/engine-core/src/life-trigger/actions.ts",
    "packages/engine-core/src/battle/counter-actions.ts",
  ];
  const forbidden = [
    /@optcg\/cards/,
    /allowlist/i,
    /equivalent card[- ]to[- ]mechanic[- ]map/i,
    /external card list/i,
    /printed text/i,
    fullDefinitionSizeAuthorizationPattern,
    /OP\d{2}-\d{3}/,
  ];
  for (const relative of sourceFiles) {
    const content = await readFile(path.join(repoRoot, relative), "utf8");
    for (const pattern of forbidden) {
      assert.equal(
        pattern.test(content),
        false,
        `${relative} must not contain authorization smell ${String(pattern)}`,
      );
    }
  }
});

test("block support delegates sequence trigger admission to entry adapters", async () => {
  const content = await readFile(
    path.join(
      repoRoot,
      "packages/engine-core/src/effect-runtime-block-support.ts",
    ),
    "utf8",
  );

  assert.equal(
    content.includes("isQueuedAutoSequenceTriggerType"),
    false,
    "block support must not maintain a second sequence trigger whitelist",
  );
});

test("counter trailing sequence support uses flattened sequence segments", async () => {
  const content = await readFile(
    path.join(
      repoRoot,
      "packages/engine-core/src/battle/counter-event-trailing-sequence.ts",
    ),
    "utf8",
  );

  assert.equal(content.includes("effectBlock.effect.effects[0]"), false);
});
