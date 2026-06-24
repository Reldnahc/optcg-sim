import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import { ReplaySelectorPageView } from "./ReplaySelectorPage.js";
import type { ReplaySummary } from "../replay-client.js";

const replaySummary = (): ReplaySummary => ({
  matchId: "match-1",
  status: "completed",
  gameType: "dev",
  formatId: "dev",
  lobbyId: "lobby-1",
  winnerUserId: null,
  winnerSeatId: "p1",
  startedAt: "2026-06-13T00:00:00.000Z",
  endedAt: "2026-06-13T00:10:00.000Z",
  turnCount: 4,
  actionCount: 12,
  players: [
    {
      seatId: "p1",
      userId: "user-1",
      displayName: "Winner",
      leaderCardNumber: "OP01-001",
      result: "win",
      isWinner: true,
    },
    {
      seatId: "p2",
      userId: "user-2",
      displayName: "Loser",
      leaderCardNumber: "OP02-001",
      result: "loss",
      isWinner: false,
    },
  ],
});

describe("ReplaySelectorPage", () => {
  test("renders loading state", () => {
    const html = renderToStaticMarkup(
      createElement(ReplaySelectorPageView, {
        status: "loading",
        replays: [],
      }),
    );

    assert.match(html, /Replay Library/u);
    assert.match(html, /Loading replays/u);
  });

  test("renders error state", () => {
    const html = renderToStaticMarkup(
      createElement(ReplaySelectorPageView, {
        status: "error",
        replays: [],
        error: "Replay request failed",
      }),
    );

    assert.match(html, /Replay Library/u);
    assert.match(html, /Replay request failed/u);
  });

  test("renders empty state", () => {
    const html = renderToStaticMarkup(
      createElement(ReplaySelectorPageView, {
        status: "ready",
        replays: [],
      }),
    );

    assert.match(html, /Replay Library/u);
    assert.match(html, /No replays are available/u);
  });

  test("renders replay summaries with links to the viewer", () => {
    const html = renderToStaticMarkup(
      createElement(ReplaySelectorPageView, {
        status: "ready",
        replays: [replaySummary()],
      }),
    );

    assert.match(html, /Replay Library/u);
    assert.match(html, /match-1/u);
    assert.match(html, /Winner/u);
    assert.match(html, /Loser/u);
    assert.match(html, /completed/u);
    assert.match(html, /dev/u);
    assert.match(html, /Turns/u);
    assert.match(html, /Actions/u);
    assert.match(html, /href="\/replays\/match-1"/u);
  });
});
