import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

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
} from "./battle-actions-test-fixtures.js";
import {
  processDefenderOpponentAttackTiming,
  processEffectRuntime,
} from "./effect-runtime.js";
import {
  attackQueueingState,
  opponentAttackQueueingState,
  queueingState,
  setupOnPlayDefinition,
} from "./effect-runtime-trigger-queueing-test-support.js";
import { getSupportedLifeTriggerDecision } from "./life-trigger-actions.js";
import { reviewedOnPlayDrawDefinition } from "./action-test-fixtures.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

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
  assert.equal(
    getSupportedLifeTriggerDecision(lifeState, p2, lifeTop.card),
    undefined,
  );

  const counterState = setupAttackState();
  const defenderHand = must(counterState.players[p2], "p2").hand;
  const counterCard = must(defenderHand[0], "counter card");
  installSupportedCounterEvent(counterState, counterCard, 1000);
  const legal = getLegalActions(counterState, p2);
  assert.equal(
    legal.some((action) => action.type === "concede"),
    true,
  );
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
      effects: [{ ...effect, id: effectId, effect: reusableSequenceBody }],
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
    "packages/engine-core/src/effect-runtime-trigger-queueing.ts",
    "packages/engine-core/src/play-card-support.ts",
    "packages/engine-core/src/life-trigger-actions.ts",
    "packages/engine-core/src/battle-counter-actions.ts",
  ];
  const forbidden = [
    /@optcg\/cards/,
    /allowlist/i,
    /equivalent card[- ]to[- ]mechanic[- ]map/i,
    /external card list/i,
    /printed text/i,
    /effects\.length\s*===\s*1/,
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
