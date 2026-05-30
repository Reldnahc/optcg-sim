import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import type { CardId, InstanceId } from "@optcg/types";

import { CardPreviewToggle } from "./CardPreviewToggle.js";
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
        onClose: () => undefined,
      }),
    );

    assert.match(markup, /floating-window/u);
    assert.match(markup, /card-preview-window/u);
    assert.match(markup, /Preview/u);
    assert.doesNotMatch(markup, /Card Preview/u);
    assert.match(markup, /Preview Card/u);
    assert.match(markup, /https:\/\/example\.test\/card\.png/u);
    assert.match(markup, /Draw 1 card\./u);
    assert.match(markup, /Add 1 card\./u);
  });

  test("minimized preview stays mounted as a draggable bar", async () => {
    const markup = renderToStaticMarkup(
      createElement(CardPreviewWindow, {
        card: card(),
        minimized: true,
        onToggleMinimized: () => undefined,
        onClose: () => undefined,
      }),
    );
    const styles = await readFile(
      join(sourceDirectory, "styles", "card-preview-window.css"),
      "utf8",
    );

    assert.match(markup, /floating-window is-minimized card-preview-window/u);
    assert.match(markup, /floating-window-drag-handle/u);
    assert.match(markup, /aria-label="Restore Preview"/u);
    assert.match(markup, /aria-label="Close Preview"/u);
    assert.match(markup, />-</u);
    assert.match(markup, />x</u);
    assert.equal(markup.includes("Draw 1 card."), false);
    assert.match(
      styles,
      /\.card-preview-window\.is-minimized\s*\{[^}]*min-height:\s*0;/u,
    );
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
    assert.match(matchApp, /onMoveOrderedCard=\{client\.moveDecisionCard\}/u);
    assert.match(matchApp, /previewHoveredCard/u);
    assert.match(matchApp, /previewControl=/u);
    assert.match(matchApp, /CardPreviewToggle/u);
    assert.match(matchApp, /CardPreviewWindow/u);
    assert.match(matchApp, /InfoTabbedWindow/u);
  });

  test("preview toggle controls whether hover preview is enabled", () => {
    const enabledMarkup = renderToStaticMarkup(
      createElement(CardPreviewToggle, {
        enabled: true,
        onToggle: () => undefined,
      }),
    );
    const disabledMarkup = renderToStaticMarkup(
      createElement(CardPreviewToggle, {
        enabled: false,
        onToggle: () => undefined,
      }),
    );

    assert.match(enabledMarkup, /card-preview-toggle is-enabled/u);
    assert.match(enabledMarkup, /aria-pressed="true"/u);
    assert.match(enabledMarkup, /Disable card preview on hover/u);
    assert.match(disabledMarkup, /aria-pressed="false"/u);
    assert.match(disabledMarkup, /Enable card preview on hover/u);
  });

  test("match app remembers the last hovered card and reopens preview when re-enabled", async () => {
    const source = await readFile(
      join(sourceDirectory, "MatchApp.tsx"),
      "utf8",
    );

    assert.match(source, /lastPreviewCard/u);
    assert.match(source, /const previewHoveredCard/u);
    assert.match(source, /if\s*\(!previewEnabled\)\s*\{\s*return;/u);
    assert.match(source, /setPreviewCard\(undefined\);/u);
    assert.match(source, /setPreviewCard\(lastPreviewCard\);/u);
  });

  test("closing the preview window disables hover preview", async () => {
    const source = await readFile(
      join(sourceDirectory, "MatchApp.tsx"),
      "utf8",
    );

    assert.match(source, /const closeCardPreview/u);
    assert.match(source, /setPreviewEnabled\(false\);/u);
    assert.match(source, /onClose=\{closeCardPreview\}/u);
  });

  test("preview window uses persisted floating window rectangle wiring", async () => {
    const [matchApp, previewWindow, infoWindowModel] = await Promise.all([
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
      readFile(join(sourceDirectory, "CardPreviewWindow.tsx"), "utf8"),
      readFile(join(sourceDirectory, "info-window-model.ts"), "utf8"),
    ]);

    assert.match(
      infoWindowModel,
      /const cardPreviewWindowKey = "card-preview";/u,
    );
    assert.match(matchApp, /cardPreviewWindowKey/u);
    assert.match(
      matchApp,
      /activeFloatingWindowRects\[cardPreviewWindowKey\]\s*\?\?\s*defaultCardPreviewWindowRect/u,
    );
    assert.match(
      matchApp,
      /updateFloatingWindowRect\(cardPreviewWindowKey, rect\)/u,
    );
    assert.match(previewWindow, /initialRect\?: WindowRect/u);
    assert.match(
      previewWindow,
      /onRectChange\?: \(\(rect: WindowRect\) => void\)/u,
    );
    assert.match(previewWindow, /onRectChange=\{onRectChange\}/u);
  });
});
