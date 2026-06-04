import type { CardRef, EngineEvent, PlayerId } from "@optcg/types";

export interface OpponentRevealViewModel {
  revealId: string;
  title: string;
  cards: readonly CardRef[];
}

export interface RevealPlayerLabels {
  selfLabel: string;
  opponentLabel: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const cardRefFromPayload = (value: unknown): CardRef | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const instanceId = value["instanceId"];
  const cardId = value["cardId"];
  const playerId = value["playerId"];
  if (
    typeof instanceId !== "string" ||
    typeof cardId !== "string" ||
    typeof playerId !== "string"
  ) {
    return undefined;
  }
  return { instanceId, cardId, playerId } as CardRef;
};

const revealedCardsFromEvent = (event: EngineEvent): readonly CardRef[] => {
  if (!isRecord(event.payload)) {
    return [];
  }
  const cards = event.payload["cards"];
  if (Array.isArray(cards)) {
    return cards.flatMap((card) => {
      const ref = cardRefFromPayload(card);
      return ref === undefined ? [] : [ref];
    });
  }
  const ref = cardRefFromPayload(event.payload);
  return ref === undefined ? [] : [ref];
};

const revealIdFromEvent = (event: EngineEvent): string => {
  if (isRecord(event.payload)) {
    const revealId = event.payload["revealId"];
    if (typeof revealId === "string") {
      return revealId;
    }
  }
  return String(event.id);
};

const isOpponentSearchRevealEvent = (event: EngineEvent): boolean => {
  if (!isRecord(event.payload)) {
    return false;
  }
  const revealId = event.payload["revealId"];
  return (
    typeof revealId === "string" &&
    revealId.startsWith("reveal:search-reveal:selected:")
  );
};

const isLifeRevealEvent = (event: EngineEvent): boolean => {
  if (!isRecord(event.payload)) {
    return false;
  }
  const revealId = event.payload["revealId"];
  const origin = event.payload["origin"];
  return (
    typeof revealId === "string" &&
    revealId.startsWith("reveal:sequence:") &&
    isRecord(origin) &&
    origin["zone"] === "life"
  );
};

export const opponentRevealFromEvents = (
  events: readonly EngineEvent[],
  playerId: PlayerId,
  dismissedRevealIds: ReadonlySet<string>,
  playerLabels?: RevealPlayerLabels,
): OpponentRevealViewModel | undefined => {
  const reveals = opponentRevealsFromEvents(
    events,
    playerId,
    dismissedRevealIds,
    playerLabels,
  );
  return reveals[reveals.length - 1];
};

export const opponentRevealsFromEvents = (
  events: readonly EngineEvent[],
  playerId: PlayerId,
  dismissedRevealIds: ReadonlySet<string>,
  playerLabels?: RevealPlayerLabels,
): readonly OpponentRevealViewModel[] => {
  const reveals: OpponentRevealViewModel[] = [];
  const seenRevealIds = new Set<string>();
  for (const event of events) {
    if (event.type !== "cardRevealed" || event.visibility.type !== "public") {
      continue;
    }
    const showToBothPlayers = isLifeRevealEvent(event);
    if (!showToBothPlayers && !isOpponentSearchRevealEvent(event)) {
      continue;
    }
    const revealId = revealIdFromEvent(event);
    if (dismissedRevealIds.has(revealId) || seenRevealIds.has(revealId)) {
      continue;
    }
    const cards = revealedCardsFromEvent(event);
    if (
      cards.length > 0 &&
      (showToBothPlayers || cards.every((card) => card.playerId !== playerId))
    ) {
      seenRevealIds.add(revealId);
      const firstRevealedCard = cards[0];
      const ownerLabel =
        firstRevealedCard?.playerId === playerId
          ? (playerLabels?.selfLabel ?? "Player")
          : (playerLabels?.opponentLabel ?? "Opponent");
      reveals.push({
        revealId,
        title: showToBothPlayers ? "Revealed" : `${ownerLabel} revealed`,
        cards,
      });
    }
  }
  return reveals;
};
