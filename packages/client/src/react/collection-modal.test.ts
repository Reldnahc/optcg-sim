import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import type { CardId, InstanceId } from "@optcg/types";

import { CollectionModalHost } from "./CollectionModalHost.js";
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
  });

  test("collection viewer has close controls without minimize controls", async () => {
    const markup = renderToStaticMarkup(
      createElement(CollectionModalHost, {
        model: {
          title: "Player trash",
          cards: [card("one", "One")],
        },
        onClose: () => undefined,
      }),
    );
    const source = await readFile(
      join(sourceDirectory, "CollectionModalHost.tsx"),
      "utf8",
    );

    assert.match(markup, /floating-window-collection collection-modal/u);
    assert.match(markup, /floating-window-close/u);
    assert.equal(markup.includes("floating-window-minimize"), false);
    assert.equal(source.includes("onToggleMinimized"), false);
    assert.equal(source.includes("minimized"), false);
  });

  test("clicking the same trash collection toggles the viewer closed", async () => {
    const source = await readFile(
      join(sourceDirectory, "MatchApp.tsx"),
      "utf8",
    );

    assert.match(source, /setCollectionModal\(\(current\)\s*=>/u);
    assert.match(
      source,
      /current\?\.title\s*===\s*title\s*\?\s*undefined\s*:\s*\{\s*title,\s*cards\s*\}/u,
    );
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

  test("collection modal body scrolls for large collections", async () => {
    const styles = await readFile(collectionStylesPath, "utf8");

    assert.match(
      styles,
      /\.collection-modal-card-grid\s*\{[^}]*overflow:\s*auto;/u,
    );
    assert.match(styles, /\.collection-modal-card-grid\s*\{[^}]*max-height:/u);
  });
});
