export type Brand<T, B extends string> = T & { readonly __brand: B };

export type CardId = Brand<string, "CardId">;
export type VariantKey = Brand<string, "VariantKey">;
export type LoadoutId = Brand<string, "LoadoutId">;
export type InstanceId = Brand<string, "InstanceId">;
export type PlayerId = Brand<string, "PlayerId">;
export type MatchId = Brand<string, "MatchId">;
export type EffectId = Brand<string, "EffectId">;
export type DecisionId = Brand<string, "DecisionId">;
export type EngineEventId = Brand<string, "EngineEventId">;
export type QueueEntryId = Brand<string, "QueueEntryId">;
export type TimingWindowId = Brand<string, "TimingWindowId">;
export type SelectionSetId = Brand<string, "SelectionSetId">;
export type SelectionId = Brand<string, "SelectionId">;
export type StateSeq = Brand<number, "StateSeq">;

export type Zone =
  | "hand"
  | "deck"
  | "trash"
  | "life"
  | "costArea"
  | "characterArea"
  | "stageArea"
  | "leaderArea"
  | "donDeck"
  | "noZone";

export type Visibility =
  | "bothPlayers"
  | "chooserOnly"
  | "ownerOnly"
  | "controllerOnly"
  | "hidden"
  | "replayOnly";

export type Comparator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";

export type PlayerRef =
  | "self"
  | "opponent"
  | "turnPlayer"
  | "nonTurnPlayer"
  | "owner"
  | "controller";

export type BattleStep = "attack" | "block" | "counter" | "damage" | "end";
export type MatchSource = "poneglyph" | "poneglyph-fixture" | "manual-test";
