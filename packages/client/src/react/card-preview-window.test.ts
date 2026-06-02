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

  test("renders an empty preview window before a card is hovered", () => {
    const markup = renderToStaticMarkup(
      createElement(CardPreviewWindow, {
        minimized: false,
        onToggleMinimized: () => undefined,
        onClose: () => undefined,
      }),
    );

    assert.match(markup, /floating-window/u);
    assert.match(markup, /card-preview-window/u);
    assert.match(markup, /Preview/);
    assert.match(markup, /Hover a card to preview it/u);
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
    const [
      boardLayout,
      zone,
      handRow,
      collectionModal,
      decisionModal,
      matchApp,
      matchInfoWindows,
      matchInteractionModals,
    ] = await Promise.all([
      readFile(join(sourceDirectory, "BoardLayout.tsx"), "utf8"),
      readFile(join(sourceDirectory, "Zone.tsx"), "utf8"),
      readFile(join(sourceDirectory, "HandRow.tsx"), "utf8"),
      readFile(join(sourceDirectory, "CollectionModalHost.tsx"), "utf8"),
      readFile(join(sourceDirectory, "DecisionModalHost.tsx"), "utf8"),
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
      readFile(join(sourceDirectory, "MatchInfoWindows.tsx"), "utf8"),
      readFile(join(sourceDirectory, "MatchInteractionModals.tsx"), "utf8"),
    ]);

    assert.match(boardLayout, /onPreviewCard/u);
    assert.match(zone, /onCardPreview/u);
    assert.match(handRow, /onCardPreview/u);
    assert.match(collectionModal, /onPreviewCard/u);
    assert.match(decisionModal, /onPreviewCard/u);
    assert.match(
      matchInteractionModals,
      /onMoveOrderedCard=\{onMoveOrderedCard\}/u,
    );
    assert.match(matchApp, /previewHoveredCard/u);
    assert.match(matchApp, /previewControl=/u);
    assert.match(matchApp, /CardPreviewToggle/u);
    assert.match(matchInfoWindows, /CardPreviewWindow/u);
    assert.match(matchInfoWindows, /InfoTabbedWindow/u);
  });

  test("preview toggle controls whether the preview window is open", () => {
    const openMarkup = renderToStaticMarkup(
      createElement(CardPreviewToggle, {
        open: true,
        onToggle: () => undefined,
      }),
    );
    const closedMarkup = renderToStaticMarkup(
      createElement(CardPreviewToggle, {
        open: false,
        onToggle: () => undefined,
      }),
    );

    assert.match(openMarkup, /card-preview-toggle is-open/u);
    assert.match(openMarkup, /aria-pressed="true"/u);
    assert.match(openMarkup, /Close preview/u);
    assert.match(closedMarkup, /aria-pressed="false"/u);
    assert.match(closedMarkup, /Open preview/u);
  });

  test("match app treats preview as a normal open window", async () => {
    const [matchApp, toolbarControls] = await Promise.all([
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
      readFile(
        join(sourceDirectory, "info-window-toolbar-controls.ts"),
        "utf8",
      ),
    ]);

    assert.match(matchApp, /const \[previewOpen/u);
    assert.match(matchApp, /previewHoveredCard/u);
    assert.match(toolbarControls, /previewHoveredCard\(card\)/u);
    const hoverBlock =
      /previewHoveredCard\(card\) \{(?<body>[\s\S]*?)\n\s{4}\},/u.exec(
        toolbarControls,
      )?.groups?.["body"] ?? "";
    assert.match(hoverBlock, /setPreviewCard\(card\);/u);
    assert.doesNotMatch(hoverBlock, /activateInfoWindowTab/u);
    assert.doesNotMatch(hoverBlock, /setPreviewOpen\(true\)/u);
    assert.match(
      toolbarControls,
      /updateFloatingWindowOpen\(cardPreviewWindowKey, true\)/u,
    );
    assert.doesNotMatch(matchApp, /lastPreviewCard/u);
    assert.doesNotMatch(matchApp, /previewEnabled/u);
  });

  test("closing the preview window closes its normal window state", async () => {
    const [matchInfoWindows, toolbarControls] = await Promise.all([
      readFile(join(sourceDirectory, "MatchInfoWindows.tsx"), "utf8"),
      readFile(
        join(sourceDirectory, "info-window-toolbar-controls.ts"),
        "utf8",
      ),
    ]);

    assert.match(toolbarControls, /const closeCardPreview/u);
    assert.match(toolbarControls, /setPreviewOpen\(false\);/u);
    assert.match(
      toolbarControls,
      /updateFloatingWindowOpen\(cardPreviewWindowKey, false\)/u,
    );
    assert.match(matchInfoWindows, /onClose=\{closeCardPreview\}/u);
  });

  test("preview window uses persisted floating window rectangle wiring", async () => {
    const [matchInfoWindows, previewWindow, infoWindowModel] =
      await Promise.all([
        readFile(join(sourceDirectory, "MatchInfoWindows.tsx"), "utf8"),
        readFile(join(sourceDirectory, "CardPreviewWindow.tsx"), "utf8"),
        readFile(join(sourceDirectory, "info-window-model.ts"), "utf8"),
      ]);

    assert.match(
      infoWindowModel,
      /const cardPreviewWindowKey = "card-preview";/u,
    );
    assert.match(matchInfoWindows, /cardPreviewWindowKey/u);
    assert.match(
      matchInfoWindows,
      /activeFloatingWindowRects\[cardPreviewWindowKey\]\s*\?\?\s*defaultCardPreviewWindowRect/u,
    );
    assert.match(
      matchInfoWindows,
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
