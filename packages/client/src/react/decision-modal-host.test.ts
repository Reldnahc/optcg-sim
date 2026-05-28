import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import type { CardId, CardRef, InstanceId, PlayerId } from "@optcg/types";

import { DecisionModalHost } from "./DecisionModalHost.js";
import type { DecisionModalModel } from "../interactions/decision-modal.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
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
      onMoveOrderedCard: () => undefined,
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
      onMoveOrderedCard: () => undefined,
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

test("return-to-deck order modal renders card images with deck order badges", () => {
  const model: DecisionModalModel = {
    kind: "orderCards",
    decisionId: "decision-order" as never,
    prompt: "Return cards to the bottom of your deck.",
    destination: "deck",
    canConfirm: true,
    orderedInstanceIds: ["top" as InstanceId, "bottom" as InstanceId],
    bottomInstanceIds: [],
    cards: [cardRef("top"), cardRef("bottom")],
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
      onMoveOrderedCard: () => undefined,
      onToggleBottomPlacement: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.match(markup, /decision-order-card-grid/u);
  assert.match(markup, /decision-order-hint/u);
  assert.equal(markup.includes("top-card.png"), true);
  assert.equal(markup.includes("bottom-card.png"), true);
  assert.match(markup, /decision-order-badge/u);
  assert.match(markup, /is-pointer-reorderable/u);
  assert.doesNotMatch(markup, /draggable=/u);
  assert.doesNotMatch(markup, /decision-order-row/u);
});

test("return-to-deck order modal uses pointer reorder instead of native drag", async () => {
  const source = await readFile(
    join(sourceDirectory, "DecisionModalHost.tsx"),
    "utf8",
  );

  assert.match(source, /onPointerDown/u);
  assert.doesNotMatch(source, /onDragStart/u);
  assert.doesNotMatch(source, /onDragOver/u);
  assert.doesNotMatch(source, /onDrop/u);
  assert.doesNotMatch(source, /draggable=/u);
});

test("trigger order modal presents source cards like a single-card selection", () => {
  const model: DecisionModalModel = {
    kind: "orderTriggers",
    decisionId: "decision-trigger-order" as never,
    prompt: "Choose the next trigger.",
    canConfirm: true,
    orderedTriggerIds: ["trigger-legal"],
    choices: [
      {
        triggerId: "trigger-legal",
        source: cardRef("legal"),
        selected: true,
        orderIndex: 0,
      },
      {
        triggerId: "trigger-other",
        source: cardRef("other"),
        selected: false,
      },
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
      onMoveOrderedCard: () => undefined,
      onToggleBottomPlacement: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.match(markup, /decision-card-grid/u);
  assert.match(markup, /decision-card-choice is-selected/u);
  assert.equal(markup.includes("legal-card.png"), true);
  assert.equal(markup.includes("other-card.png"), true);
  assert.doesNotMatch(markup, /decision-order-badge/u);
  assert.match(markup, />Confirm<\/button>/u);
});
