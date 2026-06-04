import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import type { CardId, DecisionId, InstanceId } from "@optcg/types";

import { CollectionModalHost } from "./CollectionModalHost.js";
import { DecisionModalHost } from "./DecisionModalHost.js";
import type { ClientCardModel } from "../view-model.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const modalStylesPath = join(sourceDirectory, "styles", "modal-frame.css");

const card = (instanceId: string, name: string): ClientCardModel => ({
  instanceId: instanceId as InstanceId,
  cardId: `${instanceId}-card` as CardId,
  name,
  category: "Character",
  attachedDonCount: 0,
  attachedDonCards: [],
});

describe("modal frame", () => {
  test("decision modals use modal frame while collection viewers use floating windows", () => {
    const decisionMarkup = renderToStaticMarkup(
      createElement(DecisionModalHost, {
        model: {
          title: "Choose one",
          instruction: "Choose one option.",
          kind: "chooseOption",
          decisionId: "decision-1" as DecisionId,
          prompt: "Choose one",
          options: [{ value: "yes", label: "Yes" }],
          selectedOption: "yes",
          canConfirm: true,
        },
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
    const collectionMarkup = renderToStaticMarkup(
      createElement(CollectionModalHost, {
        model: { title: "Trash", cards: [card("one", "One")] },
        onClose: () => undefined,
      }),
    );

    assert.match(decisionMarkup, /modal-frame/u);
    assert.equal(collectionMarkup.includes("modal-frame"), false);
    assert.match(decisionMarkup, /modal-frame-decision/u);
    assert.match(collectionMarkup, /floating-window/u);
  });

  test("modal frame defaults to compact content sizing with viewport guardrails", async () => {
    const styles = await readFile(modalStylesPath, "utf8");

    assert.match(styles, /\.modal-frame\s*\{[^}]*top:\s*50%;/u);
    assert.match(styles, /\.modal-frame\s*\{[^}]*left:\s*50%;/u);
    assert.match(
      styles,
      /\.modal-frame\s*\{[^}]*width:\s*min\(520px,\s*calc\(100vw - 32px\)\);/u,
    );
    assert.match(styles, /\.modal-frame\s*\{[^}]*height:\s*auto;/u);
    assert.match(styles, /\.modal-frame\s*\{[^}]*max-height:\s*82vh;/u);
    assert.match(styles, /\.modal-frame\s*\{[^}]*overflow:\s*auto;/u);
    assert.match(
      styles,
      /\.modal-frame\s*\{[^}]*transform:\s*translate\(-50%,\s*-50%\);/u,
    );
    assert.doesNotMatch(styles, /\.modal-frame\s*\{[^}]*inset:\s*26% 34%;/u);
    assert.match(styles, /\.modal-frame\s*\{[^}]*display:\s*flex;/u);
    assert.match(styles, /\.modal-frame\s*\{[^}]*flex-direction:\s*column;/u);
    assert.match(
      styles,
      /\.modal-frame\s*\{[^}]*border:\s*1px solid #f4eee7;/u,
    );
    assert.match(styles, /\.modal-frame\s*\{[^}]*box-shadow:/u);
  });

  test("card decision modals use a wider and taller default frame", async () => {
    const styles = await readFile(modalStylesPath, "utf8");

    assert.match(
      styles,
      /\.modal-frame-card-decision\s*\{[^}]*width:\s*min\(calc\(\(var\(--card-width\) \* 5\) \+ 96px\),\s*calc\(100vw - 32px\)\);/u,
    );
    assert.match(
      styles,
      /\.modal-frame-card-decision\s*\{[^}]*min-height:\s*min\(calc\(\(var\(--card-height\) \* 2\) \+ 132px\),\s*82vh\);/u,
    );
  });

  test("decision confirm action anchors low without stretching tall", async () => {
    const styles = await readFile(modalStylesPath, "utf8");

    assert.match(
      styles,
      /\.modal-frame-decision\s*>\s*\.primary-action\s*\{[^}]*margin-top:\s*auto;/u,
    );
    assert.match(
      styles,
      /\.modal-frame-decision\s*>\s*\.primary-action\s*\{[^}]*max-height:\s*34px;/u,
    );
    assert.match(
      styles,
      /\.modal-frame-decision\s*>\s*\.primary-action\s*\{[^}]*flex:\s*0 0 auto;/u,
    );
  });

  test("modal frame stacks above floating windows", async () => {
    const [modalStyles, floatingStyles] = await Promise.all([
      readFile(modalStylesPath, "utf8"),
      readFile(join(sourceDirectory, "styles", "floating-window.css"), "utf8"),
    ]);

    assert.match(modalStyles, /\.modal-frame\s*\{[^}]*z-index:\s*30;/u);
    assert.match(floatingStyles, /\.floating-window\s*\{[^}]*z-index:\s*10;/u);
  });
});
