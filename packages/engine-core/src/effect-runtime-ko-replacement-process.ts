import type {
  Action,
  CardInstance,
  CardRef,
  CardSnapshot,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
  ReplacementProcess,
  SelectTargetsDecision,
  TargetCandidate,
  TimingWindowId,
} from "@optcg/types";

import {
  appendEvent,
  rebaseEvents,
  toEngineResult,
  toDecisionId,
  toStateSeq,
} from "./action-results.js";
import { hashCanonicalStateValue } from "./canonical-state.js";
import { executeNoChoiceEffectPrimitive } from "./effect-runtime-draw-primitives.js";
import {
  executeMoveCardsPrimitive,
  isSupportedLifeTopToHandEffect,
} from "./effect-runtime-move-cards.js";
import {
  detectSupportedSelectedTargetKoReplacementCandidate,
  type SelectedTargetKoReplacementCandidate,
} from "./effect-runtime-replacement-primitives.js";
import { restFieldObjects } from "./effect-runtime-sequence-saved-field-object.js";
import { resolvePublicTargetCandidatesForRequest } from "./target-selection.js";

export type {
  DetectSelectedTargetKoReplacementCandidateResult,
  SelectedTargetKoReplacementCandidate,
  SelectedTargetKoReplacementDetectionFailureReason,
} from "./effect-runtime-replacement-primitives.js";
export { detectSupportedSelectedTargetKoReplacementCandidate };

interface SelectedTargetKoReplacementPayload {
  effectId: string;
  queueEntryId?: EffectQueueEntry["id"];
  source: CardRef;
  target: CardRef;
  fieldRemovalAttempt: {
    processFamily: "fieldRemoval";
    classification: "moveFromFieldToTrash";
    sourceKind: "battle" | "cardEffect";
    sourceControllerId: PlayerId;
  };
  battleContinuation?: {
    type: "endBattleAfterCharacterKoAttempt";
  };
}

type LocatedReplacementSource = {
  card: CardInstance;
};

type LocatedKoTarget = {
  playerId: PlayerId;
  card: CardInstance;
};

type EngineInternalReplacementAppliedEventPayload = {
  processId: ReplacementProcess["id"];
  replacementId: string;
  previousPayloadHash: string;
  transformedPayloadHash: string;
};

interface PendingReplacementRestInsteadPayload {
  decisionId: string;
  effectBlockId: EffectQueueEntry["effectBlockId"];
  replacementId: string;
  source: CardRef;
  target?: CardRef;
  controllerId: PlayerId;
}

export const buildKoReplacementProcess = (params: {
  battleContinuation?: SelectedTargetKoReplacementPayload["battleContinuation"];
  causedBy: ReplacementProcess["causedBy"];
  effectId: string;
  id: ReplacementProcess["id"];
  source: CardRef;
  sourceControllerId: PlayerId;
  sourceKind: "battle" | "cardEffect";
  queueEntryId?: EffectQueueEntry["id"];
  target: CardRef;
}): ReplacementProcess => {
  const payload: SelectedTargetKoReplacementPayload = {
    effectId: params.effectId,
    ...(params.queueEntryId === undefined
      ? {}
      : { queueEntryId: params.queueEntryId }),
    source: params.source,
    target: params.target,
    fieldRemovalAttempt: {
      processFamily: "fieldRemoval",
      classification: "moveFromFieldToTrash",
      sourceKind: params.sourceKind,
      sourceControllerId: params.sourceControllerId,
    },
    ...(params.battleContinuation === undefined
      ? {}
      : { battleContinuation: params.battleContinuation }),
  };
  return {
    id: params.id,
    type: "ko",
    source: params.source,
    target: params.target,
    payload,
    causedBy: params.causedBy,
    usedReplacementIds: [],
  };
};

export const buildSelectedTargetKoReplacementProcess = (
  entry: EffectQueueEntry,
  target: CardRef,
  targetIndex: number,
): ReplacementProcess =>
  buildKoReplacementProcess({
    effectId: entry.effectBlockId,
    id: `${entry.id}:ko:${target.instanceId}:${String(targetIndex)}`,
    queueEntryId: entry.id,
    source: entry.source,
    target,
    causedBy: entry.causedBy,
    sourceKind: "cardEffect",
    sourceControllerId: entry.controllerId,
  });

const findKoTargetByInstanceId = (
  state: GameState,
  instanceId: CardInstance["instanceId"],
): LocatedKoTarget | null => {
  for (const [playerId, player] of Object.entries(state.players) as [
    PlayerId,
    GameState["players"][PlayerId],
  ][]) {
    const card = player.characters.find(
      (candidate) => candidate.instanceId === instanceId,
    );
    if (card !== undefined) {
      return { playerId, card };
    }
    if (player.stage?.instanceId === instanceId) {
      return { playerId, card: player.stage };
    }
  }
  return null;
};

export const normalizeSelectedTargetKoProcess = (
  state: GameState,
  process: ReplacementProcess,
): ReplacementProcess => {
  const target = process.target;
  if (process.type !== "ko" || target === undefined) {
    return process;
  }
  const located = findKoTargetByInstanceId(state, target.instanceId);
  if (located === null) {
    return process;
  }
  const currentTarget: CardRef = {
    instanceId: located.card.instanceId,
    cardId: located.card.cardId,
    playerId: located.playerId,
    zone: located.card.zone,
  };
  const payload =
    typeof process.payload === "object" &&
    process.payload !== null &&
    "target" in process.payload
      ? { ...process.payload, target: currentTarget }
      : process.payload;
  return {
    ...process,
    target: currentTarget,
    payload,
  };
};

export const pauseSelectedTargetKoReplacementProcess = (
  state: GameState,
  events: EngineEvent[],
  process: ReplacementProcess,
  candidate: SelectedTargetKoReplacementCandidate,
): { state: GameState; paused: true } => {
  const replacementLabel = replacementOptionLabel(candidate);
  const pendingDecision: NonNullable<GameState["pendingDecision"]> = {
    id: toDecisionId(`decision:chooseReplacement:${process.id}`),
    type: "chooseReplacement",
    playerId: candidate.controllerId,
    prompt: "Choose replacement effect.",
    causedBy: process.causedBy,
    visibility: { type: "private", playerId: candidate.controllerId },
    processId: process.id,
    replacementIds: [candidate.id],
    replacementOptions: [
      {
        replacementId: candidate.id,
        label: replacementLabel,
      },
    ],
    mandatory: false,
  };
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: pendingDecision.id,
      decisionType: pendingDecision.type,
      playerId: pendingDecision.playerId,
    },
    pendingDecision.visibility,
  );
  const created = events[events.length - 1];
  if (created !== undefined) {
    created.causedBy = process.causedBy;
  }

  return {
    state: {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision,
      replacementState: [
        ...state.replacementState.filter(
          (candidateState) => candidateState.processId !== process.id,
        ),
        {
          processId: process.id,
          type: process.type,
          usedReplacementIds: [...process.usedReplacementIds],
          payload: process.payload,
        },
      ],
      eventJournal: [...state.eventJournal, ...events],
    },
    paused: true,
  };
};

const plural = (
  count: number,
  singular: string,
  pluralLabel: string,
): string => (count === 1 ? singular : pluralLabel);

const replacementOptionLabel = (
  candidate: SelectedTargetKoReplacementCandidate,
): string => {
  const instead = candidate.replacementEffect.instead;
  if (instead.type === "draw") {
    return `Draw ${String(instead.count)} ${plural(
      instead.count,
      "card",
      "cards",
    )} instead`;
  }
  if (isSupportedLifeTopToHandEffect(instead)) {
    return `Add ${String(instead.count)} ${plural(
      instead.count,
      "card",
      "cards",
    )} from Life to hand instead`;
  }
  if (isSupportedRestOwnCardsInsteadEffect(instead)) {
    return `Rest ${String(instead.target.request.min)} ${plural(
      instead.target.request.min,
      "card",
      "cards",
    )} instead`;
  }
  return "Use replacement effect";
};

const isSupportedRestOwnCardsInsteadEffect = (
  effect: SelectedTargetKoReplacementCandidate["replacementEffect"]["instead"],
): effect is Extract<
  SelectedTargetKoReplacementCandidate["replacementEffect"]["instead"],
  { type: "rest" }
> & {
  target: Extract<
    Extract<
      SelectedTargetKoReplacementCandidate["replacementEffect"]["instead"],
      { type: "rest" }
    >["target"],
    { type: "chooseFromZones" }
  >;
} =>
  effect.type === "rest" &&
  effect.target.type === "chooseFromZones" &&
  effect.target.request.timing === "onResolution" &&
  effect.target.request.chooser === "self" &&
  effect.target.request.player === "self" &&
  effect.target.request.filter === undefined &&
  effect.target.request.min === effect.target.request.max &&
  effect.target.request.min > 0 &&
  !effect.target.request.allowFewerIfUnavailable &&
  effect.target.request.visibility === "public";

const replacementRestCandidateIsActive = (
  state: GameState,
  target: CardRef,
): boolean => {
  const located = findKoTargetByInstanceId(state, target.instanceId);
  if (located !== null) {
    return located.card.state !== "rested";
  }
  const player = state.players[target.playerId];
  if (player === undefined) {
    return false;
  }
  if (
    target.zone?.zone === "leaderArea" &&
    player.leader.instanceId === target.instanceId
  ) {
    return player.leader.state !== "rested";
  }
  if (target.zone?.zone === "costArea") {
    return player.costArea.some(
      (card) =>
        card.instanceId === target.instanceId && card.state !== "rested",
    );
  }
  return false;
};

const replacementRestCandidates = (
  state: GameState,
  candidate: SelectedTargetKoReplacementCandidate,
): TargetCandidate[] => {
  const instead = candidate.replacementEffect.instead;
  if (!isSupportedRestOwnCardsInsteadEffect(instead)) {
    return [];
  }
  const resolved = resolvePublicTargetCandidatesForRequest(
    state,
    instead.target.request,
    { sourceControllerId: candidate.controllerId },
  );
  if (!resolved.ok) {
    return [];
  }
  return resolved.candidates.filter((target) =>
    replacementRestCandidateIsActive(state, target.card),
  );
};

const acceptedReplacementError = (
  effectId: string,
  reason: "missing-card" | "unsupported-effect-shape",
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason },
});

const findReplacementSource = (
  state: GameState,
  source: CardRef,
): LocatedReplacementSource | null => {
  for (const [, player] of Object.entries(state.players) as [
    CardInstance["controller"],
    GameState["players"][CardInstance["controller"]],
  ][]) {
    const card = [
      player.leader,
      ...player.characters,
      ...(player.stage === undefined ? [] : [player.stage]),
      ...player.hand,
      ...player.deck,
      ...player.trash,
      ...player.costArea,
      ...player.donDeck,
      ...player.life.map((lifeCard) => lifeCard.card),
    ].find((candidate) => candidate.instanceId === source.instanceId);
    if (card !== undefined) {
      return { card };
    }
  }
  return null;
};

const toReplacementDrawSourceSnapshot = (
  state: GameState,
  source: CardRef,
): CardSnapshot | null => {
  const located = findReplacementSource(state, source);
  const resolved = state.cardManifest.cards[source.cardId];
  if (located === null || resolved === undefined) {
    return null;
  }
  return {
    instanceId: located.card.instanceId,
    cardId: located.card.cardId,
    ownerId: located.card.owner,
    controllerId: located.card.controller,
    zone: located.card.zone,
    category: resolved.category,
    colors: [...resolved.colors],
    ...(resolved.cost === undefined ? {} : { cost: resolved.cost }),
    ...(resolved.power === undefined ? {} : { power: resolved.power }),
    ...(resolved.counter === undefined ? {} : { counter: resolved.counter }),
    ...(resolved.life === undefined ? {} : { life: resolved.life }),
    keywords: [...resolved.printedKeywords],
  };
};

const replacementInsteadTransformedPayload = (
  candidate: SelectedTargetKoReplacementCandidate,
) => ({
  controllerId: candidate.controllerId,
  effect: candidate.replacementEffect.instead,
  replacementId: candidate.id,
  source: candidate.source,
});

export const executeAcceptedSelectedTargetKoReplacementProcess = (
  state: GameState,
  events: EngineEvent[],
  effectId: string,
  process: ReplacementProcess,
  replacementId: string,
):
  | { state: GameState; process: ReplacementProcess }
  | { error: EngineError } => {
  if (process.usedReplacementIds.includes(replacementId)) {
    return {
      error: acceptedReplacementError(effectId, "unsupported-effect-shape"),
    };
  }
  const detected = detectSupportedSelectedTargetKoReplacementCandidate(
    state,
    process,
  );
  if (!detected.ok) return { error: detected.error };
  const candidate = detected.candidate;
  if (candidate === undefined || candidate.id !== replacementId) {
    return {
      error: acceptedReplacementError(effectId, "unsupported-effect-shape"),
    };
  }

  const usedProcess: ReplacementProcess = {
    ...process,
    usedReplacementIds: [...process.usedReplacementIds, candidate.id],
  };
  const restDecision = createReplacementRestTargetDecision(
    state,
    process,
    candidate,
  );
  if (restDecision !== undefined) {
    appendEvent(
      state,
      events,
      "decisionCreated",
      {
        decisionId: restDecision.id,
        decisionType: restDecision.type,
        playerId: restDecision.playerId,
      },
      restDecision.visibility,
    );
    const created = events[events.length - 1];
    if (created !== undefined) {
      created.causedBy = restDecision.causedBy;
    }
    return {
      state: {
        ...state,
        seq: toStateSeq(state.seq + 1),
        pendingDecision: restDecision,
        replacementState: [
          ...state.replacementState.filter(
            (candidateState) => candidateState.processId !== process.id,
          ),
          {
            processId: process.id,
            type: process.type,
            usedReplacementIds: usedProcess.usedReplacementIds,
            payload: {
              ...(typeof process.payload === "object" &&
              process.payload !== null
                ? process.payload
                : {}),
              pendingReplacementRestInstead: {
                decisionId: restDecision.id,
                effectBlockId: candidate.effectBlockId,
                replacementId: candidate.id,
                source: candidate.source,
                ...(process.target === undefined
                  ? {}
                  : { target: process.target }),
                controllerId: candidate.controllerId,
              } satisfies PendingReplacementRestInsteadPayload,
            },
          },
        ],
        eventJournal: [...state.eventJournal, ...events],
      },
      process: usedProcess,
    };
  }
  const transformedPayload = replacementInsteadTransformedPayload(candidate);
  appendEvent(
    state,
    events,
    "replacementApplied",
    {
      processId: usedProcess.id,
      replacementId: candidate.id,
      previousPayloadHash: hashCanonicalStateValue(process.payload),
      transformedPayloadHash: hashCanonicalStateValue(transformedPayload),
    } satisfies EngineInternalReplacementAppliedEventPayload,
    { type: "public" },
  );
  const applied = events[events.length - 1];
  if (applied !== undefined) {
    applied.causedBy = { type: "replacement", replacementId: candidate.id };
  }

  const sourceSnapshot = toReplacementDrawSourceSnapshot(
    state,
    candidate.source,
  );
  if (sourceSnapshot === null) {
    return { error: acceptedReplacementError(effectId, "missing-card") };
  }

  const replacementEntry: EffectQueueEntry = {
    id: `${process.id}:replacement:${candidate.id}` as EffectQueueEntry["id"],
    state: "resolving",
    timingWindowId: `replacement:${process.id}` as TimingWindowId,
    generation: 0,
    controllerId: candidate.controllerId,
    source: candidate.source,
    sourceSnapshot,
    effectBlockId: candidate.effectBlockId,
    orderingGroup:
      candidate.controllerId === state.turn.turnPlayerId
        ? "turnPlayer"
        : "nonTurnPlayer",
    createdAtEventSeq: state.eventJournal.length + events.length,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    causedBy: { type: "replacement", replacementId: candidate.id },
  };
  const replaced = executeReplacementInsteadEffect(
    { ...state, eventJournal: [...state.eventJournal, ...events] },
    replacementEntry,
    candidate.replacementEffect.instead,
  );
  if (replaced.errors !== undefined) {
    return {
      error:
        replaced.errors[0] ??
        acceptedReplacementError(effectId, "unsupported-effect-shape"),
    };
  }

  events.push(...rebaseEvents(state, replaced.events, events.length + 1));
  return {
    state: {
      ...replaced.state,
      eventJournal: [...state.eventJournal, ...events],
    },
    process: usedProcess,
  };
};

const createReplacementRestTargetDecision = (
  state: GameState,
  process: ReplacementProcess,
  candidate: SelectedTargetKoReplacementCandidate,
): SelectTargetsDecision | undefined => {
  const instead = candidate.replacementEffect.instead;
  if (!isSupportedRestOwnCardsInsteadEffect(instead)) {
    return undefined;
  }
  const candidates = replacementRestCandidates(state, candidate);
  if (candidates.length < instead.target.request.min) {
    return undefined;
  }
  if (state.players[candidate.controllerId] === undefined) {
    return undefined;
  }
  return {
    id: toDecisionId(
      `decision:replacementRestTargets:${process.id}:${candidate.id}`,
    ),
    type: "selectTargets",
    playerId: candidate.controllerId,
    prompt: `Rest ${String(instead.target.request.min)} ${plural(
      instead.target.request.min,
      "card",
      "cards",
    )} instead.`,
    causedBy: { type: "replacement", replacementId: candidate.id },
    visibility: { type: "public" },
    request: instead.target.request,
    candidates,
  };
};

const pendingReplacementRestPayload = (
  state: GameState,
  decision: NonNullable<GameState["pendingDecision"]> | undefined,
): {
  processId: string;
  payload: PendingReplacementRestInsteadPayload;
} | null => {
  if (decision?.type !== "selectTargets") {
    return null;
  }
  const processState = state.replacementState.find((candidate) => {
    const payload = candidate.payload;
    return (
      typeof payload === "object" &&
      payload !== null &&
      "pendingReplacementRestInstead" in payload &&
      pendingReplacementRestInsteadFromPayload(payload)?.decisionId ===
        decision.id
    );
  });
  const payload =
    processState === undefined
      ? undefined
      : pendingReplacementRestInsteadFromPayload(processState.payload);
  return processState === undefined || payload === undefined
    ? null
    : { processId: processState.processId, payload };
};

const pendingReplacementRestInsteadFromPayload = (
  payload: unknown,
):
  | (PendingReplacementRestInsteadPayload & { decisionId: string })
  | undefined => {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("pendingReplacementRestInstead" in payload)
  ) {
    return undefined;
  }
  const pending = payload.pendingReplacementRestInstead;
  if (typeof pending !== "object" || pending === null) {
    return undefined;
  }
  const candidate = pending as Record<string, unknown>;
  if (
    typeof candidate["decisionId"] !== "string" ||
    typeof candidate["replacementId"] !== "string" ||
    typeof candidate["effectBlockId"] !== "string" ||
    typeof candidate["controllerId"] !== "string" ||
    !isCardRef(candidate["source"])
  ) {
    return undefined;
  }
  const target = candidate["target"];
  if (target !== undefined && !isCardRef(target)) {
    return undefined;
  }
  return {
    decisionId: candidate["decisionId"],
    replacementId: candidate["replacementId"],
    effectBlockId: candidate[
      "effectBlockId"
    ] as EffectQueueEntry["effectBlockId"],
    controllerId: candidate["controllerId"] as PlayerId,
    source: candidate["source"],
    ...(target === undefined ? {} : { target }),
  };
};

const isCardRef = (value: unknown): value is CardRef => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const zone = candidate["zone"];
  return (
    typeof candidate["instanceId"] === "string" &&
    typeof candidate["cardId"] === "string" &&
    typeof candidate["playerId"] === "string" &&
    (zone === undefined || (typeof zone === "object" && zone !== null))
  );
};

const cardRefsEqual = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId &&
  left.zone?.zone === right.zone?.zone &&
  left.zone?.playerId === right.zone?.playerId &&
  left.zone?.slot === right.zone?.slot &&
  left.zone?.index === right.zone?.index;

export const isReplacementRestTargetsDecision = (
  state: GameState,
  decision: NonNullable<GameState["pendingDecision"]> | undefined,
): boolean => pendingReplacementRestPayload(state, decision) !== null;

export const getReplacementRestTargetLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const decision = state.pendingDecision;
  const pending = pendingReplacementRestPayload(state, decision);
  if (
    decision?.type !== "selectTargets" ||
    pending === null ||
    decision.playerId !== playerId
  ) {
    return [];
  }
  const currentCandidates = replacementRestDecisionCandidates(state, decision);
  if (currentCandidates.length < decision.request.min) {
    return [];
  }
  return [
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "targets",
        targets: currentCandidates
          .slice(0, decision.request.min)
          .map((candidate) => candidate.card),
      },
    },
  ];
};

export type ReplacementRestTargetDecisionResult = {
  completedPayload: unknown;
  result: EngineResult;
};

export const applyReplacementRestTargetDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): ReplacementRestTargetDecisionResult | null => {
  const decision = state.pendingDecision;
  const pending = pendingReplacementRestPayload(state, decision);
  if (decision?.type !== "selectTargets" || pending === null) {
    return null;
  }
  if (action.response.type !== "targets") {
    return {
      completedPayload: undefined,
      result: toEngineResult(
        state,
        [],
        [
          {
            type: "invalidDecisionResponse",
            reason: "Response type must be targets for selectTargets.",
          },
        ],
      ),
    };
  }
  const targets = (action.response as { targets?: unknown }).targets;
  if (!Array.isArray(targets) || !targets.every(isCardRef)) {
    return {
      completedPayload: undefined,
      result: toEngineResult(
        state,
        [],
        [
          {
            type: "invalidDecisionResponse",
            reason: "Response targets must be CardRef values.",
          },
        ],
      ),
    };
  }
  const currentCandidates = replacementRestDecisionCandidates(state, decision);
  const targetRefs = targets;
  if (
    targetRefs.length !== decision.request.min ||
    hasDuplicateTargets(targetRefs) ||
    !targetRefs.every((target) =>
      currentCandidates.some((candidate) =>
        cardRefsEqual(candidate.card, target),
      ),
    )
  ) {
    return {
      completedPayload: undefined,
      result: toEngineResult(
        state,
        [],
        [
          {
            type: "invalidDecisionResponse",
            reason:
              "Selected targets must be current legal replacement targets.",
          },
        ],
      ),
    };
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
    },
    { type: "public" },
  );
  const resolved = events[0];
  if (resolved !== undefined) {
    resolved.causedBy = { type: "decision", decisionId: decision.id };
  }
  const rested = restFieldObjects(state, targetRefs);
  const transformedPayload = {
    replacementId: pending.payload.replacementId,
    restedTargets: targetRefs,
  };
  appendEvent(
    rested.state,
    events,
    "replacementApplied",
    {
      processId: pending.processId,
      replacementId: pending.payload.replacementId,
      previousPayloadHash: hashCanonicalStateValue(
        replacementPayloadWithoutPending(state, pending.processId),
      ),
      transformedPayloadHash: hashCanonicalStateValue(transformedPayload),
    } satisfies EngineInternalReplacementAppliedEventPayload,
    { type: "public" },
  );
  const applied = events[events.length - 1];
  if (applied !== undefined) {
    applied.causedBy = {
      type: "replacement",
      replacementId: pending.payload.replacementId,
    };
  }
  const completedPayload = replacementPayloadWithoutPending(
    state,
    pending.processId,
  );
  const nextState: GameState = {
    ...rested.state,
    seq: toStateSeq(rested.state.seq + 1),
    replacementState: rested.state.replacementState.filter(
      (candidate) => candidate.processId !== pending.processId,
    ),
    eventJournal: [...rested.state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  return {
    completedPayload,
    result: toEngineResult(nextState, events),
  };
};

const replacementPayloadWithoutPending = (
  state: GameState,
  processId: string,
): unknown => {
  const stored = state.replacementState.find(
    (candidate) => candidate.processId === processId,
  );
  const payload = stored?.payload;
  if (typeof payload !== "object" || payload === null) {
    return payload;
  }
  const rest = { ...(payload as Record<string, unknown>) };
  delete rest["pendingReplacementRestInstead"];
  return rest;
};

const replacementRestDecisionCandidates = (
  state: GameState,
  decision: SelectTargetsDecision,
): TargetCandidate[] => {
  const resolved = resolvePublicTargetCandidatesForRequest(
    state,
    decision.request,
    { sourceControllerId: decision.playerId },
  );
  if (!resolved.ok) {
    return [];
  }
  return resolved.candidates.filter((candidate) =>
    replacementRestCandidateIsActive(state, candidate.card),
  );
};

const hasDuplicateTargets = (targets: readonly CardRef[]): boolean =>
  targets.some((target, index) =>
    targets
      .slice(index + 1)
      .some((candidate) => cardRefsEqual(target, candidate)),
  );

const executeReplacementInsteadEffect = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: SelectedTargetKoReplacementCandidate["replacementEffect"]["instead"],
) => {
  if (effect.type === "moveCards") {
    return executeMoveCardsPrimitive(state, entry, effect, {
      incrementStateSeq: false,
    });
  }
  return executeNoChoiceEffectPrimitive(state, entry, effect, {
    incrementStateSeq: false,
  });
};
