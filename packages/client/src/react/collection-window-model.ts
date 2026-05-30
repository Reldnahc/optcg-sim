import type { BoardViewModel } from "../view-model.js";
import type { CollectionModalModel } from "./CollectionModalHost.js";

export const collectionWindowKey = (title: string): string =>
  `collection:${title}`;

export const collectionModalFromWindowKey = (
  key: string,
  board: BoardViewModel,
): CollectionModalModel | undefined => {
  switch (key) {
    case "collection:Player trash":
      return { title: "Player trash", cards: board.self.trash };
    case "collection:Opponent trash":
      return { title: "Opponent trash", cards: board.opponent.trash };
    default:
      return undefined;
  }
};
