import type {
  CardInstance,
  CardRef,
  CardSnapshot,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  GameState,
  PlayerId,
  ReplacementProcess,
  SelectCardsDecision,
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
} from "../action-results.js";
import { toCardRef } from "../action-state.js";
import { hashCanonicalStateValue } from "../canonical-state.js";
import { executeNoChoiceEffectPrimitive } from "../runtime/primitives/execute.js";
import {
  executeMoveCardsPrimitive,
  isSupportedLifeTopToHandEffect,
} from "../effect-runtime-move-cards.js";
import {
  detectSupportedSelectedTargetKoReplacementCandidate,
  type SelectedTargetKoReplacementCandidate,
} from "./primitives.js";
import { restFieldObjects } from "../effect-runtime-sequence/saved-field-object.js";
import { consumeOncePerTurn, toOncePerTurnKey } from "../once-per-turn.js";
import { resolvePublicTargetCandidatesForRequest } from "../target-selection.js";

export type {
  DetectSelectedTargetKoReplacementCandidateResult,
  SelectedTargetKoReplacementCandidate,
  SelectedTargetKoReplacementDetectionFailureReason,
} from "./primitives.js";
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

interface PendingReplacementTrashFromHandInsteadPayload {
  decisionId: string;
  effectBlockId: EffectQueueEntry["effectBlockId"];
  replacementId: string;
  source: CardRef;
  target?: CardRef;
  controllerId: PlayerId;
  count: number;
  oncePerTurn?: {
    cardInstanceId: CardInstance["instanceId"];
    effectId: EffectQueueEntry["effectBlockId"];
    turnNumber: GameState["turn"]["globalTurn"];
  };
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
  if (isSupportedRestSelfInsteadEffect(instead)) {
    return "Rest this Character instead";
  }
  if (isSupportedTrashFromHandInsteadEffect(instead)) {
    return `Trash ${String(instead.count)} ${plural(
      instead.count,
      "card",
      "cards",
    )} from hand instead`;
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

const isSupportedRestSelfInsteadEffect = (
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
    { type: "self" }
  >;
} => effect.type === "rest" && effect.target.type === "self";

const isSupportedTrashFromHandInsteadEffect = (
  effect: SelectedTargetKoReplacementCandidate["replacementEffect"]["instead"],
): effect is Extract<
  SelectedTargetKoReplacementCandidate["replacementEffect"]["instead"],
  { type: "trashFromHand" }
> =>
  effect.type === "trashFromHand" &&
  effect.player === "self" &&
  effect.chooser === "self" &&
  effect.filter === undefined &&
  Number.isInteger(effect.count) &&
  effect.count > 0;

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
  const trashFromHandDecision = createReplacementTrashFromHandDecision(
    state,
    process,
    candidate,
  );
  if (trashFromHandDecision !== undefined) {
    appendEvent(
      state,
      events,
      "decisionCreated",
      {
        decisionId: trashFromHandDecision.id,
        decisionType: trashFromHandDecision.type,
        playerId: trashFromHandDecision.playerId,
      },
      trashFromHandDecision.visibility,
    );
    const created = events[events.length - 1];
    if (created !== undefined) {
      created.causedBy = trashFromHandDecision.causedBy;
    }
    const oncePerTurn =
      candidate.oncePerTurn === true
        ? {
            cardInstanceId: candidate.source.instanceId,
            effectId: candidate.effectBlockId,
            turnNumber: state.turn.globalTurn,
          }
        : undefined;
    return {
      state: {
        ...state,
        seq: toStateSeq(state.seq + 1),
        pendingDecision: trashFromHandDecision,
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
              pendingReplacementTrashFromHandInstead: {
                decisionId: trashFromHandDecision.id,
                effectBlockId: candidate.effectBlockId,
                replacementId: candidate.id,
                source: candidate.source,
                ...(process.target === undefined
                  ? {}
                  : { target: process.target }),
                controllerId: candidate.controllerId,
                count: trashFromHandDecision.request.min,
                ...(oncePerTurn === undefined ? {} : { oncePerTurn }),
              } satisfies PendingReplacementTrashFromHandInsteadPayload,
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

  const afterReplacement =
    candidate.oncePerTurn === true
      ? consumeOncePerTurn(
          replaced.state,
          toOncePerTurnKey({
            cardInstanceId: candidate.source.instanceId,
            effectId: candidate.effectBlockId,
            turnNumber: state.turn.globalTurn,
          }),
        )
      : replaced.state;
  events.push(...rebaseEvents(state, replaced.events, events.length + 1));
  return {
    state: {
      ...afterReplacement,
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

const createReplacementTrashFromHandDecision = (
  state: GameState,
  process: ReplacementProcess,
  candidate: SelectedTargetKoReplacementCandidate,
): SelectCardsDecision | undefined => {
  const instead = candidate.replacementEffect.instead;
  if (!isSupportedTrashFromHandInsteadEffect(instead)) {
    return undefined;
  }
  const player = state.players[candidate.controllerId];
  if (player === undefined || player.hand.length < instead.count) {
    return undefined;
  }
  const visibility = {
    type: "private",
    playerId: candidate.controllerId,
  } as const;
  return {
    id: toDecisionId(
      `decision:replacementTrashFromHand:${process.id}:${candidate.id}`,
    ),
    type: "selectCards",
    playerId: candidate.controllerId,
    prompt: `Trash ${String(instead.count)} ${plural(
      instead.count,
      "card",
      "cards",
    )} from hand instead.`,
    causedBy: { type: "replacement", replacementId: candidate.id },
    visibility,
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "self",
      zone: "hand",
      min: instead.count,
      max: instead.count,
      allowFewerIfUnavailable: false,
      visibility: "privateToChooser",
    },
    candidates: player.hand.map((card) => ({
      card: toCardRef(card, candidate.controllerId),
      visibility,
    })),
  };
};

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
  if (isSupportedRestSelfInsteadEffect(effect)) {
    const rested = restFieldObjects(state, [entry.source]);
    return toEngineResult(rested.state, []);
  }
  return executeNoChoiceEffectPrimitive(state, entry, effect, {
    incrementStateSeq: false,
  });
};
