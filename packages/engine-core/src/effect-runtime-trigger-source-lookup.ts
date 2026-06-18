import type {
  CardInstance,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import { zonesEqual } from "./actions/state.js";

export const findCardInstance = (
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): CardInstance | undefined => {
  const player = state.players[playerId];
  if (player === undefined) {
    return undefined;
  }
  const zoneCards = [
    player.leader,
    player.stage,
    ...player.characters,
    ...player.hand,
    ...player.deck,
    ...player.trash,
    ...player.costArea,
    ...player.donDeck,
    ...player.life.map((lifeCard) => lifeCard.card),
  ];
  return zoneCards.find((card) => card?.instanceId === instanceId);
};

export const findCardInstanceInTrash = (
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): CardInstance | undefined => {
  const player = state.players[playerId];
  return player?.trash.find((card) => card.instanceId === instanceId);
};

export const attackEventCardRefMatches = (
  ref: {
    playerId?: PlayerId;
    instanceId?: string;
    cardId?: string;
    zone?: CardInstance["zone"];
  },
  card: CardInstance,
  playerId: PlayerId,
): boolean =>
  ref.playerId === playerId &&
  ref.instanceId === card.instanceId &&
  ref.cardId === card.cardId &&
  ref.zone !== undefined &&
  zonesEqual(ref.zone, card.zone);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const zoneRefFromUnknown = (
  value: unknown,
): CardInstance["zone"] | undefined => {
  if (!isRecord(value) || typeof value["zone"] !== "string") {
    return undefined;
  }
  return {
    zone: value["zone"] as CardInstance["zone"]["zone"],
    ...(typeof value["playerId"] === "string"
      ? { playerId: value["playerId"] as PlayerId }
      : {}),
    ...(typeof value["slot"] === "string"
      ? { slot: value["slot"] as NonNullable<CardInstance["zone"]["slot"]> }
      : {}),
    ...(typeof value["index"] === "number" ? { index: value["index"] } : {}),
  };
};

export const findMatchingKOMoveEvent = (
  koEvent: EngineEvent,
  events: readonly EngineEvent[],
): EngineEvent | undefined => {
  const koPayload = koEvent.payload as {
    playerId?: PlayerId;
    instanceId?: string;
  };
  const matches = events.filter((event) => {
    if (event.type !== "cardMoved") {
      return false;
    }
    const payload = event.payload as {
      from?: unknown;
      to?: unknown;
      reason?: string;
      instanceId?: string;
    };
    const from = zoneRefFromUnknown(payload.from);
    const to = zoneRefFromUnknown(payload.to);
    return (
      payload.reason === "ko" &&
      payload.instanceId === koPayload.instanceId &&
      from?.zone === "characterArea" &&
      from.playerId === koPayload.playerId &&
      to?.zone === "trash" &&
      to.playerId === koPayload.playerId
    );
  });
  return matches.length === 1 ? matches[0] : undefined;
};

export const toSnapshot = (
  card: CardInstance,
  resolved: ResolvedCard,
): EffectQueueEntry["sourceSnapshot"] => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  ownerId: card.owner,
  controllerId: card.controller,
  zone: card.zone,
  category: resolved.category,
  colors: resolved.colors,
  ...(resolved.cost !== undefined ? { cost: resolved.cost } : {}),
  ...(resolved.power !== undefined ? { power: resolved.power } : {}),
  ...(resolved.counter !== undefined ? { counter: resolved.counter } : {}),
  ...(resolved.life !== undefined ? { life: resolved.life } : {}),
  keywords: resolved.printedKeywords,
});

export const fieldTriggerSources = (state: GameState): CardInstance[] =>
  Object.values(state.players).flatMap((player) => [
    player.leader,
    ...player.characters,
    ...(player.stage === undefined ? [] : [player.stage]),
  ]);
