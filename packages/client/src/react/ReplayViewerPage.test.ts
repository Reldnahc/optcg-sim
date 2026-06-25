import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import {
  ReplayPlaybackControls,
  ReplayViewerPageView,
} from "./ReplayViewerPage.js";
import type { ReplayDetail } from "../replay-client.js";

const replayViewerPageSource = (): string =>
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "ReplayViewerPage.tsx"),
    "utf8",
  );

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
  test("does not key the frame chunk request effect by its loading marker", () => {
    const source = replayViewerPageSource();
    const frameLoadingEffect =
      /useEffect\(\(\) => \{[\s\S]*?getReplayFrames[\s\S]*?\}, \[(?<dependencies>[^\]]*)\]\);/u.exec(
        source,
      );

    assert.ok(frameLoadingEffect?.groups !== undefined);
    assert.doesNotMatch(
      frameLoadingEffect.groups["dependencies"] ?? "",
      /loadingFrameWindow/u,
    );
  });

  test("loads one replay frame per request so the first board frame can render quickly", () => {
    const source = replayViewerPageSource();

    assert.match(source, /const replayFrameChunkLimit = 1;/u);
  });

  test("does not advance playback while the selected frame is still loading", () => {
    const source = replayViewerPageSource();
    const playbackTimerEffect =
      /useEffect\(\(\) => \{[\s\S]*?window\.setTimeout[\s\S]*?\}, \[(?<dependencies>[^\]]*)\]\);/u.exec(
        source,
      );

    assert.ok(playbackTimerEffect?.groups !== undefined);
    assert.match(playbackTimerEffect[0], /selectedFrame === undefined/u);
    assert.match(playbackTimerEffect[0], /framesRequestLoading/u);
    assert.match(
      playbackTimerEffect.groups["dependencies"] ?? "",
      /selectedFrame/u,
    );
    assert.match(
      playbackTimerEffect.groups["dependencies"] ?? "",
      /framesRequestLoading/u,
    );
  });

  test("does not derive frame loading from an absent selected frame", () => {
    const source = replayViewerPageSource();

    assert.match(source, /framesRequestLoading/u);
    assert.doesNotMatch(
      source,
      /selectedFrame\s*===\s*undefined\s*&&\s*frameError\s*===\s*undefined/u,
    );
  });

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

  test("renders reconstruction failure even when a stale frame count is present", () => {
    const html = renderToStaticMarkup(
      createElement(ReplayViewerPageView, {
        status: "ready",
        replay: replayDetail(),
        frameCount: 12,
        frameReconstruction: {
          status: "failed",
          reason: "State hash after deterministic entry does not match.",
          actionIndex: 2,
        },
      }),
    );

    assert.match(html, /Replay reconstruction failed/u);
    assert.match(html, /State hash after deterministic entry does not match/u);
    assert.doesNotMatch(html, /Loading board frames/u);
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
