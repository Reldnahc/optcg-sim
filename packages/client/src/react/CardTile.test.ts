import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import type { CardId, InstanceId } from "@optcg/types";

import type { ClientCardModel } from "../view-model.js";
import { CardTile } from "./CardTile.js";

const card = (overrides: Partial<ClientCardModel> = {}): ClientCardModel => ({
  instanceId: "card-1" as InstanceId,
  cardId: "OP00-001" as CardId,
  name: "Test Card",
  category: "Character",
  attachedDonCount: 0,
  attachedDonCards: [],
  ...overrides,
});

test("renders negated field cards as a red status badge", () => {
  const markup = renderToStaticMarkup(
    createElement(CardTile, {
      card: card({ effectsInvalidated: true }),
    }),
  );

  assert.match(markup, /class="[^"]*keyword-badge-negative/u);
  assert.equal(markup.includes("negated"), true);
});
