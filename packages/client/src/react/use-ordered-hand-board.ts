import { useCallback, useMemo, useState } from "react";

import type { PlayerId } from "@optcg/types";

import type { BoardViewModel } from "../view-model.js";
import { moveIdNear, type ReorderPlacement } from "./drag-reorder.js";
import { orderCardsByInstanceIds } from "./hand-order-model.js";

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
  const handOrderKey = `${matchScope ?? "local"}:${String(
    currentPlayerId ?? "unknown",
  )}`;
  const displayBoard = useMemo(() => {
    if (board === undefined) {
      return undefined;
    }
    return {
      ...board,
      self: {
        ...board.self,
        hand: orderCardsByInstanceIds(
          board.self.hand,
          handOrders[handOrderKey] ?? [],
        ),
      },
    };
  }, [board, handOrderKey, handOrders]);
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
