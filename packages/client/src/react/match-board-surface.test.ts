import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import type { PlayerId } from "@optcg/types";

import type { LobbyClientState } from "../controller.js";
import { MatchBoardSurface } from "./MatchBoardSurface.js";

const sourceDirectory = join(
  process.cwd(),
  "packages",
  "client",
  "src",
  "react",
);

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

test("lobby state renders through the shared board frame without a fake playmat", () => {
  const markup = renderSurface(lobbyState());

  assert.match(markup, /class="board-shell"/u);
  assert.match(markup, /class="hand-rail"/u);
  assert.match(markup, /class="tabletop-board is-empty-tabletop"/u);
  assert.doesNotMatch(markup, /is-pregame-placeholder/u);
  assert.doesNotMatch(markup, /loading-panel/u);
});

test("loading state renders inside the shared board frame", () => {
  const markup = renderSurface(undefined);

  assert.match(markup, /class="board-shell"/u);
  assert.match(markup, /class="hand-rail"/u);
  assert.match(markup, /class="tabletop-board"/u);
  assert.doesNotMatch(markup, /is-empty-tabletop/u);
  assert.match(markup, /class="loading-panel"/u);
});

test("empty lobby tabletop removes the painted playmat surface", async () => {
  const playmatStyles = await readFile(
    join(sourceDirectory, "styles", "playmat.css"),
    "utf8",
  );

  assert.match(
    playmatStyles,
    /\.tabletop-board\.is-empty-tabletop\s*\{[^}]*border-color:\s*transparent;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/u,
  );
});
