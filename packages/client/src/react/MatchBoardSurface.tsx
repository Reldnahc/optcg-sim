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

const PregameBoardFootprint = (): React.JSX.Element => (
  <section className="board-shell is-pregame-placeholder" aria-hidden="true">
    <div className="tabletop-board" />
  </section>
);

export const MatchBoardSurface = ({
  board,
  clientState,
  ...boardProps
}: MatchBoardSurfaceProps): React.JSX.Element | null => {
  if (board === undefined && isLobbyClientState(clientState)) {
    return <PregameBoardFootprint />;
  }
  if (board === undefined) {
    return <MatchLoadingPanel clientState={clientState} />;
  }
  return <BoardLayout board={board} {...boardProps} />;
};
