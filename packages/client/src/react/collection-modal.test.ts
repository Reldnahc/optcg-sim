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

const card = (instanceId: string, name: string): ClientCardModel => ({
  instanceId: instanceId as InstanceId,
  cardId: `${instanceId}-card` as CardId,
  name,
  category: "Character",
  attachedDonCount: 0,
});

describe("collection modal", () => {
  test("trash stack displays only the newest card", () => {
    const markup = renderToStaticMarkup(
      createElement(Zone, {
        label: "Trash",
        cards: [card("old", "Old Trash"), card("new", "Newest Trash")],
        displayMode: "stack",
        onViewCollection: () => undefined,
      }),
    );

    assert.equal(markup.includes("Newest Trash"), true);
    assert.equal(markup.includes("Old Trash"), false);
    assert.match(markup, /zone-stack/u);
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

  test("overlap zones cannot expand the playmat before measurement runs", async () => {
    const styles = await readFile(zoneStylesPath, "utf8");

    assert.match(styles, /\.zone-overlap\s*\{[^}]*overflow:\s*hidden;/u);
    assert.match(styles, /\.zone-overlap\s*\{[^}]*contain:\s*inline-size;/u);
    assert.match(styles, /\.zone-cards-overlap\s*\{[^}]*overflow:\s*hidden;/u);
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

  test("collection modal body scrolls for large collections", async () => {
    const styles = await readFile(collectionStylesPath, "utf8");

    assert.match(
      styles,
      /\.collection-modal-card-grid\s*\{[^}]*overflow:\s*auto;/u,
    );
    assert.match(styles, /\.collection-modal-card-grid\s*\{[^}]*max-height:/u);
  });
});
