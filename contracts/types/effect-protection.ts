import type { CardCategory } from "./card-metadata.js";
import type { CardFilter } from "./effects.js";

export interface EffectDslFieldRemovalProtection {
  process: "fieldRemoval";
  fieldRemoval: {
    processFamily: "fieldRemoval";
    classification:
      | "moveFromFieldToTrash"
      | "moveFromFieldToHand"
      | "moveFromFieldToDeck"
      | "moveFromFieldToLife"
      | "moveFromFieldToOtherZone";
    sourceKind: "cardEffect" | "ruleProcess" | "battle" | "cost" | "custom";
    sourceControllerRelation:
      | "opponentControlled"
      | "selfControlled"
      | "eitherController"
      | "unknownController";
    targetScope:
      | "thisCard"
      | "controllerFieldCharacter"
      | "controllerField"
      | "anyFieldCard";
    exclusions: {
      battleKO: "excluded" | "failClosed";
      ruleProcessTrash: "excluded" | "failClosed";
      controllerCost: "excluded" | "failClosed";
      controllerOwnedEffect: "excluded" | "failClosed";
      ambiguousCustomRemoval: "excluded" | "failClosed";
    };
  };
}

export interface EffectDslRestProtection {
  process: "rest";
  sourceKind: "cardEffect" | "ruleProcess" | "battle" | "cost" | "custom";
  sourceControllerRelation:
    | "opponentControlled"
    | "selfControlled"
    | "eitherController"
    | "unknownController";
  sourceCardCategories?: CardCategory[];
  sourceCardFilter?: CardFilter;
}

export type EffectDslProtection =
  | EffectDslFieldRemovalProtection
  | EffectDslRestProtection;
