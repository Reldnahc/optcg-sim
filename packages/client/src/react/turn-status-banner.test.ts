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
  nextTurnStatusBannerRenderState,
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

  test("keeps a turn banner event active after same-turn snapshots", () => {
    const firstState = nextTurnStatusBannerRenderState(
      { eventId: 0 },
      { label: "Your Turn", tone: "self", turnNumber: 3 },
    );
    const repeatState = nextTurnStatusBannerRenderState(firstState, {
      label: "Your Turn",
      tone: "self",
      turnNumber: 3,
    });
    const nextTurnState = nextTurnStatusBannerRenderState(repeatState, {
      label: "Opponent's Turn",
      tone: "opponent",
      turnNumber: 4,
    });

    assert.deepEqual(firstState.activeBanner, {
      label: "Your Turn",
      tone: "self",
      turnNumber: 3,
    });
    assert.equal(repeatState.activeBanner, firstState.activeBanner);
    assert.equal(repeatState.eventId, firstState.eventId);
    assert.deepEqual(nextTurnState.activeBanner, {
      label: "Opponent's Turn",
      tone: "opponent",
      turnNumber: 4,
    });
    assert.equal(nextTurnState.eventId, firstState.eventId + 1);
  });

  test("does not replace a battle step event with a same-turn owner banner", () => {
    const turnState = nextTurnStatusBannerRenderState(
      { eventId: 0 },
      { label: "Your Turn", tone: "self", turnNumber: 3 },
    );
    const counterState = nextTurnStatusBannerRenderState(turnState, {
      label: "Counter Step",
      tone: "counter",
      turnNumber: 3,
    });
    const repeatTurnState = nextTurnStatusBannerRenderState(counterState, {
      label: "Your Turn",
      tone: "self",
      turnNumber: 3,
    });

    assert.deepEqual(repeatTurnState.activeBanner, {
      label: "Counter Step",
      tone: "counter",
      turnNumber: 3,
    });
    assert.equal(repeatTurnState.eventId, counterState.eventId);
  });

  test("creates battle step events regardless of the last shown turn number", () => {
    const turnState = nextTurnStatusBannerRenderState(
      { eventId: 0 },
      { label: "Opponent's Turn", tone: "opponent", turnNumber: 3 },
    );
    const counterState = nextTurnStatusBannerRenderState(turnState, {
      label: "Counter Step",
      tone: "counter",
      turnNumber: 3,
    });
    const blockerState = nextTurnStatusBannerRenderState(counterState, {
      label: "Blocker Step",
      tone: "block",
      turnNumber: 3,
    });

    assert.deepEqual(counterState.activeBanner, {
      label: "Counter Step",
      tone: "counter",
      turnNumber: 3,
    });
    assert.deepEqual(blockerState.activeBanner, {
      label: "Blocker Step",
      tone: "block",
      turnNumber: 3,
    });
    assert.equal(counterState.eventId, turnState.eventId + 1);
    assert.equal(blockerState.eventId, counterState.eventId + 1);
  });

  test("keeps identical battle step snapshots from restarting the event", () => {
    const counterState = nextTurnStatusBannerRenderState(
      { eventId: 0 },
      { label: "Counter Step", tone: "counter", turnNumber: 3 },
    );
    const repeatCounterState = nextTurnStatusBannerRenderState(counterState, {
      label: "Counter Step",
      tone: "counter",
      turnNumber: 3,
    });

    assert.equal(repeatCounterState.activeBanner, counterState.activeBanner);
    assert.equal(repeatCounterState.eventId, counterState.eventId);
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
