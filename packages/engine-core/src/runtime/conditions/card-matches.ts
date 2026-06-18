import type {
  CardFilter,
  CardInstance,
  CardRef,
  Condition,
  EffectQueueEntry,
  GameState,
  PlayerId,
  PlayerRef,
} from "@optcg/types";

import { cardMatchesSearchFilter } from "../../actions/state.js";
import type { ConditionEvaluationContext } from "./card-stat-comparison.js";

interface ConditionEvaluationSuccess {
  supported: true;
  passed: boolean;
}

interface ConditionEvaluationFailure {
  supported: false;
}

type ConditionEvaluationResult =
  | ConditionEvaluationSuccess
  | ConditionEvaluationFailure;

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

const resolveSavedSelectedFieldObjectRef = (
  state: GameState,
  entry: EffectQueueEntry,
  target: Extract<Condition, { type: "cardMatches" }>["target"],
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
  if (
    target.zones !== undefined &&
    (object.zone === undefined ||
      !target.zones.some((zone) => zone === object.zone?.zone))
  ) {
    return undefined;
  }
  const expectedPlayer =
    target.player === "anyPlayer"
      ? object.playerId
      : resolveConditionPlayer(state, entry, target.player);
  return expectedPlayer === object.playerId ? object : undefined;
};

const resolveSavedSelectedCardRef = (
  target: Extract<Condition, { type: "cardMatches" }>["target"],
  context: ConditionEvaluationContext | undefined,
): CardRef | undefined => {
  if (target.type !== "savedSelectedCard") {
    return undefined;
  }
  const saved = context?.savedReferences?.[target.selection];
  if (saved?.kind !== "selectedCards") {
    return undefined;
  }
  return saved.cards[target.objectIndex ?? 0];
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

const resolveCardMatchesRef = (
  state: GameState,
  entry: EffectQueueEntry,
  target: Extract<Condition, { type: "cardMatches" }>["target"],
  context: ConditionEvaluationContext | undefined,
): CardRef | undefined => {
  if (target.type === "self") {
    if (entry.source.zone === undefined) {
      return undefined;
    }
    return {
      instanceId: entry.source.instanceId,
      cardId: entry.source.cardId,
      playerId: entry.source.playerId,
      zone: entry.source.zone,
    };
  }
  return (
    resolveSavedSelectedFieldObjectRef(state, entry, target, context) ??
    resolveSavedSelectedCardRef(target, context)
  );
};

const supportedCardMatchesFilterKeys = new Set<keyof CardFilter>([
  "anyOf",
  "categories",
  "colorsAny",
  "attributesAny",
  "attributesNotAny",
  "names",
  "nameContains",
  "nameNot",
  "typesAny",
  "typesIncludeAny",
  "typesNotIncludeAny",
  "baseCost",
  "cost",
  "power",
]);

const isSupportedCardMatchesFilter = (filter: CardFilter): boolean => {
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  return (
    keys.length > 0 &&
    keys.every((key) => supportedCardMatchesFilterKeys.has(key)) &&
    (filter.anyOf === undefined ||
      filter.anyOf.every(isSupportedCardMatchesFilter))
  );
};

export const isSupportedCardMatchesCondition = (
  condition: Extract<Condition, { type: "cardMatches" }>,
): boolean =>
  (condition.target.type === "self" ||
    condition.target.type === "savedSelectedCard" ||
    (condition.target.type === "savedFieldObject" &&
      condition.target.binding.family === "selectedTargets" &&
      (condition.target.player === "self" ||
        condition.target.player === "opponent" ||
        condition.target.player === "anyPlayer"))) &&
  isSupportedCardMatchesFilter(condition.filter);

export const evaluateCardMatches = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Extract<Condition, { type: "cardMatches" }>,
  context: ConditionEvaluationContext | undefined,
): ConditionEvaluationResult => {
  if (!isSupportedCardMatchesFilter(condition.filter)) {
    return { supported: false };
  }
  const cardRef = resolveCardMatchesRef(
    state,
    entry,
    condition.target,
    context,
  );
  if (cardRef === undefined) {
    return { supported: false };
  }
  const card = findFieldCardInstanceByRef(state, cardRef);
  const metadata =
    card === undefined && condition.target.type === "savedSelectedCard"
      ? state.cardManifest.cards[cardRef.cardId]
      : card === undefined
        ? undefined
        : state.cardManifest.cards[card.cardId];
  if (metadata === undefined) {
    return { supported: false };
  }
  return {
    supported: true,
    passed: cardMatchesSearchFilter(metadata, condition.filter),
  };
};
