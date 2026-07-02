import type {
  CardFilter,
  CardInstance,
  EffectQueueEntry,
  GameState,
  LegalAction,
  OptionalCost,
  OptionalPayCostDecision,
  PaymentOption,
} from "@optcg/types";

import {
  cardMatchesHandSelectionFilter,
  isSupportedHandSelectionCardFilter,
} from "../../actions/state.js";
import { isSupportedPublicFieldTargetFilter } from "../support-filters.js";
import {
  getReturnDonEligibleCount,
  getReturnDonEligibleInstanceIds,
} from "../../runtime/primitives/return-don.js";
import { activeDonCount } from "../segments.js";
import {
  attachDonSourceIds,
  attachDonTargetCandidates,
  type AttachDonPaymentOption,
} from "../../runtime/primitives/attach-don-cost.js";
import {
  expandMoveCardsCostRoutes,
  selectableMoveCardsCostIds,
} from "../move-card-cost-options.js";
import { chooseCombos } from "../payment-combos.js";
import {
  restFromFieldPaymentLegalActions,
  restFromFieldPaymentOption,
} from "../rest-from-field-cost-options.js";
import {
  canSetLifeFaceUp,
  selectableLifeVisibilityCardIds,
  setLifeFaceUpPaymentOption,
  turnLifeFaceUpPaymentOption,
  type SetLifeFaceUpPaymentOption,
  type TurnLifeFaceUpPaymentOption,
} from "../life-cost-options.js";
import {
  moveFieldToLifeCandidateCards,
  moveFieldToLifePaymentOptions,
} from "../../runtime/costs/move-field-to-life.js";
import { costDecisionPlayerId } from "../cost-decision-player.js";
import { hasSequenceFrameForDecision } from "../frame-decisions.js";
type ModifyPowerPaymentOption = Extract<
  OptionalPayCostDecision["paymentOptions"][number],
  { type: "modifyPower" }
>;

const canPayModifyPowerCost = (
  player: NonNullable<GameState["players"][EffectQueueEntry["controllerId"]]>,
  option: ModifyPowerPaymentOption,
): boolean =>
  option.target.type === "myLeader" &&
  (option.requiredState === undefined ||
    player.leader.state === option.requiredState) &&
  Number.isSafeInteger(option.value) &&
  option.value !== 0;

const canPayAttachDonCost = (
  state: GameState,
  playerId: EffectQueueEntry["controllerId"],
  option: AttachDonPaymentOption,
): boolean =>
  Number.isInteger(option.count) &&
  option.count > 0 &&
  attachDonSourceIds(state, playerId, option).length >= option.count &&
  attachDonTargetCandidates(state, playerId, option).length > 0;

const chooseVariableCardPaymentCombos = (
  selectableCardIds: readonly CardInstance["instanceId"][],
  option: {
    readonly count: number;
    readonly maxCount?: number | "available";
  },
): CardInstance["instanceId"][][] => {
  if (option.maxCount !== "available") {
    return chooseCombos(selectableCardIds, option.count);
  }
  const minCount = Math.max(1, option.count);
  if (selectableCardIds.length < minCount) {
    return [];
  }
  return Array.from(
    { length: selectableCardIds.length - minCount + 1 },
    (_, index) => minCount + index,
  ).flatMap((count) => chooseCombos(selectableCardIds, count));
};

const canExposeMoveCardsPaymentOption = (
  selectableCount: number,
  option: Extract<PaymentOption, { type: "moveCards" }>,
): boolean => {
  if (option.maxCount === "available") {
    return selectableCount >= Math.max(1, option.count);
  }
  return option.count > 0 && selectableCount >= option.count;
};

const supportsChooseOneTrashFilter = (
  filter: CardFilter | undefined,
): boolean => isSupportedHandSelectionCardFilter(filter);

const supportsPublicFieldCostFilter = (
  filter: CardFilter | undefined,
): boolean => isSupportedPublicFieldTargetFilter(filter);

const fieldCardMatchesFilter = (
  state: GameState,
  playerId: EffectQueueEntry["controllerId"],
  card: CardInstance,
  filter: CardFilter | undefined,
): boolean => {
  return cardMatchesHandSelectionFilter(state, playerId, card, filter);
};

const fieldTrashCandidates = (
  player: NonNullable<GameState["players"][EffectQueueEntry["controllerId"]]>,
): readonly CardInstance[] => [
  ...player.characters,
  ...(player.stage === undefined ? [] : [player.stage]),
];

const trashableSourceMatchesFilter = (
  state: GameState,
  entry: EffectQueueEntry,
  filter: CardFilter | undefined,
): boolean => {
  if (!isSupportedHandSelectionCardFilter(filter)) {
    return false;
  }
  const source = findTrashableSource(state, entry);
  return (
    source !== undefined &&
    cardMatchesHandSelectionFilter(state, entry.controllerId, source, filter)
  );
};

const chooseOneOptionId = (
  option: Extract<OptionalCost, { type: "chooseOne" }>["options"][number],
  index: number,
): string => `${option.type}:${String(index)}`;

const isSupportedChooseOneOption = (
  option: Extract<OptionalCost, { type: "chooseOne" }>["options"][number],
): boolean => {
  const optionRecord = option as Record<string, unknown>;
  const hasSupportedBaseShape =
    optionRecord["chooser"] === "self" &&
    optionRecord["optional"] === true &&
    Number.isInteger(optionRecord["count"]) &&
    (optionRecord["count"] as number) > 0;
  if (!hasSupportedBaseShape) {
    return false;
  }
  if (option.type === "trashFromHand") {
    return supportsChooseOneTrashFilter(option.filter);
  }
  if (option.type === "restDon") {
    return true;
  }
  return supportsPublicFieldCostFilter(option.filter);
};

const findRestableSource = (
  state: GameState,
  entry: EffectQueueEntry,
): CardInstance | undefined => {
  const player = state.players[entry.controllerId];
  if (player === undefined) {
    return undefined;
  }
  const candidates = [
    player.leader,
    ...player.characters,
    ...(player.stage === undefined ? [] : [player.stage]),
  ];
  return candidates.find(
    (card) =>
      card.instanceId === entry.source.instanceId &&
      card.cardId === entry.source.cardId &&
      card.controller === entry.controllerId &&
      card.state !== "rested",
  );
};

const findTrashableSource = (
  state: GameState,
  entry: EffectQueueEntry,
): CardInstance | undefined => {
  const player = state.players[entry.controllerId];
  if (player === undefined) {
    return undefined;
  }
  if (entry.source.zone?.zone === "characterArea") {
    return player.characters.find(
      (card) =>
        card.instanceId === entry.source.instanceId &&
        card.cardId === entry.source.cardId &&
        card.controller === entry.controllerId,
    );
  }
  if (entry.source.zone?.zone === "stageArea") {
    const stage = player.stage;
    return stage !== undefined &&
      stage.instanceId === entry.source.instanceId &&
      stage.cardId === entry.source.cardId &&
      stage.controller === entry.controllerId
      ? stage
      : undefined;
  }
  return undefined;
};

export const getSequencePayCostLegalActions = (
  state: GameState,
  playerId: EffectQueueEntry["controllerId"],
): LegalAction[] => {
  const decision = state.pendingDecision;
  const player = state.players[playerId];
  if (
    decision === undefined ||
    decision.type !== "payCost" ||
    decision.playerId !== playerId ||
    player === undefined ||
    !hasSequenceFrameForDecision(state, decision.id)
  ) {
    return [];
  }

  const legalPayments: LegalAction[] = [];
  for (const option of decision.paymentOptions) {
    if (option.type === "restSelf") {
      legalPayments.push({
        type: "respondToDecision",
        decisionId: decision.id,
        response: {
          type: "payment" as const,
          optionId: option.id,
        },
      });
      continue;
    }
    if (option.type === "trashSelf") {
      const causedBy = decision.causedBy;
      const entry =
        causedBy.type === "effect" && "queueEntryId" in causedBy
          ? state.effectQueue.find(
              (candidate) => candidate.id === causedBy.queueEntryId,
            )
          : undefined;
      if (
        entry === undefined ||
        !trashableSourceMatchesFilter(state, entry, option.filter)
      ) {
        continue;
      }
      legalPayments.push({
        type: "respondToDecision",
        decisionId: decision.id,
        response: {
          type: "payment" as const,
          optionId: option.id,
        },
      });
      continue;
    }
    if (option.type === "trashFromHand" || option.type === "revealFromHand") {
      if (!supportsChooseOneTrashFilter(option.filter)) {
        continue;
      }
      const selectableCardIds = player.hand
        .filter((card) =>
          cardMatchesHandSelectionFilter(state, playerId, card, option.filter),
        )
        .map((card) => card.instanceId);
      legalPayments.push(
        ...chooseVariableCardPaymentCombos(selectableCardIds, option).map(
          (combo) => ({
            type: "respondToDecision" as const,
            decisionId: decision.id,
            response: {
              type: "payment" as const,
              optionId: option.id,
              selectedCardInstanceIds: combo,
            },
          }),
        ),
      );
      continue;
    }
    if (option.type === "trashFromField" || option.type === "koFromField") {
      if (!supportsPublicFieldCostFilter(option.filter)) {
        continue;
      }
      const fieldFilter = option.filter;
      const selectableCardIds = fieldTrashCandidates(player)
        .filter((card) =>
          fieldCardMatchesFilter(state, playerId, card, fieldFilter),
        )
        .map((card) => card.instanceId);
      legalPayments.push(
        ...chooseVariableCardPaymentCombos(selectableCardIds, option).map(
          (combo) => ({
            type: "respondToDecision" as const,
            decisionId: decision.id,
            response: {
              type: "payment" as const,
              optionId: option.id,
              selectedCardInstanceIds: combo,
            },
          }),
        ),
      );
      continue;
    }
    if (option.type === "restFromField") {
      legalPayments.push(
        ...restFromFieldPaymentLegalActions(
          state,
          playerId,
          player,
          decision.id,
          option,
        ),
      );
      continue;
    }
    if (option.type === "moveCards") {
      const selectableCardIds = selectableMoveCardsCostIds(
        state,
        playerId,
        player,
        option,
      );
      if (selectableCardIds === undefined) {
        continue;
      }
      legalPayments.push(
        ...chooseCombos(selectableCardIds, option.count).map((combo) => ({
          type: "respondToDecision" as const,
          decisionId: decision.id,
          response: {
            type: "payment" as const,
            optionId: option.id,
            selectedCardInstanceIds: combo,
          },
        })),
      );
      continue;
    }
    if (option.type === "moveFieldToLife") {
      const selectableCardIds = moveFieldToLifeCandidateCards(
        state,
        playerId,
        option,
      ).map((card) => card.instanceId);
      legalPayments.push(
        ...chooseCombos(selectableCardIds, option.count).map((combo) => ({
          type: "respondToDecision" as const,
          decisionId: decision.id,
          response: {
            type: "payment" as const,
            optionId: option.id,
            selectedCardInstanceIds: combo,
          },
        })),
      );
      continue;
    }
    if (option.type === "turnLifeFaceUp" || option.type === "setLifeFaceUp") {
      if (
        option.position === "anyMatching" ||
        option.position === "topOrBottom"
      ) {
        const selectableCardIds = selectableLifeVisibilityCardIds(
          player,
          option,
        );
        legalPayments.push(
          ...chooseCombos(selectableCardIds, option.count).map((combo) => ({
            type: "respondToDecision" as const,
            decisionId: decision.id,
            response: {
              type: "payment" as const,
              optionId: option.id,
              selectedCardInstanceIds: combo,
            },
          })),
        );
        continue;
      }
      if (canSetLifeFaceUp(player, option)) {
        legalPayments.push({
          type: "respondToDecision",
          decisionId: decision.id,
          response: {
            type: "payment" as const,
            optionId: option.id,
          },
        });
      }
      continue;
    }
    if (option.type === "modifyPower") {
      if (canPayModifyPowerCost(player, option)) {
        legalPayments.push({
          type: "respondToDecision",
          decisionId: decision.id,
          response: {
            type: "payment" as const,
            optionId: option.id,
          },
        });
      }
      continue;
    }
    if (option.type === "restDon" || option.type === "returnDon") {
      const selectableDonIds =
        option.type === "returnDon"
          ? getReturnDonEligibleInstanceIds(player, option.sourceState)
          : player.costArea
              .filter((card) => card.state === "active")
              .map((card) => card.instanceId);
      legalPayments.push(
        ...chooseCombos(selectableDonIds, option.count).map((combo) => ({
          type: "respondToDecision" as const,
          decisionId: decision.id,
          response: {
            type: "payment" as const,
            optionId: option.id,
            selectedDonInstanceIds: combo,
          },
        })),
      );
      continue;
    }
    if (option.type === "attachDon") {
      const selectableDonIds = attachDonSourceIds(state, playerId, option);
      const targetCandidates = attachDonTargetCandidates(
        state,
        playerId,
        option,
      );
      legalPayments.push(
        ...chooseCombos(selectableDonIds, option.count).flatMap((combo) =>
          targetCandidates.map((target) => ({
            type: "respondToDecision" as const,
            decisionId: decision.id,
            response: {
              type: "payment" as const,
              optionId: option.id,
              selectedDonInstanceIds: combo,
              selectedCardInstanceIds: [target.instanceId],
            },
          })),
        ),
      );
    }
  }

  return [
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "paymentDeclined" },
    },
    ...legalPayments,
  ];
};

export const getSequenceOptionalPayCostOptions = (
  state: GameState,
  entry: EffectQueueEntry,
  cost: OptionalCost,
): PaymentOption[] => {
  const paymentOptions: PaymentOption[] = [];
  const paymentPlayerId = costDecisionPlayerId(state, entry, cost);
  const currentPlayer = state.players[paymentPlayerId];

  if (cost.type === "restSelf") {
    if (findRestableSource(state, entry) !== undefined) {
      paymentOptions.push({
        id: "restSelf",
        type: "restSelf",
      });
    }
    return paymentOptions;
  }
  if (cost.type === "trashSelf") {
    if (trashableSourceMatchesFilter(state, entry, cost.filter)) {
      paymentOptions.push({
        id: "trashSelf",
        type: "trashSelf",
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
      });
    }
    return paymentOptions;
  }
  if (cost.type === "restDon") {
    if (activeDonCount(state, paymentPlayerId) >= cost.count) {
      paymentOptions.push({
        id: "restDon",
        type: "restDon",
        count: cost.count,
        ...(cost.maxCount === undefined ? {} : { maxCount: cost.maxCount }),
      });
    }
    return paymentOptions;
  }
  if (cost.type === "restFromField") {
    const option = restFromFieldPaymentOption(
      state,
      entry,
      cost,
      currentPlayer,
    );
    if (option !== undefined) {
      paymentOptions.push(option);
    }
    return paymentOptions;
  }
  if (cost.type === "attachDon") {
    const option: AttachDonPaymentOption = {
      id: "attachDon",
      type: "attachDon",
      count: cost.count,
      ...(cost.sourcePlayer === undefined
        ? {}
        : { sourcePlayer: cost.sourcePlayer }),
      sourceState: cost.sourceState,
      target: cost.target,
    };
    if (canPayAttachDonCost(state, entry.controllerId, option)) {
      paymentOptions.push(option);
    }
    return paymentOptions;
  }
  if (cost.type === "returnDon") {
    const returnDonEligibleCount =
      currentPlayer === undefined
        ? 0
        : getReturnDonEligibleCount(currentPlayer, cost.sourceState);
    if (returnDonEligibleCount >= cost.count) {
      paymentOptions.push({
        id: "returnDon",
        type: "returnDon",
        count: cost.count,
        ...(cost.maxCount === undefined ? {} : { maxCount: cost.maxCount }),
        ...(cost.sourceState === undefined
          ? {}
          : { sourceState: cost.sourceState }),
      });
    }
    return paymentOptions;
  }
  if (cost.type === "trashFromHand" || cost.type === "revealFromHand") {
    const matchingHandCount =
      currentPlayer?.hand.filter((card) =>
        cardMatchesHandSelectionFilter(
          state,
          paymentPlayerId,
          card,
          cost.filter,
        ),
      ).length ?? 0;
    if (matchingHandCount >= cost.count) {
      paymentOptions.push({
        id: cost.type,
        type: cost.type,
        count: cost.count,
        ...(cost.type === "trashFromHand" && cost.maxCount !== undefined
          ? { maxCount: cost.maxCount }
          : {}),
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
      });
    }
    return paymentOptions;
  }
  if (cost.type === "trashFromField" || cost.type === "koFromField") {
    if (!supportsPublicFieldCostFilter(cost.filter)) {
      return paymentOptions;
    }
    const fieldMatchCount =
      currentPlayer === undefined
        ? 0
        : fieldTrashCandidates(currentPlayer).filter((card) =>
            fieldCardMatchesFilter(state, paymentPlayerId, card, cost.filter),
          ).length;
    if (fieldMatchCount >= cost.count) {
      paymentOptions.push({
        id: cost.type,
        type: cost.type,
        count: cost.count,
        ...(cost.filter === undefined ? {} : { filter: cost.filter }),
      });
    }
    return paymentOptions;
  }
  if (cost.type === "moveCards") {
    for (const route of expandMoveCardsCostRoutes(
      cost,
      entry.source.instanceId,
    )) {
      const selectable =
        currentPlayer === undefined
          ? undefined
          : selectableMoveCardsCostIds(
              state,
              paymentPlayerId,
              currentPlayer,
              route,
            );
      if (
        selectable !== undefined &&
        Number.isInteger(route.count) &&
        canExposeMoveCardsPaymentOption(selectable.length, route)
      ) {
        paymentOptions.push({
          id: route.id,
          type: "moveCards",
          count: route.count,
          ...(route.maxCount === undefined ? {} : { maxCount: route.maxCount }),
          from: route.from,
          to: route.to,
          ...(route.filter === undefined ? {} : { filter: route.filter }),
          ...(route.destinationState === undefined
            ? {}
            : { destinationState: route.destinationState }),
          ...(route.sourceInstanceId === undefined
            ? {}
            : { sourceInstanceId: route.sourceInstanceId }),
        });
      }
    }
    return paymentOptions;
  }
  if (cost.type === "moveFieldToLife") {
    for (const option of moveFieldToLifePaymentOptions(cost)) {
      if (
        Number.isInteger(option.count) &&
        option.count > 0 &&
        moveFieldToLifeCandidateCards(state, paymentPlayerId, option).length >=
          option.count
      ) {
        paymentOptions.push(option);
      }
    }
    return paymentOptions;
  }
  if (cost.type === "shuffleDeck") {
    if (cost.player === "self" && currentPlayer !== undefined) {
      paymentOptions.push({
        id: "shuffleDeck",
        type: "shuffleDeck",
        player: cost.player,
      });
    }
    return paymentOptions;
  }
  if (cost.type === "turnLifeFaceUp") {
    const option: TurnLifeFaceUpPaymentOption =
      turnLifeFaceUpPaymentOption(cost);
    if (
      currentPlayer !== undefined &&
      canSetLifeFaceUp(currentPlayer, option)
    ) {
      paymentOptions.push(option);
    }
    return paymentOptions;
  }
  if (cost.type === "setLifeFaceUp") {
    const option: SetLifeFaceUpPaymentOption = setLifeFaceUpPaymentOption(cost);
    if (
      currentPlayer !== undefined &&
      canSetLifeFaceUp(currentPlayer, option)
    ) {
      paymentOptions.push(option);
    }
    return paymentOptions;
  }
  if (cost.type === "modifyPower") {
    const option: ModifyPowerPaymentOption = {
      id: "modifyPower:myLeader",
      type: "modifyPower",
      target: cost.target,
      ...(cost.requiredState === undefined
        ? {}
        : { requiredState: cost.requiredState }),
      value: cost.value,
      duration: cost.duration,
    };
    if (
      currentPlayer !== undefined &&
      canPayModifyPowerCost(currentPlayer, option)
    ) {
      paymentOptions.push(option);
    }
    return paymentOptions;
  }
  if (cost.type !== "chooseOne") {
    return paymentOptions;
  }

  for (const [index, option] of cost.options.entries()) {
    if (!isSupportedChooseOneOption(option)) {
      return [];
    }
    if (option.type === "trashFromHand") {
      if (!supportsChooseOneTrashFilter(option.filter)) {
        return [];
      }
      const matchingHandCount =
        currentPlayer?.hand.filter((card) =>
          cardMatchesHandSelectionFilter(
            state,
            paymentPlayerId,
            card,
            option.filter,
          ),
        ).length ?? 0;
      if (matchingHandCount < option.count) {
        continue;
      }
      paymentOptions.push({
        id: chooseOneOptionId(option, index),
        type: "trashFromHand",
        count: option.count,
        ...(option.filter === undefined ? {} : { filter: option.filter }),
      });
      continue;
    }
    if (option.type === "restDon") {
      if (activeDonCount(state, paymentPlayerId) < option.count) {
        continue;
      }
      paymentOptions.push({
        id: chooseOneOptionId(option, index),
        type: "restDon",
        count: option.count,
        ...(option.maxCount === undefined ? {} : { maxCount: option.maxCount }),
      });
      continue;
    }
    if (option.type === "restFromField") {
      const restOption = restFromFieldPaymentOption(
        state,
        entry,
        option,
        currentPlayer,
      );
      if (restOption === undefined) {
        continue;
      }
      paymentOptions.push({
        ...restOption,
        id: chooseOneOptionId(option, index),
      });
      continue;
    }
    if (!supportsPublicFieldCostFilter(option.filter)) {
      return [];
    }
    const fieldFilter = option.filter;
    const fieldMatchCount =
      currentPlayer === undefined
        ? 0
        : fieldTrashCandidates(currentPlayer).filter((card) =>
            fieldCardMatchesFilter(state, paymentPlayerId, card, fieldFilter),
          ).length;
    if (fieldMatchCount < option.count) {
      continue;
    }
    paymentOptions.push({
      id: chooseOneOptionId(option, index),
      type: "trashFromField",
      count: option.count,
      ...(fieldFilter === undefined ? {} : { filter: fieldFilter }),
    });
  }
  return paymentOptions;
};
