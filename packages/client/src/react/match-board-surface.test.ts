import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import type { PlayerId } from "@optcg/types";

import type { LobbyClientState } from "../controller.js";
import { MatchBoardSurface } from "./MatchBoardSurface.js";

const lobbyState = (): LobbyClientState => ({
  lobbyId: "lobby-1",
  seat: {
    lobbyId: "lobby-1",
    playerId: "p1" as PlayerId,
    sessionToken: "session-1",
  },
  lobby: {
    lobbyId: "lobby-1",
    seats: {
      p1: {
        playerId: "p1" as PlayerId,
        claimed: true,
        deck: { status: "missing" },
      },
    },
  },
});

const renderSurface = (
  clientState: Parameters<typeof MatchBoardSurface>[0]["clientState"],
): string =>
  renderToStaticMarkup(
    createElement(MatchBoardSurface, {
      board: undefined,
      clientState,
      cardActions: () => [],
      onCardClick: () => undefined,
      onCardAction: () => undefined,
      onViewCollection: () => undefined,
      onBackgroundClick: () => undefined,
    }),
  );

test("lobby state renders a visible empty playmat through the shared board frame", () => {
  const markup = renderSurface(lobbyState());

  assert.match(markup, /class="board-shell"/u);
  assert.match(markup, /class="hand-rail"/u);
  assert.match(markup, /class="tabletop-board"/u);
  assert.match(markup, /class="playmat-side opponent-side"/u);
  assert.match(markup, /class="playmat-side player-side"/u);
  assert.match(markup, /class="zone zone-normal zone-slots"/u);
  assert.doesNotMatch(markup, /is-pregame-placeholder/u);
  assert.doesNotMatch(markup, /loading-panel/u);
});

test("loading state renders inside the shared board frame", () => {
  const markup = renderSurface(undefined);

  assert.match(markup, /class="board-shell"/u);
  assert.match(markup, /class="hand-rail"/u);
  assert.match(markup, /class="tabletop-board"/u);
  assert.match(markup, /class="playmat-zone center-spacer empty-playmat-center"/u);
  assert.match(markup, /class="playmat-side opponent-side"/u);
  assert.match(markup, /class="playmat-side player-side"/u);
  assert.match(markup, /class="loading-panel"/u);
});
