import type { BoardViewModel, ClientCardModel } from "../view-model.js";
import type { useMatchClient } from "./useMatchClient.js";

type CardCostSelectionSource = NonNullable<
  NonNullable<ReturnType<typeof useMatchClient>["state"]["cardCostSelection"]>
>["source"];

export const sourceZoneCards = (
  board: BoardViewModel,
  source: CardCostSelectionSource,
): readonly ClientCardModel[] => {
  if (source === undefined) {
    return [];
  }
  const selfSource =
    source.playerId === undefined || source.playerId === board.playerId;
  const zones = selfSource ? board.self : board.opponent;
  switch (source.zone) {
    case "characterArea":
      return zones.characters;
    case "costArea":
      return zones.costArea;
    case "hand":
      return selfSource ? board.self.hand : [];
    case "leaderArea":
      return [zones.leader];
    case "stageArea":
      return zones.stage === undefined ? [] : [zones.stage];
    case "trash":
      return zones.trash;
    case "deck":
    case "donDeck":
    case "life":
    case "noZone":
      return [];
  }
};
