import type { ComponentProps } from "react";

import type { MatchClientSessionState } from "../index.js";
import { BoardLayout } from "./BoardLayout.js";
import { EmptyPlaymat } from "./EmptyPlaymat.js";
import { MatchBoardFrame } from "./MatchBoardFrame.js";
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
    return (
      <MatchBoardFrame
        onBackgroundClick={boardProps.onBackgroundClick}
        tabletop={<EmptyPlaymat />}
      />
    );
  }
  if (board === undefined) {
    return (
      <MatchBoardFrame
        onBackgroundClick={boardProps.onBackgroundClick}
        tabletop={
          <EmptyPlaymat
            center={<MatchLoadingPanel clientState={clientState} />}
          />
        }
      />
    );
  }
  return <BoardLayout board={board} {...boardProps} />;
};
