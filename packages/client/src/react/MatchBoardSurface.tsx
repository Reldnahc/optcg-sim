import type { ComponentProps, ReactNode } from "react";

import type { MatchClientSessionState } from "../index.js";
import { BoardLayout } from "./BoardLayout.js";
import { MatchLoadingPanel } from "./MatchLoadingPanel.js";

type BoardLayoutProps = ComponentProps<typeof BoardLayout>;

export interface MatchBoardSurfaceProps extends Omit<
  BoardLayoutProps,
  "board"
> {
  board: BoardLayoutProps["board"] | undefined;
  clientState: MatchClientSessionState | undefined;
  lobbyDeckPanel?: ReactNode | undefined;
}

export const MatchBoardSurface = ({
  board,
  clientState,
  lobbyDeckPanel,
  ...boardProps
}: MatchBoardSurfaceProps): React.JSX.Element =>
  board === undefined ? (
    <MatchLoadingPanel
      clientState={clientState}
      lobbyDeckPanel={lobbyDeckPanel}
    />
  ) : (
    <BoardLayout board={board} {...boardProps} />
  );
