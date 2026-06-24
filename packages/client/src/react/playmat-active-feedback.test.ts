import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import type { CardId, InstanceId, PlayerId } from "@optcg/types";

import type { BoardViewModel, ClientCardModel } from "../view-model.js";
import { BoardLayout } from "./BoardLayout.js";

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
  selfIsTurnPlayer: true,
  opponentIsTurnPlayer: false,
  self: {
    leader: card("self-leader", "Self Leader"),
    hand: [card("hand-1", "Playable Card")],
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

const renderBoard = (layout: BoardViewModel): string =>
  renderToStaticMarkup(
    createElement(BoardLayout, {
      board: layout,
      cardActions: () => [],
      onCardClick: () => undefined,
      onCardAction: () => undefined,
      onViewCollection: () => undefined,
      onBackgroundClick: () => undefined,
    }),
  );

describe("playmat active feedback", () => {
  test("renders active-turn feedback on the active player field", () => {
    const layout = board();
    layout.selfIsTurnPlayer = true;
    layout.opponentIsTurnPlayer = false;

    const markup = renderBoard(layout);

    assert.equal(markup.includes('class="tabletop-board"'), true);
    assert.match(
      markup,
      /class="playmat-field player-field is-active-player-side"/u,
    );
    assert.doesNotMatch(
      markup,
      /class="playmat-field opponent-field is-active-player-side"/u,
    );
    assert.equal(
      markup.includes("summary-panel player-summary is-turn-player"),
      false,
    );
  });

  test("renders active-turn feedback on the opponent field", () => {
    const layout = board();
    layout.selfIsTurnPlayer = false;
    layout.opponentIsTurnPlayer = true;

    const markup = renderBoard(layout);

    assert.match(
      markup,
      /class="playmat-field opponent-field is-active-player-side"/u,
    );
    assert.doesNotMatch(
      markup,
      /class="playmat-field player-field is-active-player-side"/u,
    );
  });

  test("active player field uses outline feedback without a dot indicator", async () => {
    const playmatCss = await readFile(
      join(sourceDirectory, "styles", "playmat.css"),
      "utf8",
    );

    assert.equal(
      playmatCss.includes(".tabletop-board.is-turn-player::after"),
      false,
    );
    assert.equal(playmatCss.includes(".tabletop-board.is-turn-player"), false);
    assert.equal(
      playmatCss.includes("border-color: var(--match-accent-strong)"),
      true,
    );
    assert.match(
      playmatCss,
      /\.playmat-field\.is-active-player-side\s*\{[^}]*rgba\(255,\s*227,\s*138,\s*0\.34\)[^}]*rgba\(255,\s*227,\s*138,\s*0\.38\);/u,
    );
  });
});
