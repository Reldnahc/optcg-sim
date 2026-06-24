import type { CardRef, PlayerId, PublicRevealRecord } from "@optcg/types";

import type { ClientPlayerSnapshot } from "../transport.js";
import type { BoardViewModel, ClientCardModel } from "../view-model.js";
import type { RevealWindowModel } from "./RevealWindowHost.js";
import {
  isLifeRevealEvent,
  isRevealFromHandCostEvent,
  isSelectedRevealEvent,
  opponentRevealsFromEvents,
} from "./reveal-viewer.js";
import type { RevealWindowState } from "./window-state-model.js";

export interface OpponentRevealWindow {
  revealId: string;
  initialRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  model: RevealWindowModel;
}

export const revealWindowKey = (revealId: string): string =>
  `reveal:${revealId}`;

const revealOwnerLabel = (
  record: PublicRevealRecord,
  currentPlayerId: PlayerId,
  board?: Pick<BoardViewModel, "selfLabel" | "opponentLabel">,
): string => {
  const firstCard = record.cards[0];
  return firstCard?.playerId === currentPlayerId
    ? (board?.selfLabel ?? "Player")
    : (board?.opponentLabel ?? "Opponent");
};

const revealTitleFromRecord = (
  record: PublicRevealRecord,
  currentPlayerId: PlayerId,
  board?: Pick<BoardViewModel, "selfLabel" | "opponentLabel">,
): string => {
  if (record.visibility === "privateToRecipient") {
    return record.origin === "topOfDeck" ? "Looked at deck" : "Looked at cards";
  }
  if (record.origin !== "topOfDeck") {
    return "Revealed";
  }
  return `${revealOwnerLabel(record, currentPlayerId, board)} revealed`;
};

const isWindowRevealRecord = (record: PublicRevealRecord): boolean =>
  !record.id.startsWith("reveal:setup-start-of-game:");

const isPrivateLookedSetRecord = (record: PublicRevealRecord): boolean =>
  record.visibility === "privateToRecipient" &&
  record.origin === "topOfDeck" &&
  record.cleanupPolicy === "returnToOrigin";

const eventBackedRevealIds = (
  events: ClientPlayerSnapshot["view"]["events"],
): ReadonlySet<string> => {
  const revealIds = new Set<string>();
  for (const event of events) {
    if (
      event.type !== "cardRevealed" ||
      !(
        isSelectedRevealEvent(event) ||
        isRevealFromHandCostEvent(event) ||
        isLifeRevealEvent(event)
      ) ||
      typeof event.payload !== "object" ||
      event.payload === null
    ) {
      continue;
    }
    const revealId = (event.payload as Record<string, unknown>)["revealId"];
    if (typeof revealId === "string") {
      revealIds.add(revealId);
    }
  }
  return revealIds;
};

export const opponentRevealWindowsFromState = ({
  currentPlayerId,
  playerSnapshot,
  matchScope,
  board,
  revealWindowState,
  activeDismissedRevealIds,
  cardModel,
}: {
  currentPlayerId?: PlayerId | undefined;
  playerSnapshot?: ClientPlayerSnapshot | undefined;
  matchScope?: string | undefined;
  board?: BoardViewModel | undefined;
  revealWindowState: RevealWindowState;
  activeDismissedRevealIds: ReadonlySet<string>;
  cardModel: (card: CardRef) => ClientCardModel;
}): OpponentRevealWindow[] => {
  if (
    currentPlayerId === undefined ||
    playerSnapshot === undefined ||
    matchScope === undefined ||
    revealWindowState.scope !== matchScope
  ) {
    return [];
  }
  const eventRevealsById = new Map(
    opponentRevealsFromEvents(
      playerSnapshot.view.events,
      currentPlayerId,
      activeDismissedRevealIds,
      board === undefined
        ? undefined
        : {
            selfLabel: board.selfLabel,
            opponentLabel: board.opponentLabel,
          },
    ).map((reveal) => [reveal.revealId, reveal]),
  );
  const eventWindows: OpponentRevealWindow[] = [...eventRevealsById.values()]
    .filter((reveal) => !activeDismissedRevealIds.has(reveal.revealId))
    .map((reveal, index) => ({
      revealId: reveal.revealId,
      initialRect: {
        x: 380 + index * 24,
        y: 100 + index * 24,
        width: 300,
        height: 420,
      },
      model: {
        title: reveal.title,
        cards: reveal.cards.map((card) => cardModel(card)),
      },
    }));
  const eventRevealIds = eventBackedRevealIds(playerSnapshot.view.events);
  const recordWindows = playerSnapshot.view.revealedCards
    .filter(
      (record) =>
        isWindowRevealRecord(record) &&
        !isPrivateLookedSetRecord(record) &&
        !activeDismissedRevealIds.has(record.id) &&
        !eventRevealIds.has(record.id) &&
        record.cards.length > 0,
    )
    .map((record, index) => {
      const eventReveal = eventRevealsById.get(record.id);
      return {
        revealId: record.id,
        initialRect: {
          x: 380 + index * 24,
          y: 100 + index * 24,
          width: 300,
          height: 420,
        },
        model: {
          title:
            eventReveal?.title ??
            revealTitleFromRecord(record, currentPlayerId, board),
          cards: record.cards.map((card) => cardModel(card)),
        },
      };
    });
  return [...eventWindows, ...recordWindows];
};
