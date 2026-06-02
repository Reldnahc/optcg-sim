import type {
  Effect,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  MultiZoneTargetRequest,
  SelectTargetsDecision,
  Target,
  TargetRequest,
} from "@optcg/types";

import { appendEvent, toDecisionId, toStateSeq } from "../action-results.js";
import { resolvePlayerId } from "../runtime/primitives/execute.js";
import {
  frameForPausedSequenceDecision,
  stateWithPausedSequenceFrame,
} from "./frame-decisions.js";
import type { SegmentLedgers, SequenceFrameRunResult } from "./runner.js";
import { resolvePublicTargetCandidatesForRequest } from "../selection/candidates.js";

type ContinuousResolvedEffect = Extract<
  Effect,
  {
    type:
      | "modifyPower"
      | "giveKeyword"
      | "modifyCost"
      | "preventDraw"
      | "preventDonActivation"
      | "preventPlay"
      | "invalidateEffects"
      | "cannotBecomeActive"
      | "cannotAttack"
      | "cannotBlock";
  }
>;
type ContinuousEffectWithTarget = Extract<
  ContinuousResolvedEffect,
  { target: Target }
>;

export const isContinuousResolvedEffect = (
  effect: Effect,
): effect is ContinuousResolvedEffect =>
  effect.type === "modifyPower" ||
  effect.type === "giveKeyword" ||
  effect.type === "modifyCost" ||
  effect.type === "preventDraw" ||
  effect.type === "preventDonActivation" ||
  effect.type === "preventPlay" ||
  effect.type === "invalidateEffects" ||
  effect.type === "cannotBecomeActive" ||
  effect.type === "cannotAttack" ||
  effect.type === "cannotBlock";

const isContinuousEffectWithTarget = (
  effect: ContinuousResolvedEffect,
): effect is ContinuousEffectWithTarget => "target" in effect;

export const hasSavedFieldObjectContinuousTarget = (
  effect: ContinuousResolvedEffect,
): boolean =>
  isContinuousEffectWithTarget(effect) &&
  effect.target.type === "savedFieldObject";

export const continuousChooseTargetRequest = (
  effect: ContinuousResolvedEffect,
): TargetRequest | MultiZoneTargetRequest | undefined => {
  if (!isContinuousEffectWithTarget(effect)) {
    return undefined;
  }
  if (
    effect.target.type === "choose" ||
    effect.target.type === "chooseFromZones"
  ) {
    return effect.target.request;
  }
  return undefined;
};

export const restChooseTargetRequest = (
  effect: Extract<Effect, { type: "rest" }>,
): TargetRequest | MultiZoneTargetRequest | undefined => {
  if (
    effect.target.type === "choose" ||
    effect.target.type === "chooseFromZones"
  ) {
    return effect.target.request;
  }
  return undefined;
};

export const createSequenceSelectTargetsPause = (params: {
  effectBlockId: EffectQueueEntry["effectBlockId"];
  effectPath: readonly string[];
  entry: EffectQueueEntry;
  events: EngineEvent[];
  index: number;
  ledgers: SegmentLedgers;
  request: TargetRequest | MultiZoneTargetRequest;
  state: GameState;
}): SequenceFrameRunResult => {
  const candidates = resolvePublicTargetCandidatesForRequest(
    params.state,
    params.request,
    {
      sourceControllerId: params.entry.controllerId,
    },
  );
  const chooserId = resolvePlayerId(
    params.state,
    params.entry,
    params.request.chooser,
  );
  if (!candidates.ok || chooserId === undefined) {
    return { ok: false };
  }
  const decision: SelectTargetsDecision = {
    id: toDecisionId(
      `decision:selectTargets:sequence:${String(params.entry.id)}:${String(params.index)}`,
    ),
    type: "selectTargets",
    playerId: chooserId,
    prompt: "Select targets.",
    causedBy: {
      type: "effect",
      queueEntryId: params.entry.id,
      effectId: params.effectBlockId,
    },
    visibility: { type: "public" },
    request: params.request,
    candidates: candidates.candidates,
  };
  const decisionEvents: EngineEvent[] = [];
  appendEvent(
    params.state,
    decisionEvents,
    "decisionCreated",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
    },
    { type: "public" },
  );
  const created = decisionEvents[0];
  if (created !== undefined) {
    created.causedBy = decision.causedBy;
  }
  const decisionState: GameState = {
    ...params.state,
    seq: toStateSeq(params.state.seq + 1),
    pendingDecision: decision,
    eventJournal: [...params.state.eventJournal, ...decisionEvents],
  };
  const frame = frameForPausedSequenceDecision({
    decision,
    entry: params.entry,
    effectPath: [...params.effectPath],
    index: params.index,
    savedReferences: params.ledgers.savedReferences,
    segmentResults: params.ledgers.segmentResults,
    state: decisionState,
  });
  return {
    events: [...params.events, ...decisionEvents],
    kind: "paused",
    ok: true,
    state: stateWithPausedSequenceFrame(decisionState, params.entry, frame),
  };
};
