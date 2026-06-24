import type { JSX } from "react";

import type { PlayerSummaryTimerModel } from "../view-model.js";

export const PlayerSummaryLabel = ({
  label,
  status,
  timer,
}: {
  label: string;
  status?: "connected" | "disconnected" | undefined;
  timer?: PlayerSummaryTimerModel | undefined;
}): JSX.Element => (
  <div className="player-summary-label">
    <h2>
      <span className="player-name">{label}</span>
      {status === undefined ? null : (
        <span
          className={`connection-status is-${status}`}
          aria-label={`${label} ${status}`}
          title={status === "connected" ? "Connected" : "Disconnected"}
        />
      )}
    </h2>
    {timer === undefined ? null : (
      <div className="player-timers" aria-label={`${label} timers`}>
        <span
          className={["game-timer", timer.isRunning ? "is-running" : ""]
            .filter(Boolean)
            .join(" ")}
          title="Game timer"
        >
          {timer.game}
        </span>
        {timer.disconnect === undefined ? null : (
          <span className="disconnect-timer" title="Reconnect timer">
            {timer.disconnect}
          </span>
        )}
      </div>
    )}
  </div>
);
