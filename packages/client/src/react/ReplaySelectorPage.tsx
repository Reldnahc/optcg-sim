import { useEffect, useMemo, useState } from "react";

import { createReplayClient, type ReplaySummary } from "../replay-client.js";

type ReplaySelectorStatus = "loading" | "ready" | "error";

export interface ReplaySelectorPageViewProps {
  readonly status: ReplaySelectorStatus;
  readonly replays: readonly ReplaySummary[];
  readonly error?: string | undefined;
}

const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const replayHref = (matchId: string): string =>
  `/replays/${encodeURIComponent(matchId)}`;

const playerLabel = (player: ReplaySummary["players"][number]): string =>
  `${player.displayName ?? player.seatId} (${player.result})`;

export const ReplaySelectorPageView = ({
  status,
  replays,
  error,
}: ReplaySelectorPageViewProps): React.JSX.Element => (
  <section className="shell-page replay-selector-page">
    <div className="shell-page-heading">
      <h1>Replay Library</h1>
      <p>Select a completed match replay to open it in the viewer.</p>
    </div>

    {status === "loading" ? (
      <div className="replay-selector-panel">Loading replays...</div>
    ) : null}
    {status === "error" ? (
      <div className="replay-selector-panel is-error">
        {error ?? "Unable to load replays."}
      </div>
    ) : null}
    {status === "ready" && replays.length === 0 ? (
      <div className="replay-selector-panel">No replays are available.</div>
    ) : null}
    {status === "ready" && replays.length > 0 ? (
      <div className="replay-selector-list">
        {replays.map((replay) => (
          <article className="replay-selector-card" key={replay.matchId}>
            <div>
              <h2>{replay.matchId}</h2>
              <div className="replay-selector-meta">
                <span>{replay.status}</span>
                <span>{replay.formatId}</span>
                <span>{`Turns ${String(replay.turnCount ?? "-")}`}</span>
                <span>{`Actions ${String(replay.actionCount)}`}</span>
              </div>
            </div>
            <div className="replay-selector-players">
              {replay.players.map((player) => (
                <span key={player.seatId}>{playerLabel(player)}</span>
              ))}
            </div>
            <div className="replay-selector-meta">
              <span>{formatDate(replay.startedAt)}</span>
              <span>{formatDate(replay.endedAt)}</span>
            </div>
            <a className="shell-card-action" href={replayHref(replay.matchId)}>
              Open replay
            </a>
          </article>
        ))}
      </div>
    ) : null}
  </section>
);

export const ReplaySelectorPage = (): React.JSX.Element => {
  const [status, setStatus] = useState<ReplaySelectorStatus>("loading");
  const [replays, setReplays] = useState<readonly ReplaySummary[]>([]);
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
    let cancelled = false;
    setStatus("loading");
    setError(undefined);
    void client
      .listReplays()
      .then((nextReplays) => {
        if (cancelled) {
          return;
        }
        setReplays(nextReplays);
        setStatus("ready");
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }
        setReplays([]);
        setStatus("error");
        setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <ReplaySelectorPageView status={status} replays={replays} error={error} />
  );
};
