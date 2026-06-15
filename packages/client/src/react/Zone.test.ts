import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import type { CardId, InstanceId } from "@optcg/types";

import type { ClientCardModel } from "../view-model.js";
import { Zone } from "./Zone.js";

const hiddenCard = (index: number): ClientCardModel => ({
  instanceId: `hidden-deck-${String(index)}` as InstanceId,
  cardId: "hidden" as CardId,
  name: "Hidden card",
  category: "hidden",
  attachedDonCount: 0,
  attachedDonCards: [],
});

describe("Zone", () => {
  test("stack zones render the full stack while preserving the full count", () => {
    const cards = Array.from({ length: 50 }, (_, index) => hiddenCard(index));
    const markup = renderToStaticMarkup(
      createElement(Zone, {
        label: "Deck",
        cards,
        displayMode: "stack",
        stackCount: cards.length,
      }),
    );

    assert.equal((markup.match(/card-tile-shell/gu) ?? []).length, 50);
    assert.equal((markup.match(/stack-card-layer/gu) ?? []).length, 50);
    assert.match(markup, /aria-label="Deck count: 50"/u);
    assert.match(markup, /--stack-card-offset:49px/u);
    assert.match(markup, /z-index:50/u);
  });
});
