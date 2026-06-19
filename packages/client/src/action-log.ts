import type { CardRef, EngineEvent } from "@optcg/types";

import type { MatchCardCatalog, RollbackPointView } from "./transport.js";

export interface ActionLogEntry {
  id: string;
  seq: number;
  text: string;
  cardMentions?: readonly ActionLogCardMention[];
  rollback?: {
    rollbackPointId: string;
    label: string;
  };
}

export interface ActionLogCardMention {
  label: string;
  card: {
    cardId: CardRef["cardId"];
    playerId: CardRef["playerId"];
    instanceId?: CardRef["instanceId"] | undefined;
    name: string;
    category: string;
    effectText?: string | undefined;
    triggerText?: string | undefined;
    imageUrl?: string | undefined;
  };
}

export interface CreateActionLogEntriesInput {
  events: readonly EngineEvent[];
  catalog: MatchCardCatalog;
  rollbackPoints?: readonly RollbackPointView[] | undefined;
}

const eventLabels: Record<EngineEvent["type"], string> = {
  phaseStarted: "Phase started",
  phaseEnded: "Phase ended",
  cardRevealed: "Card revealed",
  cardMoved: "Card moved",
  cardPlayed: "Card played",
  cardRested: "Card rested",
  cardDrawn: "Card drawn",
  cardDiscarded: "Card discarded",
  cardTrashed: "Card trashed",
  cardKOd: "Card K.O.'d",
  cardReturned: "Card returned",
  deckShuffled: "Deck shuffled",
  donAttached: "DON!! attached",
  donReturned: "DON!! returned",
  costPaid: "Cost paid",
  attackDeclared: "Attack declared",
  blockerActivated: "Blocker activated",
  counterUsed: "Counter used",
  battleEnded: "Battle ended",
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

const cardMention = (
  catalog: MatchCardCatalog,
  ref: VisibleCardIdentity,
): ActionLogCardMention => {
  const entry = catalog.players[ref.playerId]?.cards[ref.cardId];
  return {
    label: entry?.name ?? String(ref.cardId),
    card: {
      cardId: ref.cardId,
      playerId: ref.playerId,
      ...(ref.instanceId === undefined ? {} : { instanceId: ref.instanceId }),
      name: entry?.name ?? String(ref.cardId),
      category: entry?.category ?? "unknown",
      ...(entry?.effectText === undefined
        ? {}
        : { effectText: entry.effectText }),
      ...(entry?.triggerText === undefined
        ? {}
        : { triggerText: entry.triggerText }),
      ...(entry?.imageUrl === undefined ? {} : { imageUrl: entry.imageUrl }),
    },
  };
};

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

const revealedCountLabel = (payload: unknown): string | undefined => {
  if (!isRecord(payload)) {
    return undefined;
  }
  const count = payload["revealedCount"];
  return typeof count === "number" ? selectedCountLabel(count) : undefined;
};

const stringField = (payload: unknown, field: string): string | undefined => {
  if (!isRecord(payload)) {
    return undefined;
  }
  const value = payload[field];
  return typeof value === "string" ? value : undefined;
};

const numberField = (payload: unknown, field: string): number | undefined => {
  if (!isRecord(payload)) {
    return undefined;
  }
  const value = payload[field];
  return typeof value === "number" ? value : undefined;
};

const cardIdentityField = (
  payload: unknown,
  field: string,
): VisibleCardIdentity | undefined => {
  if (!isRecord(payload)) {
    return undefined;
  }
  return payloadCardIdentity(payload[field], undefined);
};

const playerLabel = (playerId: string | undefined): string =>
  playerId ?? "A player";

const phaseLabel = (phase: string | undefined): string =>
  phase === undefined ? "phase" : `${phase} phase`;

const zoneLabels: Record<string, string> = {
  characterArea: "character area",
  costArea: "cost area",
  deck: "deck",
  donDeck: "DON!! deck",
  hand: "hand",
  leaderArea: "leader area",
  life: "life",
  stageArea: "stage area",
  trash: "trash",
};

const zoneLabel = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return zoneLabels[value] ?? value;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const zone = value["zone"];
  return typeof zone === "string" ? (zoneLabels[zone] ?? zone) : undefined;
};

const moveRouteLabel = (payload: unknown): string => {
  if (!isRecord(payload)) {
    return "";
  }
  const from = zoneLabel(payload["from"]);
  const to = zoneLabel(payload["to"]);
  if (from !== undefined && to !== undefined) {
    return ` from ${from} to ${to}`;
  }
  if (to !== undefined) {
    return ` to ${to}`;
  }
  return "";
};

const costPaidLabel = (payload: unknown): string => {
  const optionId = stringField(payload, "optionId");
  const donCount = numberField(payload, "selectedDonCount");
  const cardCount = numberField(payload, "selectedCardCount");
  if (optionId === "restDon" && donCount !== undefined) {
    return `rested ${String(donCount)} DON!!`;
  }
  if (optionId === "returnDon" && donCount !== undefined) {
    return `returned ${String(donCount)} DON!!`;
  }
  if (optionId === "restSelf") {
    return "rested source card";
  }
  if (optionId === "trashFromHand" && cardCount !== undefined) {
    return `trashed ${selectedCountLabel(cardCount)} from hand`;
  }
  if (optionId === "trashFromField" && cardCount !== undefined) {
    return `trashed ${selectedCountLabel(cardCount)} from field`;
  }
  if (optionId === "moveCards" && cardCount !== undefined) {
    return `moved ${selectedCountLabel(cardCount)}`;
  }
  return "paid a cost";
};

const eventText = (event: EngineEvent, catalog: MatchCardCatalog): string => {
  const payloadIdentities = payloadCardIdentities(event.payload, event.actor);
  if (event.type === "phaseStarted" || event.type === "phaseEnded") {
    const verb = event.type === "phaseStarted" ? "started" : "ended";
    return `${playerLabel(stringField(event.payload, "playerId"))} ${verb} ${phaseLabel(
      stringField(event.payload, "phase"),
    )}`;
  }
  if (event.type === "decisionCreated") {
    const prompt = stringField(event.payload, "prompt");
    return prompt === undefined
      ? `${playerLabel(stringField(event.payload, "playerId"))} decision created`
      : `${playerLabel(stringField(event.payload, "playerId"))} decision: ${prompt}`;
  }
  if (event.type === "decisionResolved") {
    const selectedCount = payloadSelectedCount(event.payload);
    return selectedCount === undefined
      ? `${playerLabel(stringField(event.payload, "playerId"))} resolved decision`
      : `${playerLabel(stringField(event.payload, "playerId"))} resolved decision: ${selectedCountLabel(selectedCount)}`;
  }

  if (event.type === "cardRevealed") {
    if (payloadIdentities.length === 0) {
      return `Revealed ${revealedCountLabel(event.payload) ?? "a card"}`;
    }
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
      return `A card moved${moveRouteLabel(event.payload)}`;
    }
    return `${cardListLabel(catalog, payloadIdentities)} moved${moveRouteLabel(
      event.payload,
    )}`;
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
  if (event.type === "costPaid") {
    return `${playerLabel(stringField(event.payload, "playerId"))} paid cost: ${costPaidLabel(
      event.payload,
    )}`;
  }
  if (event.type === "attackDeclared") {
    const attacker = cardIdentityField(event.payload, "attacker");
    const target = cardIdentityField(event.payload, "target");
    if (attacker !== undefined && target !== undefined) {
      return `${cardName(catalog, attacker)} attacked ${cardName(
        catalog,
        target,
      )}`;
    }
    return "Attack declared";
  }
  if (event.type === "blockerActivated") {
    const blocker = cardIdentityField(event.payload, "blocker");
    const target = cardIdentityField(event.payload, "currentTarget");
    if (blocker !== undefined && target !== undefined) {
      return `${cardName(catalog, blocker)} blocked; new target is ${cardName(
        catalog,
        target,
      )}`;
    }
    return "Blocker activated";
  }
  if (event.type === "damageDealt") {
    const amount = numberField(event.payload, "amount");
    return amount === undefined
      ? "Damage dealt"
      : `${String(amount)} ${amount === 1 ? "damage" : "damage"} dealt`;
  }
  if (event.type === "lifeTaken") {
    const amount = numberField(event.payload, "amount");
    return amount === undefined
      ? `${playerLabel(stringField(event.payload, "damagedPlayerId"))} took life`
      : `${playerLabel(stringField(event.payload, "damagedPlayerId"))} took ${String(
          amount,
        )} ${amount === 1 ? "life" : "life"}`;
  }

  const label = eventLabels[event.type];
  return event.source === undefined
    ? label
    : `${cardName(catalog, event.source)} ${label
        .charAt(0)
        .toLowerCase()}${label.slice(1)}`;
};

const dedupeIdentities = (
  identities: readonly VisibleCardIdentity[],
): VisibleCardIdentity[] => {
  const seen = new Set<string>();
  return identities.filter((identity) => {
    const key = `${identity.playerId}:${identity.cardId}:${
      identity.instanceId ?? ""
    }`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const eventCardMentions = (
  event: EngineEvent,
  catalog: MatchCardCatalog,
): ActionLogCardMention[] => {
  const identities: VisibleCardIdentity[] = [
    ...payloadCardIdentities(event.payload, event.actor),
  ];
  if (event.source !== undefined) {
    identities.push(event.source);
  }
  if (event.type === "attackDeclared") {
    const attacker = cardIdentityField(event.payload, "attacker");
    const target = cardIdentityField(event.payload, "target");
    if (attacker !== undefined) {
      identities.push(attacker);
    }
    if (target !== undefined) {
      identities.push(target);
    }
  }
  if (event.type === "blockerActivated") {
    const blocker = cardIdentityField(event.payload, "blocker");
    const target = cardIdentityField(event.payload, "currentTarget");
    if (blocker !== undefined) {
      identities.push(blocker);
    }
    if (target !== undefined) {
      identities.push(target);
    }
  }

  return dedupeIdentities(identities)
    .map((identity) => cardMention(catalog, identity))
    .filter((mention) => mention.label.length > 0);
};

export const createActionLogEntries = ({
  events,
  catalog,
  rollbackPoints = [],
}: CreateActionLogEntriesInput): ActionLogEntry[] =>
  events
    .slice(-80)
    .map((event, index) => {
      const rollbackPoint = rollbackPoints.find(
        (point) =>
          point.eventId === String(event.id) || point.eventSeq === event.seq,
      );
      const cardMentions = eventCardMentions(event, catalog);
      return {
        id: `${String(event.id)}:${String(index)}`,
        seq: event.seq,
        text: eventText(event, catalog),
        ...(cardMentions.length === 0 ? {} : { cardMentions }),
        ...(rollbackPoint === undefined
          ? {}
          : {
              rollback: {
                rollbackPointId: rollbackPoint.rollbackPointId,
                label: rollbackPoint.label,
              },
            }),
      };
    })
    .reverse();
