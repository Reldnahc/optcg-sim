import type {
  Action,
  CardId,
  CardInstance,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import {
  appendEvent,
  createEvent,
  illegalAction,
  rebaseEvents,
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
  withAllAttackTimingCombatMetadataHidden,
  withAllSupportedAttackTimingCombatMetadataHidden,
} from "./attack-timing.js";
import {
  finalizeBattleAfterReplacementResolution,
  resolveSupportedVanillaBattle,
} from "./resolution.js";
import {
  expireBattleDurationStateForCleanup,
  withSupportedBattleRuntimeMetadataHidden,
} from "./support.js";
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
import { computeView } from "../view/compute-view.js";
import {
  detectPendingRuntimeWork,
  processEffectRuntime,
} from "../effect-runtime.js";
import { continueRuntimeUntilIdle } from "../effect-runtime-decision-continuation.js";
import { assertGameStateInvariants } from "../state/invariants.js";
import { applyRuleProcessingCheckpoint } from "../rules/rule-processing.js";

export { applyUseCounter };
export {
  expireBattleDurationStateForCleanup,
  finalizeBattleAfterReplacementResolution,
  resolveSupportedVanillaBattle,
};

const isSupportedDoubleAttackCombatMetadata = (
  metadata: ResolvedCard | undefined,
): metadata is ResolvedCard => {
  const keywords = metadata?.printedKeywords ?? [];
  return (
    metadata?.support.status === "implemented-dsl" &&
    metadata.support.effectDefinitionId === undefined &&
    (metadata.effectText ?? "").trim().length === 0 &&
    (metadata.triggerText ?? "").trim().length === 0 &&
    keywords.includes("doubleAttack") &&
    !keywords.includes("banish")
  );
};

const hideSupportedDoubleAttackKeywords = (
  state: GameState,
  cardIds: readonly CardId[],
): { state: GameState; hidden: boolean } => {
  const nextCards = { ...state.cardManifest.cards };
  let hidden = false;
  for (const cardId of cardIds) {
    const metadata = nextCards[cardId];
    if (!isSupportedDoubleAttackCombatMetadata(metadata)) {
      continue;
    }
    nextCards[cardId] = {
      ...metadata,
      printedKeywords: metadata.printedKeywords.filter(
        (keyword) => keyword !== "doubleAttack",
      ),
    };
    hidden = true;
  }
  if (!hidden) {
    return { state, hidden };
  }
  return {
    state: {
      ...state,
      cardManifest: {
        ...state.cardManifest,
        cards: nextCards,
      },
    },
    hidden,
  };
};

const getCombatCardIds = (state: GameState): CardId[] => {
  const cardIds = new Set<CardId>();
  for (const player of Object.values(state.players)) {
    cardIds.add(player.leader.cardId);
    for (const character of player.characters) {
      cardIds.add(character.cardId);
    }
  }
  return [...cardIds];
};

const collectDeclareAttackLegalActions = (
  state: GameState,
  playerId: PlayerId,
  view: ReturnType<typeof computeView>,
  options: { filterUnsupportedDoubleAttackBlockers: boolean },
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
      if (
        options.filterUnsupportedDoubleAttackBlockers &&
        target.isLeader &&
        attackerHasDoubleAttack(view, state, attacker.card) &&
        hasComputedBlocker(state, target.playerId, {
          attacker: toCardRef(attacker.card, attacker.playerId),
          originalTarget: toCardRef(target.card, target.playerId),
          currentTarget: toCardRef(target.card, target.playerId),
          step: "block",
          damageCount: 2,
        })
      ) {
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

const attackerHasDoubleAttack = (
  view: ReturnType<typeof computeView>,
  state: GameState,
  attacker: CardInstance,
): boolean => {
  return (
    view.cards[attacker.instanceId]?.keywords.includes("doubleAttack") ===
      true ||
    isSupportedDoubleAttackCombatMetadata(
      state.cardManifest.cards[attacker.cardId],
    )
  );
};

const hasComputedBlocker = (
  state: GameState,
  defenderId: PlayerId,
  candidateBattle?: NonNullable<GameState["battle"]>,
): boolean => {
  const defender = state.players[defenderId];
  if (defender === undefined) {
    return false;
  }
  try {
    const battle = candidateBattle ?? state.battle;
    const blockState =
      battle === undefined
        ? state
        : ({
            ...state,
            battle: { ...battle, step: "block" },
          } satisfies GameState);
    const sanitizedBlockState = hideSupportedDoubleAttackKeywords(
      blockState,
      getCombatCardIds(blockState),
    ).state;
    const view = computeView(sanitizedBlockState);
    return defender.characters.some(
      (character) => view.cards[character.instanceId]?.canBlock === true,
    );
  } catch {
    return true;
  }
};

const hasPotentialBlockerForUnsupportedDoubleAttackWindow = (
  state: GameState,
): boolean => {
  const battle = state.battle;
  if (battle === undefined || battle.damageCount !== 2) {
    return false;
  }
  const target = reifyCardRef(state, battle.currentTarget);
  if (target === null) {
    return false;
  }
  return hasComputedBlocker(state, target.playerId);
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
  const legalActionState = withSupportedBattleRuntimeMetadataHidden(
    withAllSupportedAttackTimingCombatMetadataHidden(state),
  );
  try {
    const view = computeView(legalActionState);
    return collectDeclareAttackLegalActions(state, playerId, view, {
      filterUnsupportedDoubleAttackBlockers: true,
    });
  } catch {
    // Fail closed when computed combat metadata is unsupported or invalid.
  }
  const fallback = hideSupportedDoubleAttackKeywords(
    legalActionState,
    getCombatCardIds(legalActionState),
  );
  if (!fallback.hidden) {
    return [];
  }
  try {
    const view = computeView(fallback.state);
    return collectDeclareAttackLegalActions(state, playerId, view, {
      filterUnsupportedDoubleAttackBlockers: true,
    });
  } catch {
    return [];
  }
};

export const applyDeclareAttack = (
  state: GameState,
  action: Extract<Action, { type: "declareAttack" }>,
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

  const combatMetadataState = withSupportedBattleRuntimeMetadataHidden(
    withAllAttackTimingCombatMetadataHidden(state),
  );
  let legalTargets: readonly CardInstance["instanceId"][];
  let attackerHasDoubleAttack = false;
  try {
    const computed = computeView(combatMetadataState);
    attackerHasDoubleAttack =
      computed.cards[attacker.card.instanceId]?.keywords.includes(
        "doubleAttack",
      ) ?? false;
    legalTargets = computed.legalAttackTargets[attacker.card.instanceId] ?? [];
  } catch {
    const attackerMetadata = state.cardManifest.cards[attacker.card.cardId];
    if (!isSupportedDoubleAttackCombatMetadata(attackerMetadata)) {
      return illegalAction(
        state,
        "declareAttack is unsupported for current combat metadata.",
      );
    }

    const fallback = hideSupportedDoubleAttackKeywords(combatMetadataState, [
      attacker.card.cardId,
    ]);
    if (!fallback.hidden) {
      return illegalAction(
        state,
        "declareAttack is unsupported for current combat metadata.",
      );
    }
    try {
      const computed = computeView(fallback.state);
      legalTargets =
        computed.legalAttackTargets[attacker.card.instanceId] ?? [];
      attackerHasDoubleAttack = true;
    } catch {
      return illegalAction(
        state,
        "declareAttack is unsupported for current combat metadata.",
      );
    }
  }
  if (!legalTargets.includes(target.card.instanceId)) {
    return illegalAction(
      state,
      "declareAttack target is not legal for attacker.",
    );
  }
  if (detectPendingRuntimeWork(state) !== undefined) {
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
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    players: {
      ...state.players,
      [attacker.playerId]: {
        ...nextPlayer,
        leader: attacker.isLeader
          ? { ...nextPlayer.leader, state: "rested" }
          : nextPlayer.leader,
        characters: nextPlayer.characters.map((character) =>
          !attacker.isLeader &&
          character.instanceId === attacker.card.instanceId
            ? { ...character, state: "rested" }
            : character,
        ),
      },
    },
    battle: {
      attacker: toCardRef(attacker.card, attacker.playerId),
      originalTarget: toCardRef(target.card, target.playerId),
      currentTarget: toCardRef(target.card, target.playerId),
      step: "attack",
      damageCount: target.isLeader && attackerHasDoubleAttack ? 2 : 1,
    },
  };

  const events: EngineEvent[] = [
    createEvent(
      state,
      1,
      "attackDeclared",
      {
        attacker: toCardRef(attacker.card, attacker.playerId),
        target: toCardRef(target.card, target.playerId),
      },
      { type: "public" },
    ),
  ];
  const declaredState = applyRuleProcessingCheckpoint({
    state: nextState,
    events,
    phase: "main",
    createEvent: (seqOffset, type, payload, visibility) =>
      createEvent(state, seqOffset, type, payload, visibility),
  });
  declaredState.eventJournal = [...state.eventJournal, ...events];
  assertGameStateInvariants(declaredState);
  const declaredResult = toEngineResult(declaredState, events);
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
    return cleanupBattleAfterAttackTiming(state, attackTimingResult);
  }
  if (
    hasPotentialBlockerForUnsupportedDoubleAttackWindow(
      attackTimingResult.state,
    )
  ) {
    return illegalAction(
      state,
      "declareAttack requires unsupported blocker handling for Double Attack.",
    );
  }

  const blockDecision = createBlockStepDeclineDecision(
    withSupportedBattleRuntimeMetadataHidden(
      withAllAttackTimingCombatMetadataHidden(attackTimingResult.state),
    ),
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
    return toEngineResult(blockState, blockEvents);
  }

  const resolved = resolveSupportedVanillaBattle(attackTimingResult.state);
  if (resolved.errors !== undefined) {
    const firstError = resolved.errors[0];
    return firstError === undefined
      ? illegalAction(state, "Battle resolution failed.")
      : toEngineResult(state, [], [firstError]);
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
  return toEngineResult(finalState, [
    ...attackTimingResult.events,
    ...resolutionEvents,
  ]);
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
): EngineResult => {
  let current = toEngineResult(declaredState, []);
  const rawRuntimeEvents: EngineEvent[] = [];
  for (let stepCount = 0; stepCount < 20; stepCount += 1) {
    if (
      current.errors !== undefined ||
      current.state.pendingDecision !== undefined ||
      current.state.status.type !== "active"
    ) {
      break;
    }
    const next = processEffectRuntime(current.state);
    if (next.errors !== undefined) {
      return toEngineResult(originalState, [], toErrorTuple(next.errors));
    }
    if (next.events.length === 0) {
      if (next.stateHash !== current.stateHash) {
        current = toEngineResult(next.state, []);
        continue;
      }
      break;
    }
    rawRuntimeEvents.push(...next.events);
    current = toEngineResult(next.state, []);
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
  assertGameStateInvariants(stateWithJournal);
  return toEngineResult(stateWithJournal, events);
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
  assertGameStateInvariants(stateWithJournal);
  return toEngineResult(stateWithJournal, events);
};

const withOriginalManifestResult = (
  result: EngineResult,
  originalState: GameState,
): EngineResult => {
  const stateWithManifest: GameState = {
    ...result.state,
    cardManifest: originalState.cardManifest,
  };
  return result.errors === undefined
    ? toEngineResult(stateWithManifest, result.events)
    : toEngineResult(
        stateWithManifest,
        result.events,
        toErrorTuple(result.errors),
      );
};

const hideCurrentAttackTimingCombatMetadata = (state: GameState): GameState =>
  withSupportedBattleRuntimeMetadataHidden(
    withAllAttackTimingCombatMetadataHidden(state),
  );

const resolveSupportedBattleWithAttackTimingMetadata = (
  state: GameState,
): EngineResult =>
  withOriginalManifestResult(resolveSupportedVanillaBattle(state), state);

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
  const actionState = hideCurrentAttackTimingCombatMetadata(state);
  return [
    ...getCounterStepDecisionLegalActions(actionState, playerId),
    ...getBlockStepDecisionLegalActions(actionState, playerId),
  ];
};

export const applyBattleDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const actionState = hideCurrentAttackTimingCombatMetadata(state);
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
      ),
    );
    if (
      runtime.errors !== undefined ||
      runtime.state.pendingDecision !== undefined ||
      detectPendingRuntimeWork(runtime.state) !== undefined
    ) {
      return runtime;
    }
    const resolved = resolveSupportedBattleWithAttackTimingMetadata({
      ...runtime.state,
      cardManifest: state.cardManifest,
    });
    return resolved.errors === undefined
      ? toEngineResult(resolved.state, [...runtime.events, ...resolved.events])
      : toEngineResult(
          resolved.state,
          [...runtime.events, ...resolved.events],
          toErrorTuple(resolved.errors),
        );
  };
  const counterResponse = applyCounterStepDecisionResponse(
    actionState,
    action,
    resolveWithOriginalManifest,
  );
  if (counterResponse !== null) {
    return withOriginalManifestResult(counterResponse, state);
  }
  const blockResponse = applyBlockStepDecisionResponse(
    actionState,
    action,
    resolveWithOriginalManifest,
  );
  return blockResponse === null
    ? null
    : withOriginalManifestResult(blockResponse, state);
};

export const continueAttackTimingBattleIfReady = (
  state: GameState,
): EngineResult | null => {
  if (
    state.status.type !== "active" ||
    state.pendingDecision !== undefined ||
    detectPendingRuntimeWork(state) !== undefined
  ) {
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
        resolveSupportedVanillaBattle(state),
        state,
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
    return toEngineResult(counterState, events);
  }
  if (battle.step === "block" && battle.blocker !== undefined) {
    return withOriginalManifestResult(
      resolveSupportedVanillaBattle(state),
      state,
    );
  }
  if (battle.step !== "attack") {
    return null;
  }
  if (!battleParticipantsRemainLegal(state)) {
    return cleanupBattleAfterAttackTiming(state, toEngineResult(state, []));
  }
  if (hasPotentialBlockerForUnsupportedDoubleAttackWindow(state)) {
    return illegalAction(
      state,
      "declareAttack requires unsupported blocker handling for Double Attack.",
    );
  }

  const blockDecision = createBlockStepDeclineDecision(
    withSupportedBattleRuntimeMetadataHidden(
      withAllAttackTimingCombatMetadataHidden(state),
    ),
  );
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
    return toEngineResult(blockState, events);
  }

  return withOriginalManifestResult(
    resolveSupportedVanillaBattle(state),
    state,
  );
};

export const continueAttackTimingDecisionResultIfReady = (
  result: EngineResult,
): EngineResult => {
  if (result.errors !== undefined || result.state.status.type !== "active") {
    return result;
  }
  const continued = continueAttackTimingBattleIfReady(result.state);
  return continued === null
    ? result
    : { ...continued, events: [...result.events, ...continued.events] };
};
