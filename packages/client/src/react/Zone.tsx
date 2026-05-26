import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import type { ClientActionModel, ClientCardModel } from "../view-model.js";
import {
  calculateCardRowLayout,
  type CardRowLayout,
} from "./card-row-layout.js";
import { CardTile } from "./CardTile.js";

export interface ZoneProps {
  label: string;
  cards: readonly ClientCardModel[];
  size?: "normal" | "small" | "mini" | "hand";
  displayMode?: "spread" | "stack" | "overlap" | undefined;
  selectedCardInstanceId?: string | undefined;
  cardActions?: ((instanceId: string) => readonly ClientActionModel[]) | undefined;
  actionDisabled?: boolean | undefined;
  onCardClick?: ((instanceId: string) => void) | undefined;
  onCardAction?: ((actionIndex: number) => void) | undefined;
  onViewCollection?: (() => void) | undefined;
}

export const Zone = ({
  label,
  cards,
  size = "normal",
  displayMode = "spread",
  selectedCardInstanceId,
  cardActions,
  actionDisabled = false,
  onCardClick,
  onCardAction,
  onViewCollection,
}: ZoneProps): React.JSX.Element => {
  const visibleCards =
    displayMode === "stack" && cards.length > 0
      ? [cards[cards.length - 1] as ClientCardModel]
      : cards;
  const zoneRef = useRef<HTMLElement | null>(null);
  const cardsRef = useRef<HTMLDivElement | null>(null);
  const [rowLayout, setRowLayout] = useState<CardRowLayout>({
    overlap: 0,
    laneExtension: 0,
    edgePacked: false,
  });

  useLayoutEffect(() => {
    if (displayMode !== "overlap") {
      return;
    }
    const zoneElement = zoneRef.current;
    const cardsElement = cardsRef.current;
    if (zoneElement === null || cardsElement === null) {
      return;
    }

    const updateLayout = (): void => {
      const firstCard =
        cardsElement.querySelector<HTMLElement>(".card-tile-shell");
      setRowLayout(
        calculateCardRowLayout({
          availableWidth: cardsElement.clientWidth,
          cardWidth: firstCard?.getBoundingClientRect().width ?? 0,
          cardCount: visibleCards.length,
        }),
      );
    };

    updateLayout();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateLayout);
      return () => {
        window.removeEventListener("resize", updateLayout);
      };
    }

    const resizeObserver = new ResizeObserver(updateLayout);
    resizeObserver.observe(zoneElement);
    resizeObserver.observe(cardsElement);
    window.addEventListener("resize", updateLayout);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateLayout);
    };
  }, [displayMode, visibleCards.length]);

  const zoneCardsClassName = [
    "zone-cards",
    displayMode === "overlap" ? "zone-cards-overlap" : "",
    rowLayout.edgePacked ? "is-edge-packed" : "",
    rowLayout.overlap > 0 ? "is-overlapping" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const zoneCardsStyle = {
    "--card-row-overlap": `${rowLayout.overlap.toFixed(2)}px`,
  } as CSSProperties & Record<"--card-row-overlap", string>;

  return (
    <section ref={zoneRef} className={`zone zone-${size} zone-${displayMode}`}>
      <div className="zone-label">{label}</div>
      <div ref={cardsRef} className={zoneCardsClassName} style={zoneCardsStyle}>
        {visibleCards.length === 0 ? (
          <span className="empty-zone">empty</span>
        ) : (
          visibleCards.map((card) => {
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
                  displayMode === "stack" && onViewCollection !== undefined
                    ? onViewCollection
                    : onCardClick === undefined
                      ? undefined
                      : () => {
                          onCardClick(instanceId);
                        }
                }
              />
            );
          })
        )}
      </div>
    </section>
  );
};
