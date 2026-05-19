import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  EffectDefinition,
  PlayerId,
} from "@optcg/types";

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

test("conditioned When Attacking draw shape queues without fail-closed rejection", () => {
  const { state, definition } = attackQueueingState();
  const effect = must(definition.effects[0], "whenAttacking effect");
  state.cardManifest.effectDefinitions = {
    "def-when-attacking": {
      ...definition,
      effects: [
        {
          ...effect,
          condition: { type: "yourTurn" },
        } satisfies EffectDefinition["effects"][number],
      ],
    },
  };

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(
    result.events.some((event) => event.type === "effectQueued"),
    true,
  );
  assert.equal(result.state.effectQueue.length, 1);
});

test("conditioned When Attacking draw-then-trash sequence reaches decision-pausing path", () => {
  const { state, definition } = attackQueueingState();
  const effect = must(definition.effects[0], "whenAttacking effect");
  state.cardManifest.effectDefinitions = {
    "def-when-attacking": {
      ...definition,
      effects: [
        {
          ...effect,
          condition: { type: "yourTurn" },
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: { type: "draw", count: 1, player: "self" },
              },
              {
                connector: "then",
                effect: {
                  type: "trashFromHand",
                  player: "self",
                  chooser: "self",
                  count: 1,
                },
              },
            ],
          },
        } satisfies EffectDefinition["effects"][number],
      ],
    },
  };

  const first = processEffectRuntime(state);
  const second = processEffectRuntime(first.state);

  assert.equal(first.errors, undefined);
  assert.equal(second.errors, undefined);
  assert.equal(
    first.state.pendingDecision?.type === "selectCards" ||
      second.state.pendingDecision?.type === "selectCards",
    true,
  );
});

test("conditioned optional When Attacking draw queues and routes through chooseOptionalActivation unchanged", () => {
  const { state, definition } = attackQueueingState();
  const effect = must(definition.effects[0], "whenAttacking effect");
  state.turn.turnPlayerId = p1;
  state.cardManifest.effectDefinitions = {
    "def-when-attacking": {
      ...definition,
      effects: [
        {
          ...effect,
          optional: true,
          condition: { type: "yourTurn" },
        } satisfies EffectDefinition["effects"][number],
      ],
    },
  };

  const queued = processEffectRuntime(state);
  const paused = processEffectRuntime(queued.state);

  assert.equal(queued.errors, undefined);
  assert.equal(paused.errors, undefined);
  assert.deepEqual(
    queued.events.map((event) => event.type),
    ["effectQueued"],
  );
  assert.deepEqual(
    paused.events.map((event) => event.type),
    ["decisionCreated"],
  );
  assert.equal(paused.state.pendingDecision?.type, "chooseOptionalActivation");
  assert.equal(paused.state.effectQueue.length, 1);
});
