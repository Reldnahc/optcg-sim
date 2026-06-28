import type { ComponentProps } from "react";

import type { PlayerId } from "@optcg/types";

import type {
  FirstPlayerSetupClientState,
  LobbyClientState,
} from "../controller.js";
import type { MatchClientSessionState } from "../index.js";
import type { MatchSnapshot } from "../transport.js";
import { BoardLayout } from "./BoardLayout.js";
import {
  EmptyPlaymat,
  type EmptyPlaymatPlayerSummary,
} from "./EmptyPlaymat.js";
import { MatchBoardFrame } from "./MatchBoardFrame.js";

type BoardLayoutProps = ComponentProps<typeof BoardLayout>;
type PlayerLabel = NonNullable<
  NonNullable<MatchSnapshot["playerLabels"]>[PlayerId]
>;

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

const isFirstPlayerSetupClientState = (
  state: MatchClientSessionState | undefined,
): state is FirstPlayerSetupClientState =>
  state !== undefined && "firstPlayerChoice" in state && !("snapshot" in state);

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

const labelSummary = (
  label: PlayerLabel | undefined,
  fallbackLabel: string,
): EmptyPlaymatPlayerSummary | undefined => {
  if (label === undefined) {
    return undefined;
  }
  const displayName = label.displayName?.trim();
  return {
    label:
      displayName === undefined || displayName.length === 0
        ? fallbackLabel
        : displayName,
    status: label.connectionStatus ?? "connected",
    ...(label.avatar === undefined ? {} : { avatar: label.avatar }),
    ...(label.title === undefined ? {} : { title: label.title }),
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

const setupPlaymatSummaries = (
  state: MatchClientSessionState | undefined,
):
  | {
      readonly selfSummary?: EmptyPlaymatPlayerSummary | undefined;
      readonly opponentSummary?: EmptyPlaymatPlayerSummary | undefined;
    }
  | undefined => {
  if (!isFirstPlayerSetupClientState(state)) {
    return undefined;
  }
  const labels = state.playerLabels;
  const opponentPlayerId = (Object.keys(labels ?? {}) as PlayerId[]).find(
    (playerId) => playerId !== state.seat.playerId,
  );
  return {
    selfSummary: labelSummary(labels?.[state.seat.playerId], "Player"),
    opponentSummary: labelSummary(
      opponentPlayerId === undefined ? undefined : labels?.[opponentPlayerId],
      "Opponent",
    ),
  };
};

export const MatchBoardSurface = ({
  board,
  clientState,
  ...boardProps
}: MatchBoardSurfaceProps): React.JSX.Element | null => {
  if (board === undefined) {
    const summaries =
      lobbyPlaymatSummaries(clientState) ?? setupPlaymatSummaries(clientState);
    return (
      <MatchBoardFrame
        onBackgroundClick={boardProps.onBackgroundClick}
        tabletop={<EmptyPlaymat {...summaries} />}
      />
    );
  }
  return <BoardLayout board={board} {...boardProps} />;
};
