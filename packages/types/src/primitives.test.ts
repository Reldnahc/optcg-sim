import { expect, test } from "vitest";

import type { CardId, Comparator, PlayerId, Zone } from "./index.js";

test("primitives compile with representative values", () => {
  const cardId = "OP01-001" as CardId;
  const playerId = "player-1" as PlayerId;
  const zone: Zone = "hand";
  const comparator: Comparator = "gte";

  expect(cardId).toBe("OP01-001");
  expect(playerId).toBe("player-1");
  expect(zone).toBe("hand");
  expect(comparator).toBe("gte");

  // @ts-expect-error CardId must not be assignable to PlayerId.
  const invalidPlayerId: PlayerId = cardId;
  void invalidPlayerId;
});
