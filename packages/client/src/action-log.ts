import type { CardRef, EngineEvent } from "@optcg/types";

import type { MatchCardCatalog } from "./transport.js";

export interface ActionLogEntry {
  id: string;
  seq: number;
  text: string;
}

export interface CreateActionLogEntriesInput {
  events: readonly EngineEvent[];
  catalog: MatchCardCatalog;
}

const eventLabels: Record<EngineEvent["type"], string> = {
  phaseStarted: "Phase started",
  phaseEnded: "Phase ended",
  cardRevealed: "Card revealed",
  cardMoved: "Card moved",
  cardPlayed: "Card played",
  cardDrawn: "Card drawn",
  cardDiscarded: "Card discarded",
  cardTrashed: "Card trashed",
  cardKOd: "Card K.O.'d",
  cardReturned: "Card returned",
  donAttached: "DON!! attached",
  donReturned: "DON!! returned",
  costPaid: "Cost paid",
  attackDeclared: "Attack declared",
  blockerActivated: "Blocker activated",
  counterUsed: "Counter used",
  damageWouldBeDealt: "Damage pending",
  damageDealt: "Damage dealt",
  lifeTaken: "Life taken",
  triggerActivated: "Trigger activated",
  effectQueued: "Effect queued",
  effectResolved: "Effect resolved",
  replacementApplied: "Replacement applied",
  decisionCreated: "Decision created",
  decisionResolved: "Decision resolved",
  ruleProcessingChecked: "Rules checked",
  gameEnded: "Game ended",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

type VisibleCardIdentity = Pick<CardRef, "playerId" | "cardId"> &
  Partial<Pick<CardRef, "instanceId">>;

const cardName = (
  catalog: MatchCardCatalog,
  ref: VisibleCardIdentity,
): string =>
  catalog.players[ref.playerId]?.cards[ref.cardId]?.name ?? String(ref.cardId);

const payloadCardIdentity = (
  payload: unknown,
  fallbackPlayerId: unknown,
): VisibleCardIdentity | undefined => {
  if (!isRecord(payload)) {
    return undefined;
  }
  const cardId = payload["cardId"];
  const playerId = payload["playerId"] ?? fallbackPlayerId;
  const instanceId = payload["instanceId"];
  if (typeof cardId !== "string" || typeof playerId !== "string") {
    return undefined;
  }
  return {
    cardId: cardId as CardRef["cardId"],
    playerId: playerId as CardRef["playerId"],
    ...(typeof instanceId === "string"
      ? { instanceId: instanceId as CardRef["instanceId"] }
      : {}),
  };
};

const payloadCardIdentities = (
  payload: unknown,
  fallbackPlayerId: unknown,
): VisibleCardIdentity[] => {
  if (!isRecord(payload)) {
    return [];
  }
  const cards = payload["cards"];
  if (!Array.isArray(cards)) {
    const identity = payloadCardIdentity(payload, fallbackPlayerId);
    return identity === undefined ? [] : [identity];
  }
  return cards.flatMap((card) => {
    const identity = payloadCardIdentity(card, fallbackPlayerId);
    return identity === undefined ? [] : [identity];
  });
};

const cardListLabel = (
  catalog: MatchCardCatalog,
  identities: readonly VisibleCardIdentity[],
): string => {
  if (identities.length === 0) {
    return "a card";
  }
  if (identities.length === 1) {
    const identity = identities[0];
    return identity === undefined ? "a card" : cardName(catalog, identity);
  }
  return identities.map((identity) => cardName(catalog, identity)).join(", ");
};

const payloadSelectedCount = (payload: unknown): number | undefined => {
  if (!isRecord(payload)) {
    return undefined;
  }
  const selectedCount = payload["selectedCount"];
  return typeof selectedCount === "number" ? selectedCount : undefined;
};

const selectedCountLabel = (count: number): string =>
  `${String(count)} ${count === 1 ? "card" : "cards"}`;

const eventText = (event: EngineEvent, catalog: MatchCardCatalog): string => {
  const payloadIdentities = payloadCardIdentities(event.payload, event.actor);
  if (event.type === "decisionResolved") {
    const selectedCount = payloadSelectedCount(event.payload);
    return selectedCount === undefined
      ? "Decision resolved"
      : `Decision resolved: ${selectedCountLabel(selectedCount)}`;
  }

  if (event.type === "cardRevealed") {
    return `Revealed ${cardListLabel(catalog, payloadIdentities)}`;
  }
  if (event.type === "cardPlayed") {
    return `Played ${cardListLabel(catalog, payloadIdentities)}`;
  }
  if (event.type === "cardTrashed") {
    return `Trashed ${cardListLabel(catalog, payloadIdentities)}`;
  }
  if (event.type === "cardMoved") {
    if (payloadIdentities.length === 0) {
      return "A card moved";
    }
    return `${cardListLabel(catalog, payloadIdentities)} moved`;
  }
  if (event.type === "cardDiscarded") {
    return `Discarded ${cardListLabel(catalog, payloadIdentities)}`;
  }
  if (event.type === "cardKOd") {
    return `K.O.'d ${cardListLabel(catalog, payloadIdentities)}`;
  }
  if (event.type === "cardReturned") {
    return `Returned ${cardListLabel(catalog, payloadIdentities)}`;
  }
  if (event.type === "counterUsed") {
    return `Used ${cardListLabel(catalog, payloadIdentities)} as counter`;
  }
  if (event.type === "triggerActivated") {
    return `Activated ${cardListLabel(catalog, payloadIdentities)} trigger`;
  }

  const label = eventLabels[event.type];
  return event.source === undefined
    ? label
    : `${cardName(catalog, event.source)} ${label
        .charAt(0)
        .toLowerCase()}${label.slice(1)}`;
};

export const createActionLogEntries = ({
  events,
  catalog,
}: CreateActionLogEntriesInput): ActionLogEntry[] =>
  events
    .slice(-80)
    .map((event) => ({
      id: String(event.id),
      seq: event.seq,
      text: eventText(event, catalog),
    }))
    .reverse();
