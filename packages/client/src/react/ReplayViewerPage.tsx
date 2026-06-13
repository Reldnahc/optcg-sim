import { useEffect, useMemo, useState } from "react";

import {
  createReplayClient,
  type ReplayDetail,
  type ReplayPayload,
} from "../replay-client.js";
import { appRoutePath } from "./app-route.js";

type ReplayViewerStatus = "loading" | "ready" | "error";

export interface ReplayViewerPageViewProps {
  readonly status: ReplayViewerStatus;
  readonly replay?: ReplayDetail | undefined;
  readonly error?: string | undefined;
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
}: ReplayViewerPageViewProps): React.JSX.Element => {
  const entries = replay === undefined ? [] : replayEntries(replay.replay);
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

  return <ReplayViewerPageView status={status} replay={replay} error={error} />;
};
