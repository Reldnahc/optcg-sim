import type {
  Action,
  CardRef,
  CardInstance,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  SelectTargetsDecision,
  TargetCandidate,
  TargetSelectionConstraint,
} from "@optcg/types";

import {
  appendEvent,
  assertGameStateInvariantsIfEnabled,
  type EngineResultOptions,
  toEngineResult,
  toStateSeq,
} from "../action-results.js";
import { zonesEqual } from "../actions/state.js";
import {
  continueSelectedTargetEffect,
  resolveImplementedDslEffectDefinition,
} from "../effect-runtime.js";
import { createSupportedTrashFromHandChoiceDecision } from "../runtime/primitives/trash-from-hand.js";
import {
  clearPendingDecision,
  effectQueueEntryForDecision,
} from "../decisions/continuation-gate.js";
import { isUnsupportedSelectTargetsDecision } from "../effect-runtime-queue/target-decisions.js";
import { resumeSequenceFrameAfterSelectTargets } from "../effect-runtime-sequence/frames.js";
import { isSequenceFrameSelectTargetsDecision } from "../effect-runtime-sequence/select-targets.js";
import { computeView } from "../view/compute-view.js";
import { resolvePublicTargetCandidatesForRequest } from "./candidates.js";

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

const toErrorTuple = (
  errors: readonly EngineError[],
): readonly [EngineError, ...EngineError[]] => {
  const first = errors[0];
  if (first === undefined) {
    return [
      {
        type: "effectRuntimeError",
        effectId: "select-targets-continuation",
        details: { reason: "empty-runtime-error-list" },
      },
    ];
  }
  return [first, ...errors.slice(1)];
};

const cardRefMatches = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId &&
  ((left.zone === undefined && right.zone === undefined) ||
    (left.zone !== undefined && zonesEqual(left.zone, right.zone)));

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

const hasDuplicateTargets = (targets: readonly CardRef[]): boolean =>
  targets.some((target, index) =>
    targets
      .slice(index + 1)
      .some((candidate) => cardRefMatches(target, candidate)),
  );

const allTargetsInCandidates = (
  targets: readonly CardRef[],
  candidates: readonly TargetCandidate[],
): boolean =>
  targets.every((target) =>
    candidates.some((candidate) => cardRefMatches(target, candidate.card)),
  );

const compareNumber = (
  op: TargetSelectionConstraint["op"],
  left: number,
  right: number,
): boolean => {
  switch (op) {
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
  }
};

const findCardInstanceByRef = (
  state: GameState,
  ref: CardRef,
): CardInstance | undefined => {
  const player = state.players[ref.playerId];
  if (player === undefined) {
    return undefined;
  }
  const candidates = [
    player.leader,
    ...player.characters,
    ...(player.stage === undefined ? [] : [player.stage]),
    ...player.costArea,
  ];
  return candidates.find(
    (candidate) =>
      candidate.instanceId === ref.instanceId &&
      candidate.cardId === ref.cardId &&
      (ref.zone === undefined || zonesEqual(ref.zone, candidate.zone)),
  );
};

const targetSelectionStatValue = (
  state: GameState,
  card: CardInstance,
  stat: TargetSelectionConstraint["stat"],
): number | undefined => {
  const metadata = state.cardManifest.cards[card.cardId];
  if (metadata === undefined) {
    return undefined;
  }
  if (stat === "baseCost") {
    return metadata.cost;
  }
  if (stat === "basePower") {
    return metadata.power;
  }

  const view =
    state.continuousEffects.length === 0
      ? undefined
      : computeView(state, {
          supportStatusPolicy: "ignore",
          unsupportedCombatKeywordPolicy: "ignore",
        }).cards[card.instanceId];
  if (stat === "cost") {
    return view?.currentCost ?? metadata.cost;
  }
  return view?.currentPower ?? metadata.power;
};

const targetsSatisfySelectionConstraint = (
  state: GameState,
  targets: readonly CardRef[],
  constraint: TargetSelectionConstraint,
): boolean => {
  const total = targets.reduce<number | undefined>((sum, target) => {
    if (sum === undefined) {
      return undefined;
    }
    const card = findCardInstanceByRef(state, target);
    if (card === undefined) {
      return undefined;
    }
    const value = targetSelectionStatValue(state, card, constraint.stat);
    return value === undefined ? undefined : sum + value;
  }, 0);

  return (
    total !== undefined && compareNumber(constraint.op, total, constraint.value)
  );
};

const targetsSatisfySelectionConstraints = (
  state: GameState,
  decision: SelectTargetsDecision,
  targets: readonly CardRef[],
): boolean =>
  decision.request.selectionConstraints?.every((constraint) =>
    targetsSatisfySelectionConstraint(state, targets, constraint),
  ) ?? true;

const currentCandidatesForDecision = (
  state: GameState,
  decision: SelectTargetsDecision,
): TargetCandidate[] | null => {
  const entryLookup = effectQueueEntryForDecision(state, decision);
  if (!entryLookup.ok) {
    return null;
  }
  const { entry } = entryLookup;
  const resolved = resolvePublicTargetCandidatesForRequest(
    state,
    decision.request,
    {
      sourceControllerId: entry.controllerId,
    },
  );
  return resolved.ok ? resolved.candidates : null;
};

const minimumRequiredTargetCount = (
  decision: SelectTargetsDecision,
  currentCandidateCount: number,
): number =>
  decision.request.allowFewerIfUnavailable &&
  currentCandidateCount < decision.request.min
    ? currentCandidateCount
    : decision.request.min;

const validateTargetsResponse = (
  state: GameState,
  decision: SelectTargetsDecision,
  targets: readonly CardRef[],
  options: EngineResultOptions = {},
): EngineResult | undefined => {
  const currentCandidates = currentCandidatesForDecision(state, decision);
  if (currentCandidates === null) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Selected targets must be current legal targets."),
      options,
    );
  }
  const minimum = minimumRequiredTargetCount(
    decision,
    currentCandidates.length,
  );

  if (hasDuplicateTargets(targets)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Selected targets must not contain duplicates."),
      options,
    );
  }
  if (targets.length < minimum) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Selected target count is below the required minimum."),
      options,
    );
  }
  if (targets.length > decision.request.max) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Selected target count exceeds the allowed maximum."),
      options,
    );
  }
  if (!allTargetsInCandidates(targets, decision.candidates)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Selected targets must be active target candidates."),
      options,
    );
  }
  if (!allTargetsInCandidates(targets, currentCandidates)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Selected targets must be current legal targets."),
      options,
    );
  }
  if (!targetsSatisfySelectionConstraints(state, decision, targets)) {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "Selected targets do not satisfy the selection constraints.",
      ),
      options,
    );
  }
  return undefined;
};

const findFirstConstraintSatisfyingSelection = (
  state: GameState,
  decision: SelectTargetsDecision,
  candidates: readonly TargetCandidate[],
  minimum: number,
): CardRef[] | undefined => {
  const max = Math.min(decision.request.max, candidates.length);
  const selected: CardRef[] = [];

  const search = (startIndex: number, size: number): CardRef[] | undefined => {
    if (selected.length === size) {
      return targetsSatisfySelectionConstraints(state, decision, selected)
        ? [...selected]
        : undefined;
    }
    for (let index = startIndex; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (candidate === undefined) {
        continue;
      }
      selected.push(candidate.card);
      const result = search(index + 1, size);
      if (result !== undefined) {
        return result;
      }
      selected.pop();
    }
    return undefined;
  };

  for (let size = minimum; size <= max; size += 1) {
    const result = search(0, size);
    if (result !== undefined) {
      return result;
    }
  }
  return undefined;
};

export const getSelectTargetsLegalActions = (
  state: GameState,
  playerId: SelectTargetsDecision["playerId"],
): LegalAction[] => {
  const decision = state.pendingDecision;
  const isSequenceDecision =
    decision !== undefined &&
    decision.type === "selectTargets" &&
    isSequenceFrameSelectTargetsDecision(state, decision.id);
  if (
    decision === undefined ||
    decision.type !== "selectTargets" ||
    decision.playerId !== playerId ||
    (!isSequenceDecision &&
      isUnsupportedSelectTargetsDecision(
        state,
        decision,
        resolveImplementedDslEffectDefinition,
      ))
  ) {
    return [];
  }

  const currentCandidates = currentCandidatesForDecision(state, decision);
  if (currentCandidates === null) {
    return [];
  }
  const count = minimumRequiredTargetCount(decision, currentCandidates.length);
  if (count > decision.request.max || count > currentCandidates.length) {
    return [];
  }

  const selectedTargets = findFirstConstraintSatisfyingSelection(
    state,
    decision,
    currentCandidates,
    count,
  );
  if (selectedTargets === undefined) {
    return [];
  }

  return [
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "targets",
        targets: selectedTargets,
      },
    },
  ];
};

export const applySelectTargetsDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  options: EngineResultOptions = {},
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (decision === undefined || decision.type !== "selectTargets") {
    return null;
  }
  if (action.response.type !== "targets") {
    return toEngineResult(
      state,
      [],
      invalidDecision("Response type must be targets for selectTargets."),
      options,
    );
  }

  const targets = (action.response as { targets?: unknown }).targets;
  if (!Array.isArray(targets)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Response targets must be an array."),
      options,
    );
  }
  if (!targets.every(isCardRef)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Response targets must be CardRef values."),
      options,
    );
  }
  const validation = validateTargetsResponse(state, decision, targets, options);
  if (validation !== undefined) {
    return validation;
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

  let nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    eventJournal: [...state.eventJournal, ...events],
  };
  nextState = clearPendingDecision(nextState);
  if (isSequenceFrameSelectTargetsDecision(state, decision.id)) {
    const resumed = resumeSequenceFrameAfterSelectTargets(
      nextState,
      decision,
      targets,
      createSupportedTrashFromHandChoiceDecision,
    );
    if (resumed === undefined) {
      return null;
    }
    if (!resumed.ok) {
      return toEngineResult(state, [], [resumed.error], options);
    }
    return toEngineResult(
      resumed.state,
      [...events, ...resumed.events],
      undefined,
      options,
    );
  }
  assertGameStateInvariantsIfEnabled(nextState, options);
  const continuation = continueSelectedTargetEffect(
    nextState,
    decision,
    targets,
  );
  if (continuation.errors !== undefined) {
    return toEngineResult(
      state,
      [],
      toErrorTuple(continuation.errors),
      options,
    );
  }
  return toEngineResult(
    continuation.state,
    [...events, ...continuation.events],
    undefined,
    options,
  );
};
