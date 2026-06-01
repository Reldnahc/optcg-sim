import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import type { CardId, InstanceId, PlayerId } from "@optcg/types";

import { BoardLayout } from "./BoardLayout.js";
import { HandRow, calculateHandOverlap } from "./HandRow.js";
import { calculateCardRowLayout } from "./card-row-layout.js";
import type {
  BoardViewModel,
  ClientActionModel,
  ClientCardModel,
} from "../view-model.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const appShellStylesPath = join(sourceDirectory, "styles", "app-shell.css");
const cardStylesPath = join(sourceDirectory, "styles", "card.css");
const countBadgeStylesPath = join(sourceDirectory, "styles", "count-badge.css");

const card = (index: number): ClientCardModel => ({
  instanceId: `hand-${String(index)}` as InstanceId,
  cardId: `card-${String(index)}` as CardId,
  name: `Card ${String(index)}`,
  category: "Character",
  attachedDonCount: 0,
  attachedDonCards: [],
});

const hiddenLifeCards = (count: number, prefix: string): ClientCardModel[] =>
  Array.from({ length: count }, (_, index) => ({
    instanceId: `${prefix}-${String(index)}` as InstanceId,
    cardId: "hidden" as CardId,
    name: "Hidden card",
    category: "hidden",
    attachedDonCount: 0,
    attachedDonCards: [],
  }));

const board = (): BoardViewModel => ({
  playerId: "p1" as PlayerId,
  self: {
    leader: card(100),
    hand: [card(1), card(2), card(3)],
    characters: [],
    costArea: [],
    trash: [],
    deckCount: 40,
    donDeckCount: 10,
    lifeCount: 5,
    lifeCards: hiddenLifeCards(5, "hidden-life-self"),
  },
  opponent: {
    leader: card(200),
    handCount: 6,
    characters: [],
    costArea: [],
    trash: [],
    deckCount: 40,
    donDeckCount: 10,
    lifeCount: 5,
    lifeCards: hiddenLifeCards(5, "hidden-life-opponent"),
  },
  actionsByCardInstanceId: {},
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
      40 / 3,
    );
  });

  test("player hand consumes outside-left lane before overlapping cards", () => {
    assert.deepEqual(
      calculateCardRowLayout({
        availableWidth: 200,
        laneExtensionWidth: 80,
        cardWidth: 60,
        cardCount: 5,
      }),
      {
        overlap: 5,
        laneExtension: 80,
        edgePacked: true,
      },
    );
    assert.deepEqual(
      calculateCardRowLayout({
        availableWidth: 200,
        laneExtensionWidth: 200,
        cardWidth: 60,
        cardCount: 5,
      }),
      {
        overlap: 0,
        laneExtension: 100,
        edgePacked: true,
      },
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

  test("player hand cards can use pointer-driven rearranging", () => {
    const markup = renderToStaticMarkup(
      createElement(HandRow, {
        label: "Player hand",
        cards: [card(1), card(2)],
        overflowDirection: "left",
        onMoveCard: () => undefined,
      }),
    );

    assert.match(markup, /is-pointer-reorderable/u);
    assert.doesNotMatch(markup, /draggable=/u);
  });

  test("hand card cursor distinguishes action menus from plain reorderable cards", async () => {
    const playActions: readonly ClientActionModel[] = [
      { index: 1, type: "playCard", label: "Play" },
    ];
    const markup = renderToStaticMarkup(
      createElement(HandRow, {
        label: "Player hand",
        cards: [card(1), card(2)],
        overflowDirection: "left",
        cardActions: (instanceId: string) =>
          instanceId === "hand-1" ? playActions : [],
        onCardAction: () => undefined,
        onMoveCard: () => undefined,
      }),
    );
    const styles = await readFile(cardStylesPath, "utf8");

    assert.match(markup, /has-card-menu-actions/u);
    assert.match(
      styles,
      /\.hand-cards\s+\.card-tile-shell\.is-pointer-reorderable:not\(\.has-card-menu-actions\)\s+\.card-tile\s*\{[^}]*cursor:\s*grab;/u,
    );
    assert.match(
      styles,
      /\.hand-cards\s+\.card-tile-shell\.is-pointer-reorderable\.has-card-menu-actions\s+\.card-tile\s*\{[^}]*cursor:\s*pointer;/u,
    );
    assert.match(
      styles,
      /\.hand-cards\s+\.card-tile-shell\.is-pointer-reorder-dragging\s+\.card-tile\s*\{[^}]*cursor:\s*grabbing;/u,
    );
  });

  test("hand card drag applies a page-level grabbing cursor while hit testing ignores the dragged card", async () => {
    const [source, styles] = await Promise.all([
      readFile(join(sourceDirectory, "CardTile.tsx"), "utf8"),
      readFile(cardStylesPath, "utf8"),
    ]);

    assert.match(source, /document\.documentElement\.classList\.add/u);
    assert.match(source, /document\.documentElement\.classList\.remove/u);
    assert.match(source, /is-hand-card-reorder-dragging/u);
    assert.match(
      styles,
      /:root\.is-hand-card-reorder-dragging,\s*:root\.is-hand-card-reorder-dragging \*\s*\{[^}]*cursor:\s*grabbing !important;/u,
    );
  });

  test("card tiles use pointer reorder instead of native drag", async () => {
    const source = await readFile(
      join(sourceDirectory, "CardTile.tsx"),
      "utf8",
    );

    assert.match(source, /onPointerDown/u);
    assert.doesNotMatch(source, /onDragStart/u);
    assert.doesNotMatch(source, /onDragOver/u);
    assert.doesNotMatch(source, /onDrop/u);
    assert.doesNotMatch(source, /draggable=/u);
  });

  test("card pointer reorder keeps normal card clicks available until movement starts", async () => {
    const source = await readFile(
      join(sourceDirectory, "CardTile.tsx"),
      "utf8",
    );
    const pointerDownStart = source.indexOf("onPointerDown={(event) => {");
    const pointerMoveStart = source.indexOf("onPointerMove={(event) => {");
    assert.notEqual(pointerDownStart, -1);
    assert.notEqual(pointerMoveStart, -1);
    const pointerDownSource = source.slice(pointerDownStart, pointerMoveStart);

    assert.doesNotMatch(pointerDownSource, /stopPropagation\(\)/u);
    assert.doesNotMatch(pointerDownSource, /preventDefault\(\)/u);
    assert.match(pointerDownSource, /setPointerCapture/u);
  });

  test("card pointer reorder previews during drag and commits once on release", async () => {
    const source = await readFile(
      join(sourceDirectory, "CardTile.tsx"),
      "utf8",
    );
    const pointerMoveStart = source.indexOf("onPointerMove={(event) => {");
    const pointerUpStart = source.indexOf("onPointerUp={(event) => {");
    const pointerCancelStart = source.indexOf("onPointerCancel={(event) => {");
    assert.notEqual(pointerMoveStart, -1);
    assert.notEqual(pointerUpStart, -1);
    assert.notEqual(pointerCancelStart, -1);
    const pointerMoveSource = source.slice(pointerMoveStart, pointerUpStart);
    const pointerUpSource = source.slice(pointerUpStart, pointerCancelStart);

    assert.match(source, /const pointerReorderDragThreshold = 2;/u);
    assert.match(source, /const moveCardNearPointer =/u);
    assert.match(
      source,
      /event\.currentTarget\.closest<HTMLElement>\("\.hand-cards"\)/u,
    );
    assert.match(source, /horizontalReorderTargetFromPointer/u);
    assert.match(
      source,
      /reorderEntries: readonly HorizontalReorderEntry\[\]/u,
    );
    assert.match(source, /entries: pointerDrag\.reorderEntries/u);
    assert.match(source, /const reorderEntries =/u);
    assert.doesNotMatch(source, /elementFromPoint/u);
    assert.doesNotMatch(source, /reorderPlacementFromOriginalDirection/u);
    assert.doesNotMatch(source, /reorderPlacementFromPointer/u);
    assert.doesNotMatch(source, /Math\.hypot\(clientX - centerX/u);
    assert.match(
      source,
      /onPreviewMoveNear\?\.\(draggedInstanceId, target\.targetId, target\.placement\);/u,
    );
    assert.match(pointerMoveSource, /moveCardNearPointer/u);
    assert.doesNotMatch(pointerMoveSource, /onMoveNear\(/u);
    assert.match(pointerUpSource, /finishPointerReorder/u);
  });

  test("card images do not start native browser image dragging", async () => {
    const styles = await readFile(cardStylesPath, "utf8");

    assert.match(styles, /\.card-face\s*\{[^}]*pointer-events:\s*none;/u);
    assert.match(styles, /\.card-face\s*\{[^}]*user-select:\s*none;/u);
    assert.match(styles, /\.card-face\s*\{[^}]*-webkit-user-drag:\s*none;/u);
  });

  test("hand cards animate around a placeholder while the dragged card stays direct", async () => {
    const styles = await readFile(cardStylesPath, "utf8");

    assert.match(
      styles,
      /\.hand-cards\s+\.card-tile-shell\s*\{[^}]*transition:\s*margin-left 80ms ease,\s*transform 80ms ease;/u,
    );
    assert.match(styles, /\.hand-drag-placeholder\s*\{[^}]*height:\s*100%;/u);
    assert.match(styles, /\.hand-drag-placeholder\s*\{[^}]*transition:/u);
    assert.doesNotMatch(styles, /hand-drag-placeholder-enter/u);
    assert.match(
      styles,
      /\.card-tile-shell\.is-pointer-reorder-dragging\s*\{[^}]*transition:\s*none;/u,
    );
  });

  test("hand drag owns and cleans up pointer state even when release is noisy", async () => {
    const source = await readFile(
      join(sourceDirectory, "CardTile.tsx"),
      "utf8",
    );

    assert.match(source, /setPointerCapture\(event\.pointerId\)/u);
    assert.match(source, /document\.addEventListener\("pointerup"/u);
    assert.match(source, /document\.addEventListener\("pointercancel"/u);
    assert.match(source, /finishPointerReorder/u);
  });

  test("board layout wires hand rearranging only to the player hand", async () => {
    const source = await readFile(
      join(sourceDirectory, "BoardLayout.tsx"),
      "utf8",
    );
    const matchSource = await readFile(
      join(sourceDirectory, "MatchApp.tsx"),
      "utf8",
    );

    assert.match(source, /onMoveHandCard/u);
    assert.match(source, /onMoveCard=\{onMoveHandCard\}/u);
    assert.match(matchSource, /moveHandCard/u);
  });

  test("hand CSS uses the full lane and overlaps without shrinking or wrapping", async () => {
    const styles = await readFile(appShellStylesPath, "utf8");

    assert.match(styles, /\.hand-row\s*\{[^}]*justify-content:\s*center;/u);
    assert.match(styles, /\.hand-cards\s*\{[^}]*flex-wrap:\s*nowrap;/u);
    assert.match(styles, /\.hand-cards\s*\{[^}]*width:\s*100%;/u);
    assert.match(
      styles,
      /\.hand-cards\s*\{[^}]*justify-content:\s*space-evenly;/u,
    );
    assert.match(
      styles,
      /\.hand-cards\.is-using-outside-lane\.hand-cards-overlap-left\s*\{[^}]*width:\s*calc\(100%\s*\+\s*var\(--hand-lane-extension\)\);[^}]*margin-left:\s*calc\(-1\s*\*\s*var\(--hand-lane-extension\)\);/u,
    );
    assert.match(styles, /\.hand-cards\.is-overlapping\s*\{[^}]*gap:\s*0;/u);
    assert.match(
      styles,
      /\.hand-cards\.is-edge-packed\.hand-cards-overlap-left\s*\{[^}]*justify-content:\s*flex-end;/u,
    );
    assert.match(
      styles,
      /\.hand-cards\.is-edge-packed\.hand-cards-overlap-right\s*\{[^}]*justify-content:\s*flex-start;/u,
    );
    assert.match(
      styles,
      /\.hand-cards\.is-overlapping\s+\.card-tile-shell\s*\+\s*\.card-tile-shell\s*\{[^}]*margin-left:\s*calc\(-1\s*\*\s*var\(--hand-overlap\)\);/u,
    );
  });

  test("hand counts render between hands and board with prominent outlined numbers", async () => {
    const markup = renderToStaticMarkup(
      createElement(BoardLayout, {
        board: board(),
        cardActions: () => [],
        onCardClick: () => undefined,
        onCardAction: () => undefined,
        onViewCollection: () => undefined,
        onBackgroundClick: () => undefined,
      }),
    );
    const [appShellStyles, countBadgeStyles] = await Promise.all([
      readFile(appShellStylesPath, "utf8"),
      readFile(countBadgeStylesPath, "utf8"),
    ]);

    assert.match(
      markup,
      /class="count-badge is-hover-revealed hand-count opponent-hand-count"/u,
    );
    assert.match(markup, /aria-label="Opponent hand count: 6"/u);
    assert.match(
      markup,
      /class="count-badge is-hover-revealed hand-count player-hand-count"/u,
    );
    assert.match(markup, /aria-label="Player hand count: 3"/u);
    assert.match(countBadgeStyles, /\.count-badge\s*\{[^}]*color:\s*#42e67c;/u);
    assert.match(
      countBadgeStyles,
      /\.count-badge\s*\{[^}]*-webkit-text-stroke:\s*2px rgba\(0,\s*0,\s*0,\s*0\.92\);/u,
    );
    assert.match(
      appShellStyles,
      /\.hand-count\s*\{[^}]*position:\s*absolute;/u,
    );
    assert.match(appShellStyles, /\.hand-count\s*\{[^}]*right:\s*8px;/u);
    assert.match(
      appShellStyles,
      /\.opponent-hand-count\s*\{[^}]*top:\s*calc\(var\(--card-height\) \+ 8px\);/u,
    );
    assert.match(
      appShellStyles,
      /\.player-hand-count\s*\{[^}]*bottom:\s*calc\(var\(--card-height\) \+ 8px\);/u,
    );
    assert.match(
      appShellStyles,
      /\.hand-rail:hover\s+\.hand-count\s*\{[^}]*opacity:\s*1;/u,
    );
  });

  test("opponent hand renders every hidden card past ten cards", () => {
    const largeHandBoard = board();
    largeHandBoard.opponent.handCount = 13;

    const markup = renderToStaticMarkup(
      createElement(BoardLayout, {
        board: largeHandBoard,
        cardActions: () => [],
        onCardClick: () => undefined,
        onCardAction: () => undefined,
        onViewCollection: () => undefined,
        onBackgroundClick: () => undefined,
      }),
    );

    assert.equal([...markup.matchAll(/hidden-hand-opponent-/gu)].length, 13);
    assert.match(markup, /aria-label="Opponent hand count: 13"/u);
  });
});
