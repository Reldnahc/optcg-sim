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
  EngineResult,
  GameState,
  PlayerId,
  Trigger,
} from "@optcg/types";
import {
  gameplayLinesFromTextParts,
  materializeEffectDefinition,
  parseRawKeywordLine,
} from "@optcg/cards";
import {
  fieldProbeSource,
  installProbeSourceMetadata,
  resolvedProbeCard,
  setupProbeMainState,
} from "./behavior-probe-scenario-state.js";
import { chooseProbeDecisionAction } from "./behavior-probe-decision-policy.js";
import {
  runCardPlayedScenario,
  runEndOfYourTurnScenario,
  runFieldRemovedScenario,
} from "./behavior-probe-event-scenarios.js";
import { runOnKOScenario } from "./behavior-probe-on-ko-scenario.js";
import { runOpponentAttackScenario } from "./behavior-probe-opponent-attack-scenario.js";
import { runPermanentScenario } from "./behavior-probe-permanent-scenario.js";
import { collectScenarioSetupFilters } from "./behavior-probe-setup-filters.js";
import { collectEffectBlockPrimitiveTypes } from "./engine-primitive-inventory.js";

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
    | "declareAttack"
    | "endOfYourTurn"
    | "fieldRemoved"
    | "lifeTrigger"
    | "lifeRemoved"
    | "onKO"
    | "opponentAttack"
    | "permanent"
    | "playCard";
  readonly cardCategory?: "leader" | "character" | "event";
  readonly status: "passed" | "failed" | "skipped";
  readonly primitiveTypes: readonly string[];
  readonly reason?: string;
}

type SupportedScenario =
  | { readonly kind: "playCard"; readonly category: "character" | "event" }
  | { readonly kind: "activateEffect"; readonly category: "character" }
  | { readonly kind: "counter"; readonly category: "event" }
  | { readonly kind: "cardPlayed"; readonly category: "character" }
  | { readonly kind: "declareAttack"; readonly category: "character" }
  | { readonly kind: "endOfYourTurn"; readonly category: "character" }
  | { readonly kind: "fieldRemoved"; readonly category: "character" }
  | { readonly kind: "opponentAttack"; readonly category: "leader" }
  | { readonly kind: "lifeTrigger"; readonly category: "character" }
  | { readonly kind: "lifeRemoved"; readonly category: "character" }
  | { readonly kind: "onKO"; readonly category: "character" }
  | { readonly kind: "permanent"; readonly category: "character" }
  | { readonly kind: "skipped"; readonly reason: string };

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

  const focusedEffects = focusedEffectBlocks(
    materialized.definition.effects,
    request.focusLineNumber,
  );
  const scenario = scenarioForDefinition(focusedEffects);
  const primitiveTypes = collectEffectBlockPrimitiveTypes(focusedEffects);
  if (scenario.kind === "skipped") {
    return {
      exitCode: 0,
      lines: [
        "Behavior probe: skipped",
        `Scenario 1 engine primitives: ${primitiveTypes.join(", ")}`,
        `Scenario 1 result: skipped - ${scenario.reason}`,
      ],
      errors: [],
      scenarios: [
        {
          index: 1,
          status: "skipped",
          primitiveTypes,
          reason: scenario.reason,
        },
      ],
    };
  }

  const scenarioInput = {
    category: scenario.category,
    definition: {
      ...materialized.definition,
      metadata: {
        ...materialized.definition.metadata,
        effectDefinitionsVersion: "behavior-probe",
      },
    },
    setupFilters: collectScenarioSetupFilters(materialized.definition.effects),
    text: request.text,
  };
  const result = (() => {
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
      case "declareAttack":
        return runDeclareAttackScenario({
          ...scenarioInput,
          category: "character",
        });
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
    }
  })();
  const passed = result.ok;
  const resultLine = passed
    ? "passed"
    : `failed - ${result.reason ?? "unknown reason"}`;
  return {
    exitCode: passed ? 0 : 1,
    lines: [
      `Behavior probe: ${passed ? "passed" : "failed"}`,
      `Scenario 1 entrypoint: ${scenario.kind}`,
      `Scenario 1 card category: ${scenario.category}`,
      `Scenario 1 engine primitives: ${primitiveTypes.join(", ")}`,
      `Scenario 1 result: ${resultLine}`,
      "Scenario 1 decision policy: max-progress",
      `Scenario 1 setup filters: ${String(result.setupFilterCount)}`,
      `Scenario 1 pending decisions: ${result.pendingDecisionDrained ? "drained" : "pending"}`,
      `Scenario 1 effect queue: ${result.effectQueueDrained ? "drained" : "pending"}`,
      `Scenario 1 decisions resolved: ${String(result.decisionsResolved)}`,
      `Scenario 1 events: ${String(result.eventCount)}`,
    ],
    errors: [],
    scenarios: [
      {
        index: 1,
        entrypoint: scenario.kind,
        cardCategory: scenario.category,
        status: passed ? "passed" : "failed",
        primitiveTypes,
        ...(result.reason === undefined ? {} : { reason: result.reason }),
      },
    ],
  };
};

const scenarioForDefinition = (
  effects: readonly EffectBlock[],
): SupportedScenario => {
  const firstTrigger = effects[0]?.trigger.type;
  if (firstTrigger === undefined) {
    return { kind: "skipped", reason: "no runtime effect blocks" };
  }
  if (effects.every((effect) => effect.trigger.type === "onPlay")) {
    return { kind: "playCard", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "main")) {
    return { kind: "playCard", category: "event" };
  }
  if (effects.every((effect) => effect.trigger.type === "activateMain")) {
    return { kind: "activateEffect", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "counter")) {
    return { kind: "counter", category: "event" };
  }
  if (effects.every((effect) => effectHasTrigger(effect, "cardPlayed"))) {
    return { kind: "cardPlayed", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "whenAttacking")) {
    return { kind: "declareAttack", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "endOfYourTurn")) {
    return { kind: "endOfYourTurn", category: "character" };
  }
  if (effects.every((effect) => effectHasTrigger(effect, "fieldRemoved"))) {
    return { kind: "fieldRemoved", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "onOpponentAttack")) {
    return { kind: "opponentAttack", category: "leader" };
  }
  if (effects.every((effect) => effect.trigger.type === "trigger")) {
    return { kind: "lifeTrigger", category: "character" };
  }
  if (effects.some((effect) => effect.trigger.type === "trigger")) {
    return { kind: "lifeTrigger", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "lifeRemoved")) {
    return { kind: "lifeRemoved", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "onKO")) {
    return { kind: "onKO", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "permanent")) {
    return { kind: "permanent", category: "character" };
  }
  return {
    kind: "skipped",
    reason: `no generated scenario for trigger ${firstTrigger}`,
  };
};

const effectHasTrigger = (
  effect: EffectBlock,
  triggerType: Trigger["type"],
): boolean => triggerContainsType(effect.trigger, triggerType);

const triggerContainsType = (
  trigger: Trigger,
  triggerType: Trigger["type"],
): boolean => {
  if (trigger.type === triggerType) {
    return true;
  }
  if (trigger.type === "anyOf") {
    return trigger.triggers.some((child) =>
      triggerContainsType(child, triggerType),
    );
  }
  if (trigger.type === "eventCount") {
    return triggerContainsType(trigger.trigger, triggerType);
  }
  return false;
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
