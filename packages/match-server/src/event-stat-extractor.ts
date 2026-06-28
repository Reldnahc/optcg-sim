import type { EngineEvent } from "@optcg/types";

import type { UserStatOperation } from "./match-stat-extractor.js";
import { colorBuckets, statKeys, type ColorBucket } from "./user-stat-keys.js";

export interface EventStatContext {
  readonly userIdByPlayerId: ReadonlyMap<string, string>;
  readonly cardNumberByInstanceId: ReadonlyMap<string, string>;
  readonly categoryByInstanceId: ReadonlyMap<string, string>;
  readonly colorBucketByCardNumber: ReadonlyMap<string, string>;
}

type OperationSink = UserStatOperation[];

const colorBucketSet: ReadonlySet<string> = new Set(colorBuckets);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringProp = (
  record: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const numberProp = (
  record: Record<string, unknown>,
  key: string,
): number | undefined => {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
};

const isPositive = (value: number): boolean => value > 0;

const pushIncrement = (
  operations: OperationSink,
  userId: string,
  statKey: string,
  value = 1,
): void => {
  if (!isPositive(value)) {
    return;
  }
  operations.push({ userId, statKey, operation: "increment", value });
};

const userIdForPlayer = (
  context: EventStatContext,
  playerId: string | undefined,
): string | undefined =>
  playerId === undefined ? undefined : context.userIdByPlayerId.get(playerId);

const isColorBucket = (value: string): value is ColorBucket =>
  colorBucketSet.has(value);

const categoryForInstance = (
  context: EventStatContext,
  instanceId: string | undefined,
): string | undefined =>
  instanceId === undefined
    ? undefined
    : context.categoryByInstanceId.get(instanceId);

const cardNumberForInstance = (
  context: EventStatContext,
  instanceId: string | undefined,
): string | undefined =>
  instanceId === undefined
    ? undefined
    : context.cardNumberByInstanceId.get(instanceId);

const colorBucketForCardNumber = (
  context: EventStatContext,
  cardNumber: string | undefined,
): ColorBucket | undefined => {
  if (cardNumber === undefined) {
    return undefined;
  }
  const bucket = context.colorBucketByCardNumber.get(cardNumber);
  return bucket !== undefined && isColorBucket(bucket) ? bucket : undefined;
};

const cardRefPlayerId = (value: unknown): string | undefined =>
  isRecord(value) ? stringProp(value, "playerId") : undefined;

const cardRefInstanceId = (value: unknown): string | undefined =>
  isRecord(value) ? stringProp(value, "instanceId") : undefined;

const zoneName = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  return stringProp(value, "zone");
};

const zonePlayerId = (value: unknown): string | undefined =>
  isRecord(value) ? stringProp(value, "playerId") : undefined;

const publicEvent = (event: EngineEvent): boolean =>
  event.visibility.type === "public";

const trustedMovementEvent = (event: EngineEvent): boolean =>
  event.visibility.type === "public" || event.visibility.type === "replayOnly";

const pushCardPlayScopedStats = (
  operations: OperationSink,
  context: EventStatContext,
  userId: string,
  category: "character" | "event" | "stage",
  instanceId: string | undefined,
): void => {
  const cardNumber = cardNumberForInstance(context, instanceId);
  if (cardNumber === undefined) {
    return;
  }

  pushIncrement(operations, userId, statKeys.cardsPlayedByCard(cardNumber));
  if (category === "character") {
    pushIncrement(
      operations,
      userId,
      statKeys.charactersPlayedByCard(cardNumber),
    );
  } else if (category === "event") {
    pushIncrement(operations, userId, statKeys.eventsPlayedByCard(cardNumber));
  } else {
    pushIncrement(operations, userId, statKeys.stagesPlayedByCard(cardNumber));
  }

  const bucket = colorBucketForCardNumber(context, cardNumber);
  if (bucket === undefined) {
    return;
  }
  pushIncrement(operations, userId, statKeys.cardsPlayedColor(bucket));
  if (category === "character") {
    pushIncrement(operations, userId, statKeys.charactersPlayedColor(bucket));
  } else if (category === "event") {
    pushIncrement(operations, userId, statKeys.eventsPlayedColor(bucket));
  } else {
    pushIncrement(operations, userId, statKeys.stagesPlayedColor(bucket));
  }
};

const handleCardPlayed = (
  event: EngineEvent,
  operations: OperationSink,
  context: EventStatContext,
): void => {
  if (!publicEvent(event) || !isRecord(event.payload)) {
    return;
  }
  const userId = userIdForPlayer(
    context,
    stringProp(event.payload, "playerId"),
  );
  const category = stringProp(event.payload, "category");
  if (
    userId === undefined ||
    (category !== "character" && category !== "event" && category !== "stage")
  ) {
    return;
  }

  pushIncrement(operations, userId, statKeys.cardsPlayed);
  if (category === "character") {
    pushIncrement(operations, userId, statKeys.charactersPlayed);
  } else if (category === "event") {
    pushIncrement(operations, userId, statKeys.eventsPlayed);
  } else {
    pushIncrement(operations, userId, statKeys.stagesPlayed);
  }
  pushCardPlayScopedStats(
    operations,
    context,
    userId,
    category,
    stringProp(event.payload, "instanceId"),
  );
};

const handleAttackDeclared = (
  event: EngineEvent,
  operations: OperationSink,
  context: EventStatContext,
): void => {
  if (!publicEvent(event) || !isRecord(event.payload)) {
    return;
  }
  const attacker = event.payload["attacker"];
  const userId = userIdForPlayer(context, cardRefPlayerId(attacker));
  if (userId === undefined) {
    return;
  }
  pushIncrement(operations, userId, statKeys.attacksDeclared);

  const category = categoryForInstance(context, cardRefInstanceId(attacker));
  if (category === "leader") {
    pushIncrement(operations, userId, statKeys.leaderAttacksDeclared);
  } else if (category === "character") {
    pushIncrement(operations, userId, statKeys.characterAttacksDeclared);
  }
};

const handleBlockerActivated = (
  event: EngineEvent,
  operations: OperationSink,
  context: EventStatContext,
): void => {
  if (!publicEvent(event) || !isRecord(event.payload)) {
    return;
  }
  const userId = userIdForPlayer(
    context,
    cardRefPlayerId(event.payload["blocker"]),
  );
  if (userId !== undefined) {
    pushIncrement(operations, userId, statKeys.blockersUsed);
  }
};

const handleCounterUsed = (
  event: EngineEvent,
  operations: OperationSink,
  context: EventStatContext,
): void => {
  if (!isRecord(event.payload)) {
    return;
  }
  const userId = userIdForPlayer(
    context,
    stringProp(event.payload, "playerId"),
  );
  if (userId === undefined) {
    return;
  }
  pushIncrement(operations, userId, statKeys.countersUsed);

  const instanceId = stringProp(event.payload, "instanceId");
  if (
    instanceId !== undefined ||
    stringProp(event.payload, "cardId") !== undefined
  ) {
    pushIncrement(operations, userId, statKeys.counterCardsUsed);
  }

  const value = numberProp(event.payload, "value");
  if (value !== undefined) {
    pushIncrement(operations, userId, statKeys.counterPowerUsedTotal, value);
  }

  if (categoryForInstance(context, instanceId) === "event") {
    pushIncrement(operations, userId, statKeys.counterEventsPlayed);
  }
};

const handleCardDrawn = (
  event: EngineEvent,
  operations: OperationSink,
  context: EventStatContext,
): void => {
  if (!isRecord(event.payload)) {
    return;
  }
  const userId = userIdForPlayer(
    context,
    stringProp(event.payload, "playerId"),
  );
  if (userId !== undefined) {
    pushIncrement(operations, userId, statKeys.cardsDrawn);
  }
};

const handleCardTrashed = (
  event: EngineEvent,
  operations: OperationSink,
  context: EventStatContext,
): void => {
  if (!isRecord(event.payload)) {
    return;
  }
  const userId = userIdForPlayer(
    context,
    stringProp(event.payload, "playerId"),
  );
  if (userId === undefined) {
    return;
  }
  if (stringProp(event.payload, "reason") === "trashFromHand") {
    pushIncrement(operations, userId, statKeys.cardsTrashedFromHand);
  }
};

const playerIdForMovement = (
  payload: Record<string, unknown>,
  zoneValue: unknown,
): string | undefined =>
  stringProp(payload, "playerId") ?? zonePlayerId(zoneValue);

const handleCardMoved = (
  event: EngineEvent,
  operations: OperationSink,
  context: EventStatContext,
): void => {
  if (!trustedMovementEvent(event) || !isRecord(event.payload)) {
    return;
  }
  const from = zoneName(event.payload["from"]);
  const to = zoneName(event.payload["to"]);

  if (from === "donDeck" && to === "costArea") {
    const userId = userIdForPlayer(
      context,
      playerIdForMovement(event.payload, event.payload["to"]),
    );
    if (userId !== undefined && event.causedBy?.type === "effect") {
      pushIncrement(operations, userId, statKeys.donRamped);
    }
    return;
  }

  if (!publicEvent(event)) {
    return;
  }

  if (from === "deck" && to === "trash") {
    const userId = userIdForPlayer(
      context,
      playerIdForMovement(event.payload, event.payload["from"]),
    );
    if (userId !== undefined) {
      pushIncrement(operations, userId, statKeys.cardsTrashedFromDeck);
    }
    return;
  }

  if (from === "life" && to === "hand") {
    const userId = userIdForPlayer(
      context,
      playerIdForMovement(event.payload, event.payload["from"]),
    );
    if (userId !== undefined) {
      pushIncrement(operations, userId, statKeys.cardsAddedFromLife);
    }
    return;
  }

  if (to === "life" && from !== "life") {
    const userId = userIdForPlayer(
      context,
      playerIdForMovement(event.payload, event.payload["to"]),
    );
    if (userId !== undefined) {
      pushIncrement(operations, userId, statKeys.lifeRecovered);
    }
    return;
  }

  if (
    from === "characterArea" &&
    to === "trash" &&
    stringProp(event.payload, "reason") === "ko" &&
    stringProp(event.payload, "sourceKind") === "battle"
  ) {
    const userId = userIdForPlayer(
      context,
      stringProp(event.payload, "sourceControllerId"),
    );
    if (userId !== undefined) {
      pushIncrement(operations, userId, statKeys.charactersKoByBattle);
    }
  }
};

const handleLifeTaken = (
  event: EngineEvent,
  operations: OperationSink,
  context: EventStatContext,
): void => {
  if (!isRecord(event.payload)) {
    return;
  }
  const userId = userIdForPlayer(
    context,
    stringProp(event.payload, "damagedPlayerId"),
  );
  const amount = numberProp(event.payload, "amount");
  if (userId !== undefined && amount !== undefined) {
    pushIncrement(operations, userId, statKeys.lifeDamageTaken, amount);
  }
};

const pushRevealStatsForCards = (
  operations: OperationSink,
  context: EventStatContext,
  cards: readonly unknown[],
): void => {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const playerId = cardRefPlayerId(card);
    if (playerId !== undefined) {
      counts.set(playerId, (counts.get(playerId) ?? 0) + 1);
    }
  }
  for (const [playerId, count] of counts) {
    const userId = userIdForPlayer(context, playerId);
    if (userId !== undefined) {
      pushIncrement(operations, userId, statKeys.cardsRevealed, count);
    }
  }
};

const handleCardRevealed = (
  event: EngineEvent,
  operations: OperationSink,
  context: EventStatContext,
): void => {
  if (
    event.visibility.type !== "public" &&
    event.visibility.type !== "private" &&
    event.visibility.type !== "replayOnly"
  ) {
    return;
  }
  if (!isRecord(event.payload)) {
    return;
  }
  const cards = event.payload["cards"];
  if (!Array.isArray(cards) || cards.length === 0) {
    return;
  }
  const playerId = stringProp(event.payload, "playerId");
  if (playerId !== undefined) {
    const userId = userIdForPlayer(context, playerId);
    if (userId !== undefined) {
      pushIncrement(operations, userId, statKeys.cardsRevealed, cards.length);
    }
    return;
  }
  pushRevealStatsForCards(operations, context, cards);
};

const handleDonAttached = (
  event: EngineEvent,
  operations: OperationSink,
  context: EventStatContext,
): void => {
  if (!isRecord(event.payload)) {
    return;
  }
  const userId = userIdForPlayer(
    context,
    stringProp(event.payload, "playerId"),
  );
  if (userId !== undefined) {
    pushIncrement(operations, userId, statKeys.donAttached);
  }
};

const handleDonReturned = (
  event: EngineEvent,
  operations: OperationSink,
  context: EventStatContext,
): void => {
  if (!isRecord(event.payload)) {
    return;
  }
  const userId = userIdForPlayer(
    context,
    stringProp(event.payload, "playerId"),
  );
  if (userId !== undefined) {
    pushIncrement(operations, userId, statKeys.donReturned);
  }
};

const handleTriggerActivated = (
  event: EngineEvent,
  operations: OperationSink,
  context: EventStatContext,
): void => {
  if (!publicEvent(event) || !isRecord(event.payload)) {
    return;
  }
  const userId = userIdForPlayer(
    context,
    stringProp(event.payload, "playerId"),
  );
  if (
    userId !== undefined &&
    stringProp(event.payload, "effectBlockId") !== undefined
  ) {
    pushIncrement(operations, userId, statKeys.effectsActivatedTotal);
    pushIncrement(operations, userId, statKeys.triggerEffectsActivated);
  }
};

const entryPointType = (value: unknown): string | undefined =>
  isRecord(value) ? stringProp(value, "type") : undefined;

const handleEffectResolved = (
  event: EngineEvent,
  operations: OperationSink,
  context: EventStatContext,
): void => {
  if (!publicEvent(event) || !isRecord(event.payload)) {
    return;
  }
  if (
    stringProp(event.payload, "status") !== undefined &&
    stringProp(event.payload, "status") !== "resolved"
  ) {
    return;
  }
  if (stringProp(event.payload, "effectCategory") === undefined) {
    return;
  }
  const entryType = entryPointType(event.payload["entryPoint"]);
  if (entryType === undefined || entryType === "trigger") {
    return;
  }
  const controllerId =
    stringProp(event.payload, "controllerId") ??
    cardRefPlayerId(event.payload["source"]);
  const userId = userIdForPlayer(context, controllerId);
  if (userId === undefined) {
    return;
  }

  pushIncrement(operations, userId, statKeys.effectsActivatedTotal);
  if (entryType === "onPlay") {
    pushIncrement(operations, userId, statKeys.onPlayEffectsActivated);
  } else if (entryType === "activateMain") {
    pushIncrement(operations, userId, statKeys.activateMainEffectsActivated);
  }
};

export const extractEventStatOperations = (
  events: readonly EngineEvent[],
  context: EventStatContext,
): UserStatOperation[] => {
  const operations: UserStatOperation[] = [];
  for (const event of events) {
    if (event.type === "cardPlayed") {
      handleCardPlayed(event, operations, context);
    } else if (event.type === "attackDeclared") {
      handleAttackDeclared(event, operations, context);
    } else if (event.type === "blockerActivated") {
      handleBlockerActivated(event, operations, context);
    } else if (event.type === "counterUsed") {
      handleCounterUsed(event, operations, context);
    } else if (event.type === "cardDrawn") {
      handleCardDrawn(event, operations, context);
    } else if (event.type === "cardTrashed") {
      handleCardTrashed(event, operations, context);
    } else if (event.type === "cardMoved") {
      handleCardMoved(event, operations, context);
    } else if (event.type === "lifeTaken") {
      handleLifeTaken(event, operations, context);
    } else if (event.type === "cardRevealed") {
      handleCardRevealed(event, operations, context);
    } else if (event.type === "donAttached") {
      handleDonAttached(event, operations, context);
    } else if (event.type === "donReturned") {
      handleDonReturned(event, operations, context);
    } else if (event.type === "triggerActivated") {
      handleTriggerActivated(event, operations, context);
    } else if (event.type === "effectResolved") {
      handleEffectResolved(event, operations, context);
    }
  }
  return operations;
};
