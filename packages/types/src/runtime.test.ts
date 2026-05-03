import { expect, test } from "vitest";

import type {
  CardInstance,
  CardRef,
  EffectExecutionContext,
  EffectId,
  PlayerId,
  TimerState,
  ZoneRef,
} from "./index.js";

test("runtime concern contracts compile", () => {
  const player = "player-1" as PlayerId;
  const zone: ZoneRef = { zone: "characterArea", playerId: player };
  const card: CardInstance = {
    instanceId: "instance-1" as CardRef["instanceId"],
    cardId: "OP01-001" as CardRef["cardId"],
    owner: player,
    controller: player,
    zone,
    attachedDon: [],
  };
  const timer: TimerState = {
    players: {
      [player]: { playerId: player, remainingMs: 120_000, isRunning: true },
    },
  };
  const execution: EffectExecutionContext = {
    effectId: "effect-1" as EffectId,
    source: {
      instanceId: card.instanceId,
      cardId: card.cardId,
      playerId: player,
      zone,
    },
    transientSets: {},
    selections: {},
  };

  expect(card.owner).toBe(player);
  expect(timer.players[player]?.isRunning).toBe(true);
  expect(execution.source.cardId).toBe(card.cardId);
});
