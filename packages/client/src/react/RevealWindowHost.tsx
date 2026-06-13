import type { ClientCardModel } from "../view-model.js";
import { CardPreviewContent } from "./CardPreviewWindow.js";
import { FloatingWindow } from "./FloatingWindow.js";
import type { WindowRect } from "./FloatingWindow.js";

export interface RevealWindowModel {
  title: string;
  cards: readonly ClientCardModel[];
}

export interface RevealWindowHostProps {
  model?: RevealWindowModel | undefined;
  initialRect?: WindowRect | undefined;
  minimized?: boolean | undefined;
  docked?: boolean | undefined;
  zIndex?: number | undefined;
  onToggleMinimized?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
  onActivate?: (() => void) | undefined;
  onRectChange?: ((rect: WindowRect) => void) | undefined;
  onDragMove?: ((rect: WindowRect) => void) | undefined;
  onDragEnd?: ((rect: WindowRect) => WindowRect | undefined) | undefined;
}

export interface RevealWindowContentProps {
  model: RevealWindowModel;
}

export const RevealWindowContent = ({
  model,
}: RevealWindowContentProps): React.JSX.Element => (
  <CardPreviewContent card={model.cards[0]} />
);

export const RevealWindowHost = ({
  model,
  initialRect = { x: 380, y: 100, width: 300, height: 420 },
  minimized = false,
  docked = false,
  zIndex,
  onToggleMinimized,
  onClose,
  onActivate,
  onRectChange,
  onDragMove,
  onDragEnd,
}: RevealWindowHostProps): React.JSX.Element | null => {
  if (model === undefined) {
    return null;
  }

  return (
    <FloatingWindow
      title={model.title}
      className="card-preview-window floating-window-reveal reveal-window"
      initialRect={initialRect}
      minWidth={190}
      minHeight={150}
      docked={docked}
      minimized={minimized}
      zIndex={zIndex}
      onToggleMinimized={onToggleMinimized}
      onClose={onClose}
      onActivate={onActivate}
      onRectChange={onRectChange}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    >
      <RevealWindowContent model={model} />
    </FloatingWindow>
  );
};
