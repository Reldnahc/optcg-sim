import assert from "node:assert/strict";
import { test } from "vitest";
import type { Condition } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  queueDrawForP1,
  resolvedCard,
  withCardInZone,
} from "../../effect-runtime-queue/test-support.js";
import { evaluateQueuedEffectCondition } from "./evaluator.js";

test("fieldCount supports reusable anyOf character filters", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const firstCharacter = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "first p1 hand card"),
    zone: "characterArea",
    index: 0,
  });
  const secondCharacter = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[1], "second p1 hand card"),
    zone: "characterArea",
    index: 1,
  });
  state.cardManifest.cards[firstCharacter.cardId] = resolvedCard({
    cardId: firstCharacter.cardId,
    category: "character",
  });
  state.cardManifest.cards[secondCharacter.cardId] = resolvedCard({
    cardId: secondCharacter.cardId,
    category: "character",
  });

  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "fieldCount",
      player: "self",
      op: "gte",
      value: 1,
      filter: {
        categories: ["character"],
        anyOf: [
          { names: [String(firstCharacter.cardId)] },
          { names: ["Mohji"] },
        ],
      },
    } as unknown as Condition),
    { supported: true, passed: true },
  );
  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "fieldCount",
      player: "self",
      op: "gte",
      value: 1,
      filter: {
        categories: ["character"],
        anyOf: [{ names: ["Mohji"] }, { names: ["Richie"] }],
      },
    } as unknown as Condition),
    { supported: true, passed: false },
  );
});
