import type { ComponentProps } from "react";

import type { MatchClientSessionState } from "../index.js";
import { BoardLayout } from "./BoardLayout.js";
import { EmptyPlaymat } from "./EmptyPlaymat.js";
import { MatchBoardFrame } from "./MatchBoardFrame.js";

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
  clientState: _clientState,
  ...boardProps
}: MatchBoardSurfaceProps): React.JSX.Element | null => {
  void _clientState;
  if (board === undefined) {
    return (
      <MatchBoardFrame
        onBackgroundClick={boardProps.onBackgroundClick}
        tabletop={<EmptyPlaymat />}
      />
    );
  }
  return <BoardLayout board={board} {...boardProps} />;
};
