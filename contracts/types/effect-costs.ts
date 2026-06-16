import type { PlayerRef, Zone } from "./primitives.js";
import type { CardFilter, Duration, Target } from "./effects.js";

export type TurnLifeFaceUpCost = {
  type: "turnLifeFaceUp";
  count: number;
  player: PlayerRef;
  position: "top" | "bottom";
};

export type SetLifeFaceUpCost = {
  type: "setLifeFaceUp";
  count: number;
  player: PlayerRef;
  position: "top" | "bottom";
  faceUp: boolean;
};

export type OptionalTurnLifeFaceUpCost = TurnLifeFaceUpCost & {
  optional: true;
};

export type OptionalSetLifeFaceUpCost = SetLifeFaceUpCost & {
  optional: true;
};

export type Cost =
  | {
      type: "restDon";
      count: number;
      maxCount?: number | "available";
      chooser?: PlayerRef;
      optional?: boolean;
    }
  | {
      type: "restFromField";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
      optional?: boolean;
    }
  | {
      type: "attachDon";
      count: number;
      sourceState: "active" | "rested";
      target: Target;
      optional?: boolean;
    }
  | {
      type: "returnDon";
      count: number;
      maxCount?: number | "available";
      chooser?: PlayerRef;
      sourceState?: "active";
      optional?: boolean;
    }
  | { type: "restSelf"; optional?: boolean }
  | TurnLifeFaceUpCost
  | SetLifeFaceUpCost
  | {
      type: "trashFromHand";
      count: number;
      maxCount?: number | "available";
      filter?: CardFilter;
      chooser: PlayerRef;
    }
  | {
      type: "revealFromHand";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
    }
  | {
      type: "moveCards";
      count: number;
      chooser: PlayerRef;
      from: {
        player: PlayerRef;
        zone: Zone;
        position?: "top" | "bottom" | "topOrBottom";
        source?: "effectSource";
      };
      to: { player: PlayerRef; zone: Zone; position?: "top" | "bottom" };
      order: "chooserChoice";
      optional?: boolean;
    }
  | {
      type: "moveFieldToLife";
      count: number;
      chooser: "self";
      player: "opponent" | "anyPlayer";
      filter?: CardFilter;
      position: "top" | "bottom" | "topOrBottom";
      faceUp?: boolean;
      optional?: boolean;
    }
  | {
      type: "modifyPower";
      target: Target;
      requiredState?: "active" | "rested";
      value: number;
      duration: Duration;
      optional?: boolean;
    }
  | { type: "trashSelf"; filter?: CardFilter }
  | {
      type: "trashFromField";
      count: number;
      filter?: CardFilter;
      chooser: "self";
      optional?: boolean;
    }
  | {
      type: "koFromField";
      count: number;
      filter?: CardFilter;
      chooser: "self";
      optional?: boolean;
    }
  | {
      type: "discard";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
    }
  | { type: "sequence"; costs: Cost[]; optional?: boolean }
  | { type: "custom"; action: string };

export type OptionalTrashFromHandCost = {
  type: "trashFromHand";
  count: number;
  maxCount?: number | "available";
  filter?: CardFilter;
  chooser: PlayerRef;
  optional: true;
};

export type OptionalRevealFromHandCost = {
  type: "revealFromHand";
  count: number;
  filter?: CardFilter;
  chooser: PlayerRef;
  optional: true;
};

export type OptionalMoveCardsCost = {
  type: "moveCards";
  count: number;
  chooser: PlayerRef;
  from: {
    player: PlayerRef;
    zone: Zone;
    position?: "top" | "bottom" | "topOrBottom";
    source?: "effectSource";
  };
  to: { player: PlayerRef; zone: Zone; position?: "top" | "bottom" };
  order: "chooserChoice";
  filter?: CardFilter;
  optional: true;
};

export type OptionalMoveFieldToLifeCost = {
  type: "moveFieldToLife";
  count: number;
  chooser: "self";
  player: "opponent" | "anyPlayer";
  filter?: CardFilter;
  position: "top" | "bottom" | "topOrBottom";
  faceUp?: boolean;
  optional: true;
};

export type ScopedOptionalFieldTrashCost = {
  type: "trashFromField";
  count: number;
  filter?: CardFilter;
  chooser: "self";
  optional: true;
};

export type ScopedOptionalFieldKOCost = {
  type: "koFromField";
  count: number;
  filter?: CardFilter;
  chooser: "self";
  optional: true;
};

export type OptionalChooseOneTrashCostAlternative =
  | OptionalTrashFromHandCost
  | ScopedOptionalFieldTrashCost;

export type OptionalChooseOneTrashCost = {
  type: "chooseOne";
  options: [
    OptionalChooseOneTrashCostAlternative,
    ...OptionalChooseOneTrashCostAlternative[],
  ];
  optional: true;
};

export type OptionalCost =
  | {
      type: "restDon";
      count: number;
      maxCount?: number | "available";
      chooser?: PlayerRef;
      optional: true;
    }
  | {
      type: "attachDon";
      count: number;
      sourcePlayer?: PlayerRef;
      sourceState: "active" | "rested";
      target: Target;
      optional: true;
    }
  | {
      type: "returnDon";
      count: number;
      maxCount?: number | "available";
      chooser?: PlayerRef;
      sourceState?: "active";
      optional: true;
    }
  | { type: "restSelf"; optional: true }
  | {
      type: "restFromField";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
      optional: true;
    }
  | { type: "trashSelf"; filter?: CardFilter; optional: true }
  | ScopedOptionalFieldTrashCost
  | ScopedOptionalFieldKOCost
  | {
      type: "modifyPower";
      target: Target;
      requiredState?: "active" | "rested";
      value: number;
      duration: Duration;
      optional: true;
    }
  | OptionalTurnLifeFaceUpCost
  | OptionalSetLifeFaceUpCost
  | OptionalTrashFromHandCost
  | OptionalRevealFromHandCost
  | OptionalMoveCardsCost
  | OptionalMoveFieldToLifeCost
  | OptionalChooseOneTrashCost
  | { type: "sequence"; costs: Cost[]; optional: true };
