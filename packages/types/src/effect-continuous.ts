import type { Attribute, Keyword } from "./card-metadata.js";
import type { Duration, SavedFieldObjectTarget, Target } from "./effects.js";

export type KeywordGrantEffect = {
  type: "giveKeyword";
  target: Target;
  keyword: Keyword;
  duration: Duration;
};

export type AttributeGrantEffect = {
  type: "giveAttribute";
  target: Target;
  attribute: Attribute;
  duration: Duration;
};

export type BasePowerSwapEffect = {
  type: "swapBasePower";
  left: SavedFieldObjectTarget;
  right: SavedFieldObjectTarget;
  duration: Duration;
};

export type KeywordOrAttributeContinuousEffect =
  | KeywordGrantEffect
  | AttributeGrantEffect
  | BasePowerSwapEffect;
