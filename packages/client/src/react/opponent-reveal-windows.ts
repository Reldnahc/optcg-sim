import type { CardRef, PlayerId, PublicRevealRecord } from "@optcg/types";

import type { ClientPlayerSnapshot } from "../transport.js";
import type { BoardViewModel, ClientCardModel } from "../view-model.js";
import type { RevealWindowModel } from "./RevealWindowHost.js";
import { opponentRevealsFromEvents } from "./reveal-viewer.js";
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
  if (record.origin !== "topOfDeck") {
    return "Revealed";
  }
  return `${revealOwnerLabel(record, currentPlayerId, board)} revealed`;
};

const isWindowRevealRecord = (record: PublicRevealRecord): boolean =>
  record.visibility === "public" &&
  !record.id.startsWith("reveal:setup-start-of-game:");

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
  const revealLabels =
    board === undefined
      ? undefined
      : {
          selfLabel: board.selfLabel,
          opponentLabel: board.opponentLabel,
        };
  const currentEventReveals = opponentRevealsFromEvents(
    playerSnapshot.view.events.filter(
      (event) => event.createdAtStateSeq === playerSnapshot.view.stateSeq,
    ),
    currentPlayerId,
    activeDismissedRevealIds,
    revealLabels,
  );
  const eventRevealsById = new Map(
    currentEventReveals.map((reveal) => [reveal.revealId, reveal]),
  );
  const activeRecordWindows = playerSnapshot.view.revealedCards
    .filter(
      (record) =>
        isWindowRevealRecord(record) &&
        !activeDismissedRevealIds.has(record.id) &&
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
  const activeRecordIds = new Set(
    activeRecordWindows.map((window) => window.revealId),
  );
  const eventOnlyWindows = currentEventReveals
    .filter((reveal) => !activeRecordIds.has(reveal.revealId))
    .map((reveal, index) => ({
      revealId: reveal.revealId,
      initialRect: {
        x: 380 + (activeRecordWindows.length + index) * 24,
        y: 100 + (activeRecordWindows.length + index) * 24,
        width: 300,
        height: 420,
      },
      model: {
        title: reveal.title,
        cards: reveal.cards.map((card) => cardModel(card)),
      },
    }));
  return [...activeRecordWindows, ...eventOnlyWindows];
};
