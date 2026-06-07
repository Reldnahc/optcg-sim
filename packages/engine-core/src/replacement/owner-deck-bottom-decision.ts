import type {
  Action,
  ActiveEffectTextPresentation,
  CardRef,
  CausalityRef,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
  ReplacementProcess,
  SelectTargetsDecision,
  TargetCandidate,
} from "@optcg/types";

import {
  appendEvent,
  toDecisionId,
  toEngineResult,
  toStateSeq,
} from "../action-results.js";
import { resolvePublicTargetCandidatesForRequest } from "../selection/candidates.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import { moveFieldCardToOwnerDeckBottom } from "../movement/field-to-deck.js";
import {
  isCausalityRef,
  replacementProcessFromStoredPayload,
} from "./field-removal-targets.js";
import { isSupportedOwnerDeckBottomInsteadEffect } from "./instead-effects.js";
import type { SelectedTargetKoReplacementCandidate } from "./primitives.js";
import { activeEffectTextPresentationFromPayloadValue } from "./presentation-payload.js";
import { continueUncoveredFieldRemovalTargets } from "./unreplaced-field-removal.js";

interface PendingReplacementOwnerDeckBottomInsteadPayload {
  decisionId: string;
  effectBlockId: string;
  replacementId: string;
  source: CardRef;
  target?: CardRef;
  coveredTargets?: CardRef[];
  causedBy: CausalityRef;
  controllerId: PlayerId;
  presentation?: ActiveEffectTextPresentation;
}

interface EngineInternalReplacementAppliedEventPayload {
  processId: string;
  replacementId: string;
  previousPayloadHash: string;
  transformedPayloadHash: string;
  presentation?: ActiveEffectTextPresentation;
}

export type ReplacementOwnerDeckBottomDecisionResult = {
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

const cardRefArrayFromPayloadValue = (value: unknown): CardRef[] | undefined =>
  value === undefined
    ? undefined
    : Array.isArray(value) && value.every(isCardRef)
      ? value
      : undefined;

const pendingReplacementOwnerDeckBottomInsteadFromPayload = (
  payload: unknown,
):
  | (PendingReplacementOwnerDeckBottomInsteadPayload & { decisionId: string })
  | undefined => {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("pendingReplacementOwnerDeckBottomInstead" in payload)
  ) {
    return undefined;
  }
  const pending = payload.pendingReplacementOwnerDeckBottomInstead;
  if (typeof pending !== "object" || pending === null) {
    return undefined;
  }
  const candidate = pending as Record<string, unknown>;
  if (
    typeof candidate["decisionId"] !== "string" ||
    typeof candidate["replacementId"] !== "string" ||
    typeof candidate["effectBlockId"] !== "string" ||
    typeof candidate["controllerId"] !== "string" ||
    !isCausalityRef(candidate["causedBy"]) ||
    !isCardRef(candidate["source"])
  ) {
    return undefined;
  }
  const target = candidate["target"];
  if (target !== undefined && !isCardRef(target)) {
    return undefined;
  }
  const coveredTargets = cardRefArrayFromPayloadValue(
    candidate["coveredTargets"],
  );
  if (
    candidate["coveredTargets"] !== undefined &&
    coveredTargets === undefined
  ) {
    return undefined;
  }
  const presentation = activeEffectTextPresentationFromPayloadValue(
    candidate["presentation"],
  );
  if (candidate["presentation"] !== undefined && presentation === undefined) {
    return undefined;
  }
  return {
    decisionId: candidate["decisionId"],
    replacementId: candidate["replacementId"],
    effectBlockId: candidate["effectBlockId"],
    controllerId: candidate["controllerId"] as PlayerId,
    source: candidate["source"],
    causedBy: candidate["causedBy"],
    ...(target === undefined ? {} : { target }),
    ...(coveredTargets === undefined ? {} : { coveredTargets }),
    ...(presentation === undefined ? {} : { presentation }),
  };
};

const pendingReplacementOwnerDeckBottomPayload = (
  state: GameState,
  decision: NonNullable<GameState["pendingDecision"]> | undefined,
): {
  processId: string;
  processType: GameState["replacementState"][number]["type"];
  payload: PendingReplacementOwnerDeckBottomInsteadPayload;
} | null => {
  if (decision?.type !== "selectTargets") {
    return null;
  }
  const processState = state.replacementState.find((candidate) => {
    const payload = candidate.payload;
    return (
      typeof payload === "object" &&
      payload !== null &&
      "pendingReplacementOwnerDeckBottomInstead" in payload &&
      pendingReplacementOwnerDeckBottomInsteadFromPayload(payload)
        ?.decisionId === decision.id
    );
  });
  const payload =
    processState === undefined
      ? undefined
      : pendingReplacementOwnerDeckBottomInsteadFromPayload(
          processState.payload,
        );
  return processState === undefined || payload === undefined
    ? null
    : {
        processId: processState.processId,
        processType: processState.type,
        payload,
      };
};

const ownerDeckBottomDecisionCandidates = (
  state: GameState,
  decision: SelectTargetsDecision,
): TargetCandidate[] => {
  const resolved = resolvePublicTargetCandidatesForRequest(
    state,
    decision.request,
    { sourceControllerId: decision.playerId },
  );
  return resolved.ok ? resolved.candidates : [];
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
  delete rest["pendingReplacementOwnerDeckBottomInstead"];
  return rest;
};

const findFieldCardByRef = (
  state: GameState,
  target: CardRef,
):
  | {
      card: NonNullable<GameState["players"][PlayerId]>["characters"][number];
      playerId: PlayerId;
      sourceZone: "characterArea" | "stageArea";
    }
  | undefined => {
  const player = state.players[target.playerId];
  if (player === undefined) {
    return undefined;
  }
  if (target.zone?.zone === "characterArea") {
    const card = player.characters.find(
      (candidate) =>
        candidate.instanceId === target.instanceId &&
        candidate.cardId === target.cardId,
    );
    return card === undefined
      ? undefined
      : { card, playerId: target.playerId, sourceZone: "characterArea" };
  }
  if (
    target.zone?.zone === "stageArea" &&
    player.stage?.instanceId === target.instanceId &&
    player.stage.cardId === target.cardId
  ) {
    return {
      card: player.stage,
      playerId: target.playerId,
      sourceZone: "stageArea",
    };
  }
  return undefined;
};

export const createReplacementOwnerDeckBottomDecision = (
  state: GameState,
  process: ReplacementProcess,
  candidate: SelectedTargetKoReplacementCandidate,
): SelectTargetsDecision | undefined => {
  const instead = candidate.replacementEffect.instead;
  if (!isSupportedOwnerDeckBottomInsteadEffect(instead)) {
    return undefined;
  }
  const selectEffect = instead.effects[0]?.effect;
  if (selectEffect?.type !== "selectTargets") {
    return undefined;
  }
  const candidates = resolvePublicTargetCandidatesForRequest(
    state,
    selectEffect.request,
    { sourceControllerId: candidate.controllerId },
  );
  if (
    !candidates.ok ||
    candidates.candidates.length < selectEffect.request.min ||
    state.players[candidate.controllerId] === undefined
  ) {
    return undefined;
  }
  return {
    id: toDecisionId(
      `decision:replacementOwnerDeckBottom:${process.id}:${candidate.id}`,
    ),
    type: "selectTargets",
    playerId: candidate.controllerId,
    prompt: `Place ${String(selectEffect.request.min)} Character at the bottom of the owner's deck instead.`,
    causedBy: { type: "replacement", replacementId: candidate.id },
    visibility: { type: "public" },
    request: selectEffect.request,
    candidates: candidates.candidates,
  };
};

export const isReplacementOwnerDeckBottomDecision = (
  state: GameState,
  decision: NonNullable<GameState["pendingDecision"]> | undefined,
): boolean =>
  pendingReplacementOwnerDeckBottomPayload(state, decision) !== null;

export const getReplacementOwnerDeckBottomLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const decision = state.pendingDecision;
  const pending = pendingReplacementOwnerDeckBottomPayload(state, decision);
  if (
    decision?.type !== "selectTargets" ||
    pending === null ||
    decision.playerId !== playerId
  ) {
    return [];
  }
  const currentCandidates = ownerDeckBottomDecisionCandidates(state, decision);
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

export const applyReplacementOwnerDeckBottomDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): ReplacementOwnerDeckBottomDecisionResult | null => {
  const decision = state.pendingDecision;
  const pending = pendingReplacementOwnerDeckBottomPayload(state, decision);
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
  const currentCandidates = ownerDeckBottomDecisionCandidates(state, decision);
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

  let movedState = state;
  for (const target of targetRefs) {
    const located = findFieldCardByRef(movedState, target);
    if (located === undefined) {
      return {
        completedPayload: undefined,
        result: toEngineResult(
          state,
          [],
          invalidDecision("Selected replacement target is no longer on field."),
        ),
      };
    }
    const moved = moveFieldCardToOwnerDeckBottom({
      card: located.card,
      causedBy: {
        type: "replacement",
        replacementId: pending.payload.replacementId,
      },
      events,
      playerId: located.playerId,
      sourceZone: located.sourceZone,
      state: movedState,
    });
    movedState = moved.state;
  }
  if (movedState === state) {
    return {
      completedPayload: undefined,
      result: toEngineResult(
        state,
        [],
        invalidDecision("Selected replacement target could not be moved."),
      ),
    };
  }

  const transformedPayload = {
    replacementId: pending.payload.replacementId,
    ownerDeckBottomTargets: targetRefs,
  };
  appendEvent(
    movedState,
    events,
    "replacementApplied",
    {
      processId: pending.processId,
      replacementId: pending.payload.replacementId,
      previousPayloadHash: hashCanonicalStateValue(
        replacementPayloadWithoutPending(state, pending.processId),
      ),
      transformedPayloadHash: hashCanonicalStateValue(transformedPayload),
      ...(pending.payload.presentation === undefined
        ? {}
        : { presentation: pending.payload.presentation }),
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
  const process = replacementProcessFromStoredPayload({
    causedBy: pending.payload.causedBy,
    payload: completedPayload,
    processId: pending.processId,
    type: pending.processType,
    usedReplacementIds: [pending.payload.replacementId],
  });
  const continued =
    process === null
      ? { state: movedState }
      : continueUncoveredFieldRemovalTargets(
          movedState,
          events,
          pending.payload.effectBlockId,
          process,
          pending.payload.coveredTargets ?? [],
        );
  if ("error" in continued) {
    return {
      completedPayload: undefined,
      result: toEngineResult(state, [], [continued.error]),
    };
  }
  const nextState: GameState = {
    ...continued.state,
    seq: toStateSeq(continued.state.seq + 1),
    replacementState: continued.state.replacementState.filter(
      (candidate) => candidate.processId !== pending.processId,
    ),
    eventJournal: [...continued.state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  return {
    completedPayload,
    result: toEngineResult(nextState, events),
  };
};
