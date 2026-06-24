import type {
  CardInstance,
  CardRef,
  EngineEvent,
  GameState,
  PlayerId,
} from "@optcg/types";

import { appendPlayedCardSpotlightEntryCreatedEvent } from "../action-results.js";
import type { SupportedPlayMetadata } from "./support.js";

export type CardPlaySpotlightAdmissionOutcome = {
  readonly queuedEffectCount: number;
  readonly supportedEffectAttempted: boolean;
  readonly failedClosedEffectAttempted: boolean;
};

export const publicPlayedCardRef = (
  card: CardInstance,
  playerId: PlayerId,
): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
});

const cardRefMatches = (left: CardRef, right: CardRef): boolean =>
  left.playerId === right.playerId &&
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId;

const effectQueuedSource = (event: EngineEvent): CardRef | undefined => {
  if (event.type !== "effectQueued" || typeof event.payload !== "object") {
    return undefined;
  }
  const payload = event.payload as { readonly source?: unknown };
  const source = payload.source;
  if (typeof source !== "object" || source === null) {
    return undefined;
  }
  const candidate = source as Record<string, unknown>;
  return typeof candidate["playerId"] === "string" &&
    typeof candidate["instanceId"] === "string" &&
    typeof candidate["cardId"] === "string"
    ? {
        playerId: candidate["playerId"] as PlayerId,
        instanceId: candidate["instanceId"] as CardInstance["instanceId"],
        cardId: candidate["cardId"] as CardInstance["cardId"],
      }
    : undefined;
};

export const countQueuedEffectsForSource = (
  events: readonly EngineEvent[],
  source: CardRef,
): number =>
  events.filter((event) => {
    const queuedSource = effectQueuedSource(event);
    return queuedSource !== undefined && cardRefMatches(queuedSource, source);
  }).length;

const latestCardPlayedEvent = (
  events: readonly EngineEvent[],
  source: CardRef,
): EngineEvent | undefined => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event === undefined || event.type !== "cardPlayed") {
      continue;
    }
    if (typeof event.payload !== "object" || event.payload === null) {
      continue;
    }
    const payload = event.payload as {
      readonly playerId?: unknown;
      readonly instanceId?: unknown;
      readonly cardId?: unknown;
    };
    if (
      payload.playerId === source.playerId &&
      payload.instanceId === source.instanceId &&
      payload.cardId === source.cardId
    ) {
      return event;
    }
  }
  return undefined;
};

export const appendNoEffectPlayedCardSpotlightIfAdmitted = ({
  category,
  events,
  outcome,
  source,
  state,
}: {
  readonly state: GameState;
  readonly events: EngineEvent[];
  readonly source: CardRef;
  readonly category: SupportedPlayMetadata["category"];
  readonly outcome: CardPlaySpotlightAdmissionOutcome;
}): void => {
  if (
    (category !== "character" && category !== "stage") ||
    outcome.queuedEffectCount > 0 ||
    outcome.supportedEffectAttempted ||
    outcome.failedClosedEffectAttempted
  ) {
    return;
  }
  const cardPlayed = latestCardPlayedEvent(events, source);
  if (cardPlayed === undefined) {
    return;
  }
  appendPlayedCardSpotlightEntryCreatedEvent({
    state,
    events,
    anchorEvent: cardPlayed,
    source,
  });
};
