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

const cardName = (catalog: MatchCardCatalog, ref: CardRef): string =>
  catalog.players[ref.playerId]?.cards[ref.cardId]?.name ?? String(ref.cardId);

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
  if (event.type === "decisionResolved") {
    const selectedCount = payloadSelectedCount(event.payload);
    return selectedCount === undefined
      ? "Decision resolved"
      : `Decision resolved: ${selectedCountLabel(selectedCount)}`;
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
