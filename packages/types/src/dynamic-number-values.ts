import type { PlayerRef, SelectionId, SelectionSetId } from "./primitives.js";
import type { CardFilter, Target } from "./effects.js";

export type DynamicNumberValue =
  | {
      type: "savedNumber";
      selection: SelectionId;
    }
  | {
      type: "selectedCardCount";
      selection: SelectionId;
      per?: number;
      multiplier: number;
    }
  | {
      type: "sumSelectedCardCosts";
      selection: SelectionSetId;
      multiplier: number;
    }
  | {
      type: "paidCostCardCount";
      cost: string;
      multiplier: number;
    }
  | {
      type: "countDistinctMatchingFieldNames";
      player: PlayerRef;
      zone: "characterArea";
      filter: CardFilter;
      multiplier: number;
    }
  | {
      type: "countMatchingFieldCards";
      player: PlayerRef;
      zone: "characterArea";
      filter: CardFilter;
      multiplier: number;
    }
  | {
      type: "countMatchingZoneCards";
      player: PlayerRef;
      zone: "trash" | "life" | "costArea";
      filter?: CardFilter;
      per: number;
      multiplier: number;
      offset?: number;
      minimum?: number;
    }
  | {
      type: "countMatchingZoneCardsAcrossPlayers";
      players: PlayerRef[];
      zone: "life";
      filter?: CardFilter;
      per: number;
      multiplier: number;
      offset?: number;
      minimum?: number;
    }
  | {
      type: "fieldCountDifference";
      minuend: {
        player: PlayerRef;
        zone: "costArea";
        filter?: CardFilter;
      };
      subtrahend: {
        player: PlayerRef;
        zone: "costArea";
        filter?: CardFilter;
      };
      minimum?: number;
    }
  | {
      type: "countAttachedDon";
      target: Target;
      per: number;
      multiplier: number;
    };
