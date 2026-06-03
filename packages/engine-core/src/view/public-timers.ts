import type { GameState, PlayerId, PlayerView } from "@optcg/types";

export const toPublicTimerState = (state: GameState): PlayerView["timers"] => ({
  players: Object.fromEntries(
    (Object.keys(state.timers.players) as PlayerId[]).map((id) => {
      const timer = state.timers.players[id];
      if (timer === undefined) {
        throw new TypeError(`Missing timer for player ${String(id)}.`);
      }
      return [
        id,
        { remainingMs: timer.remainingMs, isRunning: timer.isRunning },
      ];
    }),
  ),
  ...(state.timers.drainingPlayerId === undefined
    ? {}
    : { activePlayerId: state.timers.drainingPlayerId }),
  ...(state.timers.disconnects === undefined
    ? {}
    : {
        disconnects: Object.fromEntries(
          (Object.keys(state.timers.disconnects) as PlayerId[]).map((id) => {
            const timer = state.timers.disconnects?.[id];
            if (timer === undefined) {
              throw new TypeError(
                `Missing disconnect timer for player ${String(id)}.`,
              );
            }
            return [
              id,
              { remainingMs: timer.remainingMs, isRunning: timer.isRunning },
            ];
          }),
        ),
      }),
});
