import type {
  CardRef,
  Effect,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  SequenceSegmentResult,
  Target,
} from "@optcg/types";

import { toStateSeq } from "../action-results.js";
import { buildSelectedTargetsFieldRemovalMoveZoneReplacementProcess } from "../replacement/field-removal-process.js";
import { executeSelectedTargetFieldRemovalReplacementProcess } from "../runtime/primitives/field-removal.js";
import { resolveSavedFieldObjectKoSelection } from "../runtime/primitives/execute.js";
import { resolvePublicTargetCandidatesForRequest } from "../selection/candidates.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type BounceEffect = Extract<Effect, { type: "bounce" }> & {
  target: Extract<
    Target,
    { type: "all" } | { type: "savedFieldObject" } | { type: "self" }
  >;
  destination: "deckBottom" | "hand" | "lifeTop" | "lifeBottom";
};
type SegmentLedgers = {
  savedReferences: NonNullable<
    GameState["effectExecutionFrames"][number]
  >["savedReferences"];
  segmentResults: NonNullable<
    GameState["effectExecutionFrames"][number]
  >["segmentResults"];
};

export const applyBounceSequenceSegment = (params: {
  effect: BounceEffect;
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  index: number;
  ledgers: SegmentLedgers;
  segment: SequenceEffect["effects"][number];
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string;
  state: GameState;
}):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      paused?: true;
      state: GameState;
    }
  | { ok: false } => {
  const selectedTargets = resolveBounceTargets(params);
  if (selectedTargets === undefined) {
    return { ok: false };
  }
  const classification =
    params.effect.destination === "hand"
      ? "moveFromFieldToHand"
      : params.effect.destination === "deckBottom"
        ? "moveFromFieldToDeck"
        : "moveFromFieldToLife";
  const destination =
    params.effect.destination === "deckBottom"
      ? {
          zone: "deck" as const,
          position: "bottom" as const,
        }
      : params.effect.destination === "lifeTop" ||
          params.effect.destination === "lifeBottom"
        ? {
            zone: "life" as const,
            position:
              params.effect.destination === "lifeTop"
                ? ("top" as const)
                : ("bottom" as const),
            ...(params.effect.destinationFaceUp === undefined
              ? {}
              : { faceUp: params.effect.destinationFaceUp }),
          }
        : undefined;
  let nextState = params.state;
  const events: EngineEvent[] = [];
  const resultKey = params.segmentKey(params.segment, params.index);
  const priorAttemptedTargets =
    params.ledgers.segmentResults[resultKey]?.selectedTargets ?? [];
  const attemptedTargets: CardRef[] = [...priorAttemptedTargets];
  const attemptedTargetIds = new Set(
    priorAttemptedTargets.map((target) => target.instanceId),
  );
  const changedStateBeforePause =
    params.ledgers.segmentResults[resultKey]?.changedState ?? false;
  const processTargets: CardRef[] = [];
  for (const target of selectedTargets) {
    if (attemptedTargetIds.has(target.instanceId)) {
      continue;
    }
    const player = nextState.players[target.playerId];
    const sourceZone = target.zone?.zone;
    if (
      player === undefined ||
      (sourceZone !== "characterArea" && sourceZone !== "stageArea")
    ) {
      continue;
    }
    const card =
      sourceZone === "characterArea"
        ? player.characters.find(
            (candidate) => candidate.instanceId === target.instanceId,
          )
        : player.stage?.instanceId === target.instanceId
          ? player.stage
          : undefined;
    if (card === undefined) {
      continue;
    }
    processTargets.push(target);
  }
  if (processTargets.length > 0) {
    const process = buildSelectedTargetsFieldRemovalMoveZoneReplacementProcess({
      classification,
      ...(destination === undefined ? {} : { destination }),
      entry: params.entry,
      targets: processTargets,
    });
    const resolved = executeSelectedTargetFieldRemovalReplacementProcess(
      nextState,
      events,
      params.entry.effectBlockId,
      process,
    );
    if ("error" in resolved) {
      return { ok: false };
    }
    if (resolved.paused === true) {
      attemptedTargets.push(...processTargets);
      return {
        events,
        ledgers: {
          ...params.ledgers,
          segmentResults: {
            ...params.ledgers.segmentResults,
            [resultKey]: {
              ...params.emptySegmentResult(),
              attempted: true,
              changedState: changedStateBeforePause || events.length > 0,
              selectedTargets: attemptedTargets,
            },
          },
        },
        ok: true,
        paused: true,
        state: resolved.state,
      };
    }
    nextState = resolved.state;
    for (const target of processTargets) {
      attemptedTargets.push(target);
      attemptedTargetIds.add(target.instanceId);
    }
  }
  return {
    events,
    ledgers: {
      ...params.ledgers,
      segmentResults: {
        ...params.ledgers.segmentResults,
        [resultKey]: {
          ...params.emptySegmentResult(),
          attempted: true,
          succeeded: true,
          changedState:
            changedStateBeforePause ||
            attemptedTargets.length > priorAttemptedTargets.length,
          selectedTargets: attemptedTargets,
        },
      },
    },
    ok: true,
    state: {
      ...nextState,
      seq:
        attemptedTargets.length === priorAttemptedTargets.length
          ? nextState.seq
          : toStateSeq(nextState.seq + 1),
      eventJournal: [...params.state.eventJournal, ...events],
    },
  };
};

const resolveBounceTargets = (params: {
  effect: BounceEffect;
  entry: EffectQueueEntry;
  state: GameState;
  ledgers: SegmentLedgers;
}): CardRef[] | undefined => {
  if (params.effect.target.type === "self") {
    return [params.entry.source];
  }
  if (params.effect.target.type === "all") {
    const resolved = resolvePublicTargetCandidatesForRequest(
      params.state,
      {
        timing: "onResolution",
        chooser: "self",
        player: params.effect.target.player,
        zone: params.effect.target.zone,
        ...(params.effect.target.filter === undefined
          ? {}
          : { filter: params.effect.target.filter }),
        min: 0,
        max: 10,
        allowFewerIfUnavailable: true,
        visibility: "public",
      },
      { sourceControllerId: params.entry.controllerId },
    );
    return resolved.ok
      ? resolved.candidates.map((candidate) => candidate.card)
      : undefined;
  }

  const selected =
    params.ledgers.savedReferences[params.effect.target.binding.saveResultAs];
  if (selected?.kind === "selectedTargets") {
    return selected.targets.map((target) => target.object);
  }

  const resolved = resolveSavedFieldObjectKoSelection({
    controllerId: params.entry.controllerId,
    savedReferences: params.ledgers.savedReferences,
    state: params.state,
    target: params.effect.target,
  });
  return resolved.ok ? [...resolved.selectedTargets] : undefined;
};
