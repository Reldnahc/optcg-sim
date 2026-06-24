import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import {
  ReplayPlaybackControls,
  ReplayViewerPageView,
} from "./ReplayViewerPage.js";
import type { ReplayDetail } from "../replay-client.js";

const replayDetail = (): ReplayDetail => ({
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
  actionCount: 2,
  players: [
    {
      seatId: "p1",
      userId: "user-1",
      displayName: "Winner",
      leaderCardNumber: "OP01-001",
      result: "win",
      isWinner: true,
    },
  ],
  replay: {
    replayFormatVersion: "dev-local-v1",
    deterministicEntries: [{ type: "submitAction", playerId: "p1" }],
    auditEntries: [{ type: "gameEnded", winner: "p1" }],
  },
});

describe("ReplayViewerPage", () => {
  test("renders replay metadata and saved entries", () => {
    const html = renderToStaticMarkup(
      createElement(ReplayViewerPageView, {
        status: "ready",
        replay: replayDetail(),
      }),
    );

    assert.match(html, /Replay match-1/u);
    assert.match(html, /Winner/u);
    assert.match(html, /OP01-001/u);
    assert.match(html, /submitAction/u);
    assert.match(html, /gameEnded/u);
  });

  test("renders replay controls for shared match surface playback", () => {
    const html = renderToStaticMarkup(
      createElement(ReplayViewerPageView, {
        status: "ready",
        replay: replayDetail(),
        frameCount: 0,
        frameReconstruction: {
          status: "failed",
          reason: "checkpoint hash mismatch",
          actionIndex: 17,
        },
      }),
    );

    assert.match(html, /Previous action/u);
    assert.match(html, /Next action/u);
    assert.match(html, /Board frames 0/u);
    assert.match(html, /Replay reconstruction failed/u);
    assert.match(html, /checkpoint hash mismatch/u);
    assert.match(html, /data-replay-match-surface/u);
  });

  test("renders labeled controls for frame-backed board playback", () => {
    const html = renderToStaticMarkup(
      createElement(ReplayPlaybackControls, {
        frameLabel: "playCard",
        selectedFrameIndex: 0,
        frameCount: 3,
        playing: false,
        speedMs: 700,
        onPrevious: () => undefined,
        onNext: () => undefined,
        onTogglePlay: () => undefined,
        onSelectFrame: () => undefined,
        onSelectSpeedMs: () => undefined,
      }),
    );

    assert.match(html, /aria-label="Previous replay frame"/u);
    assert.match(html, /aria-label="Next replay frame"/u);
    assert.match(html, /aria-label="Play replay"/u);
    assert.match(html, /type="range"/u);
    assert.match(html, /Frame 1 \/ 3/u);
    assert.match(html, /playCard/u);
  });

  test("disables playback edges for the first and final frame", () => {
    const firstFrameHtml = renderToStaticMarkup(
      createElement(ReplayPlaybackControls, {
        frameLabel: "start",
        selectedFrameIndex: 0,
        frameCount: 2,
        playing: false,
        speedMs: 700,
        onPrevious: () => undefined,
        onNext: () => undefined,
        onTogglePlay: () => undefined,
        onSelectFrame: () => undefined,
        onSelectSpeedMs: () => undefined,
      }),
    );
    const finalFrameHtml = renderToStaticMarkup(
      createElement(ReplayPlaybackControls, {
        frameLabel: "end",
        selectedFrameIndex: 1,
        frameCount: 2,
        playing: false,
        speedMs: 700,
        onPrevious: () => undefined,
        onNext: () => undefined,
        onTogglePlay: () => undefined,
        onSelectFrame: () => undefined,
        onSelectSpeedMs: () => undefined,
      }),
    );

    assert.match(
      firstFrameHtml,
      /<button type="button" aria-label="Previous replay frame" disabled="">Previous/u,
    );
    assert.match(
      finalFrameHtml,
      /<button type="button" aria-label="Next replay frame" disabled="">Next/u,
    );
  });
});
