import { strict as assert } from "node:assert";
import type {
  CardId,
  InstanceId,
  PlayerId,
  PublicCardView,
} from "@optcg/types";
import { describe, test } from "vitest";

import { buildOpponentDeckKnowledge } from "./bot-deck-knowledge.js";

const publicCard = (cardId: string): PublicCardView => ({
  instanceId: `${cardId}:public` as InstanceId,
  cardId: cardId as CardId,
  owner: "p1" as PlayerId,
  controller: "p1" as PlayerId,
  zone: { playerId: "p1" as PlayerId, zone: "trash" },
  attachedDonCount: 0,
  attachedDonIds: [],
});

describe("buildOpponentDeckKnowledge", () => {
  test("computes counter priors from decklist", () => {
    const knowledge = buildOpponentDeckKnowledge({
      decklist: [
        { cardId: "C1", count: 4, printedCounter: 2_000, roles: [] },
        { cardId: "C2", count: 4, printedCounter: 1_000, roles: [] },
      ],
      publicCards: [],
    });

    assert.equal(knowledge.remainingUnknownCounterPrior.unknownCardCount, 8);
    assert.equal(knowledge.remainingUnknownCounterPrior.counter2000Count, 4);
    assert.equal(knowledge.remainingUnknownCounterPrior.counter1000Count, 4);
    assert.equal(
      knowledge.remainingUnknownCounterPrior.averageCounterPower,
      1_500,
    );
  });

  test("subtracts public cards from remaining priors", () => {
    const knowledge = buildOpponentDeckKnowledge({
      decklist: [
        { cardId: "C1", count: 4, printedCounter: 2_000, roles: [] },
        { cardId: "C2", count: 4, printedCounter: 1_000, roles: [] },
      ],
      publicCards: [publicCard("C1"), publicCard("C1")],
    });

    assert.equal(knowledge.remainingUnknownCounterPrior.unknownCardCount, 6);
    assert.equal(knowledge.remainingUnknownCounterPrior.counter2000Count, 2);
    assert.equal(
      knowledge.remainingUnknownCounterPrior.averageCounterPower,
      1_333.3333333333333,
    );
  });
});
