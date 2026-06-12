import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import type { CardId, InstanceId } from "@optcg/types";

import { CollectionModalHost } from "./CollectionModalHost.js";
import { defaultCollectionWindowRect } from "./collection-window-model.js";
import { Zone } from "./Zone.js";
import type { ClientCardModel } from "../view-model.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const collectionStylesPath = join(
  sourceDirectory,
  "styles",
  "collection-modal.css",
);
const zoneStylesPath = join(sourceDirectory, "styles", "zone.css");
const countBadgeStylesPath = join(sourceDirectory, "styles", "count-badge.css");

const card = (instanceId: string, name: string): ClientCardModel => ({
  instanceId: instanceId as InstanceId,
  cardId: `${instanceId}-card` as CardId,
  name,
  category: "Character",
  attachedDonCount: 0,
  attachedDonCards: [],
});

describe("collection modal", () => {
  test("collection windows default to the center of the viewport", () => {
    assert.deepEqual(
      defaultCollectionWindowRect({ width: 1280, height: 800 }),
      { x: 360, y: 170, width: 560, height: 460 },
    );
  });

  test("trash stack displays only the newest card", () => {
    const markup = renderToStaticMarkup(
      createElement(Zone, {
        label: "Trash",
        cards: [card("new", "Newest Trash"), card("old", "Old Trash")],
        displayMode: "stack",
        onViewCollection: () => undefined,
      }),
    );

    assert.equal(markup.includes("Newest Trash"), true);
    assert.equal(markup.includes("Old Trash"), false);
    assert.match(markup, /zone-stack/u);
  });

  test("stack zones show a prominent count overlay instead of tiny empty text", async () => {
    const markup = renderToStaticMarkup(
      createElement(Zone, {
        label: "Trash",
        cards: [card("new", "Newest Trash"), card("old", "Old Trash")],
        displayMode: "stack",
        onViewCollection: () => undefined,
      }),
    );
    const emptyMarkup = renderToStaticMarkup(
      createElement(Zone, {
        label: "Trash",
        cards: [],
        displayMode: "stack",
        onViewCollection: () => undefined,
      }),
    );
    const [zoneStyles, countBadgeStyles] = await Promise.all([
      readFile(zoneStylesPath, "utf8"),
      readFile(countBadgeStylesPath, "utf8"),
    ]);

    assert.match(markup, /count-badge is-hover-revealed stack-count/u);
    assert.match(markup, /aria-label="Trash count: 2"/u);
    assert.match(markup, />2</u);
    assert.equal(emptyMarkup.includes("empty"), false);
    assert.match(emptyMarkup, /aria-label="Trash count: 0"/u);
    assert.match(zoneStyles, /\.stack-count\s*\{[^}]*top:\s*50%;/u);
    assert.match(
      zoneStyles,
      /\.stack-count\s*\{[^}]*transform:\s*translate\(-50%,\s*-50%\);/u,
    );
    assert.match(
      zoneStyles,
      /\.zone-stack:hover\s+\.stack-count\s*\{[^}]*opacity:\s*1;/u,
    );
    assert.match(countBadgeStyles, /\.count-badge\s*\{[^}]*color:\s*#42e67c;/u);
    assert.match(
      countBadgeStyles,
      /\.count-badge\.is-hover-revealed\s*\{[^}]*opacity:\s*0;/u,
    );
    assert.match(
      countBadgeStyles,
      /\.count-badge\s*\{[^}]*-webkit-text-stroke:\s*2px rgba\(0,\s*0,\s*0,\s*0\.92\);/u,
    );
  });

  test("stack zones can display a true count larger than rendered hidden cards", () => {
    const hiddenCards = Array.from({ length: 10 }, (_, index) =>
      card(`hidden-${String(index)}`, "Hidden card"),
    );
    const markup = renderToStaticMarkup(
      createElement(Zone, {
        label: "Deck",
        cards: hiddenCards,
        displayMode: "stack",
        stackCount: 37,
      }),
    );

    assert.match(markup, /aria-label="Deck count: 37"/u);
    assert.match(markup, />37</u);
  });

  test("stack zones render counted card layers with slight offsets", async () => {
    const markup = renderToStaticMarkup(
      createElement(Zone, {
        label: "Deck",
        cards: [card("hidden-deck-top", "Hidden card")],
        displayMode: "stack",
        stackCount: 4,
      }),
    );
    const zoneStyles = await readFile(zoneStylesPath, "utf8");

    assert.equal((markup.match(/stack-card-layer/gu) ?? []).length, 3);
    assert.match(markup, /--stack-card-offset:0px/u);
    assert.match(markup, /--stack-card-offset:1px/u);
    assert.match(markup, /--stack-card-offset:2px/u);
    assert.match(markup, /--stack-card-offset:3px/u);
    assert.match(markup, /z-index:3/u);
    assert.match(
      markup,
      /stack-card-layer card-face card-back card-back-main-deck/u,
    );
    assert.match(markup, /data-stack-card-index="0"/u);
    assert.match(markup, /data-stack-card-index="2"/u);
    assert.match(markup, /stack-card-top/u);
    assert.match(
      zoneStyles,
      /\.zone-cards-stack\s*\{[^}]*position:\s*relative;/u,
    );
    assert.match(
      zoneStyles,
      /\.stack-card-layer\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*transform:\s*translateY\(calc\(-1 \* var\(--stack-card-offset\)\)\);/u,
    );
    assert.match(
      zoneStyles,
      /\.stack-card-layer\s*\{[^}]*pointer-events:\s*auto;/u,
    );
    assert.match(zoneStyles, /\.stack-card-layer:hover\s*\{[^}]*box-shadow:/u);
    assert.match(
      zoneStyles,
      /\.stack-card-top\s*\{[^}]*position:\s*relative;[^}]*transform:\s*translateY\(calc\(-1 \* var\(--stack-card-offset\)\)\);/u,
    );
  });

  test("empty non-stack zones do not render placeholder text", () => {
    const markup = renderToStaticMarkup(
      createElement(Zone, {
        label: "Stage",
        cards: [],
      }),
    );

    assert.equal(markup.includes("empty"), false);
    assert.equal(markup.includes("empty-zone"), false);
  });

  test("overlap mode marks zone rows for overlap layout", () => {
    const markup = renderToStaticMarkup(
      createElement(Zone, {
        label: "Cost Area",
        cards: [card("don-1", "DON!!"), card("don-2", "DON!!")],
        displayMode: "overlap",
      }),
    );

    assert.match(markup, /zone-overlap/u);
    assert.match(markup, /zone-cards-overlap/u);
  });

  test("overlap zones contain width without clipping selected card outlines", async () => {
    const styles = await readFile(zoneStylesPath, "utf8");

    assert.match(styles, /\.zone-overlap\s*\{[^}]*contain:\s*inline-size;/u);
    assert.match(styles, /\.zone-overlap\s*\{[^}]*overflow:\s*visible;/u);
    assert.match(styles, /\.zone-cards-overlap\s*\{[^}]*overflow:\s*visible;/u);
  });

  test("overlap zones keep hand-style spacing while applying row overlap", async () => {
    const styles = await readFile(zoneStylesPath, "utf8");

    assert.match(styles, /\.zone-cards\s*\{[^}]*gap:\s*5px;/u);
    assert.match(
      styles,
      /\.zone-cards-overlap\.is-overlapping \.card-tile-shell \+ \.card-tile-shell\s*\{[^}]*margin-left:\s*calc\(-1 \* var\(--card-row-overlap\)\);/u,
    );
    assert.doesNotMatch(
      styles,
      /\.zone-cards-overlap\.is-overlapping\s*\{[^}]*gap:\s*0;/u,
    );
  });

  test("slot mode renders exactly the requested number of equal card slots", async () => {
    const markup = renderToStaticMarkup(
      createElement(Zone, {
        label: "Character Area",
        cards: [card("character-1", "First"), card("character-2", "Second")],
        displayMode: "slots",
        slotCount: 5,
      }),
    );
    const styles = await readFile(zoneStylesPath, "utf8");

    assert.match(markup, /zone-slots/u);
    assert.equal(markup.match(/zone-card-slot/g)?.length, 5);
    assert.equal(markup.match(/is-empty/g)?.length, 3);
    assert.match(
      styles,
      /\.zone-cards-slots\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/u,
    );
    assert.equal(styles.includes("border: 1px dashed"), false);
  });

  test("collection viewer is separate from decision modal and can show many cards", () => {
    const markup = renderToStaticMarkup(
      createElement(CollectionModalHost, {
        model: {
          title: "Player trash",
          cards: [
            card("one", "One"),
            card("two", "Two"),
            card("three", "Three"),
          ],
        },
        onClose: () => undefined,
      }),
    );

    assert.match(markup, /collection-modal/u);
    assert.equal(markup.includes("decision-modal"), false);
    assert.equal(markup.includes("Player trash"), true);
    assert.equal(markup.includes("One"), true);
    assert.equal(markup.includes("Two"), true);
    assert.equal(markup.includes("Three"), true);
    assert.equal(markup.includes("is-pending-choice"), false);
    assert.equal(markup.includes('disabled=""'), false);
  });

  test("trash collection viewers use possessive player labels", async () => {
    const source = await readFile(
      join(sourceDirectory, "BoardLayout.tsx"),
      "utf8",
    );
    const windowModelSource = await readFile(
      join(sourceDirectory, "collection-window-model.ts"),
      "utf8",
    );

    assert.match(source, /\$\{board\.selfLabel\}'s trash/u);
    assert.match(source, /\$\{board\.opponentLabel\}'s trash/u);
    assert.match(windowModelSource, /title: "Player's trash"/u);
    assert.match(windowModelSource, /title: "Opponent's trash"/u);
  });

  test("pending collection decisions render as modals instead of floating windows", () => {
    const markup = renderToStaticMarkup(
      createElement(CollectionModalHost, {
        model: {
          title: "Player trash",
          cards: [card("one", "One")],
          selection: {
            selectedInstanceIds: [],
            selectableInstanceIds: ["one"],
            canConfirm: true,
            confirmLabel: "Confirm",
          },
        },
        presentation: "modal",
        onToggleCard: () => undefined,
        onConfirm: () => undefined,
      }),
    );

    assert.match(markup, /modal-frame/u);
    assert.match(markup, /collection-modal/u);
    assert.match(markup, /collection-modal-card-grid is-single-card/u);
    assert.doesNotMatch(markup, /floating-window/u);
  });

  test("single-card collection viewers only enlarge when presented as decision modals", () => {
    const windowMarkup = renderToStaticMarkup(
      createElement(CollectionModalHost, {
        model: {
          title: "Player trash",
          cards: [card("one", "One")],
        },
        onClose: () => undefined,
      }),
    );
    const modalMarkup = renderToStaticMarkup(
      createElement(CollectionModalHost, {
        model: {
          title: "Choose from trash",
          cards: [card("one", "One")],
          selection: {
            selectedInstanceIds: [],
            selectableInstanceIds: ["one"],
            canConfirm: true,
            confirmLabel: "Confirm",
          },
        },
        presentation: "modal",
        onToggleCard: () => undefined,
        onConfirm: () => undefined,
      }),
    );

    assert.doesNotMatch(windowMarkup, /is-single-card/u);
    assert.match(modalMarkup, /collection-modal-card-grid is-single-card/u);
  });

  test("collection viewer has close and minimize controls", async () => {
    const markup = renderToStaticMarkup(
      createElement(CollectionModalHost, {
        model: {
          title: "Player trash",
          cards: [card("one", "One")],
        },
        minimized: false,
        onToggleMinimized: () => undefined,
        onClose: () => undefined,
      }),
    );
    const source = await readFile(
      join(sourceDirectory, "CollectionModalHost.tsx"),
      "utf8",
    );

    assert.match(markup, /floating-window-collection collection-modal/u);
    assert.match(markup, /floating-window-close/u);
    assert.match(markup, /floating-window-minimize/u);
    assert.match(source, /onToggleMinimized/u);
    assert.match(source, /minimized/u);
  });

  test("empty stack zones still expose a collection opener", () => {
    const markup = renderToStaticMarkup(
      createElement(Zone, {
        label: "Trash",
        cards: [],
        displayMode: "stack",
        onViewCollection: () => undefined,
      }),
    );

    assert.match(markup, /zone-stack-open-button/u);
    assert.match(markup, /aria-label="Open Trash"/u);
  });

  test("clicking the same trash collection toggles the viewer closed", async () => {
    const source = await readFile(
      join(sourceDirectory, "use-match-collection-modal.ts"),
      "utf8",
    );

    assert.match(
      source,
      /const nextOpen = renderedCollectionModal\?\.title !== title;/u,
    );
    assert.match(
      source,
      /setCollectionModal\(nextOpen \? \{ title, cards \} : undefined\);/u,
    );
    assert.match(source, /updateCollectionWindowOpen\(key, nextOpen\)/u);
  });

  test("client-side collection viewers remember their last window rectangle", async () => {
    const source = await readFile(
      join(sourceDirectory, "use-match-collection-modal.ts"),
      "utf8",
    );
    const hostSource = await readFile(
      join(sourceDirectory, "CollectionModalHost.tsx"),
      "utf8",
    );

    assert.match(source, /activeFloatingWindowRects/u);
    assert.doesNotMatch(source, /useState<\s*Record<string, WindowRect>\s*>/u);
    assert.match(source, /collectionViewerKey/u);
    assert.match(source, /collectionViewerWindowKey/u);
    assert.match(
      source,
      /activeFloatingWindowRects\[collectionViewerWindowKey\]/u,
    );
    assert.match(
      source,
      /updateFloatingWindowRect\(collectionViewerWindowKey, rect\)/u,
    );
    assert.match(source, /initialRect:/u);
    assert.match(source, /onRectChange:/u);
    assert.match(hostSource, /onRectChange/u);
    assert.match(hostSource, /initialRect/u);
  });

  test("client-side collection viewers remember whether they were open", async () => {
    const source = await readFile(
      join(sourceDirectory, "use-match-collection-modal.ts"),
      "utf8",
    );
    const windowStateHook = await readFile(
      join(sourceDirectory, "window-state-model.ts"),
      "utf8",
    );
    const storeSource = await readFile(
      join(sourceDirectory, "window-state-store.ts"),
      "utf8",
    );

    assert.match(source, /activeOpenWindowIds/u);
    assert.match(source, /collectionModalFromWindowKey/u);
    assert.match(source, /persistedCollectionModal/u);
    assert.match(source, /updateCollectionWindowOpen\(key, nextOpen\)/u);
    assert.match(windowStateHook, /id\.startsWith\("collection:"\)/u);
    assert.match(storeSource, /loadOpenWindowIds/u);
    assert.match(storeSource, /saveOpenWindowIds/u);
  });

  test("match app keeps opponent reveal out of the collection window", async () => {
    const source = await readFile(
      join(sourceDirectory, "MatchInteractionModals.tsx"),
      "utf8",
    );
    const revealViewerSource = await readFile(
      join(sourceDirectory, "reveal-viewer.ts"),
      "utf8",
    );
    const opponentRevealWindowsSource = await readFile(
      join(sourceDirectory, "opponent-reveal-windows.ts"),
      "utf8",
    );
    const revealWindowLayerSource = await readFile(
      join(sourceDirectory, "OpponentRevealWindowLayer.tsx"),
      "utf8",
    );

    const matchAppSource = await readFile(
      join(sourceDirectory, "MatchApp.tsx"),
      "utf8",
    );

    assert.match(matchAppSource, /opponentRevealWindowsFromState/u);
    assert.match(opponentRevealWindowsSource, /opponentRevealsFromEvents/u);
    assert.match(
      opponentRevealWindowsSource,
      /playerSnapshot\.view\.revealedCards/u,
    );
    assert.match(opponentRevealWindowsSource, /eventReveal\?\.title/u);
    assert.match(opponentRevealWindowsSource, /revealTitleFromRecord/u);
    assert.match(revealViewerSource, /\$\{ownerLabel\} revealed/u);
    assert.match(revealViewerSource, /Revealed/u);
    assert.match(matchAppSource, /updateRevealWindowState/u);
    assert.match(source, /OpponentRevealWindowLayer/u);
    assert.match(revealWindowLayerSource, /RevealWindowHost/u);
    assert.doesNotMatch(source, /opponentRevealModal/u);
    assert.match(matchAppSource, /activeRevealWindowState\.minimized/u);
  });

  test("collection modal can render selectable decision cards with confirm control", () => {
    const markup = renderToStaticMarkup(
      createElement(CollectionModalHost, {
        model: {
          title: "Player trash",
          cards: [
            card("selected", "Selected Trash"),
            card("available", "Available Trash"),
            card("disabled", "Disabled Trash"),
          ],
          selection: {
            selectedInstanceIds: ["selected"],
            selectableInstanceIds: ["selected", "available"],
            canConfirm: true,
            confirmLabel: "Confirm",
          },
        },
        disabled: false,
        onToggleCard: () => undefined,
        onConfirm: () => undefined,
      }),
    );

    assert.match(markup, /collection-modal/u);
    assert.match(markup, /is-selected/u);
    assert.match(markup, /is-pending-choice/u);
    assert.match(markup, /disabled=""/u);
    assert.equal(markup.includes("Confirm"), true);
  });

  test("collection modal can number ordered selections", () => {
    const markup = renderToStaticMarkup(
      createElement(CollectionModalHost, {
        model: {
          title: "Choose cards from trash",
          cards: [
            card("first", "Highest Card"),
            card("second", "Lowest Card"),
            card("available", "Available Trash"),
          ],
          selection: {
            selectedInstanceIds: ["second", "first"],
            selectableInstanceIds: ["first", "second", "available"],
            canConfirm: true,
            confirmLabel: "Pay cost",
            orderHint: "1 is highest, last is bottom-most.",
          },
        },
        disabled: false,
        onToggleCard: () => undefined,
        onConfirm: () => undefined,
      }),
    );

    assert.equal(markup.includes("1 is highest, last is bottom-most."), true);
    assert.match(markup, /selection-order-badge[^>]*>2</u);
    assert.match(markup, /selection-order-badge[^>]*>1</u);
  });

  test("collection modal grid scales with the floating window without clipping outlines", async () => {
    const styles = await readFile(collectionStylesPath, "utf8");

    assert.match(
      styles,
      /\.collection-modal-card-grid\s*\{[^}]*display:\s*grid;/u,
    );
    assert.match(
      styles,
      /\.collection-modal-card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(\s*auto-fill,\s*minmax\(var\(--collection-card-width\),\s*1fr\)\s*\);/u,
    );
    assert.match(
      styles,
      /\.collection-modal-card-grid\s*\{[^}]*overflow:\s*visible;/u,
    );
    assert.match(
      styles,
      /\.collection-modal-card-grid\s+\.card-tile-shell\s*\{[^}]*width:\s*min\(100%,\s*var\(--collection-card-width\)\);/u,
    );
    assert.match(
      styles,
      /\.collection-modal-card-grid\.is-single-card\s*\{[^}]*--collection-card-height:\s*min\(58vh,\s*calc\(var\(--card-height\) \* 2\)\);[^}]*grid-template-columns:\s*var\(--collection-card-width\);[^}]*justify-content:\s*center;/u,
    );
    assert.match(
      styles,
      /\.collection-modal-card-grid\.is-single-card\s+\.card-tile-shell\s*\{[^}]*width:\s*var\(--collection-card-width\);[^}]*height:\s*var\(--collection-card-height\);/u,
    );
  });
});
