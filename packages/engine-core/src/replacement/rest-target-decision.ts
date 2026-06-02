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
  SelectTargetsDecision,
  TargetCandidate,
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "../action-results.js";
import { hashCanonicalStateValue } from "../canonical-state.js";
import { restFieldObjects } from "../effect-runtime-sequence-saved-field-object.js";
import { resolvePublicTargetCandidatesForRequest } from "../target-selection.js";

interface PendingReplacementRestInsteadPayload {
  decisionId: string;
  effectBlockId: string;
  replacementId: string;
  source: CardRef;
  target?: CardRef;
  controllerId: PlayerId;
}

interface EngineInternalReplacementAppliedEventPayload {
  processId: string;
  replacementId: string;
  previousPayloadHash: string;
  transformedPayloadHash: string;
}

export type ReplacementDecisionResult = {
  completedPayload: unknown;
  result: EngineResult;
};

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

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

const hasDuplicateTargets = (targets: readonly CardRef[]): boolean =>
  targets.some((target, index) =>
    targets
      .slice(index + 1)
      .some((candidate) => cardRefsEqual(target, candidate)),
  );

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
    effectBlockId: candidate["effectBlockId"],
    controllerId: candidate["controllerId"] as PlayerId,
    source: candidate["source"],
    ...(target === undefined ? {} : { target }),
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

const findCardByInstanceId = (
  state: GameState,
  instanceId: CardInstance["instanceId"],
): CardInstance | undefined => {
  for (const player of Object.values(state.players)) {
    const cards = [
      player.leader,
      ...player.characters,
      ...(player.stage === undefined ? [] : [player.stage]),
      ...player.costArea,
    ];
    const card = cards.find((candidate) => candidate.instanceId === instanceId);
    if (card !== undefined) {
      return card;
    }
  }
  return undefined;
};

const replacementRestCandidateIsActive = (
  state: GameState,
  target: CardRef,
): boolean =>
  findCardByInstanceId(state, target.instanceId)?.state !== "rested";

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

export const applyReplacementRestTargetDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): ReplacementDecisionResult | null => {
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
        invalidDecision("Response type must be targets for selectTargets."),
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
        invalidDecision("Response targets must be CardRef values."),
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
        invalidDecision(
          "Selected targets must be current legal replacement targets.",
        ),
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
