import { useEffect, useState } from "react";

import type { ReorderPlacement } from "./drag-reorder.js";

interface ReorderableCardIdentity {
  instanceId: unknown;
}

interface CardDragPreview {
  draggedInstanceId: string;
  targetInstanceId: string;
  placement: ReorderPlacement;
}

export interface CardReorderPreview {
  placeholderBefore: (instanceId: string) => boolean;
  placeholderAfter: (instanceId: string) => boolean;
  onPreviewMoveNear:
    | ((
        draggedInstanceId: string,
        targetInstanceId: string,
        placement: ReorderPlacement,
      ) => void)
    | undefined;
  onMoveNear:
    | ((
        draggedInstanceId: string,
        targetInstanceId: string,
        placement: ReorderPlacement,
      ) => void)
    | undefined;
  onReorderCancel: () => void;
}

export const useCardReorderPreview = (
  cards: readonly ReorderableCardIdentity[],
  onMoveCard:
    | ((
        draggedInstanceId: string,
        targetInstanceId: string,
        placement: ReorderPlacement,
      ) => void)
    | undefined,
): CardReorderPreview => {
  const [dragPreview, setDragPreview] = useState<CardDragPreview | undefined>(
    undefined,
  );

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

  return {
    placeholderBefore: (instanceId) =>
      dragPreview?.targetInstanceId === instanceId &&
      dragPreview.placement === "before",
    placeholderAfter: (instanceId) =>
      dragPreview?.targetInstanceId === instanceId &&
      dragPreview.placement === "after",
    onPreviewMoveNear:
      onMoveCard === undefined
        ? undefined
        : (draggedInstanceId, targetInstanceId, placement) => {
            setDragPreview({
              draggedInstanceId,
              targetInstanceId,
              placement,
            });
          },
    onMoveNear:
      onMoveCard === undefined
        ? undefined
        : (draggedInstanceId, targetInstanceId, placement) => {
            setDragPreview(undefined);
            onMoveCard(draggedInstanceId, targetInstanceId, placement);
          },
    onReorderCancel: () => {
      setDragPreview(undefined);
    },
  };
};
