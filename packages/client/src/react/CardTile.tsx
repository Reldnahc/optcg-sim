import { useRef, useState } from "react";
import type { CSSProperties } from "react";

import type { ClientActionModel, ClientCardModel } from "../view-model.js";
import { reorderPlacementFromPointer } from "./drag-reorder.js";
import type { ReorderPlacement } from "./drag-reorder.js";

interface PointerReorderDrag {
  pointerId: number;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  moved: boolean;
}

export interface CardTileProps {
  card: ClientCardModel;
  label?: string | undefined;
  selectionOrderLabel?: string | undefined;
  selected?: boolean;
  active?: boolean | undefined;
  pendingChoice?: boolean | undefined;
  selectedDonInstanceIds?: readonly string[] | undefined;
  actions?: readonly ClientActionModel[] | undefined;
  disabled?: boolean | undefined;
  onClick?: (() => void) | undefined;
  onAction?: ((actionIndex: number) => void) | undefined;
  onAttachedDonClick?: ((instanceId: string) => void) | undefined;
  onHover?: ((card: ClientCardModel) => void) | undefined;
  reorderable?: boolean | undefined;
  onMoveNear?:
    | ((
        draggedInstanceId: string,
        targetInstanceId: string,
        placement: ReorderPlacement,
      ) => void)
    | undefined;
}

export const CardTile = ({
  card,
  label,
  selectionOrderLabel,
  selected = false,
  active = false,
  pendingChoice = false,
  selectedDonInstanceIds = [],
  actions = [],
  disabled = false,
  onClick,
  onAction,
  onAttachedDonClick,
  onHover,
  reorderable = false,
  onMoveNear,
}: CardTileProps): React.JSX.Element => {
  const [pointerDrag, setPointerDrag] = useState<
    PointerReorderDrag | undefined
  >(undefined);
  const suppressClickRef = useRef(false);
  const pointerReorderEnabled = reorderable && onMoveNear !== undefined;
  const isSelected =
    selected || selectedDonInstanceIds.includes(String(card.instanceId));
  const image =
    card.category === "hidden" ? (
      <div className="card-face card-back" aria-label={card.name} />
    ) : card.imageUrl === undefined ? (
      <div className="card-face card-placeholder">{card.name}</div>
    ) : (
      <img className="card-face" src={card.imageUrl} alt={card.name} />
    );
  const powerDeltaText =
    card.powerDelta === undefined
      ? undefined
      : `${card.powerDelta > 0 ? "+" : ""}${String(card.powerDelta)}`;
  const costDeltaText =
    card.costDelta === undefined
      ? undefined
      : `${card.costDelta > 0 ? "+" : ""}${String(card.costDelta)}`;
  const pointerDragStyle =
    pointerDrag?.moved === true
      ? ({
          transform: `translate(${String(
            pointerDrag.currentX - pointerDrag.originX,
          )}px, ${String(pointerDrag.currentY - pointerDrag.originY)}px)`,
        } satisfies CSSProperties)
      : undefined;
  return (
    <div
      className={`card-tile-shell ${
        pointerReorderEnabled ? "is-pointer-reorderable" : ""
      } ${pointerDrag?.moved === true ? "is-pointer-reorder-dragging" : ""}`}
      data-card-instance-id={String(card.instanceId)}
      style={pointerDragStyle}
      onPointerEnter={() => {
        if (card.category === "hidden") {
          return;
        }
        onHover?.(card);
      }}
      onPointerDown={(event) => {
        if (!pointerReorderEnabled || event.button !== 0) {
          return;
        }
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          target.closest(".card-action-popover, .attached-don-stack") !== null
        ) {
          return;
        }
        setPointerDrag({
          pointerId: event.pointerId,
          originX: event.clientX,
          originY: event.clientY,
          currentX: event.clientX,
          currentY: event.clientY,
          moved: false,
        });
      }}
      onPointerMove={(event) => {
        if (
          pointerDrag === undefined ||
          pointerDrag.pointerId !== event.pointerId
        ) {
          return;
        }
        const deltaX = event.clientX - pointerDrag.originX;
        const deltaY = event.clientY - pointerDrag.originY;
        const moved =
          pointerDrag.moved || Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4;
        if (moved) {
          event.preventDefault();
          event.stopPropagation();
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }
        setPointerDrag({
          ...pointerDrag,
          currentX: event.clientX,
          currentY: event.clientY,
          moved,
        });
      }}
      onPointerUp={(event) => {
        if (
          pointerDrag === undefined ||
          pointerDrag.pointerId !== event.pointerId
        ) {
          return;
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        setPointerDrag(undefined);
        suppressClickRef.current = pointerDrag.moved;
        if (!pointerDrag.moved || !pointerReorderEnabled) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const previousPointerEvents = event.currentTarget.style.pointerEvents;
        event.currentTarget.style.pointerEvents = "none";
        const targetElement = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest<HTMLElement>("[data-card-instance-id]");
        event.currentTarget.style.pointerEvents = previousPointerEvents;
        if (targetElement == null) {
          return;
        }
        const targetInstanceId = targetElement.dataset["cardInstanceId"];
        const draggedInstanceId = String(card.instanceId);
        if (
          targetInstanceId === undefined ||
          targetInstanceId === draggedInstanceId
        ) {
          return;
        }
        onMoveNear(
          draggedInstanceId,
          targetInstanceId,
          reorderPlacementFromPointer(
            targetElement.getBoundingClientRect(),
            event.clientX,
            event.clientY,
          ),
        );
      }}
      onPointerCancel={(event) => {
        if (pointerDrag?.pointerId === event.pointerId) {
          setPointerDrag(undefined);
        }
      }}
    >
      <button
        className={`card-tile ${card.state === "rested" ? "is-rested" : ""} ${
          isSelected ? "is-selected" : ""
        } ${active ? "is-active" : ""} ${
          pendingChoice ? "is-pending-choice" : ""
        }`}
        type="button"
        title={card.name}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            event.preventDefault();
            return;
          }
          onClick?.();
        }}
      >
        {image}
        {label === undefined ? null : <span className="card-tag">{label}</span>}
        {selectionOrderLabel === undefined ? null : (
          <span className="selection-order-badge">{selectionOrderLabel}</span>
        )}
        {powerDeltaText === undefined ? null : (
          <span
            className={`power-delta ${
              card.powerDelta === undefined || card.powerDelta > 0
                ? "power-delta-positive"
                : "power-delta-negative"
            }`}
          >
            {powerDeltaText}
          </span>
        )}
        {costDeltaText === undefined ? null : (
          <span
            className={`cost-delta ${
              card.costDelta === undefined || card.costDelta > 0
                ? "cost-delta-positive"
                : "cost-delta-negative"
            }`}
          >
            {costDeltaText}
          </span>
        )}
      </button>
      {selected && actions.length > 0 && onAction !== undefined ? (
        <div
          className="card-action-popover"
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          {actions.map((action) => (
            <button
              key={action.index}
              className="card-action-button"
              type="button"
              disabled={disabled}
              onClick={() => {
                onAction(action.index);
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
      {card.attachedDonCards.length > 0 ? (
        <div className="attached-don-stack" aria-label="Attached DON!!">
          {card.attachedDonCards.map((donCard) => (
            <button
              key={String(donCard.instanceId)}
              className="attached-don-card"
              type="button"
              title={donCard.name}
              onClick={(event) => {
                event.stopPropagation();
                onAttachedDonClick?.(String(donCard.instanceId));
              }}
            >
              {donCard.imageUrl === undefined ? (
                <span>{donCard.name}</span>
              ) : (
                <img src={donCard.imageUrl} alt={donCard.name} />
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
