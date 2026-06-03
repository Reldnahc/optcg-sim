import type { CSSProperties } from "react";

import type { CardMovementIntent } from "./movement-planner.js";

export interface CardMovementOverlayProps {
  movements: readonly CardMovementIntent[];
}

type MovementStyle = CSSProperties &
  Record<
    | "--card-move-from-x"
    | "--card-move-from-y"
    | "--card-move-to-x"
    | "--card-move-to-y"
    | "--card-move-width"
    | "--card-move-height",
    string
  >;

const movementStyle = (movement: CardMovementIntent): MovementStyle => ({
  "--card-move-from-x": `${String(movement.fromRect.x)}px`,
  "--card-move-from-y": `${String(movement.fromRect.y)}px`,
  "--card-move-to-x": `${String(movement.toRect.x)}px`,
  "--card-move-to-y": `${String(movement.toRect.y)}px`,
  "--card-move-width": `${String(movement.toRect.width)}px`,
  "--card-move-height": `${String(movement.toRect.height)}px`,
});

export const CardMovementOverlay = ({
  movements,
}: CardMovementOverlayProps): React.JSX.Element | null => {
  if (movements.length === 0) {
    return null;
  }

  return (
    <div className="card-movement-overlay" aria-hidden="true">
      {movements.map((movement) => {
        const hidden = movement.card.category === "hidden";
        return (
          <div
            key={movement.id}
            className="card-movement-flyer"
            style={movementStyle(movement)}
          >
            {hidden || movement.card.imageUrl === undefined ? (
              <div
                className={`card-movement-face ${
                  hidden ? "is-hidden" : "is-placeholder"
                }`}
              >
                {hidden ? "" : movement.card.name}
              </div>
            ) : (
              <img
                className="card-movement-face"
                src={movement.card.imageUrl}
                alt=""
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
