import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import type { ClientActionModel, ClientCardModel } from "../view-model.js";
import { CardTile } from "./CardTile.js";

const HAND_CARD_GAP_PX = 5;
const MIN_VISIBLE_CARD_WIDTH_PX = 18;

export type HandOverflowDirection = "left" | "right";

export interface HandOverlapInput {
  availableWidth: number;
  outsideOverflowWidth?: number;
  cardWidth: number;
  cardCount: number;
}

export interface HandLayout {
  overlap: number;
  laneExtension: number;
  edgePacked: boolean;
}

export const calculateHandLayout = ({
  availableWidth,
  outsideOverflowWidth = 0,
  cardWidth,
  cardCount,
}: HandOverlapInput): HandLayout => {
  if (cardCount <= 1 || availableWidth <= 0 || cardWidth <= 0) {
    return { overlap: 0, laneExtension: 0, edgePacked: false };
  }

  const naturalWidth =
    cardCount * cardWidth + (cardCount - 1) * HAND_CARD_GAP_PX;
  if (naturalWidth <= availableWidth) {
    return { overlap: 0, laneExtension: 0, edgePacked: false };
  }

  const laneExtension = Math.min(
    Math.max(0, outsideOverflowWidth),
    naturalWidth - availableWidth,
  );
  const usableWidth = availableWidth + laneExtension;
  const requiredOverlap = (naturalWidth - usableWidth) / (cardCount - 1);
  const maximumOverlap = Math.max(0, cardWidth - MIN_VISIBLE_CARD_WIDTH_PX);
  const overlap = Math.min(Math.max(0, requiredOverlap), maximumOverlap);
  return { overlap, laneExtension, edgePacked: true };
};

export const calculateHandOverlap = (input: HandOverlapInput): number =>
  calculateHandLayout(input).overlap;

export interface HandRowProps {
  label: string;
  cards: readonly ClientCardModel[];
  overflowDirection: HandOverflowDirection;
  selectedCardInstanceId?: string | undefined;
  cardActions?: ((instanceId: string) => readonly ClientActionModel[]) | undefined;
  actionDisabled?: boolean | undefined;
  onCardClick?: ((instanceId: string) => void) | undefined;
  onCardAction?: ((actionIndex: number) => void) | undefined;
}

export const HandRow = ({
  label,
  cards,
  overflowDirection,
  selectedCardInstanceId,
  cardActions,
  actionDisabled = false,
  onCardClick,
  onCardAction,
}: HandRowProps): React.JSX.Element => {
  const rowRef = useRef<HTMLElement | null>(null);
  const cardsRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<HandLayout>({
    overlap: 0,
    laneExtension: 0,
    edgePacked: false,
  });

  useEffect(() => {
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
        calculateHandLayout({
          availableWidth: rowElement.clientWidth,
          outsideOverflowWidth:
            overflowDirection === "left" ? rowRect.left : 0,
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
          return (
            <CardTile
              key={instanceId}
              card={card}
              selected={selectedCardInstanceId === instanceId}
              actions={cardActions?.(instanceId) ?? []}
              disabled={actionDisabled}
              onAction={onCardAction}
              onClick={
                onCardClick === undefined
                  ? undefined
                  : () => {
                      onCardClick(instanceId);
                    }
              }
            />
          );
        })}
      </div>
    </section>
  );
};
