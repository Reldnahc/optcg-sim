import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { createDefaultBotDeckSubmission } from "./bot-deck.js";

describe("bot deck", () => {
  test("uses the configured OP09-001 deck hash list", () => {
    const deck = createDefaultBotDeckSubmission();

    assert.equal(
      deck.hash,
      "eJxrmLaQjfXDyobAGAY3lkMcwiyKPus6bxmd0tbhcZDaxGS0LuEMAOZVDKs",
    );
    assert.deepEqual(deck.decoded.leader, { cardId: "OP09-001", count: 1 });
    assert.deepEqual(deck.decoded.main, [
      { cardId: "EB04-007", count: 2 },
      { cardId: "OP06-007", count: 2 },
      { cardId: "OP09-002", count: 4 },
      { cardId: "OP09-004", count: 4 },
      { cardId: "OP09-009", count: 2 },
      { cardId: "OP09-011", count: 4 },
      { cardId: "OP09-014", count: 2 },
      { cardId: "OP09-020", count: 4 },
      { cardId: "OP10-011", count: 2 },
      { cardId: "OP12-008", count: 4 },
      { cardId: "OP13-007", count: 2 },
      { cardId: "PRB02-001", count: 2 },
      { cardId: "PRB02-002", count: 4 },
      { cardId: "ST23-002", count: 4 },
      { cardId: "OP16-012", count: 4 },
      { cardId: "OP16-018", count: 4 },
    ]);
    assert.equal(
      deck.decoded.main.reduce((total, entry) => total + entry.count, 0),
      50,
    );
  });
});
