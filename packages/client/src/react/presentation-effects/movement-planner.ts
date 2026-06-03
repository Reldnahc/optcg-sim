import type { EngineEvent, PlayerId, Zone } from "@optcg/types";

import type { ClientCardModel } from "../../view-model.js";

export type PresentationSide = "self" | "opponent";
export type PresentationZoneKey = `${PresentationSide}:${Zone}`;

export interface PresentationCardPosition {
  card: ClientCardModel;
  rect: DOMRectReadOnly;
  zoneKey?: PresentationZoneKey | undefined;
}

export interface PresentationZonePosition {
  zoneKey: PresentationZoneKey;
  rect: DOMRectReadOnly;
}

export interface PresentationSnapshot {
  cards: Record<string, PresentationCardPosition>;
  zones: Record<string, PresentationZonePosition>;
}

export interface CardMovementIntent {
  id: string;
  instanceId: string;
  card: ClientCardModel;
  fromRect: DOMRectReadOnly;
  toRect: DOMRectReadOnly;
  fromZoneKey?: PresentationZoneKey | undefined;
  toZoneKey?: PresentationZoneKey | undefined;
  eventId?: string | undefined;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const rectMoved = (left: DOMRectReadOnly, right: DOMRectReadOnly): boolean =>
  left.x !== right.x ||
  left.y !== right.y ||
  left.width !== right.width ||
  left.height !== right.height;

const sideForPlayer = (
  playerId: unknown,
  currentPlayerId: PlayerId,
): PresentationSide | undefined =>
  typeof playerId === "string"
    ? playerId === currentPlayerId
      ? "self"
      : "opponent"
    : undefined;

export const presentationZoneKey = (
  zoneRef: unknown,
  currentPlayerId: PlayerId,
): PresentationZoneKey | undefined => {
  if (!isRecord(zoneRef)) {
    return undefined;
  }
  const zone = zoneRef["zone"];
  if (typeof zone !== "string") {
    return undefined;
  }
  const side = sideForPlayer(zoneRef["playerId"], currentPlayerId);
  return side === undefined
    ? undefined
    : (`${side}:${zone}` as PresentationZoneKey);
};

const payloadCards = (payload: unknown): unknown[] => {
  if (!isRecord(payload)) {
    return [];
  }
  const cards = payload["cards"];
  if (Array.isArray(cards)) {
    return cards;
  }
  return [payload];
};

const eventCardInstanceIds = (event: EngineEvent): string[] => {
  const payloadIds = payloadCards(event.payload).flatMap((card) => {
    if (!isRecord(card)) {
      return [];
    }
    const instanceId = card["instanceId"];
    return typeof instanceId === "string" ? [instanceId] : [];
  });
  if (payloadIds.length > 0) {
    return payloadIds;
  }
  return (event.affected ?? []).map((card) => String(card.instanceId));
};

const movementEventZone = (
  event: EngineEvent,
  field: "from" | "to",
  currentPlayerId: PlayerId,
): PresentationZoneKey | undefined => {
  if (!isRecord(event.payload)) {
    return undefined;
  }
  return presentationZoneKey(event.payload[field], currentPlayerId);
};

const movementEventTypes = new Set<EngineEvent["type"]>([
  "cardMoved",
  "cardPlayed",
  "cardDrawn",
  "cardDiscarded",
  "cardTrashed",
  "cardKOd",
  "cardReturned",
  "lifeTaken",
]);

export const planCardMovementIntents = (input: {
  previous: PresentationSnapshot | undefined;
  current: PresentationSnapshot;
  events: readonly EngineEvent[];
  currentPlayerId: PlayerId;
}): CardMovementIntent[] => {
  const previous = input.previous;
  if (previous === undefined) {
    return [];
  }

  const movementByInstanceId = new Map<string, CardMovementIntent>();

  for (const [instanceId, currentPosition] of Object.entries(
    input.current.cards,
  )) {
    const previousPosition = previous.cards[instanceId];
    if (
      previousPosition === undefined ||
      previousPosition.zoneKey === currentPosition.zoneKey ||
      !rectMoved(previousPosition.rect, currentPosition.rect)
    ) {
      continue;
    }
    movementByInstanceId.set(instanceId, {
      id: `position:${instanceId}:${previousPosition.zoneKey ?? "unknown"}:${currentPosition.zoneKey ?? "unknown"}`,
      instanceId,
      card: currentPosition.card,
      fromRect: previousPosition.rect,
      toRect: currentPosition.rect,
      fromZoneKey: previousPosition.zoneKey,
      toZoneKey: currentPosition.zoneKey,
    });
  }

  for (const event of input.events) {
    if (!movementEventTypes.has(event.type)) {
      continue;
    }
    const fromZoneKey = movementEventZone(event, "from", input.currentPlayerId);
    const toZoneKey = movementEventZone(event, "to", input.currentPlayerId);
    for (const instanceId of eventCardInstanceIds(event)) {
      if (movementByInstanceId.has(instanceId)) {
        continue;
      }
      const currentPosition = input.current.cards[instanceId];
      const previousPosition = previous.cards[instanceId];
      const fromRect =
        previousPosition?.rect ??
        (fromZoneKey === undefined
          ? undefined
          : (previous.zones[fromZoneKey]?.rect ??
            input.current.zones[fromZoneKey]?.rect));
      const toRect =
        currentPosition?.rect ??
        (toZoneKey === undefined
          ? undefined
          : input.current.zones[toZoneKey]?.rect);
      const card = currentPosition?.card ?? previousPosition?.card;
      if (
        fromRect === undefined ||
        toRect === undefined ||
        card === undefined
      ) {
        continue;
      }
      movementByInstanceId.set(instanceId, {
        id: `${String(event.id)}:${instanceId}`,
        instanceId,
        card,
        fromRect,
        toRect,
        fromZoneKey: previousPosition?.zoneKey ?? fromZoneKey,
        toZoneKey: currentPosition?.zoneKey ?? toZoneKey,
        eventId: String(event.id),
      });
    }
  }

  return [...movementByInstanceId.values()];
};
