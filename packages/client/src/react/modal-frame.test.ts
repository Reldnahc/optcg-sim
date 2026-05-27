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
  test("decision and collection modals share the presentation frame", () => {
    const decisionMarkup = renderToStaticMarkup(
      createElement(DecisionModalHost, {
        model: {
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
    assert.match(collectionMarkup, /modal-frame/u);
    assert.match(decisionMarkup, /modal-frame-decision/u);
    assert.match(collectionMarkup, /modal-frame-collection/u);
  });

  test("modal frame owns the shared smaller default size", async () => {
    const styles = await readFile(modalStylesPath, "utf8");

    assert.match(styles, /\.modal-frame\s*\{[^}]*inset:\s*14% 22%;/u);
    assert.match(
      styles,
      /\.modal-frame\s*\{[^}]*border:\s*2px solid #f4eee7;/u,
    );
    assert.match(styles, /\.modal-frame\s*\{[^}]*box-shadow:/u);
  });
});
