import type {
  CardFilter,
  CardInstance,
  CardRef,
  DynamicNumberValue,
  Effect,
  EffectExecutionFrame,
  EffectQueueEntry,
  GameState,
  PlayerId,
  SnapshotNumberValue,
  TargetSpec,
} from "@optcg/types";

import { cardMatchesAnyName } from "../../card-name-matching.js";

export type ContinuousResolutionContext = {
  savedReferences?: EffectExecutionFrame["savedReferences"];
  controllerId?: PlayerId;
};

const opponentOf = (state: GameState, playerId: PlayerId): PlayerId | null => {
  const playerIds = Object.keys(state.players) as PlayerId[];
  return playerIds.find((candidate) => candidate !== playerId) ?? null;
};

const resolvePlayerRef = (
  state: GameState,
  controllerId: PlayerId,
  player: "self" | "opponent",
): PlayerId | null => {
  if (player === "self") {
    return controllerId;
  }
  return opponentOf(state, controllerId);
};

const cardMatchesBasicFilter = (
  state: GameState,
  card: CardInstance,
  filter: CardFilter,
): boolean => {
  const metadata = state.cardManifest.cards[card.cardId];
  if (metadata === undefined) {
    return false;
  }
  if (
    filter.categories !== undefined &&
    !filter.categories.includes(metadata.category)
  ) {
    return false;
  }
  if (
    filter.names !== undefined &&
    !cardMatchesAnyName(metadata, filter.names)
  ) {
    return false;
  }
  if (
    filter.typesAny !== undefined &&
    !filter.typesAny.some((typeName) => metadata.types.includes(typeName))
  ) {
    return false;
  }
  if (
    filter.typesIncludeAny !== undefined &&
    !filter.typesIncludeAny.some((typeText) =>
      metadata.types.some((typeName) => typeName.includes(typeText)),
    )
  ) {
    return false;
  }
  return true;
};

const countDistinctMatchingFieldNames = (
  state: GameState,
  controllerId: PlayerId,
  value: Extract<
    Extract<Effect, { type: "modifyPower" }>["value"],
    { type: "countDistinctMatchingFieldNames" }
  >,
): number | null => {
  if (value.player !== "self" && value.player !== "opponent") {
    return null;
  }
  const playerId = resolvePlayerRef(state, controllerId, value.player);
  const player = playerId === null ? undefined : state.players[playerId];
  if (player === undefined) {
    return null;
  }
  const names = new Set<string>();
  for (const card of player.characters) {
    if (!cardMatchesBasicFilter(state, card, value.filter)) {
      continue;
    }
    const name = state.cardManifest.cards[card.cardId]?.name;
    if (name !== undefined) {
      names.add(name);
    }
  }
  return names.size * value.multiplier;
};

const countMatchingZoneCards = (
  state: GameState,
  controllerId: PlayerId,
  value: Extract<DynamicNumberValue, { type: "countMatchingZoneCards" }>,
): number | null => {
  if (value.player !== "self" && value.player !== "opponent") {
    return null;
  }
  if (
    !Number.isSafeInteger(value.per) ||
    value.per <= 0 ||
    !Number.isSafeInteger(value.multiplier)
  ) {
    return null;
  }
  const playerId = resolvePlayerRef(state, controllerId, value.player);
  const player = playerId === null ? undefined : state.players[playerId];
  if (player === undefined) {
    return null;
  }
  const filter = value.filter;
  const matchingCount =
    filter === undefined
      ? player.trash.length
      : player.trash.filter((card) =>
          cardMatchesBasicFilter(state, card, filter),
        ).length;
  return Math.floor(matchingCount / value.per) * value.multiplier;
};

export const resolveDynamicNumberValue = (
  state: GameState,
  value: number | DynamicNumberValue,
  context: ContinuousResolutionContext | undefined,
): number | null => {
  if (typeof value === "number") {
    return value;
  }
  if (value.type === "countDistinctMatchingFieldNames") {
    const controllerId = context?.controllerId;
    return controllerId === undefined
      ? null
      : countDistinctMatchingFieldNames(state, controllerId, value);
  }
  if (value.type === "countMatchingZoneCards") {
    const controllerId = context?.controllerId;
    return controllerId === undefined
      ? null
      : countMatchingZoneCards(state, controllerId, value);
  }
  if (value.type === "paidCostCardCount") {
    const reference = context?.savedReferences?.[value.cost];
    if (reference?.kind !== "paidCost") {
      return null;
    }
    return (reference.selectedCards?.length ?? 0) * value.multiplier;
  }
  const reference = context?.savedReferences?.[value.selection];
  if (reference?.kind !== "selectedCards") {
    return null;
  }
  let totalCost = 0;
  for (const card of reference.cards) {
    const cost = state.cardManifest.cards[card.cardId]?.cost;
    if (cost === undefined || !Number.isSafeInteger(cost)) {
      return null;
    }
    totalCost += cost;
  }
  return totalCost * value.multiplier;
};

export const resolvePowerValue = (
  state: GameState,
  value: Extract<Effect, { type: "modifyPower" }>["value"],
  context: ContinuousResolutionContext | undefined,
): number | null => resolveDynamicNumberValue(state, value, context);

const cardRefForSnapshotTarget = (
  state: GameState,
  entry: EffectQueueEntry,
  target: SnapshotNumberValue["target"],
  context: ContinuousResolutionContext | undefined,
): CardRef | null => {
  if (target.type === "opponentLeader") {
    const opponentId = opponentOf(state, entry.controllerId);
    if (opponentId === null) {
      return null;
    }
    const opponent = state.players[opponentId];
    if (opponent === undefined) {
      return null;
    }
    return {
      instanceId: opponent.leader.instanceId,
      cardId: opponent.leader.cardId,
      playerId: opponentId,
      zone: opponent.leader.zone,
    };
  }
  if (target.type === "myLeader") {
    const player = state.players[entry.controllerId];
    if (player === undefined) {
      return null;
    }
    return {
      instanceId: player.leader.instanceId,
      cardId: player.leader.cardId,
      playerId: entry.controllerId,
      zone: player.leader.zone,
    };
  }
  if (target.type === "savedFieldObject") {
    const saved = context?.savedReferences?.[target.binding.saveResultAs];
    if (saved?.kind !== "selectedTargets") {
      return null;
    }
    const object = saved.targets[target.binding.objectIndex ?? 0]?.object;
    if (object === undefined) {
      return null;
    }
    if (target.zone !== undefined && object.zone?.zone !== target.zone) {
      return null;
    }
    const expectedPlayer =
      target.player === "self"
        ? entry.controllerId
        : target.player === "opponent"
          ? opponentOf(state, entry.controllerId)
          : target.player;
    if (expectedPlayer === null || object.playerId !== expectedPlayer) {
      return null;
    }
    return object;
  }
  return null;
};

const continuousTargetMatchesCard = (
  target: TargetSpec,
  card: CardRef,
): boolean => {
  if (target.type === "myLeader") {
    return card.zone?.zone === "leaderArea";
  }
  if (target.type === "opponentLeader") {
    return card.zone?.zone === "leaderArea";
  }
  if (target.type === "exactCard") {
    return (
      target.card.instanceId === card.instanceId &&
      target.card.cardId === card.cardId &&
      target.card.playerId === card.playerId
    );
  }
  if (target.type === "all") {
    return target.player === card.playerId && target.zone === card.zone?.zone;
  }
  return false;
};

const findFieldCardInstance = (
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

const currentPowerForSnapshotTarget = (
  state: GameState,
  card: CardRef,
): number | null => {
  const cardInstance = findFieldCardInstance(state, card);
  const printedPower = state.cardManifest.cards[card.cardId]?.power;
  if (cardInstance === undefined || printedPower === undefined) {
    return null;
  }
  let basePower = printedPower;
  let powerAdd = cardInstance.attachedDon.length * 1000;
  for (const effect of state.continuousEffects) {
    if (!continuousTargetMatchesCard(effect.modifier.target, card)) {
      continue;
    }
    if (effect.modifier.operation.type === "setBasePower") {
      basePower = effect.modifier.operation.value;
    }
    if (effect.modifier.operation.type === "addPower") {
      powerAdd += effect.modifier.operation.value;
    }
  }
  return basePower + powerAdd;
};

export const resolveBasePowerValue = (
  state: GameState,
  entry: EffectQueueEntry,
  value: Extract<Effect, { type: "setBasePower" }>["value"],
  context?: ContinuousResolutionContext,
): number | null => {
  if (typeof value === "number") {
    return value;
  }
  const target = cardRefForSnapshotTarget(state, entry, value.target, context);
  return target === null ? null : currentPowerForSnapshotTarget(state, target);
};
