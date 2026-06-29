import { strict as assert } from "node:assert";
import type {
  CardId,
  InstanceId,
  PlayerId,
  PublicCardView,
} from "@optcg/types";
import { describe, test } from "vitest";

import { deriveBotCardSemantics } from "./bot-card-semantics.js";

const botPlayerId = "p2" as PlayerId;

const publicCard = (
  instanceId: string,
  fields: Partial<PublicCardView> = {},
): PublicCardView => ({
  instanceId: instanceId as InstanceId,
  cardId: (fields.cardId ?? "OP01-001") as CardId,
  owner: botPlayerId,
  controller: botPlayerId,
  zone: { playerId: botPlayerId, zone: "hand" },
  attachedDonCount: 0,
  attachedDonIds: [],
  ...fields,
});

describe("deriveBotCardSemantics", () => {
  test("derives blocker and high-counter roles from visible card data", () => {
    const semantics = deriveBotCardSemantics({
      card: publicCard("blocker", {
        keywords: ["blocker"],
        printedCounter: 2_000,
      }),
    });

    assert.equal(semantics.roles.has("blocker"), true);
    assert.equal(semantics.roles.has("high-counter"), true);
  });

  test("merges profile roles with generic roles", () => {
    const semantics = deriveBotCardSemantics({
      card: publicCard("engine", { cardId: "OP16-012" as CardId }),
      profile: {
        id: "test",
        cardRoles: { "OP16-012": ["combo-enabler", "preserve"] },
        searchPriorities: {},
        preserveCards: [],
        cheatTargets: [],
        effectPolicies: [],
      },
    });

    assert.equal(semantics.roles.has("combo-enabler"), true);
    assert.equal(semantics.roles.has("preserve"), true);
  });
});
