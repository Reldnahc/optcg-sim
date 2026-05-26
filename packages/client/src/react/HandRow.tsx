import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import type { ClientActionModel, ClientCardModel } from "../view-model.js";
import { CardTile } from "./CardTile.js";

const HAND_CARD_GAP_PX = 5;
const MIN_VISIBLE_CARD_WIDTH_PX = 18;

export type HandOverflowDirection = "left" | "right";

export interface HandOverlapInput {
  availableWidth: number;
  cardWidth: number;
  cardCount: number;
}

export const calculateHandOverlap = ({
  availableWidth,
  cardWidth,
  cardCount,
}: HandOverlapInput): number => {
  if (cardCount <= 1 || availableWidth <= 0 || cardWidth <= 0) {
    return 0;
  }

  const naturalWidth =
    cardCount * cardWidth + (cardCount - 1) * HAND_CARD_GAP_PX;
  if (naturalWidth <= availableWidth) {
    return 0;
  }

  const requiredOverlap = (naturalWidth - availableWidth) / (cardCount - 1);
  const maximumOverlap = Math.max(0, cardWidth - MIN_VISIBLE_CARD_WIDTH_PX);
  return Math.min(requiredOverlap, maximumOverlap);
};

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
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    const rowElement = rowRef.current;
    const cardsElement = cardsRef.current;
    if (rowElement === null || cardsElement === null) {
      return;
    }

    const updateOverlap = (): void => {
      const firstCard =
        cardsElement.querySelector<HTMLElement>(".card-tile-shell");
      setOverlap(
        calculateHandOverlap({
          availableWidth: rowElement.clientWidth,
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
    return () => {
      resizeObserver.disconnect();
    };
  }, [cards.length]);

  const handCardsClassName = [
    "hand-cards",
    `hand-cards-overlap-${overflowDirection}`,
    overlap > 0 ? "is-overlapping" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const handStyle = {
    "--hand-overlap": `${overlap.toFixed(2)}px`,
  } as CSSProperties & Record<"--hand-overlap", string>;

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
