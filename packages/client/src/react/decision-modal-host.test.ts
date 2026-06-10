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

const presentation = {
  title: "Decision title",
  instruction: "Decision instruction.",
  prompt: "Raw decision prompt.",
};

test("selectCards modal renders card images and disables nonselectable choices", () => {
  const model: DecisionModalModel = {
    ...presentation,
    kind: "selectCards",
    decisionId: "decision-1" as never,
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
      onPlacementDestination: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.match(markup, /<img class="decision-card-face"/u);
  assert.match(markup, /modal-frame-card-decision/u);
  assert.match(markup, /Decision title/u);
  assert.match(markup, /Decision instruction\./u);
  assert.equal(markup.includes("legal-card.png"), true);
  assert.equal(markup.includes("illegal-card.png"), true);
  assert.match(markup, /disabled=""/u);
});

test("single-card selection modals enlarge the lone card", () => {
  const model: DecisionModalModel = {
    ...presentation,
    kind: "selectCards",
    decisionId: "decision-single-card" as never,
    min: 0,
    max: 1,
    canConfirm: true,
    selectedInstanceIds: [],
    cards: [{ card: cardRef("only"), selectable: true }],
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
      onPlacementDestination: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.match(markup, /class="decision-card-grid is-single-card"/u);
  assert.equal(markup.includes("only-card.png"), true);
});

test("simple decision modals use compact modal sizing", () => {
  const model: DecisionModalModel = {
    ...presentation,
    kind: "chooseOption",
    decisionId: "decision-option" as never,
    options: [{ value: "yes", label: "Yes" }],
    selectedOption: "yes",
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
      onPlacementDestination: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.match(markup, /modal-frame-decision/u);
  assert.doesNotMatch(markup, /modal-frame-card-decision/u);
  assert.doesNotMatch(markup, /primary-action/u);
  assert.doesNotMatch(markup, /decision-choice is-selected/u);
});

test("chooseQuantity modal renders a range slider over the legal range", () => {
  const model: DecisionModalModel = {
    ...presentation,
    kind: "chooseQuantity",
    decisionId: "decision-quantity" as never,
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
      onPlacementDestination: () => undefined,
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

test("binary quantity modal renders yes-no choices instead of a slider", () => {
  const model: DecisionModalModel = {
    ...presentation,
    kind: "binaryQuantity",
    decisionId: "decision-quantity" as never,
    selectedQuantity: 1,
    options: [
      { quantity: 0, label: "No" },
      { quantity: 1, label: "Yes" },
    ],
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
      onPlacementDestination: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.match(markup, /decision-option-list/u);
  assert.match(markup, />No<\/button>/u);
  assert.match(markup, />Yes<\/button>/u);
  assert.doesNotMatch(markup, /decision-choice is-selected/u);
  assert.doesNotMatch(markup, /primary-action/u);
  assert.doesNotMatch(markup, /type="range"/u);
  assert.doesNotMatch(markup, /quantity-slider/u);
});

test("action option modals render one-click choices without a confirm action", () => {
  const model: DecisionModalModel = {
    ...presentation,
    kind: "actionOptions",
    decisionId: "decision-action" as never,
    options: [
      { actionIndex: 1, label: "Use trigger" },
      { actionIndex: 2, label: "Add to hand" },
    ],
    selectedActionIndex: 1,
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
      onPlacementDestination: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.match(markup, />Use trigger<\/button>/u);
  assert.match(markup, />Add to hand<\/button>/u);
  assert.doesNotMatch(markup, /primary-action/u);
  assert.doesNotMatch(markup, /decision-choice is-selected/u);
});

test("action option modals can render replacement choices as source cards", () => {
  const model: DecisionModalModel = {
    ...presentation,
    kind: "actionOptions",
    decisionId: "decision-replacement" as never,
    options: [
      {
        actionIndex: 1,
        label: "Use replacement",
        cards: [cardRef("replacement-source")],
      },
      { actionIndex: 2, label: "Do not replace" },
    ],
    selectedActionIndex: 1,
    canConfirm: true,
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
      onPlacementDestination: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.match(markup, /decision-card-grid/u);
  assert.match(markup, /decision-card-choice/u);
  assert.equal(markup.includes("replacement-source-card.png"), true);
  assert.match(markup, />Do not replace<\/button>/u);
  assert.doesNotMatch(markup, /primary-action/u);
});

test("life trigger action options render one card preview and text response buttons", () => {
  const model: DecisionModalModel = {
    ...presentation,
    kind: "actionOptions",
    decisionId: "decision-life-trigger" as never,
    card: cardRef("life-trigger"),
    options: [
      { actionIndex: 1, label: "Activate trigger" },
      { actionIndex: 2, label: "Add to hand" },
    ],
    selectedActionIndex: 1,
    canConfirm: true,
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
      onPlacementDestination: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.equal(markup.match(/class="decision-card-face"/gu)?.length, 1);
  assert.match(
    markup,
    /class="decision-card-grid decision-card-preview-grid is-single-card"/u,
  );
  assert.equal(markup.includes("life-trigger-card.png"), true);
  assert.match(markup, />Activate trigger<\/button>/u);
  assert.match(markup, />Add to hand<\/button>/u);
  assert.doesNotMatch(markup, /primary-action/u);
});

test("button-only decision options use pointer and hover feedback", async () => {
  const styles = await readFile(
    join(sourceDirectory, "styles", "decision-modal.css"),
    "utf8",
  );

  assert.match(
    styles,
    /\.decision-option-list\s+\.decision-choice:not\(:disabled\)\s*\{[^}]*cursor:\s*pointer;/u,
  );
  assert.match(
    styles,
    /\.decision-option-list\s+\.decision-choice:hover:not\(:disabled\),\s*\.decision-option-list\s+\.decision-choice:focus-visible:not\(:disabled\)\s*\{[^}]*background:\s*#706a67;[^}]*box-shadow:\s*0 0 0 2px rgba\(255,\s*255,\s*255,\s*0\.88\),\s*0 0 10px rgba\(255,\s*255,\s*255,\s*0\.42\);/u,
  );
});

test("single-card action option previews center inside the modal", async () => {
  const styles = await readFile(
    join(sourceDirectory, "styles", "decision-modal.css"),
    "utf8",
  );

  assert.match(
    styles,
    /\.decision-card-preview-grid\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*justify-content:\s*center;/u,
  );
  assert.match(
    styles,
    /\.decision-card-grid\.is-single-card\s*\{[^}]*--decision-single-card-height:\s*min\(58vh,\s*calc\(var\(--card-height\) \* 2\)\);[^}]*justify-content:\s*center;/u,
  );
  assert.match(
    styles,
    /\.decision-card-grid\.is-single-card\s+\.decision-choice\.decision-card-choice\s*\{[^}]*height:\s*var\(--decision-single-card-height\);/u,
  );
});

test("return-to-deck order modal renders card images with deck order badges", () => {
  const model: DecisionModalModel = {
    ...presentation,
    kind: "orderCards",
    decisionId: "decision-order" as never,
    destination: "deck",
    canConfirm: true,
    orderedInstanceIds: ["top" as InstanceId, "bottom" as InstanceId],
    placementDestination: "top",
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
      onPlacementDestination: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.match(markup, /decision-order-card-grid/u);
  assert.match(markup, /modal-frame-card-decision/u);
  assert.match(markup, /hand-cards decision-order-card-grid/u);
  assert.match(markup, /decision-order-hint/u);
  assert.equal(markup.includes("top-card.png"), true);
  assert.equal(markup.includes("bottom-card.png"), true);
  assert.match(markup, /selection-order-badge/u);
  assert.match(markup, /card-tile-shell/u);
  assert.match(markup, /is-pointer-reorderable/u);
  assert.doesNotMatch(markup, /draggable=/u);
  assert.doesNotMatch(markup, /decision-order-row/u);
  assert.match(markup, /primary-action/u);
});

test("top-or-bottom order modal uses one destination control for all ordered cards", () => {
  const model: DecisionModalModel = {
    ...presentation,
    kind: "orderCards",
    decisionId: "decision-top-or-bottom" as never,
    destination: "deck",
    placement: { type: "topOrBottom" },
    canConfirm: true,
    orderedInstanceIds: ["top" as InstanceId, "bottom" as InstanceId],
    placementDestination: "bottom",
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
      onPlacementDestination: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.match(markup, /decision-placement-choice/u);
  assert.match(markup, />Top<\/button>/u);
  assert.match(markup, />Bottom<\/button>/u);
  assert.doesNotMatch(markup, /decision-placement-toggle/u);
});

test("fixed top order modal has no top-or-bottom destination control", () => {
  const model: DecisionModalModel = {
    ...presentation,
    kind: "orderCards",
    decisionId: "decision-fixed-top" as never,
    destination: "deck",
    canConfirm: true,
    orderedInstanceIds: ["top" as InstanceId, "bottom" as InstanceId],
    placementDestination: "top",
    cards: [cardRef("top"), cardRef("bottom")],
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
      onPlacementDestination: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.doesNotMatch(markup, /decision-placement-choice/u);
});

test("return-to-deck order modal shares CardTile reorder instead of custom drag", async () => {
  const [source, styles] = await Promise.all([
    readFile(join(sourceDirectory, "DecisionModalHost.tsx"), "utf8"),
    readFile(join(sourceDirectory, "styles", "decision-modal.css"), "utf8"),
  ]);

  assert.match(source, /CardTile/u);
  assert.match(source, /useCardReorderPreview/u);
  assert.match(source, /onPreviewMoveNear/u);
  assert.match(source, /onMoveNear/u);
  assert.doesNotMatch(source, /reorderDragStrategy="translate"/u);
  assert.match(source, /className="hand-cards decision-order-card-grid"/u);
  assert.doesNotMatch(source, /decision-order-card-slot/u);
  assert.doesNotMatch(styles, /\.decision-order-card-grid\s*\{[^}]*gap:/u);
  assert.doesNotMatch(
    styles,
    /\.decision-order-card-grid\s*\{[^}]*justify-content:/u,
  );
  assert.doesNotMatch(source, /PointerReorderDrag/u);
  assert.doesNotMatch(source, /data-decision-order-instance-id/u);
  assert.doesNotMatch(source, /reorderPlacementFromPointer/u);
  assert.doesNotMatch(source, /DecisionOrderCard/u);
  assert.doesNotMatch(source, /onDragStart/u);
  assert.doesNotMatch(source, /onDragOver/u);
  assert.doesNotMatch(source, /onDrop/u);
  assert.doesNotMatch(source, /draggable=/u);
});

test("decision modal card surfaces pass hover callbacks to card preview", async () => {
  const source = await readFile(
    join(sourceDirectory, "DecisionModalHost.tsx"),
    "utf8",
  );

  assert.match(
    source,
    /onPreviewCard\?: \(\(card: ClientCardModel\) => void\)/u,
  );
  assert.match(
    source,
    /cardModel\?: \(\(card: CardRef\) => ClientCardModel\) \| undefined/u,
  );
  assert.match(source, /onHover=\{onPreviewCard\}/u);
  assert.match(source, /decisionClientCard\(/u);
  assert.match(source, /cardModel\?\.\(card\)/u);
  assert.doesNotMatch(source, /onHover=\{\(\) => undefined\}/u);
});

test("decision modal card grids reserve enough width for five card choices", async () => {
  const styles = await readFile(
    join(sourceDirectory, "styles", "decision-modal.css"),
    "utf8",
  );

  assert.match(
    styles,
    /\.decision-card-grid\s*\{[^}]*min-width:\s*min\(calc\(100vw - 96px\),\s*calc\(\(var\(--card-width\) \* 5\) \+ 32px\)\);/u,
  );
});

test("decision modal selectable cards use board-card pointer and hover affordances", async () => {
  const styles = await readFile(
    join(sourceDirectory, "styles", "decision-modal.css"),
    "utf8",
  );

  assert.match(
    styles,
    /\.decision-choice\.decision-card-choice:not\(:disabled\)\s*\{[^}]*cursor:\s*pointer;/u,
  );
  assert.match(
    styles,
    /\.decision-choice\.decision-card-choice:hover:not\(:disabled\)\s+:where\(\.decision-card-face,\s*\.decision-card-placeholder\)\s*\{[^}]*box-shadow:\s*0 0 0 2px rgba\(255,\s*255,\s*255,\s*0\.95\),\s*0 0 10px rgba\(255,\s*255,\s*255,\s*0\.72\);/u,
  );
});

test("decision modal selected cards use the board-card selected highlight", async () => {
  const styles = await readFile(
    join(sourceDirectory, "styles", "decision-modal.css"),
    "utf8",
  );

  assert.match(
    styles,
    /\.decision-choice\.decision-card-choice\.is-selected\s*\{[^}]*outline:\s*0;/u,
  );
  assert.match(
    styles,
    /\.decision-choice\.decision-card-choice\.is-selected\s+:where\(\.decision-card-face,\s*\.decision-card-placeholder\)\s*\{[^}]*outline:\s*3px solid #ffdc62;[^}]*outline-offset:\s*0;/u,
  );
});

test("decision modal card surfaces use the board-card rounded mask", async () => {
  const styles = await readFile(
    join(sourceDirectory, "styles", "decision-modal.css"),
    "utf8",
  );

  assert.match(styles, /\.decision-card-face\s*\{[^}]*border-radius:\s*6px;/u);
  assert.match(
    styles,
    /\.decision-card-placeholder\s*\{[^}]*border-radius:\s*6px;/u,
  );
});

test("trigger order modal presents source cards like a single-card selection", () => {
  const model: DecisionModalModel = {
    ...presentation,
    kind: "orderTriggers",
    decisionId: "decision-trigger-order" as never,
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
      onPlacementDestination: () => undefined,
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
