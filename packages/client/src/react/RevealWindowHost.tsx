import type { ClientCardModel } from "../view-model.js";
import { CardTile } from "./CardTile.js";
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
  onToggleMinimized?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
  onRectChange?: ((rect: WindowRect) => void) | undefined;
  onDragMove?: ((rect: WindowRect) => void) | undefined;
  onDragEnd?: ((rect: WindowRect) => WindowRect | undefined) | undefined;
  onPreviewCard?: ((card: ClientCardModel) => void) | undefined;
}

export interface RevealWindowContentProps {
  model: RevealWindowModel;
  onPreviewCard?: ((card: ClientCardModel) => void) | undefined;
}

export const RevealWindowContent = ({
  model,
  onPreviewCard,
}: RevealWindowContentProps): React.JSX.Element => (
  <div className="reveal-window-card-spot">
    {model.cards.map((card) => (
      <CardTile
        key={String(card.instanceId)}
        card={card}
        onHover={onPreviewCard}
      />
    ))}
  </div>
);

export const RevealWindowHost = ({
  model,
  initialRect = { x: 380, y: 100, width: 300, height: 420 },
  minimized = false,
  docked = false,
  onToggleMinimized,
  onClose,
  onRectChange,
  onDragMove,
  onDragEnd,
  onPreviewCard,
}: RevealWindowHostProps): React.JSX.Element | null => {
  if (model === undefined) {
    return null;
  }

  return (
    <FloatingWindow
      title={model.title}
      className="floating-window-reveal reveal-window"
      initialRect={initialRect}
      minWidth={300}
      minHeight={420}
      docked={docked}
      minimized={minimized}
      onToggleMinimized={onToggleMinimized}
      onClose={onClose}
      onRectChange={onRectChange}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    >
      <RevealWindowContent model={model} onPreviewCard={onPreviewCard} />
    </FloatingWindow>
  );
};
