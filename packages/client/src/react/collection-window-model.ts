import type { BoardViewModel } from "../view-model.js";
import type { CollectionModalModel } from "./CollectionModalHost.js";
import type { WindowRect, WindowViewport } from "./FloatingWindow.js";

export const collectionWindowKey = (title: string): string =>
  `collection:${title}`;

export const defaultCollectionWindowRect = (
  viewport: WindowViewport | undefined = typeof window === "undefined"
    ? undefined
    : { width: window.innerWidth, height: window.innerHeight },
): WindowRect => {
  const width = 560;
  const height = 460;
  if (viewport === undefined) {
    return { x: 320, y: 120, width, height };
  }
  return {
    x: Math.max(0, Math.round((viewport.width - width) / 2)),
    y: Math.max(0, Math.round((viewport.height - height) / 2)),
    width,
    height,
  };
};

export const collectionModalFromWindowKey = (
  key: string,
  board: BoardViewModel,
): CollectionModalModel | undefined => {
  switch (key) {
    case "collection:Player's trash":
    case "collection:Player trash":
      return { title: "Player's trash", cards: board.self.trash };
    case "collection:Opponent's trash":
    case "collection:Opponent trash":
      return { title: "Opponent's trash", cards: board.opponent.trash };
    default:
      return undefined;
  }
};
