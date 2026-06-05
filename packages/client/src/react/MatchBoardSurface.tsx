import type { ComponentProps } from "react";

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
}

export const MatchBoardSurface = ({
  board,
  clientState,
  ...boardProps
}: MatchBoardSurfaceProps): React.JSX.Element =>
  board === undefined ? (
    <MatchLoadingPanel clientState={clientState} />
  ) : (
    <BoardLayout board={board} {...boardProps} />
  );
