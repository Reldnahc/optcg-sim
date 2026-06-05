import type { ComponentProps } from "react";

import type { MatchClientSessionState } from "../index.js";
import { BoardLayout } from "./BoardLayout.js";
import { MatchLoadingPanel } from "./MatchLoadingPanel.js";
import { isLobbyClientState } from "./useMatchClient-support.js";

type BoardLayoutProps = ComponentProps<typeof BoardLayout>;

export interface MatchBoardSurfaceProps extends Omit<
  BoardLayoutProps,
  "board"
> {
  board: BoardLayoutProps["board"] | undefined;
  clientState: MatchClientSessionState | undefined;
}

export const MatchBoardSurface = ({
  board,
  clientState,
  ...boardProps
}: MatchBoardSurfaceProps): React.JSX.Element | null => {
  if (board === undefined && isLobbyClientState(clientState)) {
    return null;
  }
  if (board === undefined) {
    return <MatchLoadingPanel clientState={clientState} />;
  }
  return <BoardLayout board={board} {...boardProps} />;
};
