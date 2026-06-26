import type { ReactNode, Ref } from "react";

export interface MatchBoardFrameProps {
  rootRef?: Ref<HTMLElement> | undefined;
  overlay?: ReactNode | undefined;
  handRail?: ReactNode | undefined;
  tabletop?: ReactNode | undefined;
  onBackgroundClick?: (() => void) | undefined;
}

export const MatchBoardFrame = ({
  rootRef,
  overlay,
  handRail,
  tabletop,
  onBackgroundClick,
}: MatchBoardFrameProps): React.JSX.Element => (
  <section
    ref={rootRef}
    className="board-shell"
    onClick={() => {
      onBackgroundClick?.();
    }}
  >
    {overlay}
    <div className="hand-rail">{handRail}</div>
    {tabletop === undefined ? null : (
      <div className="tabletop-board">{tabletop}</div>
    )}
  </section>
);
