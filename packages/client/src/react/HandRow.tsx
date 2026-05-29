import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import type { ClientActionModel, ClientCardModel } from "../view-model.js";
import {
  calculateCardRowLayout,
  type CardRowLayout,
} from "./card-row-layout.js";
import { CardTile } from "./CardTile.js";
import type { ReorderPlacement } from "./drag-reorder.js";

export type HandOverflowDirection = "left" | "right";

export interface HandOverlapInput {
  availableWidth: number;
  outsideOverflowWidth?: number;
  cardWidth: number;
  cardCount: number;
}

export const calculateHandOverlap = ({
  availableWidth,
  outsideOverflowWidth,
  cardWidth,
  cardCount,
}: HandOverlapInput): number =>
  calculateCardRowLayout({
    availableWidth,
    cardWidth,
    cardCount,
    ...(outsideOverflowWidth === undefined
      ? {}
      : { laneExtensionWidth: outsideOverflowWidth }),
  }).overlap;

export interface HandRowProps {
  label: string;
  cards: readonly ClientCardModel[];
  overflowDirection: HandOverflowDirection;
  selectedCardInstanceId?: string | undefined;
  pendingChoiceInstanceIds?: readonly string[] | undefined;
  decisionSelectedInstanceIds?: readonly string[] | undefined;
  selectedDonInstanceIds?: readonly string[] | undefined;
  activeCardInstanceIds?: readonly string[] | undefined;
  cardActions?:
    | ((instanceId: string) => readonly ClientActionModel[])
    | undefined;
  actionDisabled?: boolean | undefined;
  onCardClick?: ((instanceId: string) => void) | undefined;
  onCardAction?: ((actionIndex: number) => void) | undefined;
  onCardPreview?: ((card: ClientCardModel) => void) | undefined;
  onMoveCard?:
    | ((
        draggedInstanceId: string,
        targetInstanceId: string,
        placement: ReorderPlacement,
      ) => void)
    | undefined;
}

interface HandDragPreview {
  draggedInstanceId: string;
  targetInstanceId: string;
  placement: ReorderPlacement;
}

const captureHandLayoutRects = (
  rootElement: HTMLElement,
): Map<string, DOMRect> => {
  const rects = new Map<string, DOMRect>();
  for (const element of rootElement.querySelectorAll<HTMLElement>(
    "[data-hand-layout-id]",
  )) {
    const layoutId = element.dataset["handLayoutId"];
    if (layoutId !== undefined) {
      rects.set(layoutId, element.getBoundingClientRect());
    }
  }
  return rects;
};

export const HandRow = ({
  label,
  cards,
  overflowDirection,
  selectedCardInstanceId,
  pendingChoiceInstanceIds = [],
  decisionSelectedInstanceIds = [],
  selectedDonInstanceIds = [],
  activeCardInstanceIds = [],
  cardActions,
  actionDisabled = false,
  onCardClick,
  onCardAction,
  onCardPreview,
  onMoveCard,
}: HandRowProps): React.JSX.Element => {
  const rowRef = useRef<HTMLElement | null>(null);
  const cardsRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<CardRowLayout>({
    overlap: 0,
    laneExtension: 0,
    edgePacked: false,
  });
  const [dragPreview, setDragPreview] = useState<
    HandDragPreview | undefined
  >(undefined);
  const previousLayoutRectsRef = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const rowElement = rowRef.current;
    const cardsElement = cardsRef.current;
    if (rowElement === null || cardsElement === null) {
      return;
    }

    const updateOverlap = (): void => {
      const firstCard =
        cardsElement.querySelector<HTMLElement>(".card-tile-shell");
      const rowRect = rowElement.getBoundingClientRect();
      setLayout(
        calculateCardRowLayout({
          availableWidth: rowElement.clientWidth,
          laneExtensionWidth: overflowDirection === "left" ? rowRect.left : 0,
          cardWidth: firstCard?.getBoundingClientRect().width ?? 0,
          cardCount: cards.length,
        }),
      );
    };

    updateOverlap();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateOverlap);
      return () => {
        window.removeEventListener("resize", updateOverlap);
      };
    }

    const resizeObserver = new ResizeObserver(updateOverlap);
    resizeObserver.observe(rowElement);
    resizeObserver.observe(cardsElement);
    window.addEventListener("resize", updateOverlap);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateOverlap);
    };
  }, [cards.length, overflowDirection]);

  useEffect(() => {
    if (dragPreview === undefined) {
      return;
    }
    const cardIds = new Set(cards.map((card) => String(card.instanceId)));
    if (
      !cardIds.has(dragPreview.draggedInstanceId) ||
      !cardIds.has(dragPreview.targetInstanceId)
    ) {
      setDragPreview(undefined);
    }
  }, [cards, dragPreview]);

  useLayoutEffect(() => {
    const cardsElement = cardsRef.current;
    if (cardsElement === null) {
      return;
    }
    const previousRects = previousLayoutRectsRef.current;
    const nextRects = captureHandLayoutRects(cardsElement);
    for (const element of cardsElement.querySelectorAll<HTMLElement>(
      "[data-hand-layout-id]",
    )) {
      if (element.classList.contains("is-pointer-reorder-dragging")) {
        continue;
      }
      const layoutId = element.dataset["handLayoutId"];
      if (layoutId === undefined) {
        continue;
      }
      const previousRect = previousRects.get(layoutId);
      const nextRect = nextRects.get(layoutId);
      if (previousRect === undefined || nextRect === undefined) {
        continue;
      }
      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;
      if (deltaX === 0 && deltaY === 0) {
        continue;
      }
      element.style.transition = "none";
      element.style.transform = `translate(${deltaX.toFixed(2)}px, ${deltaY.toFixed(2)}px)`;
      window.requestAnimationFrame(() => {
        element.style.transition = "transform 90ms ease";
        element.style.transform = "";
      });
    }
    previousLayoutRectsRef.current = nextRects;
  });

  const handCardsClassName = [
    "hand-cards",
    `hand-cards-overlap-${overflowDirection}`,
    layout.edgePacked ? "is-edge-packed" : "",
    layout.laneExtension > 0 ? "is-using-outside-lane" : "",
    layout.overlap > 0 ? "is-overlapping" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const handStyle = {
    "--hand-lane-extension": `${layout.laneExtension.toFixed(2)}px`,
    "--hand-overlap": `${layout.overlap.toFixed(2)}px`,
  } as CSSProperties &
    Record<"--hand-lane-extension" | "--hand-overlap", string>;

  return (
    <section ref={rowRef} className="hand-row" aria-label={label}>
      <div ref={cardsRef} className={handCardsClassName} style={handStyle}>
        {cards.map((card) => {
          const instanceId = String(card.instanceId);
          const placeholderBefore =
            dragPreview?.targetInstanceId === instanceId &&
            dragPreview.placement === "before";
          const placeholderAfter =
            dragPreview?.targetInstanceId === instanceId &&
            dragPreview.placement === "after";
          return (
            <Fragment key={instanceId}>
              {placeholderBefore ? (
                <div
                  className="hand-drag-placeholder"
                  data-hand-layout-id={`placeholder:${dragPreview.draggedInstanceId}`}
                  aria-hidden="true"
                />
              ) : null}
              <CardTile
                card={card}
                layoutId={`card:${instanceId}`}
                selected={
                  selectedCardInstanceId === instanceId ||
                  decisionSelectedInstanceIds.includes(instanceId)
                }
                pendingChoice={pendingChoiceInstanceIds.includes(instanceId)}
                selectedDonInstanceIds={selectedDonInstanceIds}
                active={activeCardInstanceIds.includes(instanceId)}
                actions={cardActions?.(instanceId) ?? []}
                disabled={actionDisabled}
                onAction={onCardAction}
                onAttachedDonClick={onCardClick}
                onHover={onCardPreview}
                reorderable={onMoveCard !== undefined}
                onPreviewMoveNear={
                  onMoveCard === undefined
                    ? undefined
                    : (draggedInstanceId, targetInstanceId, placement) => {
                        setDragPreview({
                          draggedInstanceId,
                          targetInstanceId,
                          placement,
                        });
                      }
                }
                onMoveNear={
                  onMoveCard === undefined
                    ? undefined
                    : (draggedInstanceId, targetInstanceId, placement) => {
                        setDragPreview(undefined);
                        onMoveCard(draggedInstanceId, targetInstanceId, placement);
                      }
                }
                onReorderStart={(draggedInstanceId) => {
                  setDragPreview({
                    draggedInstanceId,
                    targetInstanceId: draggedInstanceId,
                    placement: "before",
                  });
                }}
                onReorderCancel={() => {
                  setDragPreview(undefined);
                }}
                onClick={
                  onCardClick === undefined
                    ? undefined
                    : () => {
                        onCardClick(instanceId);
                      }
                }
              />
              {placeholderAfter ? (
                <div
                  className="hand-drag-placeholder"
                  data-hand-layout-id={`placeholder:${dragPreview.draggedInstanceId}`}
                  aria-hidden="true"
                />
              ) : null}
            </Fragment>
          );
        })}
      </div>
    </section>
  );
};
