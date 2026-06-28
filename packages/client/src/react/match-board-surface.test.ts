import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import type { MatchId, PlayerId } from "@optcg/types";

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
        displayName: "Alice",
        avatar: {
          imageUrl: "https://cdn.example/alice.png",
          crop: { x: 0.1, y: 0.2, size: 0.6 },
        },
        title: {
          key: "champion",
          label: "Champion",
          style: { text_color: "#f8fafc", font_weight: 700 },
        },
        deck: { status: "missing" },
      },
      p2: {
        playerId: "p2" as PlayerId,
        claimed: true,
        displayName: "Bob",
        deck: { status: "ready" },
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

test("lobby state renders joined player identity in empty playmat summaries", () => {
  const markup = renderSurface(lobbyState());

  assert.match(markup, /Alice/u);
  assert.match(markup, /Bob/u);
  assert.match(markup, /Champion/u);
  assert.match(markup, /https:\/\/cdn\.example\/alice\.png/u);
  assert.match(markup, /Alice connected/u);
  assert.match(markup, /Bob connected/u);
});

test("first-player setup state renders player identity in empty playmat summaries", () => {
  const markup = renderSurface({
    matchId: "match-1" as MatchId,
    seat: {
      matchId: "match-1" as MatchId,
      playerId: "p1" as PlayerId,
    },
    firstPlayerChoice: {
      chooserPlayerId: "p1" as PlayerId,
      choices: ["goFirst", "goSecond"],
    },
    playerLabels: {
      ["p1" as PlayerId]: {
        displayName: "Alice",
        avatar: {
          imageUrl: "https://cdn.example/alice.png",
          crop: { x: 0.1, y: 0.2, size: 0.6 },
        },
      },
      ["p2" as PlayerId]: {
        displayName: "Bob",
      },
    },
  });

  assert.match(markup, /Alice/u);
  assert.match(markup, /Bob/u);
  assert.match(markup, /https:\/\/cdn\.example\/alice\.png/u);
});

test("loading state renders the same empty playmat without status text", () => {
  const markup = renderSurface(undefined);

  assert.match(markup, /class="board-shell"/u);
  assert.match(markup, /class="hand-rail"/u);
  assert.match(markup, /class="tabletop-board"/u);
  assert.match(markup, /class="playmat-zone center-spacer"/u);
  assert.match(markup, /class="playmat-side opponent-side"/u);
  assert.match(markup, /class="playmat-side player-side"/u);
  assert.doesNotMatch(markup, /loading-panel/u);
  assert.doesNotMatch(markup, /Loading match/u);
  assert.doesNotMatch(markup, /Waiting for first-player setup/u);
});
