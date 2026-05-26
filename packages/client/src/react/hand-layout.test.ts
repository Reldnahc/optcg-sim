import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import type { CardId, InstanceId } from "@optcg/types";

import { HandRow, calculateHandOverlap } from "./HandRow.js";
import type { ClientCardModel } from "../view-model.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const appShellStylesPath = join(sourceDirectory, "styles", "app-shell.css");

const card = (index: number): ClientCardModel => ({
  instanceId: `hand-${String(index)}` as InstanceId,
  cardId: `card-${String(index)}` as CardId,
  name: `Card ${String(index)}`,
  category: "Character",
  attachedDonCount: 0,
});

describe("hand layout", () => {
  test("hand overlap is only added when natural card width exceeds the rail", () => {
    assert.equal(
      calculateHandOverlap({
        availableWidth: 300,
        cardWidth: 60,
        cardCount: 4,
      }),
      0,
    );
    assert.equal(
      calculateHandOverlap({
        availableWidth: 200,
        cardWidth: 60,
        cardCount: 4,
      }),
      55 / 3,
    );
  });

  test("board hands declare opposite overflow directions", () => {
    const opponentMarkup = renderToStaticMarkup(
      createElement(HandRow, {
        label: "Opponent hand",
        cards: [card(1), card(2)],
        overflowDirection: "right",
      }),
    );
    const playerMarkup = renderToStaticMarkup(
      createElement(HandRow, {
        label: "Player hand",
        cards: [card(1), card(2)],
        overflowDirection: "left",
      }),
    );

    assert.match(opponentMarkup, /hand-cards-overlap-right/u);
    assert.match(playerMarkup, /hand-cards-overlap-left/u);
  });

  test("hand CSS centers fitting cards and overlaps without shrinking or wrapping", async () => {
    const styles = await readFile(appShellStylesPath, "utf8");

    assert.match(styles, /\.hand-row\s*\{[^}]*justify-content:\s*center;/u);
    assert.match(styles, /\.hand-cards\s*\{[^}]*flex-wrap:\s*nowrap;/u);
    assert.match(styles, /\.hand-cards\s*\{[^}]*width:\s*100%;/u);
    assert.match(styles, /\.hand-cards\.is-overlapping\s*\{[^}]*gap:\s*0;/u);
    assert.match(
      styles,
      /\.hand-cards\.is-overlapping\.hand-cards-overlap-left\s*\{[^}]*justify-content:\s*flex-end;/u,
    );
    assert.match(
      styles,
      /\.hand-cards\.is-overlapping\.hand-cards-overlap-right\s*\{[^}]*justify-content:\s*flex-start;/u,
    );
    assert.match(
      styles,
      /\.hand-cards\.is-overlapping\s+\.card-tile-shell\s*\+\s*\.card-tile-shell\s*\{[^}]*margin-left:\s*calc\(-1\s*\*\s*var\(--hand-overlap\)\);/u,
    );
  });
});
