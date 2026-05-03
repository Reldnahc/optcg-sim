import { expect, test } from "vitest";

import type {
  BattleStep,
  CardId,
  Comparator,
  EffectId,
  MatchId,
  PlayerId,
  PlayerRef,
  StateSeq,
  Visibility,
  Zone,
} from "./index.js";

test("branded identifiers reject incompatible assignment at compile time", () => {
  const cardId = "OP01-001" as CardId;
  const playerId = "player-1" as PlayerId;
  const effectId = "effect-1" as EffectId;
  const matchId = "match-1" as MatchId;
  const stateSeq = 1 as StateSeq;

  const sameCardId: CardId = cardId;
  const samePlayerId: PlayerId = playerId;
  const sameEffectId: EffectId = effectId;
  const sameMatchId: MatchId = matchId;
  const sameStateSeq: StateSeq = stateSeq;

  expect(sameCardId).toBe(cardId);
  expect(samePlayerId).toBe(playerId);
  expect(sameEffectId).toBe(effectId);
  expect(sameMatchId).toBe(matchId);
  expect(sameStateSeq).toBe(stateSeq);

  // @ts-expect-error CardId must not be assignable to PlayerId.
  const invalidPlayerId: PlayerId = cardId;
  // @ts-expect-error PlayerId must not be assignable to CardId.
  const invalidCardId: CardId = playerId;
  // @ts-expect-error EffectId must not be assignable to MatchId.
  const invalidMatchId: MatchId = effectId;

  void invalidPlayerId;
  void invalidCardId;
  void invalidMatchId;
});

test("global scalar and reference primitives compile with representative values", () => {
  const zone: Zone = "hand";
  const visibility: Visibility = "bothPlayers";
  const comparator: Comparator = "gte";
  const playerRef: PlayerRef = "opponent";
  const battleStep: BattleStep = "counter";

  expect(zone).toBe("hand");
  expect(visibility).toBe("bothPlayers");
  expect(comparator).toBe("gte");
  expect(playerRef).toBe("opponent");
  expect(battleStep).toBe("counter");
});
