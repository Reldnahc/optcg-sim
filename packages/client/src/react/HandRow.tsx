import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import type { ClientActionModel, ClientCardModel } from "../view-model.js";
import {
  calculateCardRowLayout,
  type CardRowLayout,
} from "./card-row-layout.js";
import { CardTile } from "./CardTile.js";

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
  selectedDonInstanceIds?: readonly string[] | undefined;
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
  selectedDonInstanceIds = [],
  cardActions,
  actionDisabled = false,
  onCardClick,
  onCardAction,
}: HandRowProps): React.JSX.Element => {
  const rowRef = useRef<HTMLElement | null>(null);
  const cardsRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<CardRowLayout>({
    overlap: 0,
    laneExtension: 0,
    edgePacked: false,
  });

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
          laneExtensionWidth:
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
              selectedDonInstanceIds={selectedDonInstanceIds}
              actions={cardActions?.(instanceId) ?? []}
              disabled={actionDisabled}
              onAction={onCardAction}
              onAttachedDonClick={onCardClick}
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
