import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import type { CardId, InstanceId, PlayerId } from "@optcg/types";

import type { BoardViewModel, ClientCardModel } from "../../view-model.js";
import { BoardLayout } from "../BoardLayout.js";

const p1 = "p1" as PlayerId;

const card = (instanceId: string, category = "Character"): ClientCardModel => ({
  instanceId: instanceId as InstanceId,
  cardId: "OP00-001" as CardId,
  name: instanceId,
  category,
  attachedDonCount: 0,
  attachedDonCards: [],
});

const board = (): BoardViewModel => ({
  playerId: p1,
  selfLabel: "Player",
  opponentLabel: "Opponent",
  selfIsTurnPlayer: true,
  opponentIsTurnPlayer: false,
  self: {
    leader: card("self-leader", "Leader"),
    hand: [card("self-hand")],
    characters: [card("self-character")],
    costArea: [],
    trash: [],
    deckCount: 1,
    donDeckCount: 1,
    lifeCount: 0,
    lifeCards: [],
  },
  opponent: {
    leader: card("opponent-leader", "Leader"),
    characters: [],
    costArea: [],
    trash: [],
    deckCount: 1,
    donDeckCount: 1,
    lifeCount: 0,
    lifeCards: [],
    handCount: 1,
  },
  actionsByCardInstanceId: {},
});

describe("board presentation anchors", () => {
  test("renders stable zone anchors for presentation effects", () => {
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

    assert.match(markup, /data-presentation-zone="self:hand"/u);
    assert.match(markup, /data-presentation-zone="self:deck"/u);
    assert.match(markup, /data-presentation-zone="self:trash"/u);
    assert.match(markup, /data-presentation-zone="self:characterArea"/u);
    assert.match(markup, /data-presentation-zone="opponent:hand"/u);
    assert.match(markup, /data-presentation-zone="opponent:deck"/u);
  });
});
