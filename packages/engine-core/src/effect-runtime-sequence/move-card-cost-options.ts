import type {
  CardInstance,
  EffectQueueEntry,
  GameState,
  InstanceId,
  OptionalCost,
  OptionalPayCostDecision,
  PlayerId,
} from "@optcg/types";

import { cardMatchesHandSelectionFilter } from "../actions/state.js";

export type MoveCardsPaymentOption = Extract<
  OptionalPayCostDecision["paymentOptions"][number],
  { type: "moveCards" }
>;

type PlayerState = NonNullable<
  GameState["players"][EffectQueueEntry["controllerId"]]
>;

export const expandMoveCardsCostRoutes = (
  cost: Extract<OptionalCost, { type: "moveCards" }>,
  sourceInstanceId?: InstanceId,
): MoveCardsPaymentOption[] => {
  if (
    !isMoveCardsCostRouteOwnedByChooser(cost) ||
    !isSupportedMoveCardsCostCount(cost)
  ) {
    return [];
  }
  const countFields = {
    count: cost.count,
    ...(cost.maxCount === undefined ? {} : { maxCount: cost.maxCount }),
  };
  if (
    cost.from.zone === "trash" &&
    cost.from.position === undefined &&
    cost.to.zone === "deck" &&
    (cost.to.position === undefined || cost.to.position === "bottom")
  ) {
    return [
      {
        id: "moveCards",
        type: "moveCards",
        ...countFields,
        from: {
          player: cost.from.player,
          zone: cost.from.zone,
          ...(cost.from.source === undefined
            ? {}
            : { source: cost.from.source }),
        },
        to: cost.to,
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
        ...(cost.from.source === undefined || sourceInstanceId === undefined
          ? {}
          : { sourceInstanceId }),
      },
    ];
  }
  if (
    cost.from.zone === "deck" &&
    cost.from.position === "top" &&
    cost.to.zone === "trash" &&
    cost.to.position === undefined
  ) {
    return [
      {
        id: "moveCards",
        type: "moveCards",
        ...countFields,
        from: {
          player: cost.from.player,
          zone: cost.from.zone,
          position: "top",
        },
        to: cost.to,
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
      },
    ];
  }
  if (
    cost.from.zone === "hand" &&
    cost.from.position === undefined &&
    cost.to.zone === "deck" &&
    (cost.to.position === "top" || cost.to.position === "bottom")
  ) {
    return [
      {
        id: "moveCards",
        type: "moveCards",
        ...countFields,
        from: {
          player: cost.from.player,
          zone: cost.from.zone,
          ...(cost.from.source === undefined
            ? {}
            : { source: cost.from.source }),
        },
        to: cost.to,
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
        ...(cost.from.source === undefined || sourceInstanceId === undefined
          ? {}
          : { sourceInstanceId }),
      },
    ];
  }
  if (
    (cost.from.zone === "characterArea" || cost.from.zone === "stageArea") &&
    cost.from.position === undefined &&
    ((cost.to.zone === "deck" && cost.to.position === "bottom") ||
      (cost.to.zone === "hand" && cost.to.position === undefined))
  ) {
    return [
      {
        id: "moveCards",
        type: "moveCards",
        ...countFields,
        from: {
          player: cost.from.player,
          zone: cost.from.zone,
          ...(cost.from.source === undefined
            ? {}
            : { source: cost.from.source }),
        },
        to: cost.to,
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
        ...(cost.from.source === undefined || sourceInstanceId === undefined
          ? {}
          : { sourceInstanceId }),
        ...(cost.destinationState === undefined
          ? {}
          : { destinationState: cost.destinationState }),
      },
    ];
  }
  if (
    cost.from.zone === "costArea" &&
    cost.from.position === undefined &&
    cost.to.zone === "costArea" &&
    cost.to.position === undefined &&
    cost.destinationState === "rested" &&
    cost.filter?.state === "attached"
  ) {
    return [
      {
        id: "moveCards",
        type: "moveCards",
        ...countFields,
        from: { player: cost.from.player, zone: cost.from.zone },
        to: cost.to,
        filter: cost.filter,
        destinationState: cost.destinationState,
      },
    ];
  }
  if (
    cost.from.zone !== "life" ||
    (cost.to.zone !== "hand" && cost.to.zone !== "trash") ||
    cost.to.position !== undefined
  ) {
    return [];
  }
  const positions =
    cost.from.position === "topOrBottom"
      ? (["top", "bottom"] as const)
      : cost.from.position === "top" || cost.from.position === "bottom"
        ? ([cost.from.position] as const)
        : [];
  return positions.map((position) => ({
    id: `moveCards:${position}`,
    type: "moveCards",
    ...countFields,
    from: { ...cost.from, position },
    to: cost.to,
  }));
};

export const selectableMoveCardsCostIds = (
  state: GameState,
  playerId: PlayerId,
  player: PlayerState,
  option: MoveCardsPaymentOption,
): CardInstance["instanceId"][] | undefined => {
  if (!isConcreteSamePlayerRoute(option) || option.count <= 0) {
    if (option.maxCount !== "available" || option.count < 0) {
      return undefined;
    }
  }
  if (!isConcreteSamePlayerRoute(option)) {
    return undefined;
  }
  if (
    option.from.zone === "trash" &&
    option.from.position === undefined &&
    option.to.zone === "deck" &&
    (option.to.position === undefined || option.to.position === "bottom")
  ) {
    return player.trash
      .filter((card) =>
        cardMatchesHandSelectionFilter(state, playerId, card, option.filter),
      )
      .map((card) => card.instanceId);
  }
  if (
    option.from.zone === "hand" &&
    option.from.position === undefined &&
    option.to.zone === "deck" &&
    (option.to.position === "top" || option.to.position === "bottom")
  ) {
    return player.hand
      .filter((card) =>
        cardMatchesHandSelectionFilter(state, playerId, card, option.filter),
      )
      .map((card) => card.instanceId);
  }
  if (
    option.from.zone === "deck" &&
    option.from.position === "top" &&
    option.to.zone === "trash" &&
    option.to.position === undefined
  ) {
    return player.deck
      .slice(0, option.count)
      .filter((card) =>
        cardMatchesHandSelectionFilter(state, playerId, card, option.filter),
      )
      .map((card) => card.instanceId);
  }
  if (
    option.from.zone === "characterArea" &&
    option.from.position === undefined &&
    ((option.to.zone === "deck" && option.to.position === "bottom") ||
      (option.to.zone === "hand" && option.to.position === undefined))
  ) {
    if (option.from.source === "effectSource") {
      return option.sourceInstanceId === undefined
        ? []
        : player.characters
            .filter(
              (card) =>
                card.instanceId === option.sourceInstanceId &&
                cardMatchesHandSelectionFilter(
                  state,
                  playerId,
                  card,
                  option.filter,
                ),
            )
            .map((card) => card.instanceId);
    }
    return player.characters
      .filter((card) =>
        cardMatchesHandSelectionFilter(state, playerId, card, option.filter),
      )
      .map((card) => card.instanceId);
  }
  if (
    option.from.zone === "stageArea" &&
    option.from.position === undefined &&
    ((option.to.zone === "deck" && option.to.position === "bottom") ||
      (option.to.zone === "hand" && option.to.position === undefined))
  ) {
    if (option.from.source === "effectSource") {
      return player.stage !== undefined &&
        option.sourceInstanceId !== undefined &&
        player.stage.instanceId === option.sourceInstanceId &&
        cardMatchesHandSelectionFilter(
          state,
          playerId,
          player.stage,
          option.filter,
        )
        ? [player.stage.instanceId]
        : [];
    }
    return player.stage !== undefined &&
      cardMatchesHandSelectionFilter(
        state,
        playerId,
        player.stage,
        option.filter,
      )
      ? [player.stage.instanceId]
      : [];
  }
  if (
    option.from.zone === "costArea" &&
    option.from.position === undefined &&
    option.to.zone === "costArea" &&
    option.to.position === undefined &&
    option.destinationState === "rested" &&
    option.filter?.state === "attached"
  ) {
    return player.costArea
      .filter((card) =>
        cardMatchesAttachedDonMoveCardsFilter(state, playerId, player, card),
      )
      .map((card) => card.instanceId);
  }
  if (
    option.from.zone === "life" &&
    (option.to.zone === "hand" || option.to.zone === "trash") &&
    option.to.position === undefined
  ) {
    if (option.from.position === "top") {
      const card = player.life[0]?.card;
      return card === undefined ? [] : [card.instanceId];
    }
    if (option.from.position === "bottom") {
      const card = player.life.at(-1)?.card;
      return card === undefined ? [] : [card.instanceId];
    }
  }
  return undefined;
};

const cardMatchesAttachedDonMoveCardsFilter = (
  state: GameState,
  playerId: PlayerId,
  player: PlayerState,
  card: CardInstance,
): boolean => {
  const attachedDonIds = new Set([
    ...player.leader.attachedDon,
    ...player.characters.flatMap((character) => character.attachedDon),
  ]);
  return (
    attachedDonIds.has(card.instanceId) &&
    (state.players[playerId]?.costArea.some(
      (candidate) => candidate.instanceId === card.instanceId,
    ) ??
      false)
  );
};

const isMoveCardsCostRouteOwnedByChooser = (
  cost: Extract<OptionalCost, { type: "moveCards" }>,
): boolean =>
  isConcreteSamePlayerRoute(cost) && cost.chooser === cost.from.player;

const isConcreteSamePlayerRoute = (route: {
  readonly from: { readonly player: OptionalCostPlayerRef };
  readonly to: { readonly player: OptionalCostPlayerRef };
}): boolean =>
  route.from.player === route.to.player &&
  (route.from.player === "self" || route.from.player === "opponent");

type OptionalCostPlayerRef = Extract<
  OptionalCost,
  { type: "moveCards" }
>["from"]["player"];

const isSupportedMoveCardsCostCount = (
  cost: Extract<OptionalCost, { type: "moveCards" }>,
): boolean => {
  if (cost.maxCount === "available") {
    return Number.isInteger(cost.count) && cost.count >= 0;
  }
  return Number.isInteger(cost.count) && cost.count > 0;
};
