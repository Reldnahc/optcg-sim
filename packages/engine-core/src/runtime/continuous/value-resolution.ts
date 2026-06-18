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
  source?: CardRef;
  affectedCard?: CardRef;
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
  if (
    filter.attributesAny !== undefined &&
    !filter.attributesAny.some((attribute) =>
      metadata.attributes.includes(attribute),
    )
  ) {
    return false;
  }
  if (
    filter.attributesNotAny !== undefined &&
    filter.attributesNotAny.some((attribute) =>
      metadata.attributes.includes(attribute),
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

const countMatchingFieldCards = (
  state: GameState,
  controllerId: PlayerId,
  value: Extract<DynamicNumberValue, { type: "countMatchingFieldCards" }>,
): number | null => {
  if (
    (value.player !== "self" && value.player !== "opponent") ||
    !Number.isSafeInteger(value.multiplier)
  ) {
    return null;
  }
  const playerId = resolvePlayerRef(state, controllerId, value.player);
  const player = playerId === null ? undefined : state.players[playerId];
  if (player === undefined) {
    return null;
  }
  return (
    player.characters.filter((card) =>
      cardMatchesBasicFilter(state, card, value.filter),
    ).length * value.multiplier
  );
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
  if (value.zone === "life") {
    return filter === undefined
      ? applyDynamicZoneCountArithmetic(
          Math.floor(player.life.length / value.per) * value.multiplier,
          value,
        )
      : null;
  }
  const zoneCards = value.zone === "costArea" ? player.costArea : player.trash;
  const matchingCount =
    filter === undefined
      ? zoneCards.length
      : zoneCards.filter((card) =>
          value.zone === "costArea"
            ? costAreaDonMatchesFilter(card, filter)
            : cardMatchesBasicFilter(state, card, filter),
        ).length;
  return applyDynamicZoneCountArithmetic(
    Math.floor(matchingCount / value.per) * value.multiplier,
    value,
  );
};

const costAreaDonMatchesFilter = (
  card: CardInstance,
  filter: CardFilter,
): boolean =>
  (filter.categories === undefined || filter.categories.includes("don")) &&
  (filter.state === undefined || card.state === filter.state);

const countMatchingZoneCardsAcrossPlayers = (
  state: GameState,
  controllerId: PlayerId,
  value: Extract<
    DynamicNumberValue,
    { type: "countMatchingZoneCardsAcrossPlayers" }
  >,
): number | null => {
  if (
    value.filter !== undefined ||
    value.players.length === 0 ||
    !Number.isSafeInteger(value.per) ||
    value.per <= 0 ||
    !Number.isSafeInteger(value.multiplier)
  ) {
    return null;
  }

  let count = 0;
  for (const playerRef of value.players) {
    if (playerRef !== "self" && playerRef !== "opponent") {
      return null;
    }
    const playerId = resolvePlayerRef(state, controllerId, playerRef);
    const player = playerId === null ? undefined : state.players[playerId];
    if (player === undefined) {
      return null;
    }
    count += player.life.length;
  }

  return applyDynamicZoneCountArithmetic(
    Math.floor(count / value.per) * value.multiplier,
    value,
  );
};

const countFieldCountDifference = (
  state: GameState,
  controllerId: PlayerId,
  value: Extract<DynamicNumberValue, { type: "fieldCountDifference" }>,
): number | null => {
  const minuend = countFieldCountDifferenceOperand(
    state,
    controllerId,
    value.minuend,
  );
  const subtrahend = countFieldCountDifferenceOperand(
    state,
    controllerId,
    value.subtrahend,
  );
  if (
    minuend === null ||
    subtrahend === null ||
    (value.minimum !== undefined && !Number.isSafeInteger(value.minimum))
  ) {
    return null;
  }
  const difference = minuend - subtrahend;
  return value.minimum === undefined
    ? difference
    : Math.max(value.minimum, difference);
};

const countFieldCountDifferenceOperand = (
  state: GameState,
  controllerId: PlayerId,
  operand: Extract<
    DynamicNumberValue,
    { type: "fieldCountDifference" }
  >["minuend"],
): number | null => {
  if (operand.player !== "self" && operand.player !== "opponent") {
    return null;
  }
  const playerId = resolvePlayerRef(state, controllerId, operand.player);
  const player = playerId === null ? undefined : state.players[playerId];
  if (player === undefined) {
    return null;
  }
  const filter = operand.filter;
  return filter === undefined
    ? player.costArea.length
    : player.costArea.filter((card) => costAreaDonMatchesFilter(card, filter))
        .length;
};

const applyDynamicZoneCountArithmetic = (
  baseValue: number,
  value:
    | Extract<DynamicNumberValue, { type: "countMatchingZoneCards" }>
    | Extract<
        DynamicNumberValue,
        { type: "countMatchingZoneCardsAcrossPlayers" }
      >,
): number | null => {
  const offset = value.offset ?? 0;
  if (
    !Number.isSafeInteger(offset) ||
    (value.minimum !== undefined && !Number.isSafeInteger(value.minimum))
  ) {
    return null;
  }
  const adjusted = baseValue + offset;
  return value.minimum === undefined
    ? adjusted
    : Math.max(value.minimum, adjusted);
};

const cardRefForDynamicTarget = (
  state: GameState,
  target: Extract<DynamicNumberValue, { type: "countAttachedDon" }>["target"],
  context: ContinuousResolutionContext | undefined,
): CardRef | null => {
  const controllerId = context?.controllerId;
  if (target.type === "self") {
    return context?.source ?? null;
  }
  if (target.type === "affectedCard") {
    return context?.affectedCard ?? null;
  }
  if (controllerId === undefined) {
    return null;
  }
  if (target.type === "myLeader") {
    const player = state.players[controllerId];
    if (player === undefined) {
      return null;
    }
    return {
      instanceId: player.leader.instanceId,
      cardId: player.leader.cardId,
      playerId: controllerId,
      zone: player.leader.zone,
    };
  }
  if (target.type === "opponentLeader") {
    const opponentId = opponentOf(state, controllerId);
    const opponent =
      opponentId === null ? undefined : state.players[opponentId];
    if (opponentId === null || opponent === undefined) {
      return null;
    }
    return {
      instanceId: opponent.leader.instanceId,
      cardId: opponent.leader.cardId,
      playerId: opponentId,
      zone: opponent.leader.zone,
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
    return object;
  }
  return null;
};

const countAttachedDon = (
  state: GameState,
  value: Extract<DynamicNumberValue, { type: "countAttachedDon" }>,
  context: ContinuousResolutionContext | undefined,
): number | null => {
  if (
    !Number.isSafeInteger(value.per) ||
    value.per <= 0 ||
    !Number.isSafeInteger(value.multiplier)
  ) {
    return null;
  }
  const cardRef = cardRefForDynamicTarget(state, value.target, context);
  if (cardRef === null) {
    return null;
  }
  const card = findFieldCardInstance(state, cardRef);
  return card === undefined
    ? null
    : Math.floor(card.attachedDon.length / value.per) * value.multiplier;
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
  if (value.type === "countMatchingFieldCards") {
    const controllerId = context?.controllerId;
    return controllerId === undefined
      ? null
      : countMatchingFieldCards(state, controllerId, value);
  }
  if (value.type === "countMatchingZoneCards") {
    const controllerId = context?.controllerId;
    return controllerId === undefined
      ? null
      : countMatchingZoneCards(state, controllerId, value);
  }
  if (value.type === "countMatchingZoneCardsAcrossPlayers") {
    const controllerId = context?.controllerId;
    return controllerId === undefined
      ? null
      : countMatchingZoneCardsAcrossPlayers(state, controllerId, value);
  }
  if (value.type === "fieldCountDifference") {
    const controllerId = context?.controllerId;
    return controllerId === undefined
      ? null
      : countFieldCountDifference(state, controllerId, value);
  }
  if (value.type === "countAttachedDon") {
    return countAttachedDon(state, value, context);
  }
  if (value.type === "paidCostCardCount") {
    const reference = context?.savedReferences?.[value.cost];
    if (reference?.kind !== "paidCost") {
      return null;
    }
    return (
      ((reference.selectedCards?.length ?? 0) +
        (reference.selectedDonInstanceIds?.length ?? 0)) *
      value.multiplier
    );
  }
  if (value.type === "savedNumber") {
    const reference = context?.savedReferences?.[value.selection];
    return reference?.kind === "chosenNumber" ? reference.value : null;
  }
  if (value.type === "selectedCardCount") {
    const reference = context?.savedReferences?.[value.selection];
    return reference?.kind === "selectedCards"
      ? reference.cards.length * value.multiplier
      : null;
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
  controllerId: PlayerId,
  target: SnapshotNumberValue["target"],
  context: ContinuousResolutionContext | undefined,
): CardRef | null => {
  if (target.type === "opponentLeader") {
    const opponentId = opponentOf(state, controllerId);
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
    const player = state.players[controllerId];
    if (player === undefined) {
      return null;
    }
    return {
      instanceId: player.leader.instanceId,
      cardId: player.leader.cardId,
      playerId: controllerId,
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
        ? controllerId
        : target.player === "opponent"
          ? opponentOf(state, controllerId)
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
  stat: SnapshotNumberValue["stat"],
): number | null => {
  const cardInstance = findFieldCardInstance(state, card);
  const printedPower = state.cardManifest.cards[card.cardId]?.power;
  if (cardInstance === undefined || printedPower === undefined) {
    return null;
  }
  let basePower = printedPower;
  let powerAdd = cardInstance.attachedDon.length * 1000;
  let powerSet: number | undefined;
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
    if (effect.modifier.operation.type === "setPower") {
      powerSet =
        powerSet === undefined
          ? effect.modifier.operation.value
          : Math.min(powerSet, effect.modifier.operation.value);
    }
  }
  if (stat === "basePower") {
    return basePower;
  }
  return powerSet ?? basePower + powerAdd;
};

export const resolveBasePowerValue = (
  state: GameState,
  entry: EffectQueueEntry,
  value: Extract<Effect, { type: "setBasePower" }>["value"],
  context?: ContinuousResolutionContext,
): number | null => {
  return resolveBasePowerValueForController(
    state,
    entry.controllerId,
    value,
    context,
  );
};

export const resolveBasePowerValueForController = (
  state: GameState,
  controllerId: PlayerId,
  value: Extract<Effect, { type: "setBasePower" }>["value"],
  context?: ContinuousResolutionContext,
): number | null => {
  if (typeof value === "number") {
    return value;
  }
  const target = cardRefForSnapshotTarget(
    state,
    controllerId,
    value.target,
    context,
  );
  return target === null
    ? null
    : currentPowerForSnapshotTarget(state, target, value.stat);
};
