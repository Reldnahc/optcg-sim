import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import type { ClientActionModel, ClientCardModel } from "../view-model.js";
import { horizontalReorderTargetFromPointer } from "./drag-reorder.js";
import type {
  HorizontalReorderEntry,
  ReorderPlacement,
} from "./drag-reorder.js";

const pointerReorderDragThreshold = 2;
const handCardReorderDraggingClassName = "is-hand-card-reorder-dragging";
type ClientKeyword = NonNullable<ClientCardModel["keywords"]>[number];
type ClientRestriction = NonNullable<ClientCardModel["restrictions"]>[number];

const donCardFaceClassName = "card-face card-don-face";

const isDonCard = (card: ClientCardModel): boolean =>
  card.name === "DON!!" || card.category.toLowerCase() === "don";

const hiddenCardBackClassName = (card: ClientCardModel): string =>
  String(card.instanceId).startsWith("hidden-don-deck-")
    ? "card-back-don-deck"
    : "card-back-main-deck";

const keywordLabel = (keyword: ClientKeyword): string => {
  switch (keyword) {
    case "rush":
      return "rush";
    case "rushCharacter":
      return "rush character";
    case "doubleAttack":
      return "double attack";
    case "banish":
      return "banish";
    case "blocker":
      return "blocker";
    case "unblockable":
      return "unblockable";
  }
};

const restrictionLabel = (restriction: ClientRestriction): string => {
  switch (restriction) {
    case "cannot-attack":
      return "can't attack";
    case "cannot-block":
      return "can't block";
    case "cannot-become-active":
      return "no refresh";
    case "no-blocker":
      return "No Blocker";
    default:
      return restriction;
  }
};

const restrictionTone = (
  restriction: ClientRestriction,
): "positive" | "negative" => {
  switch (restriction) {
    case "no-blocker":
      return "positive";
    default:
      return "negative";
  }
};

interface PointerReorderDrag {
  pointerId: number;
  originX: number;
  originY: number;
  originLeft: number;
  originTop: number;
  originSurfaceLeft: number;
  originSurfaceTop: number;
  width: number;
  height: number;
  currentX: number;
  currentY: number;
  moved: boolean;
  reorderEntries: readonly HorizontalReorderEntry[];
}

interface PointerReorderTarget {
  targetInstanceId: string;
  placement: ReorderPlacement;
}

type ReorderDragStrategy = "fixed" | "absolute";

interface PointerReorderFinishEvent {
  pointerId: number;
  type: "pointerup" | "pointercancel";
  preventDefault: () => void;
  stopPropagation: () => void;
}

export interface CardTileProps {
  card: ClientCardModel;
  label?: string | undefined;
  selectionOrderLabel?: string | undefined;
  selected?: boolean;
  selectable?: boolean | undefined;
  active?: boolean | undefined;
  pendingChoice?: boolean | undefined;
  selectedDonInstanceIds?: readonly string[] | undefined;
  actions?: readonly ClientActionModel[] | undefined;
  disabled?: boolean | undefined;
  overlay?: ReactNode | undefined;
  onClick?: (() => void) | undefined;
  onAction?: ((actionIndex: number) => void) | undefined;
  onAttachedDonClick?: ((instanceId: string) => void) | undefined;
  onHover?: ((card: ClientCardModel) => void) | undefined;
  reorderable?: boolean | undefined;
  reorderDragStrategy?: ReorderDragStrategy | undefined;
  onMoveNear?:
    | ((
        draggedInstanceId: string,
        targetInstanceId: string,
        placement: ReorderPlacement,
      ) => void)
    | undefined;
  onPreviewMoveNear?:
    | ((
        draggedInstanceId: string,
        targetInstanceId: string,
        placement: ReorderPlacement,
      ) => void)
    | undefined;
  onReorderCancel?: (() => void) | undefined;
}

export const CardTile = ({
  card,
  label,
  selectionOrderLabel,
  selected = false,
  selectable = false,
  active = false,
  pendingChoice = false,
  selectedDonInstanceIds = [],
  actions = [],
  disabled = false,
  overlay,
  onClick,
  onAction,
  onAttachedDonClick,
  onHover,
  reorderable = false,
  reorderDragStrategy = "fixed",
  onMoveNear,
  onPreviewMoveNear,
  onReorderCancel,
}: CardTileProps): React.JSX.Element => {
  const [pointerDrag, setPointerDrag] = useState<
    PointerReorderDrag | undefined
  >(undefined);
  const suppressClickRef = useRef(false);
  const completedPointerIdRef = useRef<number | undefined>(undefined);
  const lastPointerMoveRef = useRef<PointerReorderTarget | undefined>(
    undefined,
  );
  const pointerReorderEnabled = reorderable && onMoveNear !== undefined;
  const hasCardMenuActions = actions.length > 0 && onAction !== undefined;
  const pointerReorderDragging = pointerDrag?.moved === true;
  const isSelected =
    selected || selectedDonInstanceIds.includes(String(card.instanceId));
  const image =
    card.category === "hidden" ? (
      <div
        className={`card-face card-back ${hiddenCardBackClassName(card)}`}
        aria-label={card.name}
      />
    ) : card.imageUrl === undefined && isDonCard(card) ? (
      <div className={donCardFaceClassName} aria-label={card.name} />
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
  const statusBadges = [
    ...(card.keywords ?? []).map((keyword) => ({
      id: `keyword:${keyword}`,
      label: keywordLabel(keyword),
      tone: "positive" as const,
    })),
    ...(card.restrictions ?? []).map((restriction) => ({
      id: `restriction:${restriction}`,
      label: restrictionLabel(restriction),
      tone: restrictionTone(restriction),
    })),
  ];
  const pointerDragStyle =
    pointerDrag?.moved !== true
      ? undefined
      : reorderDragStrategy === "absolute"
        ? ({
            position: "absolute",
            left: pointerDrag.originLeft - pointerDrag.originSurfaceLeft,
            top: pointerDrag.originTop - pointerDrag.originSurfaceTop,
            zIndex: 40,
            width: pointerDrag.width,
            height: pointerDrag.height,
            transform: `translate(${String(pointerDrag.currentX - pointerDrag.originX)}px, ${String(pointerDrag.currentY - pointerDrag.originY)}px)`,
            pointerEvents: "none",
          } satisfies CSSProperties)
        : ({
            position: "fixed",
            left:
              pointerDrag.originLeft +
              pointerDrag.currentX -
              pointerDrag.originX,
            top:
              pointerDrag.originTop +
              pointerDrag.currentY -
              pointerDrag.originY,
            width: pointerDrag.width,
            height: pointerDrag.height,
            pointerEvents: "none",
          } satisfies CSSProperties);
  const finishPointerReorder = (event: PointerReorderFinishEvent): boolean => {
    if (
      pointerDrag === undefined ||
      pointerDrag.pointerId !== event.pointerId
    ) {
      return false;
    }
    const commitTarget = lastPointerMoveRef.current;
    setPointerDrag(undefined);
    lastPointerMoveRef.current = undefined;
    suppressClickRef.current = pointerDrag.moved;
    if (!pointerDrag.moved || !pointerReorderEnabled) {
      return true;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "pointerup" && commitTarget !== undefined) {
      onMoveNear(
        String(card.instanceId),
        commitTarget.targetInstanceId,
        commitTarget.placement,
      );
    } else {
      onReorderCancel?.();
    }
    return true;
  };
  const moveCardNearPointer = (clientX: number): void => {
    if (!pointerReorderEnabled) {
      return;
    }
    const draggedInstanceId = String(card.instanceId);
    if (pointerDrag === undefined) {
      return;
    }
    const target = horizontalReorderTargetFromPointer({
      entries: pointerDrag.reorderEntries,
      draggedId: draggedInstanceId,
      clientX,
    });
    if (target === undefined) {
      return;
    }
    if (
      lastPointerMoveRef.current?.targetInstanceId === target.targetId &&
      lastPointerMoveRef.current.placement === target.placement
    ) {
      return;
    }
    lastPointerMoveRef.current = {
      targetInstanceId: target.targetId,
      placement: target.placement,
    };
    onPreviewMoveNear?.(draggedInstanceId, target.targetId, target.placement);
  };

  useEffect(() => {
    if (!pointerReorderDragging) {
      return;
    }
    document.documentElement.classList.add(handCardReorderDraggingClassName);
    return () => {
      document.documentElement.classList.remove(
        handCardReorderDraggingClassName,
      );
    };
  }, [pointerReorderDragging]);

  useEffect(() => {
    if (pointerDrag === undefined) {
      return;
    }

    const finishFromDocument = (event: PointerEvent): void => {
      if (
        finishPointerReorder({
          pointerId: event.pointerId,
          type: event.type === "pointercancel" ? "pointercancel" : "pointerup",
          preventDefault: () => {
            event.preventDefault();
          },
          stopPropagation: () => {
            event.stopPropagation();
          },
        })
      ) {
        completedPointerIdRef.current = event.pointerId;
      }
    };

    document.addEventListener("pointerup", finishFromDocument, true);
    document.addEventListener("pointercancel", finishFromDocument, true);
    return () => {
      document.removeEventListener("pointerup", finishFromDocument, true);
      document.removeEventListener("pointercancel", finishFromDocument, true);
    };
  }, [finishPointerReorder, pointerDrag]);

  return (
    <div
      className={`card-tile-shell ${
        pointerReorderEnabled ? "is-pointer-reorderable" : ""
      } ${hasCardMenuActions ? "has-card-menu-actions" : ""} ${
        pointerReorderDragging ? "is-pointer-reorder-dragging" : ""
      }`}
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
        const rect = event.currentTarget.getBoundingClientRect();
        completedPointerIdRef.current = undefined;
        const reorderRoot =
          event.currentTarget.closest<HTMLElement>(".hand-cards");
        const reorderRootRect = reorderRoot?.getBoundingClientRect();
        const reorderEntries =
          reorderRoot === null
            ? []
            : Array.from(
                reorderRoot.querySelectorAll<HTMLElement>(
                  "[data-card-instance-id]",
                ),
              ).flatMap((element) => {
                const id = element.dataset["cardInstanceId"];
                if (id === undefined) {
                  return [];
                }
                const entryRect =
                  element === event.currentTarget
                    ? rect
                    : element.getBoundingClientRect();
                return [{ id, centerX: entryRect.left + entryRect.width / 2 }];
              });
        lastPointerMoveRef.current = undefined;
        setPointerDrag({
          pointerId: event.pointerId,
          originX: event.clientX,
          originY: event.clientY,
          originLeft: rect.left,
          originTop: rect.top,
          originSurfaceLeft: reorderRootRect?.left ?? 0,
          originSurfaceTop: reorderRootRect?.top ?? 0,
          width: rect.width,
          height: rect.height,
          currentX: event.clientX,
          currentY: event.clientY,
          moved: false,
          reorderEntries,
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
          pointerDrag.moved ||
          Math.abs(deltaX) > pointerReorderDragThreshold ||
          Math.abs(deltaY) > pointerReorderDragThreshold;
        if (moved) {
          event.preventDefault();
          event.stopPropagation();
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          moveCardNearPointer(event.clientX);
        }
        setPointerDrag({
          ...pointerDrag,
          currentX: event.clientX,
          currentY: event.clientY,
          moved,
        });
      }}
      onPointerUp={(event) => {
        if (completedPointerIdRef.current === event.pointerId) {
          completedPointerIdRef.current = undefined;
          return;
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        finishPointerReorder({
          pointerId: event.pointerId,
          type: "pointerup",
          preventDefault: () => {
            event.preventDefault();
          },
          stopPropagation: () => {
            event.stopPropagation();
          },
        });
      }}
      onPointerCancel={(event) => {
        if (completedPointerIdRef.current === event.pointerId) {
          completedPointerIdRef.current = undefined;
          return;
        }
        finishPointerReorder({
          pointerId: event.pointerId,
          type: "pointercancel",
          preventDefault: () => {
            event.preventDefault();
          },
          stopPropagation: () => {
            event.stopPropagation();
          },
        });
      }}
    >
      <button
        className={`card-tile ${card.state === "rested" ? "is-rested" : ""} ${
          isSelected ? "is-selected" : ""
        } ${selectable ? "is-selectable" : ""} ${active ? "is-active" : ""} ${
          pendingChoice ? "is-pending-choice" : ""
        } ${
          card.freshlyPlayedAttackRestricted === true
            ? "is-freshly-played-attack-restricted"
            : ""
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
        {statusBadges.length === 0 ? null : (
          <span className="keyword-badges" aria-label="Card status">
            {statusBadges.map((badge) => (
              <span
                key={badge.id}
                className={`keyword-badge keyword-badge-${badge.tone}`}
              >
                {badge.label}
              </span>
            ))}
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
              data-card-instance-id={String(donCard.instanceId)}
              type="button"
              title={donCard.name}
              onClick={(event) => {
                event.stopPropagation();
                onAttachedDonClick?.(String(donCard.instanceId));
              }}
            >
              {donCard.imageUrl === undefined ? (
                isDonCard(donCard) ? (
                  <span
                    className="attached-don-card-face attached-don-card-don-face"
                    aria-label={donCard.name}
                  />
                ) : (
                  <span>{donCard.name}</span>
                )
              ) : (
                <img src={donCard.imageUrl} alt={donCard.name} />
              )}
            </button>
          ))}
        </div>
      ) : null}
      {overlay}
    </div>
  );
};
