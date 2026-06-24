import { useEffect, useMemo, useState } from "react";

import {
  createReplayClient,
  type ReplayDetail,
  type ReplayFrameReconstructionPayload,
  type ReplayPayload,
} from "../replay-client.js";
import { appRoutePath } from "./app-route.js";
import { MatchApp } from "./MatchApp.js";
import {
  createReplayMatchClient,
  replayFramesFromDetail,
} from "./replay-match-client.js";

type ReplayViewerStatus = "loading" | "ready" | "error";

export interface ReplayViewerPageViewProps {
  readonly status: ReplayViewerStatus;
  readonly replay?: ReplayDetail | undefined;
  readonly error?: string | undefined;
  readonly frameCount?: number | undefined;
  readonly frameReconstruction?:
    | ReplayFrameReconstructionPayload
    | undefined;
}

const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const entryType = (entry: unknown): string => {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return "entry";
  }
  const type = (entry as Record<string, unknown>)["type"];
  return typeof type === "string" && type.length > 0 ? type : "entry";
};

const replayEntries = (
  replay: ReplayPayload,
): Array<{ readonly group: string; readonly entry: unknown }> => [
  ...(replay.deterministicEntries ?? []).map((entry) => ({
    group: "Input",
    entry,
  })),
  ...(replay.auditEntries ?? []).map((entry) => ({
    group: "Audit",
    entry,
  })),
];

export const ReplayViewerPageView = ({
  status,
  replay,
  error,
  frameCount,
  frameReconstruction,
}: ReplayViewerPageViewProps): React.JSX.Element => {
  const entries = replay === undefined ? [] : replayEntries(replay.replay);
  const boardFrameCount = frameCount ?? 0;
  const reconstructionFailure =
    frameReconstruction?.status === "failed"
      ? frameReconstruction.reason
      : "Replay reconstruction did not produce any frames.";
  return (
    <section className="replay-viewer-page">
      <header className="replay-viewer-header">
        <div>
          <p className="replay-viewer-kicker">Replay Viewer</p>
          <h1>
            {replay === undefined ? "Replay" : `Replay ${replay.matchId}`}
          </h1>
        </div>
        <a className="replay-viewer-home" href={appRoutePath("dashboard")}>
          Home
        </a>
      </header>

      {status === "loading" ? (
        <div className="replay-viewer-panel">Loading replay...</div>
      ) : null}
      {status === "error" ? (
        <div className="replay-viewer-panel is-error">
          {error ?? "Unable to load replay."}
        </div>
      ) : null}
      {status === "ready" && replay !== undefined ? (
        <div className="replay-viewer-grid">
          <section
            className="replay-viewer-panel replay-controls-panel"
            data-replay-match-surface=""
          >
            <button type="button" disabled>
              Previous action
            </button>
            <span>{`Board frames ${String(boardFrameCount)}`}</span>
            <button type="button" disabled>
              Next action
            </button>
            {boardFrameCount === 0 ? (
              <p>{`Replay reconstruction failed: ${reconstructionFailure}`}</p>
            ) : null}
          </section>
          <section className="replay-viewer-panel">
            <h2>Match</h2>
            <dl className="replay-viewer-facts">
              <div>
                <dt>Status</dt>
                <dd>{replay.status}</dd>
              </div>
              <div>
                <dt>Format</dt>
                <dd>{replay.formatId}</dd>
              </div>
              <div>
                <dt>Turns</dt>
                <dd>{replay.turnCount ?? "-"}</dd>
              </div>
              <div>
                <dt>Actions</dt>
                <dd>{replay.actionCount}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{formatDate(replay.startedAt)}</dd>
              </div>
              <div>
                <dt>Ended</dt>
                <dd>{formatDate(replay.endedAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="replay-viewer-panel">
            <h2>Players</h2>
            <div className="replay-player-list">
              {replay.players.map((player) => (
                <div className="replay-player-row" key={player.seatId}>
                  <div>
                    <strong>{player.displayName ?? player.seatId}</strong>
                    <span>{player.leaderCardNumber}</span>
                  </div>
                  <span>{player.result}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="replay-viewer-panel replay-entry-panel">
            <h2>Entries</h2>
            {entries.length === 0 ? (
              <p>No replay entries were saved.</p>
            ) : (
              <ol className="replay-entry-list">
                {entries.map((item, index) => (
                  <li key={`${item.group}-${String(index)}`}>
                    <div className="replay-entry-heading">
                      <span>{item.group}</span>
                      <strong>{entryType(item.entry)}</strong>
                    </div>
                    <pre>{JSON.stringify(item.entry, null, 2)}</pre>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
};

export interface ReplayPlaybackControlsProps {
  readonly frameLabel: string;
  readonly selectedFrameIndex: number;
  readonly frameCount: number;
  readonly playing: boolean;
  readonly speedMs: number;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onTogglePlay: () => void;
  readonly onSelectFrame: (index: number) => void;
  readonly onSelectSpeedMs: (speedMs: number) => void;
}

export const ReplayPlaybackControls = ({
  frameLabel,
  selectedFrameIndex,
  frameCount,
  playing,
  speedMs,
  onPrevious,
  onNext,
  onTogglePlay,
  onSelectFrame,
  onSelectSpeedMs,
}: ReplayPlaybackControlsProps): React.JSX.Element => (
  <div className="replay-transport" aria-label="Replay transport">
    <button
      type="button"
      aria-label="Previous replay frame"
      disabled={selectedFrameIndex <= 0}
      onClick={onPrevious}
    >
      Previous
    </button>
    <button
      type="button"
      aria-label={playing ? "Pause replay" : "Play replay"}
      onClick={onTogglePlay}
    >
      {playing ? "Pause" : "Play"}
    </button>
    <button
      type="button"
      aria-label="Next replay frame"
      disabled={selectedFrameIndex >= frameCount - 1}
      onClick={onNext}
    >
      Next
    </button>
    <input
      aria-label="Replay frame"
      type="range"
      min={0}
      max={Math.max(0, frameCount - 1)}
      value={selectedFrameIndex}
      onChange={(event) => {
        onSelectFrame(Number(event.currentTarget.value));
      }}
    />
    <select
      aria-label="Replay speed"
      value={speedMs}
      onChange={(event) => {
        onSelectSpeedMs(Number(event.currentTarget.value));
      }}
    >
      <option value={1200}>0.5x</option>
      <option value={700}>1x</option>
      <option value={350}>2x</option>
    </select>
    <span>{`Frame ${String(selectedFrameIndex + 1)} / ${String(frameCount)}`}</span>
    <strong>{frameLabel}</strong>
  </div>
);

const replayMatchIdFromPath = (path: string): string | undefined => {
  const match = /^\/replays\/(?<matchId>[^/]+)$/u.exec(
    new URL(path, "http://localhost").pathname,
  );
  const matchId = match?.groups?.["matchId"];
  return matchId === undefined ? undefined : decodeURIComponent(matchId);
};

export interface ReplayViewerPageProps {
  readonly path?: string | undefined;
}

export const ReplayViewerPage = ({
  path,
}: ReplayViewerPageProps): React.JSX.Element => {
  const matchId = replayMatchIdFromPath(
    path ?? `${window.location.pathname}${window.location.search}`,
  );
  const [status, setStatus] = useState<ReplayViewerStatus>("loading");
  const [replay, setReplay] = useState<ReplayDetail>();
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(700);
  const [error, setError] = useState<string>();
  const client = useMemo(
    () =>
      createReplayClient({
        baseUrl:
          typeof window === "undefined"
            ? "http://localhost"
            : window.location.origin,
      }),
    [],
  );

  useEffect(() => {
    if (matchId === undefined) {
      setStatus("error");
      setError("Replay match id is missing.");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setError(undefined);
    void client
      .getReplay(matchId)
      .then((nextReplay) => {
        if (cancelled) {
          return;
        }
        setReplay(nextReplay);
        setStatus("ready");
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }
        setReplay(undefined);
        setStatus("error");
        setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [client, matchId]);

  useEffect(() => {
    setFrameIndex(0);
    setPlaying(false);
  }, [replay?.matchId]);

  const frames = useMemo(
    () =>
      replay === undefined
        ? []
        : replayFramesFromDetail({
            matchId: replay.matchId,
            manifestSnapshot: replay.replay.manifestSnapshot,
            frameReconstruction: replay.frameReconstruction,
            deterministicEntries: replay.replay.deterministicEntries ?? [],
          }),
    [replay],
  );
  const selectedFrameIndex =
    frames.length === 0 ? 0 : Math.min(frameIndex, frames.length - 1);
  const selectedFrame = frames[selectedFrameIndex];
  const replayClient = useMemo(
    () => createReplayMatchClient(selectedFrame),
    [selectedFrame],
  );
  useEffect(() => {
    if (!playing || frames.length <= 1) {
      return;
    }
    const timer = window.setTimeout(() => {
      setFrameIndex((current) => {
        const next = Math.min(frames.length - 1, current + 1);
        if (next >= frames.length - 1) {
          setPlaying(false);
        }
        return next;
      });
    }, speedMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [frames.length, playing, selectedFrameIndex, speedMs]);
  const replayControls =
    replay === undefined ? undefined : (
      <ReplayPlaybackControls
        frameLabel={selectedFrame?.label ?? "Replay frame"}
        selectedFrameIndex={selectedFrameIndex}
        frameCount={Math.max(1, frames.length)}
        playing={playing}
        speedMs={speedMs}
        onPrevious={() => {
          setFrameIndex((current) => Math.max(0, current - 1));
        }}
        onNext={() => {
          setFrameIndex((current) =>
            Math.min(Math.max(0, frames.length - 1), current + 1),
          );
        }}
        onTogglePlay={() => {
          setPlaying((current) => !current);
        }}
        onSelectFrame={(index) => {
          setFrameIndex(Math.max(0, Math.min(frames.length - 1, index)));
        }}
        onSelectSpeedMs={setSpeedMs}
      />
    );

  if (status === "ready" && replay !== undefined && frames.length > 0) {
    return <MatchApp client={replayClient} replayControls={replayControls} />;
  }

  return (
    <ReplayViewerPageView
      status={status}
      replay={replay}
      error={error}
      frameCount={frames.length}
      frameReconstruction={replay?.frameReconstruction}
    />
  );
};
