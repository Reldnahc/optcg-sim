import type { TriggerQueueCapability } from "./types.js";

const capability = (value: TriggerQueueCapability): TriggerQueueCapability =>
  value;

export const specializedTriggerQueueTypes = [
  "onPlay",
  "whenAttacking",
  "onOpponentAttack",
  "onKO",
  "endOfYourTurn",
  "main",
  "trigger",
  "counter",
  "handTrashedByEffect",
  "opponentActivated",
] as const;

export const specializedTriggerQueueCapabilities = [
  capability({
    triggerType: "onPlay",
    category: "auto",
    sourcePresencePolicies: [
      "mustRemainInSameZone",
      "resolveFromLastKnownInformation",
    ],
    router: "specializedOnPlay",
    runtimeEventTypes: ["cardPlayed"],
    behaviorProbeScenario: { kind: "playCard", category: "character" },
  }),
  capability({
    triggerType: "whenAttacking",
    category: "auto",
    sourcePresencePolicies: ["mustRemainInSameZone"],
    router: "specializedAttack",
    runtimeEventTypes: ["attackDeclared"],
    behaviorProbeScenario: { kind: "declareAttack", category: "character" },
  }),
  capability({
    triggerType: "onOpponentAttack",
    category: "auto",
    sourcePresencePolicies: ["mustRemainInSameZone"],
    router: "specializedAttack",
    runtimeEventTypes: ["attackDeclared"],
    behaviorProbeScenario: { kind: "opponentAttack", category: "leader" },
  }),
  capability({
    triggerType: "onKO",
    category: "auto",
    sourcePresencePolicies: [
      "resolveFromDestinationZone",
      "resolveFromLastKnownInformation",
    ],
    router: "specializedBattleKo",
    runtimeEventTypes: ["cardMoved"],
    behaviorProbeScenario: { kind: "onKO", category: "character" },
  }),
  capability({
    triggerType: "endOfYourTurn",
    category: "auto",
    sourcePresencePolicies: ["mustRemainInSameZone"],
    router: "specializedTurn",
    runtimeEventTypes: [],
    behaviorProbeScenario: { kind: "endOfYourTurn", category: "character" },
  }),
  capability({
    triggerType: "main",
    category: "auto",
    sourcePresencePolicies: ["noSourceRequired", "resolveFromDestinationZone"],
    router: "specializedMainEvent",
    runtimeEventTypes: ["cardPlayed"],
    behaviorProbeScenario: { kind: "playCard", category: "event" },
  }),
  capability({
    triggerType: "trigger",
    category: "auto",
    sourcePresencePolicies: [
      "noSourceRequired",
      "resolveFromLastKnownInformation",
    ],
    router: "specializedTrigger",
    runtimeEventTypes: ["triggerActivated"],
    behaviorProbeScenario: { kind: "lifeTrigger", category: "character" },
  }),
  capability({
    triggerType: "counter",
    category: "auto",
    sourcePresencePolicies: ["resolveFromDestinationZone"],
    router: "specializedTrigger",
    runtimeEventTypes: ["effectQueued"],
    behaviorProbeScenario: { kind: "counter", category: "event" },
  }),
  capability({
    triggerType: "handTrashedByEffect",
    category: "auto",
    sourcePresencePolicies: ["mustRemainInSameZone"],
    router: "specializedHandTrash",
    runtimeEventTypes: ["cardTrashed"],
    behaviorProbeScenario: {
      kind: "handTrashedByEffect",
      category: "character",
    },
  }),
  capability({
    triggerType: "opponentActivated",
    category: "auto",
    sourcePresencePolicies: ["mustRemainInSameZone"],
    router: "specializedOpponentActivation",
    runtimeEventTypes: ["cardPlayed", "blockerActivated", "triggerActivated"],
    behaviorProbeScenario: {
      kind: "opponentActivated",
      category: "character",
    },
  }),
] as const satisfies readonly TriggerQueueCapability[];
