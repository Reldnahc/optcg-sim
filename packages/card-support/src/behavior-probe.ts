import {
  applyAction,
  evaluateEffectBlockRuntimeSupport,
  getLegalActions,
} from "@optcg/engine-core";
import type {
  Action,
  CardId,
  CardFilter,
  EffectBlock,
  EffectDefinition,
  EngineResult,
  GameState,
  PlayerId,
} from "@optcg/types";
import {
  gameplayLinesFromTextParts,
  materializeEffectDefinition,
  parseRawKeywordLine,
} from "@optcg/cards";
import {
  configureProbeFieldSourceForScenario,
  fieldProbeSource,
  installProbeSourceMetadata,
  resolvedProbeCard,
  setupProbeMainState,
} from "./behavior-probe-scenario-state.js";
import { chooseProbeDecisionAction } from "./behavior-probe-decision-policy.js";
import {
  runCardPlayedScenario,
  runCardRestedScenario,
  runDonReturnedScenario,
  runEndOfYourTurnScenario,
  runFieldRemovedScenario,
  runHandTrashedByEffectScenario,
  runOpponentActivatedScenario,
} from "./behavior-probe-event-scenarios.js";
import { runOnKOScenario } from "./behavior-probe-on-ko-scenario.js";
import { runOpponentAttackScenario } from "./behavior-probe-opponent-attack-scenario.js";
import { runPermanentScenario } from "./behavior-probe-permanent-scenario.js";
import { runReplacementScenario } from "./behavior-probe-replacement-scenario.js";
import {
  scenarioPlansForEffects,
  type RunnableScenario,
} from "./behavior-probe-scenario-plans.js";
import { collectScenarioSetupFilters } from "./behavior-probe-setup-filters.js";

export interface BehaviorProbeRequest {
  readonly text: string;
  readonly focusLineNumber?: number;
}

export type BehaviorProbeFailure = {
  readonly kind: "materializationFailed";
  readonly diagnostics: readonly string[];
};

export interface BehaviorProbeReport {
  readonly exitCode: number;
  readonly lines: readonly string[];
  readonly errors: readonly string[];
  readonly scenarios: readonly BehaviorProbeScenario[];
  readonly failure?: BehaviorProbeFailure;
}

export interface BehaviorProbeScenario {
  readonly index: number;
  readonly entrypoint?:
    | "activateEffect"
    | "counter"
    | "cardPlayed"
    | "cardRested"
    | "declareAttack"
    | "donReturned"
    | "endOfYourTurn"
    | "fieldRemoved"
    | "handTrashedByEffect"
    | "lifeTrigger"
    | "lifeRemoved"
    | "onKO"
    | "opponentActivated"
    | "opponentAttack"
    | "permanent"
    | "playCard"
    | "replacement";
  readonly cardCategory?: "leader" | "character" | "event";
  readonly status: "passed" | "failed" | "skipped";
  readonly primitiveTypes: readonly string[];
  readonly reason?: string;
}

interface ScenarioInput {
  readonly category: "leader" | "character" | "event";
  readonly definition: EffectDefinition;
  readonly setupFilters: readonly CardFilter[];
  readonly text: string;
}

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;
const probeCardId = "probe-card" as CardId;
const maxDecisionSteps = 30;
export const createBehaviorProbeReport = (
  request: BehaviorProbeRequest,
): BehaviorProbeReport => {
  const effectLines = gameplayLinesFromTextParts([request.text]).filter(
    (line) => parseRawKeywordLine({ text: line }) === undefined,
  );
  const materialized = materializeEffectDefinition(
    probeCardId,
    effectLines,
    "behavior-probe-source",
    {
      effectDefinitionsVersion: "behavior-probe",
      rulesVersion: "behavior-probe",
    },
    { evaluateRuntimeSupport: evaluateEffectBlockRuntimeSupport },
  );

  if (!materialized.runtimeSupported || materialized.definition === undefined) {
    return {
      exitCode: 1,
      lines: [
        "Behavior probe: failed",
        ...materialized.diagnostics.map(
          (diagnostic) => `Behavior probe diagnostic: ${diagnostic}`,
        ),
      ],
      errors: [],
      scenarios: [],
      failure: {
        kind: "materializationFailed",
        diagnostics: materialized.diagnostics,
      },
    };
  }
  const materializedDefinition = materialized.definition;

  const focusedEffects = focusedEffectBlocks(
    materializedDefinition.effects,
    request.focusLineNumber,
  );
  const scenarioResults = scenarioPlansForEffects(focusedEffects).map(
    (plan, index) => {
      const scenarioIndex = index + 1;
      if (plan.scenario.kind === "skipped") {
        return {
          lines: [
            `Scenario ${String(scenarioIndex)} engine primitives: ${plan.primitiveTypes.join(", ")}`,
            `Scenario ${String(scenarioIndex)} result: skipped - ${plan.scenario.reason}`,
          ],
          scenario: {
            index: scenarioIndex,
            status: "skipped" as const,
            primitiveTypes: plan.primitiveTypes,
            reason: plan.scenario.reason,
          },
        };
      }
      const scenarioDefinition: EffectDefinition = {
        ...materializedDefinition,
        effects: [...plan.effects],
        metadata: {
          ...materializedDefinition.metadata,
          effectDefinitionsVersion: "behavior-probe",
        },
      };
      const scenarioInput: ScenarioInput = {
        category: plan.scenario.category,
        definition: scenarioDefinition,
        setupFilters: collectScenarioSetupFilters(plan.effects),
        text: request.text,
      };
      const result = runScenario(plan.scenario, scenarioInput);
      const passed = result.ok;
      const resultLine = passed
        ? "passed"
        : `failed - ${result.reason ?? "unknown reason"}`;
      return {
        lines: [
          `Scenario ${String(scenarioIndex)} entrypoint: ${plan.scenario.kind}`,
          `Scenario ${String(scenarioIndex)} card category: ${plan.scenario.category}`,
          `Scenario ${String(scenarioIndex)} engine primitives: ${plan.primitiveTypes.join(", ")}`,
          `Scenario ${String(scenarioIndex)} result: ${resultLine}`,
          `Scenario ${String(scenarioIndex)} decision policy: max-progress`,
          `Scenario ${String(scenarioIndex)} setup filters: ${String(result.setupFilterCount)}`,
          `Scenario ${String(scenarioIndex)} pending decisions: ${result.pendingDecisionDrained ? "drained" : "pending"}`,
          `Scenario ${String(scenarioIndex)} effect queue: ${result.effectQueueDrained ? "drained" : "pending"}`,
          `Scenario ${String(scenarioIndex)} decisions resolved: ${String(result.decisionsResolved)}`,
          `Scenario ${String(scenarioIndex)} events: ${String(result.eventCount)}`,
        ],
        scenario: {
          index: scenarioIndex,
          entrypoint: plan.scenario.kind,
          cardCategory: plan.scenario.category,
          status: passed ? ("passed" as const) : ("failed" as const),
          primitiveTypes: plan.primitiveTypes,
          ...(result.reason === undefined ? {} : { reason: result.reason }),
        },
      };
    },
  );
  const scenarios = scenarioResults.map((result) => result.scenario);
  const failed = scenarios.some((scenario) => scenario.status === "failed");
  const skipped = scenarios.every((scenario) => scenario.status === "skipped");
  return {
    exitCode: failed ? 1 : 0,
    lines: [
      `Behavior probe: ${failed ? "failed" : skipped ? "skipped" : "passed"}`,
      ...scenarioResults.flatMap((result) => result.lines),
    ],
    errors: [],
    scenarios,
  };
};

const runScenario = (
  scenario: RunnableScenario,
  scenarioInput: ScenarioInput,
) => {
  switch (scenario.kind) {
    case "activateEffect":
      return runActivateEffectScenario({
        ...scenarioInput,
        category: "character",
      });
    case "counter":
      return runCounterScenario({ ...scenarioInput, category: "event" });
    case "cardPlayed":
      return runCardPlayedScenario(
        {
          ...scenarioInput,
          category: "character",
        },
        (initialResult, setupFilterCount) =>
          drainRuntime(
            initialResult,
            setupFilterCount,
            scenarioInput.definition.effects,
          ),
      );
    case "cardRested":
      return runCardRestedScenario(
        {
          ...scenarioInput,
          category: "character",
        },
        (initialResult, setupFilterCount) =>
          drainRuntime(
            initialResult,
            setupFilterCount,
            scenarioInput.definition.effects,
          ),
      );
    case "declareAttack":
      return runDeclareAttackScenario({
        ...scenarioInput,
        category: "character",
      });
    case "donReturned":
      return runDonReturnedScenario(
        {
          ...scenarioInput,
          category: "character",
        },
        (initialResult, setupFilterCount) =>
          drainRuntime(
            initialResult,
            setupFilterCount,
            scenarioInput.definition.effects,
          ),
      );
    case "endOfYourTurn":
      return runEndOfYourTurnScenario(
        {
          ...scenarioInput,
          category: "character",
        },
        (initialResult, setupFilterCount) =>
          drainRuntime(
            initialResult,
            setupFilterCount,
            scenarioInput.definition.effects,
          ),
      );
    case "fieldRemoved":
      return runFieldRemovedScenario(
        {
          ...scenarioInput,
          category: "character",
        },
        (initialResult, setupFilterCount) =>
          drainRuntime(
            initialResult,
            setupFilterCount,
            scenarioInput.definition.effects,
          ),
      );
    case "handTrashedByEffect":
      return runHandTrashedByEffectScenario(
        {
          ...scenarioInput,
          category: "character",
        },
        (initialResult, setupFilterCount) =>
          drainRuntime(
            initialResult,
            setupFilterCount,
            scenarioInput.definition.effects,
          ),
      );
    case "opponentAttack":
      return runOpponentAttackScenario(
        {
          ...scenarioInput,
          category: "leader",
        },
        (initialResult, setupFilterCount) =>
          drainRuntime(
            initialResult,
            setupFilterCount,
            scenarioInput.definition.effects,
          ),
      );
    case "lifeTrigger":
      return runLifeTriggerScenario({
        ...scenarioInput,
        category: "character",
      });
    case "lifeRemoved":
      return runLifeRemovedScenario({
        ...scenarioInput,
        category: "character",
      });
    case "onKO":
      return runOnKOScenario(
        {
          ...scenarioInput,
          category: "character",
        },
        (initialResult, setupFilterCount) =>
          drainRuntime(
            initialResult,
            setupFilterCount,
            scenarioInput.definition.effects,
          ),
      );
    case "opponentActivated":
      return runOpponentActivatedScenario(
        {
          ...scenarioInput,
          category: "character",
        },
        (initialResult, setupFilterCount) =>
          drainRuntime(
            initialResult,
            setupFilterCount,
            scenarioInput.definition.effects,
          ),
      );
    case "permanent":
      return runPermanentScenario(
        {
          ...scenarioInput,
          category: "character",
        },
        (initialResult, setupFilterCount) =>
          drainRuntime(
            initialResult,
            setupFilterCount,
            scenarioInput.definition.effects,
          ),
      );
    case "playCard":
      return runPlayCardScenario({
        ...scenarioInput,
        category: scenario.category,
      });
    case "replacement":
      return runReplacementScenario(
        {
          ...scenarioInput,
          category: "character",
        },
        (initialResult, setupFilterCount) =>
          drainRuntime(
            initialResult,
            setupFilterCount,
            scenarioInput.definition.effects,
          ),
      );
  }
};

const focusedEffectBlocks = (
  effects: readonly EffectBlock[],
  lineNumber: number | undefined,
): readonly EffectBlock[] => {
  if (lineNumber === undefined) {
    return effects;
  }
  return effects.filter(
    (effect) => effectBlockLineNumber(effect) === lineNumber,
  );
};

const effectBlockLineNumber = (effect: EffectBlock): number | undefined => {
  const suffix = String(effect.id).split(":generated:")[1];
  const rawLineNumber = suffix?.split(":")[0];
  if (rawLineNumber === undefined) {
    return undefined;
  }
  const lineNumber = Number.parseInt(rawLineNumber, 10);
  return Number.isFinite(lineNumber) ? lineNumber : undefined;
};

const runPlayCardScenario = (input: {
  readonly category: "character" | "event";
  readonly definition: NonNullable<
    ReturnType<typeof materializeEffectDefinition>["definition"]
  >;
  readonly setupFilters: readonly CardFilter[];
  readonly text: string;
}): {
  readonly ok: boolean;
  readonly reason?: string;
  readonly pendingDecisionDrained: boolean;
  readonly effectQueueDrained: boolean;
  readonly eventCount: number;
  readonly decisionsResolved: number;
  readonly setupFilterCount: number;
} => {
  const state = setupProbeMainState(input);
  const player = state.players[p1];
  const card = player?.hand.find(
    (candidate) => candidate.cardId === probeCardId,
  );
  if (card === undefined) {
    return {
      ok: false,
      reason: "probe card was not in hand",
      pendingDecisionDrained: state.pendingDecision === undefined,
      effectQueueDrained: state.effectQueue.length === 0,
      eventCount: 0,
      decisionsResolved: 0,
      setupFilterCount: input.setupFilters.length,
    };
  }

  const opened = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  return drainRuntime(
    opened,
    input.setupFilters.length,
    input.definition.effects,
  );
};

const runActivateEffectScenario = (input: {
  readonly category: "character";
  readonly definition: NonNullable<
    ReturnType<typeof materializeEffectDefinition>["definition"]
  >;
  readonly setupFilters: readonly CardFilter[];
  readonly text: string;
}): {
  readonly ok: boolean;
  readonly reason?: string;
  readonly pendingDecisionDrained: boolean;
  readonly effectQueueDrained: boolean;
  readonly eventCount: number;
  readonly decisionsResolved: number;
  readonly setupFilterCount: number;
} => {
  const state = setupProbeMainState(input);
  installProbeSourceMetadata(state, "character", input.setupFilters);
  const player = must(state.players[p1], `player ${String(p1)}`);
  const source = fieldProbeSource(player);
  if (source === undefined) {
    return {
      ok: false,
      reason: "probe card could not be fielded",
      pendingDecisionDrained: state.pendingDecision === undefined,
      effectQueueDrained: state.effectQueue.length === 0,
      eventCount: 0,
      decisionsResolved: 0,
      setupFilterCount: input.setupFilters.length,
    };
  }
  configureProbeFieldSourceForScenario(state, source, input.definition.effects);

  const action = getLegalActions(state, p1).find(
    (candidate): candidate is Extract<Action, { type: "activateEffect" }> =>
      candidate.type === "activateEffect" &&
      candidate.source.instanceId === source.instanceId,
  );
  if (action === undefined) {
    return {
      ok: false,
      reason: "no legal activateEffect action",
      pendingDecisionDrained: state.pendingDecision === undefined,
      effectQueueDrained: state.effectQueue.length === 0,
      eventCount: 0,
      decisionsResolved: 0,
      setupFilterCount: input.setupFilters.length,
    };
  }

  return drainRuntime(
    applyAction(state, action),
    input.setupFilters.length,
    input.definition.effects,
  );
};

const runDeclareAttackScenario = (input: {
  readonly category: "character";
  readonly definition: NonNullable<
    ReturnType<typeof materializeEffectDefinition>["definition"]
  >;
  readonly setupFilters: readonly CardFilter[];
  readonly text: string;
}): {
  readonly ok: boolean;
  readonly reason?: string;
  readonly pendingDecisionDrained: boolean;
  readonly effectQueueDrained: boolean;
  readonly eventCount: number;
  readonly decisionsResolved: number;
  readonly setupFilterCount: number;
} => {
  const state = setupProbeMainState(input);
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  const player = must(state.players[p1], `player ${String(p1)}`);
  const source = fieldProbeSource(player);
  if (source === undefined) {
    return {
      ok: false,
      reason: "probe card could not be fielded",
      pendingDecisionDrained: state.pendingDecision === undefined,
      effectQueueDrained: state.effectQueue.length === 0,
      eventCount: 0,
      decisionsResolved: 0,
      setupFilterCount: input.setupFilters.length,
    };
  }
  const defender = must(state.players[p2], `player ${String(p2)}`);
  defender.hand = [];
  const target = defender.leader;
  return drainRuntime(
    applyAction(state, {
      type: "declareAttack",
      attacker: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      target: {
        instanceId: target.instanceId,
        cardId: target.cardId,
        playerId: p2,
        zone: target.zone,
      },
    }),
    input.setupFilters.length,
    input.definition.effects,
  );
};

const runCounterScenario = (input: {
  readonly category: "event";
  readonly definition: NonNullable<
    ReturnType<typeof materializeEffectDefinition>["definition"]
  >;
  readonly setupFilters: readonly CardFilter[];
  readonly text: string;
}): {
  readonly ok: boolean;
  readonly reason?: string;
  readonly pendingDecisionDrained: boolean;
  readonly effectQueueDrained: boolean;
  readonly eventCount: number;
  readonly decisionsResolved: number;
  readonly setupFilterCount: number;
} => {
  const state = setupProbeMainState(input);
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  const attacker = must(state.players[p1], `player ${String(p1)}`);
  const defender = must(state.players[p2], `player ${String(p2)}`);
  attacker.leader.state = "active";
  defender.leader.state = "active";
  const probeHandIndex = attacker.hand.findIndex(
    (candidate) => candidate.cardId === probeCardId,
  );
  const probeCard = attacker.hand[probeHandIndex];
  if (probeCard === undefined) {
    return drainResult(
      false,
      state,
      0,
      0,
      input.setupFilters.length,
      "probe counter event was not in hand",
    );
  }
  attacker.hand = attacker.hand
    .filter((_, index) => index !== probeHandIndex)
    .map((card, index) => ({
      ...card,
      zone: {
        zone: "hand" as const,
        playerId: p1,
        slot: "hand" as const,
        index,
      },
    }));
  const costCard = defender.hand.find(
    (candidate) => candidate.cardId !== probeCardId,
  );
  defender.hand = [
    {
      ...probeCard,
      owner: p2,
      controller: p2,
      zone: {
        zone: "hand" as const,
        playerId: p2,
        slot: "hand" as const,
        index: 0,
      },
    },
    ...(costCard === undefined
      ? []
      : [
          {
            ...costCard,
            owner: p2,
            controller: p2,
            zone: {
              zone: "hand" as const,
              playerId: p2,
              slot: "hand" as const,
              index: 1,
            },
          },
        ]),
  ];
  if (costCard !== undefined) {
    state.cardManifest.cards[costCard.cardId] = resolvedProbeCard({
      cardId: costCard.cardId,
      category: "character",
      effectText: "",
    });
  }
  const opened = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.leader.instanceId,
      cardId: attacker.leader.cardId,
      playerId: p1,
      zone: attacker.leader.zone,
    },
    target: {
      instanceId: defender.leader.instanceId,
      cardId: defender.leader.cardId,
      playerId: p2,
      zone: defender.leader.zone,
    },
  });
  if (opened.errors !== undefined) {
    return drainRuntime(
      opened,
      input.setupFilters.length,
      input.definition.effects,
    );
  }
  const counterAction = getLegalActions(opened.state, p2).find(
    (action): action is Extract<Action, { type: "useCounter" }> =>
      action.type === "useCounter" &&
      action.cardInstanceId === probeCard.instanceId,
  );
  if (counterAction === undefined) {
    return drainResult(
      false,
      opened.state,
      opened.events.length,
      0,
      input.setupFilters.length,
      "no legal useCounter action",
    );
  }
  return drainRuntime(
    applyAction(opened.state, counterAction),
    input.setupFilters.length,
    input.definition.effects,
  );
};

const runLifeTriggerScenario = (input: {
  readonly category: "character";
  readonly definition: NonNullable<
    ReturnType<typeof materializeEffectDefinition>["definition"]
  >;
  readonly setupFilters: readonly CardFilter[];
  readonly text: string;
}): {
  readonly ok: boolean;
  readonly reason?: string;
  readonly pendingDecisionDrained: boolean;
  readonly effectQueueDrained: boolean;
  readonly eventCount: number;
  readonly decisionsResolved: number;
  readonly setupFilterCount: number;
} => {
  const state = setupProbeMainState(input);
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  const attacker = must(state.players[p1], `player ${String(p1)}`);
  const defender = must(state.players[p2], `player ${String(p2)}`);
  attacker.leader.state = "active";
  defender.leader.state = "active";
  defender.hand = [];
  defender.characters = [];
  const topLife = must(defender.life[0], "defender top Life");
  defender.life[0] = {
    ...topLife,
    card: {
      ...topLife.card,
      cardId: probeCardId,
    },
  };
  const resolved = must(
    state.cardManifest.cards[probeCardId],
    "probe card metadata",
  );
  state.cardManifest.cards[probeCardId] = {
    ...resolved,
    triggerText: input.text,
  };

  return drainRuntime(
    applyAction(state, {
      type: "declareAttack",
      attacker: {
        instanceId: attacker.leader.instanceId,
        cardId: attacker.leader.cardId,
        playerId: p1,
        zone: attacker.leader.zone,
      },
      target: {
        instanceId: defender.leader.instanceId,
        cardId: defender.leader.cardId,
        playerId: p2,
        zone: defender.leader.zone,
      },
    }),
    input.setupFilters.length,
    input.definition.effects,
  );
};

const runLifeRemovedScenario = (input: {
  readonly category: "character";
  readonly definition: NonNullable<
    ReturnType<typeof materializeEffectDefinition>["definition"]
  >;
  readonly setupFilters: readonly CardFilter[];
  readonly text: string;
}): {
  readonly ok: boolean;
  readonly reason?: string;
  readonly pendingDecisionDrained: boolean;
  readonly effectQueueDrained: boolean;
  readonly eventCount: number;
  readonly decisionsResolved: number;
  readonly setupFilterCount: number;
} => {
  const state = setupProbeMainState(input);
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  const attacker = must(state.players[p1], `player ${String(p1)}`);
  const defender = must(state.players[p2], `player ${String(p2)}`);
  attacker.leader.state = "active";
  defender.leader.state = "active";
  defender.hand = [];
  const source = fieldProbeSource(attacker);
  if (source === undefined) {
    return {
      ok: false,
      reason: "probe card could not be fielded",
      pendingDecisionDrained: state.pendingDecision === undefined,
      effectQueueDrained: state.effectQueue.length === 0,
      eventCount: 0,
      decisionsResolved: 0,
      setupFilterCount: input.setupFilters.length,
    };
  }

  return drainRuntime(
    applyAction(state, {
      type: "declareAttack",
      attacker: {
        instanceId: attacker.leader.instanceId,
        cardId: attacker.leader.cardId,
        playerId: p1,
        zone: attacker.leader.zone,
      },
      target: {
        instanceId: defender.leader.instanceId,
        cardId: defender.leader.cardId,
        playerId: p2,
        zone: defender.leader.zone,
      },
    }),
    input.setupFilters.length,
    input.definition.effects,
  );
};

const drainRuntime = (
  initialResult: EngineResult,
  setupFilterCount = 0,
  effectBlocks: readonly EffectBlock[] = [],
): {
  readonly ok: boolean;
  readonly reason?: string;
  readonly pendingDecisionDrained: boolean;
  readonly effectQueueDrained: boolean;
  readonly eventCount: number;
  readonly decisionsResolved: number;
  readonly setupFilterCount: number;
} => {
  let result = initialResult;
  let state = result.state;
  let eventCount = result.events.length;
  let decisionsResolved = 0;
  for (let step = 0; step < maxDecisionSteps; step += 1) {
    if (result.errors !== undefined && result.errors.length > 0) {
      return drainResult(
        false,
        state,
        eventCount,
        decisionsResolved,
        setupFilterCount,
        engineErrorReason(result.errors[0]),
      );
    }
    if (
      state.pendingDecision === undefined &&
      state.effectQueue.length === 0 &&
      state.deferredTriggers.length === 0
    ) {
      return drainResult(
        true,
        state,
        eventCount,
        decisionsResolved,
        setupFilterCount,
      );
    }

    const decision = state.pendingDecision;
    if (decision === undefined) {
      return drainResult(
        false,
        state,
        eventCount,
        decisionsResolved,
        setupFilterCount,
        "runtime work did not drain",
      );
    }
    const nextAction = chooseProbeDecisionAction(
      state,
      getLegalActions(state, decision.playerId),
      effectBlocks,
    );
    if (nextAction === undefined) {
      return drainResult(
        false,
        state,
        eventCount,
        decisionsResolved,
        setupFilterCount,
        `no legal response for ${decision.type}`,
      );
    }
    result = applyAction(state, nextAction);
    state = result.state;
    eventCount += result.events.length;
    decisionsResolved += 1;
  }

  return drainResult(
    false,
    state,
    eventCount,
    decisionsResolved,
    setupFilterCount,
    "decision drain step limit hit",
  );
};

const drainResult = (
  ok: boolean,
  state: GameState,
  eventCount: number,
  decisionsResolved: number,
  setupFilterCount: number,
  reason?: string,
) => ({
  ok,
  ...(reason === undefined ? {} : { reason }),
  pendingDecisionDrained: state.pendingDecision === undefined,
  effectQueueDrained: state.effectQueue.length === 0,
  eventCount,
  decisionsResolved,
  setupFilterCount,
});

const engineErrorReason = (
  error: EngineResult["errors"] extends readonly (infer T)[] | undefined
    ? T | undefined
    : never,
): string | undefined => {
  if (error === undefined) {
    return undefined;
  }
  switch (error.type) {
    case "illegalAction":
    case "invalidDecisionResponse":
      return error.reason;
    case "invariantViolation":
      return `invariant violation: ${error.invariant}`;
    case "unsupportedCard":
      return `unsupported card: ${String(error.cardId)} ${error.status}`;
    case "effectRuntimeError":
      return `effect runtime error: ${error.effectId}${formatErrorDetails(error.details)}`;
    case "loopDetected":
      return "loop detected";
  }
};

const formatErrorDetails = (details: unknown): string => {
  const serialized = JSON.stringify(details);
  return ` ${serialized}`;
};
const must = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`Behavior probe missing ${label}.`);
  }
  return value;
};
