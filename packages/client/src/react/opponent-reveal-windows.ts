import type { CardRef, PlayerId } from "@optcg/types";

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
  const activeRevealIds = new Set(
    playerSnapshot.view.revealedCards.map((record) => record.id),
  );
  return opponentRevealsFromEvents(
    playerSnapshot.view.events,
    currentPlayerId,
    activeDismissedRevealIds,
    board === undefined
      ? undefined
      : {
          selfLabel: board.selfLabel,
          opponentLabel: board.opponentLabel,
        },
  )
    .filter((reveal) => activeRevealIds.has(reveal.revealId))
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
};
