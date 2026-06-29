export type BotCardRole =
  | "attacker"
  | "blocker"
  | "rush"
  | "removal"
  | "searcher"
  | "draw"
  | "ramp"
  | "power-reduction"
  | "high-counter"
  | "engine-piece"
  | "combo-enabler"
  | "combo-payoff"
  | "preserve"
  | "low-priority-payment";

export interface BotDeckProfileData {
  readonly id: string;
  readonly cardRoles: Partial<Record<string, readonly BotCardRole[]>>;
  readonly searchPriorities: Partial<Record<string, readonly string[]>>;
  readonly preserveCards: readonly string[];
  readonly cheatTargets: readonly BotCheatTargetPolicy[];
  readonly effectPolicies: readonly BotEffectPolicy[];
  readonly playScores?: Partial<Record<string, number>>;
  readonly cheatEnablerHardCastScores?: Partial<Record<string, number>>;
}

export interface BotCheatTargetPolicy {
  readonly sourceCardId: string;
  readonly cardId: string;
  readonly baseScore: number;
  readonly bonusWhenOpponentHasRemovableCharacter?: number;
}

export interface BotEffectPolicy {
  readonly sourceCardId: string;
  readonly kind: "powerReduction";
  readonly amount: number;
  readonly target: "opponentCharacter" | "currentAttacker";
  readonly restsSource: boolean;
}
