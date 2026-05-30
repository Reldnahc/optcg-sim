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
  displayMode?: "spread" | "stack" | "overlap" | "slots" | "life" | undefined;
  stackCount?: number | undefined;
  slotCount?: number | undefined;
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
  onViewCollection?: (() => void) | undefined;
}

export const Zone = ({
  label,
  cards,
  size = "normal",
  displayMode = "spread",
  stackCount,
  slotCount = 0,
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
  onViewCollection,
}: ZoneProps): React.JSX.Element => {
  const visibleCards =
    displayMode === "stack" && cards.length > 0
      ? [cards[0] as ClientCardModel]
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
    displayMode === "slots" ? "zone-cards-slots" : "",
    displayMode === "life" ? "zone-cards-life" : "",
    rowLayout.edgePacked ? "is-edge-packed" : "",
    rowLayout.overlap > 0 ? "is-overlapping" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const zoneCardsStyle = {
    "--card-row-overlap": `${rowLayout.overlap.toFixed(2)}px`,
  } as CSSProperties & Record<"--card-row-overlap", string>;
  const lifeCardStyle = (index: number, count: number): CSSProperties => {
    const yStep = count <= 5 ? 12 : Math.max(6, 16 - count);
    return {
      "--life-card-y-offset": `${String(index * yStep)}%`,
      zIndex: count - index,
    } as CSSProperties & Record<"--life-card-y-offset", string>;
  };
  const displayedStackCount = stackCount ?? cards.length;

  return (
    <section ref={zoneRef} className={`zone zone-${size} zone-${displayMode}`}>
      <div className="zone-label">{label}</div>
      {displayMode === "stack" ? (
        <div
          className="count-badge is-hover-revealed stack-count"
          aria-label={`${label} count: ${String(displayedStackCount)}`}
        >
          {displayedStackCount}
        </div>
      ) : null}
      {displayMode === "stack" &&
      visibleCards.length === 0 &&
      onViewCollection !== undefined ? (
        <button
          className="zone-stack-open-button"
          type="button"
          aria-label={`Open ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            onViewCollection();
          }}
        />
      ) : null}
      <div ref={cardsRef} className={zoneCardsClassName} style={zoneCardsStyle}>
        {displayMode === "slots"
          ? Array.from({ length: slotCount }, (_, index) => {
              const card = visibleCards[index];
              if (card === undefined) {
                return (
                  <div
                    key={`empty-slot-${String(index)}`}
                    className="zone-card-slot is-empty"
                  />
                );
              }
              const instanceId = String(card.instanceId);
              return (
                <div key={instanceId} className="zone-card-slot">
                  <CardTile
                    card={card}
                    selected={
                      selectedCardInstanceId === instanceId ||
                      decisionSelectedInstanceIds.includes(instanceId)
                    }
                    pendingChoice={pendingChoiceInstanceIds.includes(
                      instanceId,
                    )}
                    selectedDonInstanceIds={selectedDonInstanceIds}
                    active={activeCardInstanceIds.includes(instanceId)}
                    actions={cardActions?.(instanceId) ?? []}
                    disabled={actionDisabled}
                    onAction={onCardAction}
                    onAttachedDonClick={onCardClick}
                    onHover={onCardPreview}
                    onClick={
                      onCardClick === undefined
                        ? undefined
                        : () => {
                            onCardClick(instanceId);
                          }
                    }
                  />
                </div>
              );
            })
          : displayMode === "life"
            ? visibleCards.map((card, index) => {
                const instanceId = String(card.instanceId);
                return (
                  <div
                    key={instanceId}
                    className="life-card-position"
                    style={lifeCardStyle(index, visibleCards.length)}
                  >
                    <CardTile
                      card={card}
                      selected={decisionSelectedInstanceIds.includes(
                        instanceId,
                      )}
                      pendingChoice={pendingChoiceInstanceIds.includes(
                        instanceId,
                      )}
                      disabled={actionDisabled}
                      onHover={onCardPreview}
                      onClick={
                        onCardClick === undefined
                          ? undefined
                          : () => {
                              onCardClick(instanceId);
                            }
                      }
                    />
                  </div>
                );
              })
            : visibleCards.map((card) => {
                const instanceId = String(card.instanceId);
                return (
                  <CardTile
                    key={instanceId}
                    card={card}
                    selected={
                      selectedCardInstanceId === instanceId ||
                      decisionSelectedInstanceIds.includes(instanceId)
                    }
                    pendingChoice={pendingChoiceInstanceIds.includes(
                      instanceId,
                    )}
                    selectedDonInstanceIds={selectedDonInstanceIds}
                    active={activeCardInstanceIds.includes(instanceId)}
                    actions={cardActions?.(instanceId) ?? []}
                    disabled={actionDisabled}
                    onAction={onCardAction}
                    onAttachedDonClick={onCardClick}
                    onHover={onCardPreview}
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
              })}
      </div>
    </section>
  );
};
