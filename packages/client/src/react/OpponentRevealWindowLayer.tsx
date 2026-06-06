import type { JSX } from "react";

import type { ClientCardModel } from "../view-model.js";
import type { WindowRect } from "./FloatingWindow.js";
import type { OpponentRevealWindow } from "./opponent-reveal-windows.js";
import { revealWindowKey } from "./opponent-reveal-windows.js";
import { RevealWindowHost } from "./RevealWindowHost.js";

export interface OpponentRevealWindowLayerProps {
  windows: readonly OpponentRevealWindow[];
  activeDockedWindowIds: ReadonlySet<string>;
  activeFloatingWindowRects: Readonly<Record<string, WindowRect>>;
  activeFloatingWindowZIndexes: Readonly<Record<string, number>>;
  minimizedRevealIds: ReadonlySet<string>;
  onActivateWindow: (windowKey: string) => void;
  onToggleMinimized: (revealId: string) => void;
  onClose: (revealId: string) => void;
  onPreviewCard: (card: ClientCardModel) => void;
  onRectChange: (windowKey: string, rect: WindowRect) => void;
  onDragMove: (rect: WindowRect) => void;
  onDragEnd: (windowKey: string, rect: WindowRect) => WindowRect | undefined;
}

export const OpponentRevealWindowLayer = ({
  windows,
  activeDockedWindowIds,
  activeFloatingWindowRects,
  activeFloatingWindowZIndexes,
  minimizedRevealIds,
  onActivateWindow,
  onToggleMinimized,
  onClose,
  onPreviewCard,
  onRectChange,
  onDragMove,
  onDragEnd,
}: OpponentRevealWindowLayerProps): JSX.Element => (
  <>
    {windows
      .filter(
        (revealWindow) =>
          !activeDockedWindowIds.has(revealWindowKey(revealWindow.revealId)),
      )
      .map((revealWindow) => {
        const windowKey = revealWindowKey(revealWindow.revealId);
        return (
          <RevealWindowHost
            key={revealWindow.revealId}
            model={revealWindow.model}
            initialRect={
              activeFloatingWindowRects[windowKey] ?? revealWindow.initialRect
            }
            zIndex={activeFloatingWindowZIndexes[windowKey]}
            minimized={minimizedRevealIds.has(revealWindow.revealId)}
            onActivate={() => {
              onActivateWindow(windowKey);
            }}
            onToggleMinimized={() => {
              onToggleMinimized(revealWindow.revealId);
            }}
            onPreviewCard={onPreviewCard}
            onClose={() => {
              onClose(revealWindow.revealId);
            }}
            onRectChange={(rect) => {
              onRectChange(windowKey, rect);
            }}
            onDragMove={onDragMove}
            onDragEnd={(rect) => onDragEnd(windowKey, rect)}
          />
        );
      })}
  </>
);
