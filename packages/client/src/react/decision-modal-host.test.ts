import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import type { CardId, CardRef, InstanceId, PlayerId } from "@optcg/types";

import { DecisionModalHost } from "./DecisionModalHost.js";
import type { DecisionModalModel } from "../interactions/decision-modal.js";

const p1 = "p1" as PlayerId;

const cardRef = (id: string): CardRef => ({
  instanceId: id as InstanceId,
  cardId: `${id}-card` as CardId,
  playerId: p1,
});

test("selectCards modal renders card images and disables nonselectable choices", () => {
  const model: DecisionModalModel = {
    kind: "selectCards",
    decisionId: "decision-1" as never,
    prompt: "Choose cards",
    min: 0,
    max: 1,
    canConfirm: true,
    selectedInstanceIds: [],
    cards: [
      { card: cardRef("legal"), selectable: true },
      { card: cardRef("illegal"), selectable: false },
    ],
    confirmLabel: "Confirm",
  };

  const markup = renderToStaticMarkup(
    createElement(DecisionModalHost, {
      model,
      disabled: false,
      cardDisplay: (card: CardRef) => ({
        name: String(card.cardId),
        imageUrl: `https://cdn.example/${String(card.cardId)}.png`,
      }),
      onToggleCard: () => undefined,
      onChooseTrigger: () => undefined,
      onQuantity: () => undefined,
      onOption: () => undefined,
      onActionOption: () => undefined,
      onToggleBottomPlacement: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.match(markup, /<img class="decision-card-face"/u);
  assert.equal(markup.includes("legal-card.png"), true);
  assert.equal(markup.includes("illegal-card.png"), true);
  assert.match(markup, /disabled=""/u);
});

test("chooseQuantity modal renders a range slider over the legal range", () => {
  const model: DecisionModalModel = {
    kind: "chooseQuantity",
    decisionId: "decision-quantity" as never,
    prompt: "Choose quantity",
    min: 0,
    max: 4,
    quantity: 4,
    canConfirm: true,
  };

  const markup = renderToStaticMarkup(
    createElement(DecisionModalHost, {
      model,
      disabled: false,
      onToggleCard: () => undefined,
      onChooseTrigger: () => undefined,
      onQuantity: () => undefined,
      onOption: () => undefined,
      onActionOption: () => undefined,
      onToggleBottomPlacement: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.match(markup, /type="range"/u);
  assert.match(markup, /class="quantity-slider"/u);
  assert.match(markup, /min="0"/u);
  assert.match(markup, /max="4"/u);
  assert.match(markup, /value="4"/u);
  assert.equal(markup.includes('type="number"'), false);
});
