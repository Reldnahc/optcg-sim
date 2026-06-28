import type { ComponentProps } from "react";

import type { LobbyClientState } from "../controller.js";
import type { MatchClientSessionState } from "../index.js";
import { BoardLayout } from "./BoardLayout.js";
import {
  EmptyPlaymat,
  type EmptyPlaymatPlayerSummary,
} from "./EmptyPlaymat.js";
import { MatchBoardFrame } from "./MatchBoardFrame.js";

type BoardLayoutProps = ComponentProps<typeof BoardLayout>;

export interface MatchBoardSurfaceProps extends Omit<
  BoardLayoutProps,
  "board"
> {
  board: BoardLayoutProps["board"] | undefined;
  clientState: MatchClientSessionState | undefined;
}

const isLobbyClientState = (
  state: MatchClientSessionState | undefined,
): state is LobbyClientState => state !== undefined && "lobbyId" in state;

const seatSummary = (
  seat: LobbyClientState["lobby"]["seats"][string] | undefined,
  fallbackLabel: string,
): EmptyPlaymatPlayerSummary | undefined => {
  if (seat?.claimed !== true) {
    return undefined;
  }
  const displayName = seat.displayName?.trim();
  return {
    label:
      displayName === undefined || displayName.length === 0
        ? fallbackLabel
        : displayName,
    status: "connected",
    ...(seat.avatar === undefined ? {} : { avatar: seat.avatar }),
    ...(seat.title === undefined ? {} : { title: seat.title }),
  };
};

const lobbyPlaymatSummaries = (
  state: MatchClientSessionState | undefined,
):
  | {
      readonly selfSummary?: EmptyPlaymatPlayerSummary | undefined;
      readonly opponentSummary?: EmptyPlaymatPlayerSummary | undefined;
    }
  | undefined => {
  if (!isLobbyClientState(state)) {
    return undefined;
  }
  const selfSeat = state.lobby.seats[String(state.seat.playerId)];
  const opponentSeat = Object.values(state.lobby.seats).find(
    (seat) => seat.playerId !== state.seat.playerId && seat.claimed,
  );
  return {
    selfSummary: seatSummary(selfSeat, "Player"),
    opponentSummary: seatSummary(opponentSeat, "Opponent"),
  };
};

export const MatchBoardSurface = ({
  board,
  clientState,
  ...boardProps
}: MatchBoardSurfaceProps): React.JSX.Element | null => {
  if (board === undefined) {
    const summaries = lobbyPlaymatSummaries(clientState);
    return (
      <MatchBoardFrame
        onBackgroundClick={boardProps.onBackgroundClick}
        tabletop={<EmptyPlaymat {...summaries} />}
      />
    );
  }
  return <BoardLayout board={board} {...boardProps} />;
};
