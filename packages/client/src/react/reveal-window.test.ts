import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import type { CardId, InstanceId } from "@optcg/types";

import type { ClientCardModel } from "../view-model.js";
import { RevealWindowHost } from "./RevealWindowHost.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const revealStylesPath = join(sourceDirectory, "styles", "reveal-window.css");
const mainPath = join(sourceDirectory, "main.tsx");
const matchInteractionModalsPath = join(
  sourceDirectory,
  "MatchInteractionModals.tsx",
);
const revealLayerPath = join(sourceDirectory, "OpponentRevealWindowLayer.tsx");

const card = (imageUrl: string): ClientCardModel => ({
  instanceId: "revealed-1" as InstanceId,
  cardId: "revealed-card" as CardId,
  name: "Revealed Card",
  category: "Character",
  imageUrl,
  attachedDonCount: 0,
  attachedDonCards: [],
});

describe("reveal window", () => {
  test("renders revealed cards through a dedicated large-card spot", () => {
    const markup = renderToStaticMarkup(
      createElement(RevealWindowHost, {
        model: {
          title: "Opponent revealed",
          cards: [card("https://cdn.example.test/revealed.webp")],
        },
        minimized: false,
        onToggleMinimized: () => undefined,
        onClose: () => undefined,
      }),
    );

    assert.match(markup, /floating-window-reveal reveal-window/u);
    assert.match(markup, /floating-window-minimize/u);
    assert.match(markup, /reveal-window-card-spot/u);
    assert.match(markup, /src="https:\/\/cdn\.example\.test\/revealed\.webp"/u);
    assert.doesNotMatch(markup, /collection-modal-card-grid/u);
  });

  test("reveal windows spawn at their minimum allowed size", () => {
    const markup = renderToStaticMarkup(
      createElement(RevealWindowHost, {
        model: {
          title: "Opponent revealed",
          cards: [card("https://cdn.example.test/revealed.webp")],
        },
        onClose: () => undefined,
      }),
    );

    assert.match(markup, /width:300px/);
    assert.match(markup, /height:420px/);
  });

  test("large reveal card sizing is isolated from collection grid sizing", async () => {
    const [styles, mainSource, revealLayerSource] = await Promise.all([
      readFile(revealStylesPath, "utf8"),
      readFile(mainPath, "utf8"),
      readFile(revealLayerPath, "utf8"),
    ]);

    assert.match(styles, /\.reveal-window-card-spot/u);
    assert.match(
      styles,
      /--reveal-card-height:\s*min\(\s*58vh,\s*calc\(var\(--card-height\) \+ var\(--card-height\) \+ \(var\(--card-height\) \/ 2\)\)\s*\);/u,
    );
    assert.match(styles, /\.reveal-window-card-spot\s+\.card-tile-shell/u);
    assert.match(mainSource, /styles\/reveal-window\.css/u);
    assert.match(revealLayerSource, /RevealWindowHost/u);
  });

  test("match app renders one reveal window for each active reveal", async () => {
    const [modalLayerSource, revealLayerSource] = await Promise.all([
      readFile(matchInteractionModalsPath, "utf8"),
      readFile(revealLayerPath, "utf8"),
    ]);

    assert.match(modalLayerSource, /OpponentRevealWindowLayer/u);
    assert.match(revealLayerSource, /windows\s*[\s\S]*\.filter/u);
    assert.match(
      revealLayerSource,
      /activeDockedWindowIds\.has\(revealWindowKey/u,
    );
    assert.match(revealLayerSource, /\.map\(\(revealWindow\) =>/u);
    assert.doesNotMatch(revealLayerSource, /model=\{opponentRevealWindow\}/u);
  });

  test("reveal windows use persisted floating window rectangle wiring", async () => {
    const [revealLayerSource, revealWindowSource, revealWindowModelSource] =
      await Promise.all([
        readFile(revealLayerPath, "utf8"),
        readFile(join(sourceDirectory, "RevealWindowHost.tsx"), "utf8"),
        readFile(join(sourceDirectory, "opponent-reveal-windows.ts"), "utf8"),
      ]);

    assert.match(
      revealWindowModelSource,
      /const revealWindowKey = \(revealId: string\)/u,
    );
    assert.match(revealLayerSource, /const windowKey = revealWindowKey/u);
    assert.match(revealLayerSource, /activeFloatingWindowRects\[windowKey\]/u);
    assert.match(revealLayerSource, /onRectChange\(windowKey, rect\)/u);
    assert.match(
      revealWindowSource,
      /onRectChange\?: \(\(rect: WindowRect\) => void\)/u,
    );
    assert.match(revealWindowSource, /onRectChange=\{onRectChange\}/u);
  });
});
