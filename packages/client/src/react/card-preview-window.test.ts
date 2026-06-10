import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import type { CardId, InstanceId } from "@optcg/types";

import { CardPreviewButton } from "./CardPreviewButton.js";
import { CardPreviewWindow } from "./CardPreviewWindow.js";
import { CardTile } from "./CardTile.js";
import type { ClientCardModel } from "../view-model.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

const card = (overrides: Partial<ClientCardModel> = {}): ClientCardModel => ({
  instanceId: "preview-card" as InstanceId,
  cardId: "OP00-000" as CardId,
  name: "Preview Card",
  category: "Character",
  effectText: "[On Play] Draw 1 card.",
  triggerText: "Add 1 card.",
  imageUrl: "https://example.test/card.png",
  counter: 1000,
  attributes: ["special"],
  types: ["Dressrosa", "Navy"],
  attachedDonCount: 0,
  attachedDonCards: [],
  ...overrides,
});

const markupForPreviewControls = (): string =>
  renderToStaticMarkup(
    createElement(CardPreviewWindow, {
      card: card(),
      minimized: false,
      onToggleMinimized: () => undefined,
      onClose: () => undefined,
    }),
  );

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
    assert.doesNotMatch(markup, />Effect<\/h3>/u);
    assert.doesNotMatch(markup, />Trigger<\/h3>/u);
    assert.match(markup, /Type/u);
    assert.match(markup, /Dressrosa \/ Navy/u);
    assert.match(markup, /Attribute/u);
    assert.match(markup, /Special/u);
    assert.match(markup, /Counter/u);
    assert.match(markup, /\+1000/u);
    assert.match(markup, /effect-rules-text/u);
    assert.match(markup, /card-rules-tag--blue/u);
  });

  test("renders an image-first preview with zoom controls and a resizable text panel", () => {
    const markup = renderToStaticMarkup(
      createElement(CardPreviewWindow, {
        card: card(),
        minimized: false,
        onToggleMinimized: () => undefined,
        onClose: () => undefined,
      }),
    );

    assert.match(markup, /card-preview-stage/u);
    assert.match(markup, /card-preview-image-scroll/u);
    assert.match(markup, /card-preview-card-image/u);
    assert.match(markup, /--card-preview-zoom:1/u);
    assert.match(
      markup,
      /--card-preview-image-bottom-reserve:calc\(42% \+ 24px\)/u,
    );
    assert.match(markup, /card-preview-rules-panel/u);
    assert.match(markup, /card-preview-rules-resize-handle/u);
    assert.match(markup, /--card-preview-rules-height:42%/u);
    assert.match(markup, /card-preview-control-bar/u);
    assert.match(markup, /card-preview-metadata/u);
    assert.match(markup, /aria-label="Zoom card out"/u);
    assert.match(markup, /aria-label="Reset card zoom"/u);
    assert.match(markup, /aria-label="Zoom card in"/u);
    assert.match(markup, /aria-label="Hide card text"/u);
  });

  test("preview image area stays transparent and controls expose feedback states", async () => {
    const styles = await readFile(
      join(sourceDirectory, "styles", "card-preview-window.css"),
      "utf8",
    );

    assert.doesNotMatch(styles, /\.card-preview-stage\s*\{[^}]*background:/u);
    assert.match(styles, /\.card-preview-stage\s*\{[^}]*overflow:\s*hidden;/u);
    assert.match(
      styles,
      /\.card-preview-image-scroll\s*\{[^}]*overflow:\s*auto;/u,
    );
    assert.match(
      styles,
      /\.card-preview-image-frame\s*\{[^}]*padding:\s*0 0 var\(--card-preview-image-bottom-reserve\);[^}]*place-items:\s*start center;/u,
    );
    assert.match(
      styles,
      /\.card-preview-rules-panel\s*\{[^}]*right:\s*0;[^}]*bottom:\s*0;[^}]*left:\s*0;/u,
    );
    assert.match(
      styles,
      /\.card-preview-window \.floating-window-body\s*\{[^}]*padding:\s*0;[^}]*overflow:\s*hidden;/u,
    );
    assert.match(
      markupForPreviewControls(),
      /aria-label="Reset card zoom" disabled=""/u,
    );
    assert.match(styles, /\.card-preview-control-bar button:active\s*\{/u);
    assert.match(
      styles,
      /\.card-preview-content\s*\{[^}]*--card-preview-card-width:\s*clamp\(/u,
    );
    assert.match(
      styles,
      /\.card-preview-control-bar\s*\{[^}]*min-height:\s*var\(--card-preview-control-height\);/u,
    );
    assert.match(
      styles,
      /\.card-preview-control-bar button\s*\{[^}]*height:\s*var\(--card-preview-button-height\);/u,
    );
    assert.match(styles, /\.card-preview-control-bar button:disabled\s*\{/u);
    assert.match(
      styles,
      /\.card-preview-control-bar button\s*\{[^}]*cursor:\s*pointer;/u,
    );
  });

  test("preview content captures ctrl wheel for card zoom instead of page zoom", async () => {
    const source = await readFile(
      join(sourceDirectory, "CardPreviewWindow.tsx"),
      "utf8",
    );

    assert.match(source, /addEventListener\("wheel",\s*handlePreviewWheel/u);
    assert.match(source, /removeEventListener\("wheel",\s*handlePreviewWheel/u);
    assert.match(source, /\{\s*passive:\s*false\s*\}/u);
    assert.match(source, /if\s*\(\s*!event\.ctrlKey\s*\)/u);
    assert.match(source, /event\.preventDefault\(\);/u);
    assert.match(
      source,
      /zoomBy\(event\.deltaY < 0 \? previewZoomStep : -previewZoomStep\);/u,
    );
  });

  test("preview text panel can be dragged to the top of the preview stage", async () => {
    const [source, styles] = await Promise.all([
      readFile(join(sourceDirectory, "CardPreviewWindow.tsx"), "utf8"),
      readFile(
        join(sourceDirectory, "styles", "card-preview-window.css"),
        "utf8",
      ),
    ]);

    assert.match(source, /const maxPreviewTextPanelHeight = 100;/u);
    assert.doesNotMatch(
      styles,
      /\.card-preview-rules-panel\s*\{[^}]*max-height:/u,
    );
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
    assert.match(matchApp, /CardPreviewButton/u);
    assert.match(matchInfoWindows, /CardPreviewWindow/u);
    assert.match(matchInfoWindows, /InfoTabbedWindow/u);
  });

  test("preview toggle controls whether the preview window is open", () => {
    const openMarkup = renderToStaticMarkup(
      createElement(CardPreviewButton, {
        open: true,
        onActivate: () => undefined,
      }),
    );
    const closedMarkup = renderToStaticMarkup(
      createElement(CardPreviewButton, {
        open: false,
        onActivate: () => undefined,
      }),
    );

    assert.match(openMarkup, /card-preview-button is-open/u);
    assert.match(openMarkup, /aria-pressed="true"/u);
    assert.match(openMarkup, /Show preview/u);
    assert.match(closedMarkup, /aria-pressed="false"/u);
    assert.match(closedMarkup, /Show preview/u);
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
      /focusInfoWindow\(\{ tabId: "preview", windowKey: cardPreviewWindowKey \}\)/u,
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
