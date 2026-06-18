import type {
  Action,
  CardInstance,
  CardRef,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
  SelectCardsDecision,
} from "@optcg/types";

import {
  appendEvent,
  assertGameStateInvariantsIfEnabled,
  createEvent,
  type EngineResultOptions,
  illegalAction,
  rebaseEvents,
  replaceEngineResultEvents,
  toDecisionId,
  toEngineResult,
  toStateSeq,
} from "../action-results.js";
import {
  getCombatCardByInstanceId,
  isMatchActive,
  reifyCardRef,
  toCardRef,
} from "../actions/state.js";
import {
  finalizeBattleAfterReplacementResolution,
  resolveSupportedVanillaBattle,
} from "./resolution.js";
import { expireBattleDurationStateForCleanup } from "./support.js";
import {
  applyBlockStepDecisionResponse,
  createBlockStepDeclineDecision,
  getBlockStepDecisionLegalActions,
} from "./block-actions.js";
import {
  applyCounterStepDecisionResponse,
  applyUseCounter,
  createCounterStepPassDecision,
  getCounterStepDecisionLegalActions,
} from "./counter-actions.js";
import {
  attackTrashCostCountForCard,
  computeView,
} from "../view/compute-view.js";
import {
  detectPendingRuntimeWork,
  processEffectRuntime,
} from "../effect-runtime.js";
import { continueRuntimeUntilIdle } from "../effect-runtime-decision-continuation.js";
import { assertGameStateInvariants } from "../state/invariants.js";
import { applyRuleProcessingCheckpoint } from "../rules/rule-processing.js";
import { moveConcreteCardsToTrash } from "../concrete-card-movement.js";
import { restFieldObjects } from "../effect-runtime-sequence/saved-field-object.js";

export { applyUseCounter };
export {
  expireBattleDurationStateForCleanup,
  finalizeBattleAfterReplacementResolution,
  resolveSupportedVanillaBattle,
};

const collectDeclareAttackLegalActions = (
  state: GameState,
  playerId: PlayerId,
  view: ReturnType<typeof computeView>,
): LegalAction[] => {
  const actions: LegalAction[] = [];
  for (const [attackerId, targetIds] of Object.entries(
    view.legalAttackTargets,
  )) {
    const attacker = getCombatCardByInstanceId(
      state,
      attackerId as CardInstance["instanceId"],
    );
    if (attacker === null || attacker.playerId !== playerId) {
      continue;
    }
    for (const targetId of targetIds) {
      const target = getCombatCardByInstanceId(state, targetId);
      if (target === null) {
        continue;
      }
      actions.push({
        type: "declareAttack",
        attacker: toCardRef(attacker.card, attacker.playerId),
        target: toCardRef(target.card, target.playerId),
      });
    }
  }
  return actions;
};

export const getDeclareAttackLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  if (
    !isMatchActive(state) ||
    state.players[playerId] === undefined ||
    state.pendingDecision !== undefined ||
    state.turn.phase !== "main" ||
    state.turn.turnPlayerId !== playerId ||
    state.battle !== undefined
  ) {
    return [];
  }
  try {
    const view = computeView(state);
    return collectDeclareAttackLegalActions(state, playerId, view);
  } catch {
    // Fail closed when computed combat metadata is unsupported or invalid.
    return [];
  }
};

const isCardRef = (value: unknown): value is CardRef => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["instanceId"] === "string" &&
    typeof candidate["cardId"] === "string" &&
    typeof candidate["playerId"] === "string"
  );
};

const cardRefMatches = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId;

const hasDuplicateInstanceIds = (cards: readonly CardRef[]): boolean =>
  new Set(cards.map((card) => card.instanceId)).size !== cards.length;

const isAttackCostDecision = (
  decision: NonNullable<GameState["pendingDecision"]>,
): decision is SelectCardsDecision =>
  decision.type === "selectCards" &&
  String(decision.id).startsWith("decision:selectCards:attack-cost:") &&
  decision.runtime?.attackCost !== undefined &&
  decision.request.timing === "onResolution" &&
  decision.request.zone === "hand" &&
  decision.request.min === decision.request.max &&
  decision.request.min > 0 &&
  decision.request.visibility === "privateToChooser" &&
  decision.visibility.type === "private" &&
  decision.visibility.playerId === decision.playerId;

export const getAttackCostDecisionLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    !isAttackCostDecision(decision) ||
    decision.playerId !== playerId
  ) {
    return [];
  }
  return [
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "cards",
        cards: decision.candidates
          .slice(0, decision.request.min)
          .map((candidate) => candidate.card),
      },
    },
  ];
};

const createAttackCostDecision = (
  state: GameState,
  attacker: { card: CardInstance; playerId: PlayerId },
  target: { card: CardInstance; playerId: PlayerId },
  count: number,
  options: EngineResultOptions = {},
): EngineResult => {
  const player = state.players[attacker.playerId];
  if (player === undefined || player.hand.length < count) {
    return illegalAction(state, "declareAttack attack cost cannot be paid.");
  }
  const visibility = { type: "private", playerId: attacker.playerId } as const;
  const decision: SelectCardsDecision = {
    id: toDecisionId(
      `decision:selectCards:attack-cost:${String(state.actionSeq + 1)}:${String(attacker.card.instanceId)}:${String(target.card.instanceId)}`,
    ),
    type: "selectCards",
    playerId: attacker.playerId,
    prompt: "Trash cards from hand to attack.",
    causedBy: { type: "ruleProcess", name: "attack-cost" },
    visibility,
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "self",
      zone: "hand",
      min: count,
      max: count,
      allowFewerIfUnavailable: false,
      visibility: "privateToChooser",
    },
    candidates: player.hand.map((card) => ({
      card: toCardRef(card, attacker.playerId),
      visibility,
    })),
    runtime: {
      attackCost: {
        attacker: toCardRef(attacker.card, attacker.playerId),
        target: toCardRef(target.card, target.playerId),
        cost: { type: "trashFromHand", count },
      },
    },
  };
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
    },
    visibility,
  );
  const created = events[0];
  if (created !== undefined) {
    created.causedBy = decision.causedBy;
  }
  return toEngineResult(
    {
      ...state,
      seq: toStateSeq(state.seq + 1),
      actionSeq: state.actionSeq + 1,
      pendingDecision: decision,
      eventJournal: [...state.eventJournal, ...events],
    },
    events,
    undefined,
    options,
  );
};

type DeclareAttackOptions = EngineResultOptions & {
  readonly ignoreAttackCosts?: boolean;
};

export const applyDeclareAttack = (
  state: GameState,
  action: Extract<Action, { type: "declareAttack" }>,
  options: EngineResultOptions = {},
): EngineResult => applyDeclareAttackInternal(state, action, options);

const applyDeclareAttackInternal = (
  state: GameState,
  action: Extract<Action, { type: "declareAttack" }>,
  options: DeclareAttackOptions = {},
): EngineResult => {
  if (!isMatchActive(state)) {
    return illegalAction(
      state,
      "declareAttack is only legal while match is active.",
    );
  }
  if (state.turn.phase !== "main") {
    return illegalAction(state, "declareAttack requires main phase.");
  }
  if (state.battle !== undefined) {
    return illegalAction(
      state,
      "declareAttack is illegal during an active battle.",
    );
  }

  const attacker = reifyCardRef(state, action.attacker);
  if (attacker === null) {
    return illegalAction(
      state,
      "declareAttack attacker reference is stale or invalid.",
    );
  }
  if (attacker.playerId !== state.turn.turnPlayerId) {
    return illegalAction(
      state,
      "declareAttack attacker must be controlled by turn player.",
    );
  }
  if (attacker.card.state !== "active") {
    return illegalAction(state, "declareAttack attacker must be active.");
  }

  const target = reifyCardRef(state, action.target);
  if (target === null) {
    return illegalAction(
      state,
      "declareAttack target reference is stale or invalid.",
    );
  }

  let legalTargets: readonly CardInstance["instanceId"][];
  let attackerHasDoubleAttack = false;
  let attackPower: number | undefined;
  let defendPower: number | undefined;
  try {
    const computed = computeView(state, {
      ignoreAttackCosts: options.ignoreAttackCosts === true,
    });
    const attackerView = computed.cards[attacker.card.instanceId];
    const targetView = computed.cards[target.card.instanceId];
    attackerHasDoubleAttack =
      attackerView?.keywords.includes("doubleAttack") ?? false;
    attackPower = attackerView?.currentPower;
    defendPower = targetView?.currentPower;
    legalTargets = computed.legalAttackTargets[attacker.card.instanceId] ?? [];
  } catch {
    return illegalAction(
      state,
      "declareAttack is unsupported for current combat metadata.",
    );
  }
  if (!legalTargets.includes(target.card.instanceId)) {
    return illegalAction(
      state,
      "declareAttack target is not legal for attacker.",
    );
  }
  if (options.ignoreAttackCosts !== true) {
    const attackTrashCost = attackTrashCostCountForCard(state, attacker.card);
    if (attackTrashCost > 0) {
      return createAttackCostDecision(
        state,
        attacker,
        target,
        attackTrashCost,
        options,
      );
    }
  }
  if (detectPendingRuntimeWork(state) !== undefined) {
    // Runtime work is resolved by the action/decision continuation path; legal actions stay hidden while it is pending.
    return illegalAction(
      state,
      "declareAttack requires no pending runtime work.",
    );
  }
  const nextPlayer = state.players[attacker.playerId];
  if (nextPlayer === undefined) {
    return illegalAction(
      state,
      "declareAttack attacker player does not exist.",
    );
  }
  const events: EngineEvent[] = [
    createEvent(
      state,
      1,
      "attackDeclared",
      {
        attacker: toCardRef(attacker.card, attacker.playerId),
        target: toCardRef(target.card, target.playerId),
        ...(attackPower === undefined ? {} : { attackerPower: attackPower }),
        ...(defendPower === undefined ? {} : { defenderPower: defendPower }),
      },
      { type: "public" },
    ),
  ];
  const baseState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    battle: {
      attacker: toCardRef(attacker.card, attacker.playerId),
      originalTarget: toCardRef(target.card, target.playerId),
      currentTarget: toCardRef(target.card, target.playerId),
      step: "attack",
      damageCount: target.isLeader && attackerHasDoubleAttack ? 2 : 1,
    },
  };
  const rested = restFieldObjects(
    baseState,
    [toCardRef(attacker.card, attacker.playerId)],
    undefined,
    {
      events,
      eventState: state,
      sourceKind: "attack",
      sourceControllerId: attacker.playerId,
    },
  );
  const nextState = rested.state;
  const declaredState = applyRuleProcessingCheckpoint({
    state: nextState,
    events,
    phase: "main",
    createEvent: (seqOffset, type, payload, visibility) =>
      createEvent(state, seqOffset, type, payload, visibility),
  });
  declaredState.eventJournal = [...state.eventJournal, ...events];
  assertGameStateInvariantsIfEnabled(declaredState, options);
  const declaredResult = toEngineResult(
    declaredState,
    events,
    undefined,
    options,
  );
  if (declaredResult.errors !== undefined) {
    return declaredResult;
  }
  if (declaredResult.state.status.type !== "active") {
    return declaredResult;
  }
  const attackTimingResult = resolveAttackTimingEffects(
    state,
    declaredResult.state,
    events,
    options,
  );
  if (attackTimingResult.errors !== undefined) {
    return attackTimingResult;
  }
  if (attackTimingResult.state.status.type !== "active") {
    return attackTimingResult;
  }
  if (attackTimingResult.state.pendingDecision !== undefined) {
    return attackTimingResult;
  }
  if (!battleParticipantsRemainLegal(attackTimingResult.state)) {
    return cleanupBattleAfterAttackTiming(state, attackTimingResult, options);
  }

  const blockDecision = createBlockStepDeclineDecision(
    attackTimingResult.state,
  );
  if (blockDecision !== null) {
    const blockEvents = [...attackTimingResult.events];
    appendEvent(
      state,
      blockEvents,
      "decisionCreated",
      {
        decisionId: blockDecision.id,
        decisionType: blockDecision.type,
        playerId: blockDecision.playerId,
      },
      { type: "public" },
    );
    const blockState: GameState = {
      ...attackTimingResult.state,
      battle: {
        ...mustBattle(attackTimingResult.state),
        step: "block",
      },
      pendingDecision: blockDecision,
      eventJournal: [...state.eventJournal, ...blockEvents],
    };
    return toEngineResult(blockState, blockEvents, undefined, options);
  }

  const resolved = resolveSupportedVanillaBattle(
    attackTimingResult.state,
    options,
  );
  if (resolved.errors !== undefined) {
    const firstError = resolved.errors[0];
    return firstError === undefined
      ? illegalAction(state, "Battle resolution failed.")
      : toEngineResult(state, [], [firstError], options);
  }
  const resolutionEvents = rebaseEvents(
    state,
    resolved.events,
    attackTimingResult.events.length + 1,
  );
  const finalState: GameState = {
    ...resolved.state,
    cardManifest: state.cardManifest,
    seq: nextState.seq,
    actionSeq: nextState.actionSeq,
    eventJournal: [
      ...state.eventJournal,
      ...attackTimingResult.events,
      ...resolutionEvents,
    ],
  };
  return toEngineResult(
    finalState,
    [...attackTimingResult.events, ...resolutionEvents],
    undefined,
    options,
  );
};

const toErrorTuple = (
  errors: readonly EngineError[],
): readonly [EngineError, ...EngineError[]] => {
  const first = errors[0];
  if (first === undefined) {
    return [
      {
        type: "effectRuntimeError",
        effectId: "attack-timing-effect-runtime",
        details: { reason: "empty-runtime-error-list" },
      },
    ];
  }
  return [first, ...errors.slice(1)];
};

const resolveAttackTimingEffects = (
  originalState: GameState,
  declaredState: GameState,
  declaredEvents: EngineEvent[],
  options: EngineResultOptions = {},
): EngineResult => {
  let current = toEngineResult(declaredState, [], undefined, options);
  const rawRuntimeEvents: EngineEvent[] = [];
  for (let stepCount = 0; stepCount < 20; stepCount += 1) {
    if (
      current.errors !== undefined ||
      current.state.pendingDecision !== undefined ||
      current.state.status.type !== "active"
    ) {
      break;
    }
    const next = processEffectRuntime(current.state, options);
    if (next.errors !== undefined) {
      return toEngineResult(
        originalState,
        [],
        toErrorTuple(next.errors),
        options,
      );
    }
    if (next.events.length === 0) {
      const stateChanged =
        options.includeStateHash === false
          ? next.state !== current.state
          : next.stateHash !== current.stateHash;
      if (stateChanged) {
        current = toEngineResult(next.state, [], undefined, options);
        continue;
      }
      break;
    }
    rawRuntimeEvents.push(...next.events);
    current = toEngineResult(next.state, [], undefined, options);
  }
  if (
    current.errors === undefined &&
    current.state.pendingDecision === undefined &&
    current.state.status.type === "active" &&
    detectPendingRuntimeWork(current.state) !== undefined
  ) {
    return toEngineResult(
      originalState,
      [],
      [
        {
          type: "illegalAction",
          reason: "Attack timing runtime continuation did not settle.",
        },
      ],
      options,
    );
  }

  const runtimeEvents = rebaseEvents(
    originalState,
    rawRuntimeEvents,
    declaredEvents.length + 1,
  );
  const events = [...declaredEvents, ...runtimeEvents];
  const stateWithJournal: GameState = {
    ...current.state,
    seq: declaredState.seq,
    cardManifest: originalState.cardManifest,
    eventJournal: [...originalState.eventJournal, ...events],
  };
  assertGameStateInvariantsIfEnabled(stateWithJournal, options);
  return toEngineResult(stateWithJournal, events, undefined, options);
};

const battleParticipantsRemainLegal = (state: GameState): boolean => {
  const battle = state.battle;
  if (battle === undefined) {
    return true;
  }
  return (
    reifyCardRef(state, battle.attacker) !== null &&
    reifyCardRef(state, battle.currentTarget) !== null
  );
};

const cleanupBattleAfterAttackTiming = (
  originalState: GameState,
  attackTimingResult: EngineResult,
  options: EngineResultOptions = {},
): EngineResult => {
  const events = [...attackTimingResult.events];
  appendEvent(
    originalState,
    events,
    "effectResolved",
    { systemStep: "endBattle", battleCleared: true },
    { type: "replayOnly" },
  );
  const cleanedState = expireBattleDurationStateForCleanup(
    attackTimingResult.state,
  );
  const finalizedState = applyRuleProcessingCheckpoint({
    state: cleanedState,
    events,
    phase: "main",
    createEvent: (seqOffset, type, payload, visibility) =>
      createEvent(originalState, seqOffset, type, payload, visibility),
  });
  const stateWithJournal: GameState = {
    ...finalizedState,
    cardManifest: originalState.cardManifest,
    eventJournal: [...originalState.eventJournal, ...events],
  };
  assertGameStateInvariantsIfEnabled(stateWithJournal, options);
  return toEngineResult(stateWithJournal, events, undefined, options);
};

const withOriginalManifestResult = (
  result: EngineResult,
  originalState: GameState,
  options: EngineResultOptions = {},
): EngineResult => {
  const stateWithManifest: GameState = {
    ...result.state,
    cardManifest: originalState.cardManifest,
  };
  return result.errors === undefined
    ? toEngineResult(stateWithManifest, result.events, undefined, options)
    : toEngineResult(
        stateWithManifest,
        result.events,
        toErrorTuple(result.errors),
        options,
      );
};

const resolveSupportedBattleWithAttackTimingMetadata = (
  state: GameState,
  options: EngineResultOptions = {},
): EngineResult =>
  withOriginalManifestResult(
    resolveSupportedVanillaBattle(state, options),
    state,
    options,
  );

const mustBattle = (state: GameState): NonNullable<GameState["battle"]> => {
  const battle = state.battle;
  if (battle === undefined) {
    throw new Error("battle is required");
  }
  return battle;
};

export const getBattleDecisionLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  return [
    ...getCounterStepDecisionLegalActions(state, playerId),
    ...getBlockStepDecisionLegalActions(state, playerId),
  ];
};

export const applyAttackCostDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  options: EngineResultOptions = {},
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (decision === undefined || !isAttackCostDecision(decision)) {
    return null;
  }
  const fail = (reason: string): EngineResult =>
    toEngineResult(
      state,
      [],
      [{ type: "invalidDecisionResponse", reason }],
      options,
    );
  if (decision.id !== action.decisionId) {
    return fail("Decision id does not match current attack cost decision.");
  }
  if (action.response.type !== "cards") {
    return fail("Response type must be cards for attack cost choices.");
  }

  const responseCards = (action.response as { cards?: unknown }).cards;
  if (!Array.isArray(responseCards) || !responseCards.every(isCardRef)) {
    return fail("Response cards must be CardRef values.");
  }
  if (responseCards.length !== decision.request.min) {
    return fail("Selected card count must match attack cost count.");
  }
  if (hasDuplicateInstanceIds(responseCards)) {
    return fail("Selected cards must not contain duplicates.");
  }

  const player = state.players[decision.playerId];
  if (player === undefined) {
    return fail("Attack cost player does not exist.");
  }
  const selectedCards: CardInstance[] = [];
  for (const ref of responseCards) {
    const current = player.hand.find((card) =>
      cardRefMatches(ref, toCardRef(card, decision.playerId)),
    );
    if (current === undefined) {
      return fail("Selected cards must be active cards in hand.");
    }
    selectedCards.push(current);
  }

  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionResolved",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
      responseType: action.response.type,
      selectedCount: responseCards.length,
    },
    decision.visibility,
  );
  const resolved = events[0];
  if (resolved !== undefined) {
    resolved.causedBy = { type: "decision", decisionId: decision.id };
  }

  const moved = moveConcreteCardsToTrash(state, events, selectedCards, {
    cardMovedPayloadShape: "publicZoneNames",
    cardMovedVisibility: { type: "public" },
    cardTrashedVisibility: { type: "public" },
    causedBy: { type: "decision", decisionId: decision.id },
    clearAttachedDon: true,
    emitCardTrashed: true,
    playerId: decision.playerId,
    reason: "trashFromHand",
    sourceZone: "hand",
  });

  const nextState: GameState = {
    ...moved.state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;

  const runtime = decision.runtime?.attackCost;
  if (runtime === undefined) {
    return fail("Attack cost decision is missing runtime metadata.");
  }
  const attack = applyDeclareAttackInternal(
    nextState,
    {
      type: "declareAttack",
      attacker: runtime.attacker,
      target: runtime.target,
    },
    { ...options, ignoreAttackCosts: true },
  );
  return toEngineResult(
    attack.state,
    [...events, ...attack.events],
    attack.errors === undefined ? undefined : toErrorTuple(attack.errors),
    options,
  );
};

export const applyBattleDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  options: EngineResultOptions = {},
): EngineResult | null => {
  const resolveWithOriginalManifest = (
    resolverState: GameState,
  ): EngineResult => {
    const runtime = continueRuntimeUntilIdle(
      state,
      toEngineResult(
        {
          ...resolverState,
          cardManifest: state.cardManifest,
        },
        [],
        undefined,
        options,
      ),
      options,
    );
    if (
      runtime.errors !== undefined ||
      runtime.state.pendingDecision !== undefined ||
      detectPendingRuntimeWork(runtime.state) !== undefined
    ) {
      return runtime;
    }
    const resolved = resolveSupportedBattleWithAttackTimingMetadata(
      {
        ...runtime.state,
        cardManifest: state.cardManifest,
      },
      options,
    );
    return resolved.errors === undefined
      ? toEngineResult(
          resolved.state,
          [...runtime.events, ...resolved.events],
          undefined,
          options,
        )
      : toEngineResult(
          resolved.state,
          [...runtime.events, ...resolved.events],
          toErrorTuple(resolved.errors),
          options,
        );
  };
  const counterResponse = applyCounterStepDecisionResponse(
    state,
    action,
    resolveWithOriginalManifest,
    options,
  );
  if (counterResponse !== null) {
    return withOriginalManifestResult(counterResponse, state, options);
  }
  const blockResponse = applyBlockStepDecisionResponse(
    state,
    action,
    resolveWithOriginalManifest,
    options,
  );
  return blockResponse === null
    ? null
    : withOriginalManifestResult(blockResponse, state, options);
};

export const continueAttackTimingBattleIfReady = (
  state: GameState,
  options: EngineResultOptions = {},
): EngineResult | null => {
  if (
    state.status.type !== "active" ||
    state.pendingDecision !== undefined ||
    detectPendingRuntimeWork(state) !== undefined
  ) {
    // Runtime work is resolved by the action/decision continuation path; legal actions stay hidden while it is pending.
    return null;
  }
  const battle = state.battle;
  if (battle === undefined) {
    return null;
  }
  if (battle.step === "counter") {
    const decision = createCounterStepPassDecision(state, {
      requirePotentialCounterActions: false,
    });
    if (decision === null) {
      return withOriginalManifestResult(
        resolveSupportedVanillaBattle(state, options),
        state,
        options,
      );
    }
    const events: EngineEvent[] = [];
    appendEvent(
      state,
      events,
      "decisionCreated",
      {
        decisionId: decision.id,
        decisionType: decision.type,
        playerId: decision.playerId,
      },
      { type: "public" },
    );
    const counterState: GameState = {
      ...state,
      pendingDecision: decision,
      eventJournal: [...state.eventJournal, ...events],
    };
    assertGameStateInvariants(counterState);
    return toEngineResult(counterState, events, undefined, options);
  }
  if (battle.step === "block" && battle.blocker !== undefined) {
    return withOriginalManifestResult(
      resolveSupportedVanillaBattle(state, options),
      state,
      options,
    );
  }
  if (battle.step !== "attack") {
    return null;
  }
  if (!battleParticipantsRemainLegal(state)) {
    return cleanupBattleAfterAttackTiming(
      state,
      toEngineResult(state, [], undefined, options),
    );
  }

  const blockDecision = createBlockStepDeclineDecision(state);
  if (blockDecision !== null) {
    const events: EngineEvent[] = [];
    appendEvent(
      state,
      events,
      "decisionCreated",
      {
        decisionId: blockDecision.id,
        decisionType: blockDecision.type,
        playerId: blockDecision.playerId,
      },
      { type: "public" },
    );
    const blockState: GameState = {
      ...state,
      battle: {
        ...battle,
        step: "block",
      },
      pendingDecision: blockDecision,
      eventJournal: [...state.eventJournal, ...events],
    };
    return toEngineResult(blockState, events, undefined, options);
  }

  return withOriginalManifestResult(
    resolveSupportedVanillaBattle(state, options),
    state,
    options,
  );
};

export const continueAttackTimingDecisionResultIfReady = (
  result: EngineResult,
  options: EngineResultOptions = {},
): EngineResult => {
  if (result.errors !== undefined || result.state.status.type !== "active") {
    return result;
  }
  const continued = continueAttackTimingBattleIfReady(result.state, options);
  return continued === null
    ? result
    : replaceEngineResultEvents(
        continued,
        [...result.events, ...continued.events],
        options,
      );
};
