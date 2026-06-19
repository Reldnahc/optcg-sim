import {
  applyAction,
  evaluateEffectBlockRuntimeSupport,
  getLegalActions,
} from "@optcg/engine-core";
import type {
  Action,
  CardId,
  CardFilter,
  Condition,
  Effect,
  EffectBlock,
  EngineResult,
  GameState,
  LegalAction,
  OptionalCost,
  PlayerId,
  Target,
} from "@optcg/types";
import {
  gameplayLinesFromTextParts,
  materializeEffectDefinition,
  parseRawKeywordLine,
} from "@optcg/cards";
import {
  fieldProbeSource,
  setupProbeMainState,
} from "./behavior-probe-scenario-state.js";
import { collectEffectBlockPrimitiveTypes } from "./engine-primitive-inventory.js";

export interface BehaviorProbeRequest {
  readonly text: string;
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
    | "declareAttack"
    | "lifeTrigger"
    | "playCard";
  readonly cardCategory?: "character" | "event";
  readonly status: "passed" | "failed" | "skipped";
  readonly primitiveTypes: readonly string[];
  readonly reason?: string;
}

type SupportedScenario =
  | { readonly kind: "playCard"; readonly category: "character" | "event" }
  | { readonly kind: "activateEffect"; readonly category: "character" }
  | { readonly kind: "declareAttack"; readonly category: "character" }
  | { readonly kind: "lifeTrigger"; readonly category: "character" }
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

  const scenario = scenarioForDefinition(materialized.definition.effects);
  const primitiveTypes = collectEffectBlockPrimitiveTypes(
    materialized.definition.effects,
  );
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
  const result =
    scenario.kind === "activateEffect"
      ? runActivateEffectScenario({ ...scenarioInput, category: "character" })
      : scenario.kind === "declareAttack"
        ? runDeclareAttackScenario({
            ...scenarioInput,
            category: "character",
          })
        : scenario.kind === "lifeTrigger"
          ? runLifeTriggerScenario({
              ...scenarioInput,
              category: "character",
            })
          : runPlayCardScenario(scenarioInput);
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
  if (effects.every((effect) => effect.trigger.type === "whenAttacking")) {
    return { kind: "declareAttack", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "trigger")) {
    return { kind: "lifeTrigger", category: "character" };
  }
  return {
    kind: "skipped",
    reason: `no generated scenario for trigger ${firstTrigger}`,
  };
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
  return drainRuntime(opened, input.setupFilters.length);
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

  return drainRuntime(applyAction(state, action), input.setupFilters.length);
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
  );
};

const drainRuntime = (
  initialResult: EngineResult,
  setupFilterCount = 0,
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
    const nextAction =
      chooseDecisionAction(getLegalActions(state, decision.playerId)) ??
      choosePendingDecisionAction(state);
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

const chooseDecisionAction = (
  legalActions: readonly LegalAction[],
): Extract<Action, { type: "respondToDecision" }> | undefined => {
  const responses = legalActions.filter(
    (action): action is Extract<Action, { type: "respondToDecision" }> =>
      action.type === "respondToDecision",
  );
  if (responses.length === 0) {
    return undefined;
  }
  return [...responses].sort(compareDecisionProgress)[0];
};

const compareDecisionProgress = (
  left: Extract<Action, { type: "respondToDecision" }>,
  right: Extract<Action, { type: "respondToDecision" }>,
): number => decisionScore(right) - decisionScore(left);

const decisionScore = (
  action: Extract<Action, { type: "respondToDecision" }>,
): number => {
  const response = action.response;
  switch (response.type) {
    case "optionalActivation":
      return response.choice === "activate" ? 100 : 0;
    case "payment":
      return (
        90 +
        selectionCount(response.selectedCardInstanceIds) +
        selectionCount(response.selectedDonInstanceIds)
      );
    case "paymentDeclined":
      return 0;
    case "chooseQuantity":
      return 80 + response.quantity;
    case "targets":
      return 70 + response.targets.length;
    case "cards":
      return 60 + response.cards.length;
    case "effectOption":
      return 50;
    case "effectOptionDeclined":
      return 0;
    case "lifeTrigger":
      return response.choice === "activateTrigger" ? 40 : 0;
    case "replacement":
      return response.replacementId === undefined ? 0 : 30;
    case "orderedIds":
      return 20 + response.ids.length;
    case "topBottomPlacement":
      return 20 + response.topIds.length + response.bottomIds.length;
    case "loopCount":
      return 10 + response.count;
    case "mulligan":
    case "rollbackConsent":
      return 1;
  }
};

const selectionCount = (values: readonly unknown[] | undefined): number =>
  values?.length ?? 0;

const collectScenarioSetupFilters = (
  effects: readonly EffectBlock[],
): readonly CardFilter[] =>
  uniqueFilters(
    effects.flatMap((block) => [
      ...collectConditionFilters(block.condition),
      ...collectEffectFilters(block.effect),
    ]),
  );

const uniqueFilters = (
  filters: readonly CardFilter[],
): readonly CardFilter[] => {
  const seen = new Set<string>();
  const unique: CardFilter[] = [];
  for (const filter of filters) {
    const key = JSON.stringify(filter);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(filter);
  }
  return unique;
};

const collectConditionFilters = (
  condition: Condition | undefined,
): readonly CardFilter[] => {
  if (condition === undefined) {
    return [];
  }
  if (
    condition.type === "cardMatches" ||
    condition.type === "fieldStatTotal" ||
    condition.type === "onlyMatchingFieldCards" ||
    condition.type === "hasCardInZone"
  ) {
    return [condition.filter];
  }
  if (
    condition.type === "fieldCount" ||
    condition.type === "fieldCountTotal" ||
    condition.type === "trashCount"
  ) {
    return condition.filter === undefined ? [] : [condition.filter];
  }
  if (condition.type === "fieldCountDifference") {
    return [
      ...(condition.minuend.filter === undefined
        ? []
        : [condition.minuend.filter]),
      ...(condition.subtrahend.filter === undefined
        ? []
        : [condition.subtrahend.filter]),
    ];
  }
  if (condition.type === "eventHistory") {
    return [
      ...(condition.filter === undefined ? [] : [condition.filter]),
      ...(condition.sourceFilter === undefined ? [] : [condition.sourceFilter]),
    ];
  }
  if (condition.type === "and" || condition.type === "or") {
    return condition.conditions.flatMap(collectConditionFilters);
  }
  if (condition.type === "not") {
    return collectConditionFilters(condition.condition);
  }
  return [];
};

const collectTargetFilters = (target: Target): readonly CardFilter[] => {
  if (target.type === "all" || target.type === "savedFieldObject") {
    return target.filter === undefined ? [] : [target.filter];
  }
  if (target.type === "choose" || target.type === "chooseFromZones") {
    return target.request.filter === undefined ? [] : [target.request.filter];
  }
  return [];
};

const collectEffectFilters = (effect: Effect): readonly CardFilter[] => {
  if (
    effect.type === "preventPlay" ||
    effect.type === "enterRested" ||
    effect.type === "play" ||
    effect.type === "cannotBeBlockedBy"
  ) {
    return [effect.filter];
  }
  if (effect.type === "forEachMatch") {
    return [effect.filter, ...collectEffectFilters(effect.effect)];
  }
  if (
    effect.type === "revealFromZone" ||
    effect.type === "selectFromSet" ||
    effect.type === "selectCards" ||
    effect.type === "trashFromHand" ||
    effect.type === "modifyCounter"
  ) {
    return effect.filter === undefined ? [] : [effect.filter];
  }
  if (effect.type === "selectTargets" || effect.type === "selectAllTargets") {
    return effect.request.filter === undefined ? [] : [effect.request.filter];
  }
  if (
    effect.type === "bounce" ||
    effect.type === "trash" ||
    effect.type === "ko" ||
    effect.type === "modifyPower" ||
    effect.type === "setPowerToZero" ||
    effect.type === "setBasePower" ||
    effect.type === "rest" ||
    effect.type === "activate" ||
    effect.type === "giveProtection" ||
    effect.type === "attachDon" ||
    effect.type === "attachSelectedDon" ||
    effect.type === "invalidateEffects" ||
    effect.type === "protectFromKO" ||
    effect.type === "cannotBecomeActive" ||
    effect.type === "cannotAttack" ||
    effect.type === "attackCost" ||
    effect.type === "cannotBlock" ||
    effect.type === "preventBlockerActivation" ||
    effect.type === "changeAttackTarget" ||
    effect.type === "cannotBeAttacked"
  ) {
    return collectTargetFilters(effect.target);
  }
  if (effect.type === "modifyCost") {
    return [
      ...(effect.filter === undefined ? [] : [effect.filter]),
      ...(effect.target === undefined
        ? []
        : collectTargetFilters(effect.target)),
    ];
  }
  if (
    effect.type === "preventPlayByEffects" ||
    effect.type === "allowAttackActiveCharacters" ||
    effect.type === "setBaseCost"
  ) {
    return collectTargetFilters(effect.target);
  }
  if (effect.type === "cannotAttackTarget") {
    return [
      ...collectTargetFilters(effect.target),
      ...(effect.attackTarget.filter === undefined
        ? []
        : [effect.attackTarget.filter]),
    ];
  }
  if (effect.type === "sequence") {
    return effect.effects.flatMap((segment) =>
      segment.effect.type === "payCost"
        ? collectOptionalCostFilters(segment.effect.cost)
        : collectEffectFilters(segment.effect),
    );
  }
  if (effect.type === "choice") {
    return effect.options.flatMap((option) =>
      collectEffectFilters(option.effect),
    );
  }
  if (effect.type === "conditional") {
    return [
      ...collectConditionFilters(effect.if),
      ...collectEffectFilters(effect.then),
      ...(effect.else === undefined ? [] : collectEffectFilters(effect.else)),
    ];
  }
  if (
    effect.type === "delayed" ||
    effect.type === "repeat" ||
    effect.type === "forEachSavedTarget"
  ) {
    return collectEffectFilters(effect.effect);
  }
  if (effect.type === "replacement") {
    return collectEffectFilters(effect.instead);
  }
  return [];
};

const collectOptionalCostFilters = (
  cost: OptionalCost,
): readonly CardFilter[] => {
  if (
    cost.type === "trashFromHand" ||
    cost.type === "revealFromHand" ||
    cost.type === "trashFromField" ||
    cost.type === "koFromField" ||
    cost.type === "restFromField" ||
    cost.type === "moveCards" ||
    cost.type === "moveFieldToLife"
  ) {
    return cost.filter === undefined ? [] : [cost.filter];
  }
  if (cost.type === "modifyPower" || cost.type === "attachDon") {
    return collectTargetFilters(cost.target);
  }
  return [];
};

const choosePendingDecisionAction = (
  state: GameState,
): Extract<Action, { type: "respondToDecision" }> | undefined => {
  const decision = state.pendingDecision;
  if (decision === undefined || decision.type !== "orderCards") {
    return undefined;
  }
  if (decision.placement?.type === "topOrBottom") {
    return {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "topBottomPlacement",
        topIds: [],
        bottomIds: decision.cards.map((card) => String(card.instanceId)),
      },
    };
  }
  return {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "orderedIds",
      ids: decision.cards.map((card) => String(card.instanceId)),
    },
  };
};

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
