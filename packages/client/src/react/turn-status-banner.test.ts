import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import type { CardId, InstanceId, PlayerId } from "@optcg/types";

import {
  BoardLayout,
  shouldShowTurnStatusBanner,
  statusBannerAnimationKey,
} from "./BoardLayout.js";
import type { BoardViewModel, ClientCardModel } from "../view-model.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

const card = (instanceId: string, name = instanceId): ClientCardModel => ({
  instanceId: instanceId as InstanceId,
  cardId: `${instanceId}-card` as CardId,
  name,
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
  selfLabel: "Player",
  opponentLabel: "Opponent",
  statusBanner: {
    label: "Counter Step",
    tone: "counter",
    turnNumber: 1,
  },
  selfIsTurnPlayer: true,
  opponentIsTurnPlayer: false,
  self: {
    leader: card("self-leader", "Self Leader"),
    hand: [],
    characters: [],
    costArea: [],
    trash: [],
    deckCount: 40,
    donDeckCount: 10,
    lifeCount: 5,
    lifeCards: hiddenLifeCards(5, "hidden-life-self"),
  },
  opponent: {
    leader: card("opponent-leader", "Opponent Leader"),
    handCount: 5,
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

describe("turn status banner", () => {
  test("uses a distinct animation key for each banner state", () => {
    assert.notEqual(
      statusBannerAnimationKey({
        label: "Your Turn",
        tone: "self",
        turnNumber: 1,
      }),
      statusBannerAnimationKey({
        label: "Opponent's Turn",
        tone: "opponent",
        turnNumber: 1,
      }),
    );
    assert.notEqual(
      statusBannerAnimationKey({
        label: "Blocker Step",
        tone: "block",
        turnNumber: 1,
      }),
      statusBannerAnimationKey({
        label: "Counter Step",
        tone: "counter",
        turnNumber: 1,
      }),
    );
    assert.notEqual(
      statusBannerAnimationKey({
        label: "Your Turn",
        tone: "self",
        turnNumber: 1,
      }),
      statusBannerAnimationKey({
        label: "Your Turn",
        tone: "self",
        turnNumber: 2,
      }),
    );
  });

  test("suppresses turn banners until the turn number increments", () => {
    assert.equal(
      shouldShowTurnStatusBanner(
        { label: "Your Turn", tone: "self", turnNumber: 3 },
        3,
      ),
      false,
    );
    assert.equal(
      shouldShowTurnStatusBanner(
        { label: "Your Turn", tone: "self", turnNumber: 4 },
        3,
      ),
      true,
    );
  });

  test("keeps battle step banners visible regardless of the last shown turn number", () => {
    assert.equal(
      shouldShowTurnStatusBanner(
        { label: "Counter Step", tone: "counter", turnNumber: 3 },
        3,
      ),
      true,
    );
    assert.equal(
      shouldShowTurnStatusBanner(
        { label: "Blocker Step", tone: "block", turnNumber: 3 },
        3,
      ),
      true,
    );
  });

  test("renders across the playmat with the projected banner tone", () => {
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

    assert.match(markup, /class="[^"]*turn-status-banner-lane/u);
    assert.match(markup, /class="[^"]*turn-status-banner[^"]*is-counter/u);
    assert.match(markup, /data-turn-status="counter"/u);
    assert.equal(markup.includes("Counter Step"), true);
  });

  test("enters quickly, pauses centered, then exits quickly", async () => {
    const css = await readFile(
      join(sourceDirectory, "styles", "playmat.css"),
      "utf8",
    );

    assert.match(
      css,
      /animation:\s*turn-status-slide-across 1500ms ease-in-out\s+both;/u,
    );
    assert.match(
      css,
      /18%\s*\{\s*opacity:\s*1;\s*transform:\s*translateX\(0\);\s*\}/u,
    );
    assert.match(
      css,
      /82%\s*\{\s*opacity:\s*1;\s*transform:\s*translateX\(0\);\s*\}/u,
    );
  });
});
