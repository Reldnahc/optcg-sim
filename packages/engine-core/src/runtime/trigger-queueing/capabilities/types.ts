import type { EngineEvent, SourcePresencePolicy, Trigger } from "@optcg/types";

export type TriggerQueueRouter =
  | "genericEventReaction"
  | "specializedAttack"
  | "specializedBattleKo"
  | "specializedHandTrash"
  | "specializedMainEvent"
  | "specializedOnPlay"
  | "specializedOpponentActivation"
  | "specializedTurn"
  | "specializedTrigger"
  | "unsupported";

export type BehaviorProbeScenarioKind =
  | "attackDeclared"
  | "cardDrawn"
  | "cardPlayed"
  | "cardRested"
  | "counter"
  | "damageDealt"
  | "declareAttack"
  | "donAttached"
  | "donReturned"
  | "endOfBattle"
  | "endOfYourTurn"
  | "effectQueued"
  | "fieldRemoved"
  | "handTrashedByEffect"
  | "lifeRemoved"
  | "lifeTrigger"
  | "onBlock"
  | "onKO"
  | "opponentActivated"
  | "opponentAttack"
  | "playCard"
  | "triggerActivated";

export type BehaviorProbeScenarioDescriptor =
  | { readonly kind: "playCard"; readonly category: "character" | "event" }
  | { readonly kind: "counter"; readonly category: "event" }
  | { readonly kind: "attackDeclared"; readonly category: "leader" }
  | { readonly kind: "cardPlayed"; readonly category: "character" }
  | { readonly kind: "cardDrawn"; readonly category: "character" }
  | { readonly kind: "cardRested"; readonly category: "character" }
  | { readonly kind: "declareAttack"; readonly category: "character" }
  | { readonly kind: "damageDealt"; readonly category: "character" }
  | { readonly kind: "donAttached"; readonly category: "character" }
  | { readonly kind: "donReturned"; readonly category: "character" }
  | { readonly kind: "endOfBattle"; readonly category: "character" }
  | { readonly kind: "endOfYourTurn"; readonly category: "character" }
  | { readonly kind: "effectQueued"; readonly category: "character" }
  | { readonly kind: "fieldRemoved"; readonly category: "character" }
  | { readonly kind: "handTrashedByEffect"; readonly category: "character" }
  | { readonly kind: "lifeTrigger"; readonly category: "character" }
  | { readonly kind: "lifeRemoved"; readonly category: "character" }
  | { readonly kind: "onBlock"; readonly category: "character" }
  | { readonly kind: "onKO"; readonly category: "character" }
  | { readonly kind: "opponentActivated"; readonly category: "character" }
  | { readonly kind: "opponentAttack"; readonly category: "leader" }
  | { readonly kind: "triggerActivated"; readonly category: "character" };

export interface TriggerQueueCapability {
  readonly triggerType: Exclude<Trigger["type"], "anyOf" | "eventCount">;
  readonly category: "auto" | "activate";
  readonly sourcePresencePolicies: readonly SourcePresencePolicy[];
  readonly router: TriggerQueueRouter;
  readonly runtimeEventTypes: readonly EngineEvent["type"][];
  readonly behaviorProbeScenario?: BehaviorProbeScenarioDescriptor;
}
