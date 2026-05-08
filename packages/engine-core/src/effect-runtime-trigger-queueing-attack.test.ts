import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardId, CardInstance, PlayerId } from "@optcg/types";

import { must, p1 } from "./action-test-fixtures.js";
import {
  processDefenderOpponentAttackTiming,
  processEffectRuntime,
} from "./effect-runtime.js";
import {
  attackQueueingState,
  opponentAttackQueueingState,
} from "./effect-runtime-trigger-queueing-test-support.js";

test("attackDeclared source presence failure rejects When Attacking queueing without mutation or events", () => {
  const { state, attacker } = attackQueueingState();
  const player = must(state.players[p1], "p1");
  player.characters = player.characters.filter(
    (character) => character.instanceId !== attacker.instanceId,
  );
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "when-attacking-trigger-queueing",
      details: {
        reason: "source-presence-failed",
      },
    },
  ]);
  assert.deepEqual(result.state, before);
});

test("attackDeclared stale attacker zone rejects When Attacking queueing without mutation or events", () => {
  const { state, attacker } = attackQueueingState();
  const event = must(state.eventJournal.at(-1), "attackDeclared");
  const payload = event.payload as {
    attacker: {
      instanceId: string;
      cardId: CardId;
      playerId: PlayerId;
      zone: CardInstance["zone"];
    };
    target: {
      instanceId: string;
      cardId: CardId;
      playerId: PlayerId;
      zone: CardInstance["zone"];
    };
  };
  event.payload = {
    ...payload,
    attacker: {
      ...payload.attacker,
      zone: { ...attacker.zone, index: (attacker.zone.index ?? 0) + 1 },
    },
  };
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "when-attacking-trigger-queueing",
      details: {
        reason: "source-presence-failed",
      },
    },
  ]);
  assert.deepEqual(result.state, before);
});

test("attackDeclared stale target zone rejects On Your Opponent's Attack queueing without mutation or events", () => {
  const { state, target } = opponentAttackQueueingState();
  const event = must(state.eventJournal.at(-1), "attackDeclared");
  const payload = event.payload as {
    attacker: {
      instanceId: string;
      cardId: CardId;
      playerId: PlayerId;
      zone: CardInstance["zone"];
    };
    target: {
      instanceId: string;
      cardId: CardId;
      playerId: PlayerId;
      zone: CardInstance["zone"];
    };
  };
  event.payload = {
    ...payload,
    target: {
      ...payload.target,
      zone: { ...target.zone, index: (target.zone.index ?? 0) + 1 },
    },
  };
  const before = structuredClone(state);

  const result = processDefenderOpponentAttackTiming(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "on-opponent-attack-trigger-queueing",
      details: {
        reason: "source-presence-failed",
      },
    },
  ]);
  assert.deepEqual(result.state, before);
});
