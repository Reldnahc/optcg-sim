import type {
  CardInstance,
  CardRef,
  Comparator,
  Condition,
  EffectExecutionFrame,
  EffectQueueEntry,
  GameState,
  PlayerId,
  PlayerRef,
} from "@optcg/types";

import { computeView } from "../../view/compute-view.js";
import { resolveDynamicNumberValue } from "../continuous/value-resolution.js";

export interface ConditionEvaluationContext {
  readonly savedReferences?: EffectExecutionFrame["savedReferences"];
}

const compare = (op: Comparator, left: number, right: number): boolean => {
  switch (op) {
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
  }
};

const isComparator = (value: unknown): value is Comparator => {
  switch (value) {
    case "eq":
    case "neq":
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      return true;
    default:
      return false;
  }
};

const resolveConditionPlayer = (
  state: GameState,
  entry: EffectQueueEntry,
  player: PlayerRef,
): PlayerId | undefined => {
  if (player === "self") {
    return entry.controllerId;
  }
  if (player !== "opponent") {
    return undefined;
  }
  const playerIds = Object.keys(state.players) as PlayerId[];
  return playerIds.find((playerId) => playerId !== entry.controllerId);
};

const findFieldCardInstanceByRef = (
  state: GameState,
  card: CardRef,
): CardInstance | undefined => {
  const player = state.players[card.playerId];
  if (player === undefined) {
    return undefined;
  }
  if (
    card.zone?.zone === "leaderArea" &&
    player.leader.instanceId === card.instanceId &&
    player.leader.cardId === card.cardId
  ) {
    return player.leader;
  }
  if (card.zone?.zone === "characterArea") {
    return player.characters.find(
      (candidate) =>
        candidate.instanceId === card.instanceId &&
        candidate.cardId === card.cardId,
    );
  }
  if (
    card.zone?.zone === "stageArea" &&
    player.stage?.instanceId === card.instanceId &&
    player.stage.cardId === card.cardId
  ) {
    return player.stage;
  }
  if (card.zone?.zone === "costArea") {
    return player.costArea.find(
      (candidate) =>
        candidate.instanceId === card.instanceId &&
        candidate.cardId === card.cardId,
    );
  }
  return undefined;
};

const resolveSavedFieldObjectRef = (
  state: GameState,
  entry: EffectQueueEntry,
  target: Extract<Condition, { type: "cardStatComparison" }>["target"],
  context: ConditionEvaluationContext | undefined,
): CardRef | undefined => {
  if (
    target.type !== "savedFieldObject" ||
    target.binding.family !== "selectedTargets"
  ) {
    return undefined;
  }
  const saved = context?.savedReferences?.[target.binding.saveResultAs];
  if (saved?.kind !== "selectedTargets") {
    return undefined;
  }
  const object = saved.targets[target.binding.objectIndex ?? 0]?.object;
  if (object === undefined) {
    return undefined;
  }
  if (target.zone !== undefined && object.zone?.zone !== target.zone) {
    return undefined;
  }
  const expectedPlayer =
    target.player === "anyPlayer"
      ? object.playerId
      : resolveConditionPlayer(state, entry, target.player);
  return expectedPlayer === object.playerId ? object : undefined;
};

const readCardStat = (
  state: GameState,
  card: CardInstance,
  stat: Extract<Condition, { type: "cardStatComparison" }>["stat"],
): number | undefined => {
  const metadata = state.cardManifest.cards[card.cardId];
  if (metadata === undefined) {
    return undefined;
  }
  const computed = computeView(state, {
    supportStatusPolicy: "ignore",
    unsupportedCombatKeywordPolicy: "ignore",
  }).cards[card.instanceId];
  switch (stat) {
    case "cost":
      return computed?.currentCost ?? metadata.cost;
    case "baseCost":
      return metadata.cost;
    case "power":
      return metadata.power;
    case "currentPower":
      return computed?.currentPower ?? metadata.power;
    case "attachedDon":
      return card.attachedDon.length;
  }
};

export const evaluateCardStatComparison = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Extract<Condition, { type: "cardStatComparison" }>,
  context: ConditionEvaluationContext | undefined,
): { supported: true; passed: boolean } | { supported: false } => {
  if (!isComparator(condition.op)) {
    return { supported: false };
  }
  const cardRef = resolveSavedFieldObjectRef(
    state,
    entry,
    condition.target,
    context,
  );
  if (cardRef === undefined) {
    return { supported: false };
  }
  const card = findFieldCardInstanceByRef(state, cardRef);
  if (card === undefined) {
    return { supported: false };
  }
  const left = readCardStat(state, card, condition.stat);
  const valueContext = {
    controllerId: entry.controllerId,
    ...(context?.savedReferences === undefined
      ? {}
      : { savedReferences: context.savedReferences }),
    ...(entry.source.zone === undefined
      ? {}
      : {
          source: {
            instanceId: entry.source.instanceId,
            cardId: entry.source.cardId,
            playerId: entry.source.playerId,
            zone: entry.source.zone,
          },
        }),
  };
  const right = resolveDynamicNumberValue(state, condition.value, valueContext);
  if (left === undefined || right === null) {
    return { supported: false };
  }
  return { supported: true, passed: compare(condition.op, left, right) };
};

const isSupportedSavedSelectedFieldObjectTarget = (
  target: Extract<Condition, { type: "cardStatComparison" }>["target"],
): boolean =>
  target.type === "savedFieldObject" &&
  target.binding.family === "selectedTargets" &&
  (target.player === "self" ||
    target.player === "opponent" ||
    target.player === "anyPlayer");

const isSupportedCardStatComparisonValue = (
  value: Extract<Condition, { type: "cardStatComparison" }>["value"],
): boolean => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value);
  }
  return (
    value.type === "countAttachedDon" &&
    isSupportedSavedSelectedFieldObjectTarget(value.target) &&
    Number.isSafeInteger(value.per) &&
    value.per > 0 &&
    Number.isSafeInteger(value.multiplier)
  );
};

export const isSupportedCardStatComparisonCondition = (
  condition: Extract<Condition, { type: "cardStatComparison" }>,
): boolean =>
  isSupportedSavedSelectedFieldObjectTarget(condition.target) &&
  isComparator(condition.op) &&
  isSupportedCardStatComparisonValue(condition.value);
