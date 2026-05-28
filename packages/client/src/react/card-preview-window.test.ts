import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import type { CardId, InstanceId } from "@optcg/types";

import { CardPreviewWindow } from "./CardPreviewWindow.js";
import { CardTile } from "./CardTile.js";
import type { ClientCardModel } from "../view-model.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

const card = (overrides: Partial<ClientCardModel> = {}): ClientCardModel => ({
  instanceId: "preview-card" as InstanceId,
  cardId: "OP00-000" as CardId,
  name: "Preview Card",
  category: "Character",
  effectText: "Draw 1 card.",
  triggerText: "Add 1 card.",
  imageUrl: "https://example.test/card.png",
  attachedDonCount: 0,
  attachedDonCards: [],
  ...overrides,
});

describe("card preview window", () => {
  test("renders hovered card details in a floating window", () => {
    const markup = renderToStaticMarkup(
      createElement(CardPreviewWindow, {
        card: card(),
        minimized: false,
        onToggleMinimized: () => undefined,
      }),
    );

    assert.match(markup, /floating-window/u);
    assert.match(markup, /card-preview-window/u);
    assert.match(markup, /Card Preview/u);
    assert.match(markup, /Preview Card/u);
    assert.match(markup, /https:\/\/example\.test\/card\.png/u);
    assert.match(markup, /Draw 1 card\./u);
    assert.match(markup, /Add 1 card\./u);
  });

  test("can render minimized without card body content", () => {
    const markup = renderToStaticMarkup(
      createElement(CardPreviewWindow, {
        card: card(),
        minimized: true,
        onToggleMinimized: () => undefined,
      }),
    );

    assert.match(markup, /is-minimized/u);
    assert.match(markup, /Show/u);
    assert.equal(markup.includes("Draw 1 card."), false);
  });

  test("card tiles expose generic hover callbacks for preview surfaces", () => {
    const markup = renderToStaticMarkup(
      createElement(CardTile, {
        card: card(),
        onHover: () => undefined,
      }),
    );

    assert.match(markup, /data-card-instance-id="preview-card"/u);
  });

  test("hidden card tiles do not expose preview hover callbacks", async () => {
    const source = await readFile(
      join(sourceDirectory, "CardTile.tsx"),
      "utf8",
    );

    assert.match(
      source,
      /if\s*\(\s*card\.category\s*===\s*"hidden"\s*\)\s*\{\s*return;\s*\}/u,
    );
  });

  test("board and modal surfaces pass hover preview callbacks through shared card tiles", async () => {
    const [boardLayout, zone, handRow, collectionModal, matchApp] =
      await Promise.all([
        readFile(join(sourceDirectory, "BoardLayout.tsx"), "utf8"),
        readFile(join(sourceDirectory, "Zone.tsx"), "utf8"),
        readFile(join(sourceDirectory, "HandRow.tsx"), "utf8"),
        readFile(join(sourceDirectory, "CollectionModalHost.tsx"), "utf8"),
        readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
      ]);

    assert.match(boardLayout, /onPreviewCard/u);
    assert.match(zone, /onCardPreview/u);
    assert.match(handRow, /onCardPreview/u);
    assert.match(collectionModal, /onPreviewCard/u);
    assert.match(matchApp, /setPreviewCard/u);
    assert.match(matchApp, /CardPreviewWindow/u);
  });
});
