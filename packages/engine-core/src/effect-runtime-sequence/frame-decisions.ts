import type {
  CardFilter,
  ChooseEffectOptionDecision,
  CardInstance,
  ChooseQuantityDecision,
  ChooseOptionalActivationDecision,
  Effect,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  LegalAction,
  OptionalCost,
  OptionalPayCostDecision,
  PayCostDecision,
  PlayerId,
} from "@optcg/types";

import { appendEvent, toDecisionId, toStateSeq } from "../action-results.js";
import {
  cardMatchesHandSelectionFilter,
  isSupportedHandSelectionCardFilter,
} from "../actions/state.js";
import {
  getReturnDonEligibleCount,
  getReturnDonEligibleInstanceIds,
} from "../runtime/primitives/return-don.js";
import { chooseQuantityPromptForEffect } from "../effect-runtime-quantity-prompts.js";
import { activeDonCount } from "./segments.js";
import {
  attachDonTargetCandidates,
  type AttachDonPaymentOption,
} from "../runtime/primitives/attach-don-cost.js";
import {
  expandMoveCardsCostRoutes,
  selectableMoveCardsCostIds,
} from "./move-card-cost-options.js";

const decisionCauseForEntry = (entry: EffectQueueEntry) =>
  ({
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  }) as const;

type TurnLifeFaceUpPaymentOption = Extract<
  OptionalPayCostDecision["paymentOptions"][number],
  { type: "turnLifeFaceUp" }
>;
type ModifyPowerPaymentOption = Extract<
  OptionalPayCostDecision["paymentOptions"][number],
  { type: "modifyPower" }
>;

const canTurnLifeFaceUp = (
  player: NonNullable<GameState["players"][EffectQueueEntry["controllerId"]]>,
  option: TurnLifeFaceUpPaymentOption,
): boolean => {
  if (
    option.player !== "self" ||
    !Number.isInteger(option.count) ||
    option.count <= 0
  ) {
    return false;
  }
  const selected =
    option.position === "top"
      ? player.life.slice(0, option.count)
      : player.life.slice(Math.max(0, player.life.length - option.count));
  return (
    selected.length === option.count &&
    selected.every((lifeCard) => !lifeCard.faceUp)
  );
};

const canPayModifyPowerCost = (
  player: NonNullable<GameState["players"][EffectQueueEntry["controllerId"]]>,
  option: ModifyPowerPaymentOption,
): boolean =>
  option.target.type === "myLeader" &&
  (option.requiredState === undefined ||
    player.leader.state === option.requiredState) &&
  Number.isSafeInteger(option.value) &&
  option.value !== 0;

const attachDonSourceIds = (
  player: NonNullable<GameState["players"][EffectQueueEntry["controllerId"]]>,
  option: AttachDonPaymentOption,
): CardInstance["instanceId"][] =>
  player.costArea
    .filter((card) => card.state === option.sourceState)
    .map((card) => card.instanceId);

const canPayAttachDonCost = (
  state: GameState,
  playerId: EffectQueueEntry["controllerId"],
  player: NonNullable<GameState["players"][EffectQueueEntry["controllerId"]]>,
  option: AttachDonPaymentOption,
): boolean =>
  Number.isInteger(option.count) &&
  option.count > 0 &&
  attachDonSourceIds(player, option).length >= option.count &&
  attachDonTargetCandidates(state, playerId, player, option).length > 0;

export const findSequenceFrameByDecisionId = (
  state: GameState,
  decisionId: NonNullable<GameState["pendingDecision"]>["id"],
): EffectExecutionFrame | undefined =>
  state.effectExecutionFrames.find(
    (candidate) => candidate.pendingDecision.decisionId === decisionId,
  );

export const hasSequenceFrameForDecision = (
  state: GameState,
  decisionId: NonNullable<GameState["pendingDecision"]>["id"],
): boolean => findSequenceFrameByDecisionId(state, decisionId) !== undefined;

export const frameForPausedSequenceDecision = (params: {
  decision: NonNullable<GameState["pendingDecision"]>;
  entry: EffectQueueEntry;
  effectPath?: string[];
  index: number;
  resumePendingDecision?: NonNullable<GameState["pendingDecision"]>;
  segmentResults: EffectExecutionFrame["segmentResults"];
  savedReferences: EffectExecutionFrame["savedReferences"];
  state: GameState;
}): EffectExecutionFrame => {
  const frame: EffectExecutionFrame = {
    queueEntryId: params.entry.id,
    effectBlockId: params.entry.effectBlockId,
    effectPath: params.effectPath ?? ["effect", "sequence"],
    nextSegmentIndex: params.index + 1,
    segmentResults: params.segmentResults,
    savedReferences: params.savedReferences,
    transientSets: {},
    pendingDecision: {
      decisionId: params.decision.id,
      causedBy: params.decision.causedBy,
      createdAtStateSeq: params.state.seq,
      resumeAtSegmentIndex: params.index,
    },
  };
  return params.resumePendingDecision === undefined
    ? frame
    : { ...frame, resumePendingDecision: params.resumePendingDecision };
};

export const stateWithPausedSequenceFrame = (
  state: GameState,
  entry: EffectQueueEntry,
  frame: EffectExecutionFrame,
): GameState => ({
  ...state,
  effectExecutionFrames: [
    ...state.effectExecutionFrames.filter(
      (candidate) => candidate.queueEntryId !== entry.id,
    ),
    frame,
  ],
});

export const createOptionalActivationDecisionForSequenceSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  index: number,
): { events: EngineEvent[]; ok: true; state: GameState } => {
  const causedBy = decisionCauseForEntry(entry);
  const visibility = { type: "private", playerId: entry.controllerId } as const;
  const pendingDecision: ChooseOptionalActivationDecision = {
    id: toDecisionId(
      `decision:chooseOptionalActivation:sequence:${String(entry.id)}:${String(index)}`,
    ),
    type: "chooseOptionalActivation",
    playerId: entry.controllerId,
    prompt: "Choose whether to resolve this optional effect.",
    causedBy,
    visibility,
    effectId: entry.effectBlockId,
    source: entry.source,
    options: ["activate", "decline"],
  };
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: pendingDecision.id,
      decisionType: pendingDecision.type,
      playerId: pendingDecision.playerId,
    },
    visibility,
  );
  const created = events[0];
  if (created !== undefined) {
    created.causedBy = causedBy;
  }
  return {
    events,
    ok: true,
    state: {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    },
  };
};

export const createPayCostDecisionForSequenceSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  cost: OptionalCost,
  paymentOptions: OptionalPayCostDecision["paymentOptions"],
  index: number,
): { events: EngineEvent[]; ok: true; state: GameState } => {
  const causedBy = decisionCauseForEntry(entry);
  const visibility = { type: "private", playerId: entry.controllerId } as const;
  const pendingDecision: OptionalPayCostDecision = {
    id: toDecisionId(
      `decision:payCost:sequence:${String(entry.id)}:${String(index)}`,
    ),
    type: "payCost",
    playerId: entry.controllerId,
    prompt: "Choose whether to pay this optional cost.",
    causedBy,
    visibility,
    defaultResponse: { type: "paymentDeclined" },
    cost,
    paymentOptions,
  };
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: pendingDecision.id,
      decisionType: pendingDecision.type,
      playerId: pendingDecision.playerId,
    },
    visibility,
  );
  const created = events[0];
  if (created !== undefined) {
    created.causedBy = causedBy;
  }
  return {
    events,
    ok: true,
    state: {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    },
  };
};

export const createReturnDonDecisionForSequenceSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  playerId: PlayerId,
  count: number,
  index: number,
): { events: EngineEvent[]; ok: true; state: GameState } => {
  const causedBy = decisionCauseForEntry(entry);
  const visibility = { type: "private", playerId } as const;
  const pendingDecision: PayCostDecision = {
    id: toDecisionId(
      `decision:returnDon:sequence:${String(entry.id)}:${String(index)}`,
    ),
    type: "payCost",
    playerId,
    prompt: "Choose DON!! cards to return.",
    causedBy,
    visibility,
    cost: { type: "returnDon", count },
    paymentOptions: [{ id: "returnDon", type: "returnDon", count }],
  };
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: pendingDecision.id,
      decisionType: pendingDecision.type,
      playerId: pendingDecision.playerId,
    },
    visibility,
  );
  const created = events[0];
  if (created !== undefined) {
    created.causedBy = causedBy;
  }
  return {
    events,
    ok: true,
    state: {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    },
  };
};

export const createChooseQuantityDecisionForSequenceSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  index: number,
  effect: Effect,
  max: number,
): { events: EngineEvent[]; ok: true; state: GameState } => {
  const causedBy = {
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  } as const;
  const visibility = { type: "private", playerId: entry.controllerId } as const;
  const pendingDecision: ChooseQuantityDecision = {
    id: toDecisionId(
      `decision:chooseQuantity:sequence:${String(entry.id)}:${String(index)}`,
    ),
    type: "chooseQuantity",
    playerId: entry.controllerId,
    prompt: chooseQuantityPromptForEffect(effect),
    causedBy,
    visibility,
    mode: "upTo",
    min: 0,
    max,
  };
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: pendingDecision.id,
      decisionType: pendingDecision.type,
      playerId: pendingDecision.playerId,
    },
    visibility,
  );
  const created = events[0];
  if (created !== undefined) {
    created.causedBy = causedBy;
  }
  return {
    events,
    ok: true,
    state: {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    },
  };
};

export const createChooseEffectOptionDecisionForSequenceSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Extract<Effect, { type: "choice" }>,
  index: number,
): { events: EngineEvent[]; ok: true; state: GameState } => {
  const causedBy = decisionCauseForEntry(entry);
  const visibility = { type: "private", playerId: entry.controllerId } as const;
  const pendingDecision: ChooseEffectOptionDecision = {
    id: toDecisionId(
      `decision:chooseEffectOption:sequence:${String(entry.id)}:${String(index)}`,
    ),
    type: "chooseEffectOption",
    playerId: entry.controllerId,
    prompt: "Choose one effect.",
    causedBy,
    visibility,
    options: effect.options,
  };
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: pendingDecision.id,
      decisionType: pendingDecision.type,
      playerId: pendingDecision.playerId,
    },
    visibility,
  );
  const created = events[0];
  if (created !== undefined) {
    created.causedBy = causedBy;
  }
  return {
    events,
    ok: true,
    state: {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    },
  };
};

const chooseCombos = <T>(values: readonly T[], count: number): T[][] => {
  if (count === 0) {
    return [[]];
  }
  if (count < 0 || values.length < count) {
    return [];
  }
  const results: T[][] = [];
  const visit = (start: number, current: T[]): void => {
    if (current.length === count) {
      results.push([...current]);
      return;
    }
    for (let index = start; index < values.length; index += 1) {
      const value = values[index];
      if (value === undefined) {
        continue;
      }
      current.push(value);
      visit(index + 1, current);
      current.pop();
    }
  };
  visit(0, []);
  return results;
};

const supportsChooseOneTrashFilter = (
  filter: CardFilter | undefined,
): boolean => isSupportedHandSelectionCardFilter(filter);

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

const chooseOneOptionId = (
  option: { type: "trashFromHand" | "trashFromField" },
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
  return supportsChooseOneTrashFilter(option.filter);
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
    if (option.type === "trashFromField") {
      if (!supportsChooseOneTrashFilter(option.filter)) {
        continue;
      }
      const fieldFilter = option.filter;
      const selectableCardIds = fieldTrashCandidates(player)
        .filter((card) =>
          fieldCardMatchesFilter(state, playerId, card, fieldFilter),
        )
        .map((card) => card.instanceId);
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
    if (option.type === "turnLifeFaceUp") {
      if (canTurnLifeFaceUp(player, option)) {
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
          ? getReturnDonEligibleInstanceIds(player)
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
      const selectableDonIds = attachDonSourceIds(player, option);
      const targetCandidates = attachDonTargetCandidates(
        state,
        playerId,
        player,
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
): Array<
  Extract<
    OptionalPayCostDecision["paymentOptions"][number],
    {
      type:
        | "restSelf"
        | "trashSelf"
        | "restDon"
        | "attachDon"
        | "returnDon"
        | "trashFromHand"
        | "revealFromHand"
        | "trashFromField"
        | "moveCards"
        | "turnLifeFaceUp"
        | "modifyPower";
    }
  >
> => {
  const paymentOptions: Array<
    Extract<
      OptionalPayCostDecision["paymentOptions"][number],
      {
        type:
          | "restSelf"
          | "trashSelf"
          | "restDon"
          | "attachDon"
          | "returnDon"
          | "trashFromHand"
          | "revealFromHand"
          | "trashFromField"
          | "moveCards"
          | "turnLifeFaceUp"
          | "modifyPower";
      }
    >
  > = [];
  const currentPlayer = state.players[entry.controllerId];
  const returnDonEligibleCount =
    currentPlayer === undefined ? 0 : getReturnDonEligibleCount(currentPlayer);

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
    if (findTrashableSource(state, entry) !== undefined) {
      paymentOptions.push({
        id: "trashSelf",
        type: "trashSelf",
      });
    }
    return paymentOptions;
  }
  if (cost.type === "restDon") {
    if (activeDonCount(state, entry.controllerId) >= cost.count) {
      paymentOptions.push({
        id: "restDon",
        type: "restDon",
        count: cost.count,
      });
    }
    return paymentOptions;
  }
  if (cost.type === "attachDon") {
    const option: AttachDonPaymentOption = {
      id: "attachDon",
      type: "attachDon",
      count: cost.count,
      sourceState: cost.sourceState,
      target: cost.target,
    };
    if (
      currentPlayer !== undefined &&
      canPayAttachDonCost(state, entry.controllerId, currentPlayer, option)
    ) {
      paymentOptions.push(option);
    }
    return paymentOptions;
  }
  if (cost.type === "returnDon") {
    if (returnDonEligibleCount >= cost.count) {
      paymentOptions.push({
        id: "returnDon",
        type: "returnDon",
        count: cost.count,
      });
    }
    return paymentOptions;
  }
  if (cost.type === "trashFromHand" || cost.type === "revealFromHand") {
    const matchingHandCount =
      currentPlayer?.hand.filter((card) =>
        cardMatchesHandSelectionFilter(
          state,
          entry.controllerId,
          card,
          cost.filter,
        ),
      ).length ?? 0;
    if (matchingHandCount >= cost.count) {
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
    if (cost.chooser !== "self") {
      return paymentOptions;
    }
    for (const route of expandMoveCardsCostRoutes(cost)) {
      const selectable =
        currentPlayer === undefined
          ? undefined
          : selectableMoveCardsCostIds(
              state,
              entry.controllerId,
              currentPlayer,
              route,
            );
      if (
        selectable !== undefined &&
        Number.isInteger(route.count) &&
        route.count > 0 &&
        selectable.length >= route.count
      ) {
        paymentOptions.push({
          id: route.id,
          type: "moveCards",
          count: route.count,
          from: route.from,
          to: route.to,
          ...(route.filter === undefined ? {} : { filter: route.filter }),
        });
      }
    }
    return paymentOptions;
  }
  if (cost.type === "turnLifeFaceUp") {
    const option: TurnLifeFaceUpPaymentOption = {
      id: `turnLifeFaceUp:${cost.position}`,
      type: "turnLifeFaceUp",
      count: cost.count,
      player: cost.player,
      position: cost.position,
    };
    if (
      currentPlayer !== undefined &&
      canTurnLifeFaceUp(currentPlayer, option)
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
            entry.controllerId,
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
    if (!supportsChooseOneTrashFilter(option.filter)) {
      return [];
    }
    const fieldFilter = option.filter;
    const fieldMatchCount =
      currentPlayer === undefined
        ? 0
        : fieldTrashCandidates(currentPlayer).filter((card) =>
            fieldCardMatchesFilter(
              state,
              entry.controllerId,
              card,
              fieldFilter,
            ),
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
