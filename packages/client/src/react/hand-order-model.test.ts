import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  orderCardsByInstanceIds,
  reconcileContinuousHandOrder,
} from "./hand-order-model.js";
import type { ClientCardModel } from "../view-model.js";
import type { CardId, InstanceId } from "@optcg/types";

const card = (instanceId: string): ClientCardModel => ({
  instanceId: instanceId as InstanceId,
  cardId: `${instanceId}-card` as CardId,
  name: instanceId,
  category: "Character",
  attachedDonCount: 0,
  attachedDonCards: [],
});

const instanceIds = (cards: readonly ClientCardModel[]): string[] =>
  cards.map((item) => String(item.instanceId));

describe("hand order model", () => {
  test("returned cards do not reuse stale manual hand positions", () => {
    const currentHand = [card("left"), card("right"), card("returned")];
    const rememberedOrder = ["returned", "left", "right"];
    const reconciledOrder = reconcileContinuousHandOrder({
      currentHandIds: ["left", "right", "returned"],
      previousHandIds: ["left", "right"],
      rememberedOrder,
    });

    assert.deepEqual(reconciledOrder, ["left", "right"]);
    assert.deepEqual(
      instanceIds(orderCardsByInstanceIds(currentHand, reconciledOrder)),
      ["left", "right", "returned"],
    );
  });

  test("manual hand order remains for cards that stayed in hand", () => {
    const currentHand = [
      card("left"),
      card("right"),
      card("continuous"),
      card("new"),
    ];
    const reconciledOrder = reconcileContinuousHandOrder({
      currentHandIds: ["left", "right", "continuous", "new"],
      previousHandIds: ["left", "right", "continuous"],
      rememberedOrder: ["continuous", "left", "right"],
    });

    assert.deepEqual(reconciledOrder, ["continuous", "left", "right"]);
    assert.deepEqual(
      instanceIds(orderCardsByInstanceIds(currentHand, reconciledOrder)),
      ["continuous", "left", "right", "new"],
    );
  });
});
