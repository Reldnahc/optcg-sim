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

export type BehaviorProbeScenarioCategory = "character" | "event" | "leader";

export interface BehaviorProbeScenarioDescriptor {
  readonly kind: BehaviorProbeScenarioKind;
  readonly category: BehaviorProbeScenarioCategory;
}

export interface TriggerQueueCapability {
  readonly triggerType: Exclude<Trigger["type"], "anyOf" | "eventCount">;
  readonly category: "auto" | "activate";
  readonly sourcePresencePolicies: readonly SourcePresencePolicy[];
  readonly router: TriggerQueueRouter;
  readonly runtimeEventTypes: readonly EngineEvent["type"][];
  readonly behaviorProbeScenario?: BehaviorProbeScenarioDescriptor;
}
