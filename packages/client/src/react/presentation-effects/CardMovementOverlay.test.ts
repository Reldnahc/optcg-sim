import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import type { CardId, InstanceId } from "@optcg/types";

import type { ClientCardModel } from "../../view-model.js";
import { CardMovementOverlay } from "./CardMovementOverlay.js";
import type { CardMovementIntent } from "./movement-planner.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

const card = (overrides: Partial<ClientCardModel> = {}): ClientCardModel => ({
  instanceId: "card-1" as InstanceId,
  cardId: "OP00-001" as CardId,
  name: "Moving Card",
  category: "Character",
  imageUrl: "https://example.test/card.png",
  attachedDonCount: 0,
  attachedDonCards: [],
  ...overrides,
});

const rect = (
  x: number,
  y: number,
  width = 50,
  height = 70,
): DOMRectReadOnly => ({
  x,
  y,
  width,
  height,
  top: y,
  right: x + width,
  bottom: y + height,
  left: x,
  toJSON: () => ({}),
});

const movement = (
  overrides: Partial<CardMovementIntent> = {},
): CardMovementIntent => ({
  id: "move-1",
  instanceId: "card-1",
  card: card(),
  fromRect: rect(10, 20),
  toRect: rect(200, 240),
  fromZoneKey: "self:deck",
  toZoneKey: "self:hand",
  ...overrides,
});

describe("CardMovementOverlay", () => {
  test("renders a noninteractive flying card with movement CSS variables", () => {
    const markup = renderToStaticMarkup(
      createElement(CardMovementOverlay, { movements: [movement()] }),
    );

    assert.match(markup, /card-movement-overlay/u);
    assert.match(markup, /card-movement-flyer/u);
    assert.match(markup, /--card-move-from-x:10px/u);
    assert.match(markup, /--card-move-from-y:20px/u);
    assert.match(markup, /--card-move-to-x:200px/u);
    assert.match(markup, /--card-move-to-y:240px/u);
    assert.match(markup, /https:\/\/example\.test\/card\.png/u);
  });

  test("uses a hidden card face for hidden movement cards", () => {
    const markup = renderToStaticMarkup(
      createElement(CardMovementOverlay, {
        movements: [movement({ card: card({ category: "hidden" }) })],
      }),
    );

    assert.match(markup, /card-movement-face is-hidden/u);
    assert.doesNotMatch(markup, /https:\/\/example\.test\/card\.png/u);
  });

  test("stylesheet keeps movement overlay above board and below modals", async () => {
    const styles = await readFile(
      join(sourceDirectory, "..", "styles", "presentation-effects.css"),
      "utf8",
    );

    assert.match(
      styles,
      /\.card-movement-overlay\s*\{[^}]*pointer-events:\s*none;/u,
    );
    assert.match(
      styles,
      /\.card-movement-flyer\s*\{[^}]*animation:\s*card-move-fly 140ms/u,
    );
    assert.match(styles, /@keyframes card-move-fly/u);
    assert.match(styles, /prefers-reduced-motion:\s*reduce/u);
  });

  test("flying card faces use the board-card rounded mask", async () => {
    const styles = await readFile(
      join(sourceDirectory, "..", "styles", "presentation-effects.css"),
      "utf8",
    );

    assert.match(
      styles,
      /\.card-movement-face\s*\{[^}]*border-radius:\s*6px;/u,
    );
  });
});
