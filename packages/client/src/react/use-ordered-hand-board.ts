import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PlayerId } from "@optcg/types";

import type { BoardViewModel } from "../view-model.js";
import { moveIdNear, type ReorderPlacement } from "./drag-reorder.js";
import {
  orderCardsByInstanceIds,
  reconcileContinuousHandOrder,
} from "./hand-order-model.js";

export interface OrderedHandBoardController {
  displayBoard: BoardViewModel | undefined;
  moveHandCard: (
    draggedInstanceId: string,
    targetInstanceId: string,
    placement: ReorderPlacement,
  ) => void;
}

export const useOrderedHandBoard = ({
  board,
  matchScope,
  currentPlayerId,
}: {
  board: BoardViewModel | undefined;
  matchScope: string | undefined;
  currentPlayerId: PlayerId | undefined;
}): OrderedHandBoardController => {
  const [handOrders, setHandOrders] = useState<Record<string, string[]>>({});
  const previousHandRef = useRef<
    | {
        key: string;
        instanceIds: string[];
      }
    | undefined
  >(undefined);
  const handOrderKey = `${matchScope ?? "local"}:${String(
    currentPlayerId ?? "unknown",
  )}`;
  const currentHandInstanceIds = useMemo(
    () => board?.self.hand.map((card) => String(card.instanceId)) ?? [],
    [board?.self.hand],
  );
  useEffect(() => {
    if (board === undefined) {
      previousHandRef.current = undefined;
      return;
    }
    const previousHandIds =
      previousHandRef.current?.key === handOrderKey
        ? previousHandRef.current.instanceIds
        : undefined;
    setHandOrders((current) => {
      const rememberedOrder = current[handOrderKey];
      if (rememberedOrder === undefined) {
        return current;
      }
      const nextOrder = reconcileContinuousHandOrder({
        currentHandIds: currentHandInstanceIds,
        previousHandIds,
        rememberedOrder,
      });
      if (
        nextOrder.length === rememberedOrder.length &&
        nextOrder.every(
          (instanceId, index) => rememberedOrder[index] === instanceId,
        )
      ) {
        return current;
      }
      return {
        ...current,
        [handOrderKey]: nextOrder,
      };
    });
    previousHandRef.current = {
      key: handOrderKey,
      instanceIds: currentHandInstanceIds,
    };
  }, [board, currentHandInstanceIds, handOrderKey]);
  const displayBoard = useMemo(() => {
    if (board === undefined) {
      return undefined;
    }
    const previousHandIds =
      previousHandRef.current?.key === handOrderKey
        ? previousHandRef.current.instanceIds
        : undefined;
    const visibleHandOrder = reconcileContinuousHandOrder({
      currentHandIds: currentHandInstanceIds,
      previousHandIds,
      rememberedOrder: handOrders[handOrderKey] ?? [],
    });
    return {
      ...board,
      self: {
        ...board.self,
        hand: orderCardsByInstanceIds(board.self.hand, visibleHandOrder),
      },
    };
  }, [board, currentHandInstanceIds, handOrderKey, handOrders]);
  const moveHandCard = useCallback(
    (
      draggedInstanceId: string,
      targetInstanceId: string,
      placement: ReorderPlacement,
    ): void => {
      if (board === undefined) {
        return;
      }
      setHandOrders((current) => {
        const currentOrder = orderCardsByInstanceIds(
          board.self.hand,
          current[handOrderKey] ?? [],
        ).map((card) => String(card.instanceId));
        return {
          ...current,
          [handOrderKey]: moveIdNear(
            currentOrder,
            draggedInstanceId,
            targetInstanceId,
            placement,
          ),
        };
      });
    },
    [board, handOrderKey],
  );

  return { displayBoard, moveHandCard };
};
