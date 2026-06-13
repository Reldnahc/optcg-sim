import type {
  CardInstance,
  CardRef,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
  SavedFieldObjectReference,
  SavedFieldObjectTarget,
  SavedFieldObjectZone,
  SequenceSavedResultReference,
  Target,
  Zone,
} from "@optcg/types";

import { toEngineResult, toStateSeq } from "../../action-results.js";
import { getOpponentId } from "../../actions/state.js";
import { buildSelectedTargetsFieldRemovalKoReplacementProcess } from "../../replacement/field-removal-process.js";
import { executeSelectedTargetFieldRemovalReplacementProcess } from "./field-removal.js";

export type SelectedTargetKoExecutionFailureReason =
  | "unsupported-effect-shape"
  | "unsupported-target-shape"
  | "selected-target-count-below-minimum"
  | "duplicate-targets"
  | "missing-card"
  | "stale-target"
  | "private-target"
  | "non-character-target"
  | "missing-source-controller"
  | "unsupported-field-removal-destination"
  | "ambiguous-field-removal-source"
  | "malformed-field-removal-protection";

export type SavedFieldObjectKoSelectionFailureReason =
  | "unsupported-saved-reference-family"
  | "missing-saved-reference"
  | "invalid-object-index"
  | "missing-object"
  | "hidden-object"
  | "illegal-object"
  | "unsupported-target-policy";

interface SelectedTargetKoExecutionErrorDetails {
  reason: SelectedTargetKoExecutionFailureReason;
}

const selectedTargetKoExecutionError = (
  effectId: string,
  reason: SelectedTargetKoExecutionFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason } satisfies SelectedTargetKoExecutionErrorDetails,
});

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

type LocatedCard = {
  playerId: PlayerId;
  zone:
    | "leaderArea"
    | "characterArea"
    | "stageArea"
    | "hand"
    | "deck"
    | "trash"
    | "costArea"
    | "donDeck"
    | "life";
  card: CardInstance;
  index?: number;
};

const findCardByInstanceId = (
  state: GameState,
  instanceId: CardInstance["instanceId"],
): LocatedCard | null => {
  for (const [playerId, player] of Object.entries(state.players) as [
    PlayerId,
    GameState["players"][PlayerId],
  ][]) {
    if (player.leader.instanceId === instanceId) {
      return { playerId, zone: "leaderArea", card: player.leader };
    }

    const collections = [
      ["characterArea", player.characters],
      ["stageArea", player.stage === undefined ? [] : [player.stage]],
      ["hand", player.hand],
      ["deck", player.deck],
      ["trash", player.trash],
      ["costArea", player.costArea],
      ["donDeck", player.donDeck],
      ["life", player.life.map((lifeCard) => lifeCard.card)],
    ] as const;

    for (const [zone, cards] of collections) {
      const index = cards.findIndex((card) => card.instanceId === instanceId);
      const card = cards[index];
      if (index >= 0 && card !== undefined) {
        return { playerId, zone, card, index };
      }
    }
  }
  return null;
};

const isPublicFieldZone = (
  zone: CardRef["zone"],
): zone is NonNullable<CardRef["zone"]> =>
  zone?.zone === "leaderArea" ||
  zone?.zone === "characterArea" ||
  zone?.zone === "stageArea" ||
  zone?.zone === "costArea";

const toSavedFieldObjectReferenceList = (
  saved: SequenceSavedResultReference | undefined,
  binding: SavedFieldObjectTarget["binding"],
  capturedAtStateSeq: GameState["seq"],
):
  | {
      ok: true;
      objects: SavedFieldObjectReference[];
    }
  | { ok: false; reason: SavedFieldObjectKoSelectionFailureReason } => {
  if (saved === undefined) {
    return { ok: false, reason: "missing-saved-reference" };
  }
  const family = binding.family;
  if (family === "selectedTargets" || family === "forEachSavedTarget") {
    return saved.kind === "selectedTargets"
      ? { ok: true, objects: saved.targets }
      : { ok: false, reason: "unsupported-saved-reference-family" };
  }
  if (family === "paidCost") {
    return saved.kind === "paidCost"
      ? {
          ok: true,
          objects: (saved.selectedCards ?? []).map(
            (object, objectIndex): SavedFieldObjectReference => ({
              binding: {
                family: "paidCost",
                saveResultAs: binding.saveResultAs,
                objectIndex,
                ...(binding.sourceSegmentId === undefined
                  ? {}
                  : { sourceSegmentId: binding.sourceSegmentId }),
              },
              capturedAtStateSeq,
              object,
              visibility: "public",
            }),
          ),
        }
      : { ok: false, reason: "unsupported-saved-reference-family" };
  }
  return saved.kind === "producedObjects"
    ? { ok: true, objects: saved.objects }
    : { ok: false, reason: "unsupported-saved-reference-family" };
};

const isSavedFieldObjectZone = (zone: Zone): zone is SavedFieldObjectZone =>
  zone === "leaderArea" ||
  zone === "characterArea" ||
  zone === "stageArea" ||
  zone === "costArea";

export const resolveSavedFieldObjectKoSelection = (params: {
  controllerId: EffectQueueEntry["controllerId"];
  savedReferences: Record<string, SequenceSavedResultReference>;
  state: GameState;
  target: SavedFieldObjectTarget;
}):
  | { ok: true; selectedTargets: readonly CardRef[] }
  | { ok: false; reason: SavedFieldObjectKoSelectionFailureReason } => {
  if (
    params.target.controller !== undefined ||
    params.target.filter !== undefined
  ) {
    return { ok: false, reason: "unsupported-target-policy" };
  }

  const refs = toSavedFieldObjectReferenceList(
    params.savedReferences[params.target.binding.saveResultAs],
    params.target.binding,
    params.state.seq,
  );
  if (!refs.ok) {
    return refs;
  }
  const requestedObjectIndex = params.target.binding.objectIndex;
  if (
    requestedObjectIndex !== undefined &&
    (!Number.isInteger(requestedObjectIndex) || requestedObjectIndex < 0)
  ) {
    return { ok: false, reason: "invalid-object-index" };
  }
  const objects =
    requestedObjectIndex === undefined
      ? refs.objects
      : refs.objects[requestedObjectIndex] === undefined
        ? []
        : [refs.objects[requestedObjectIndex]];
  if (objects.length === 0) {
    return { ok: false, reason: "missing-object" };
  }
  if (!Object.hasOwn(params.state.players, params.controllerId)) {
    return { ok: false, reason: "illegal-object" };
  }
  const targetZones =
    params.target.zones ??
    (params.target.zone === undefined ? [] : [params.target.zone]);
  if (targetZones.length === 0) {
    return { ok: false, reason: "unsupported-target-policy" };
  }

  const selectedTargets: CardRef[] = [];
  for (const object of objects) {
    if (
      object.binding.saveResultAs !== params.target.binding.saveResultAs ||
      object.binding.family !== params.target.binding.family ||
      (params.target.binding.sourceSegmentId !== undefined &&
        object.binding.sourceSegmentId !==
          params.target.binding.sourceSegmentId)
    ) {
      return { ok: false, reason: "illegal-object" };
    }
    if (!isPublicFieldZone(object.object.zone)) {
      return { ok: false, reason: "hidden-object" };
    }
    const targetPlayerId =
      params.target.player === "anyPlayer"
        ? object.object.playerId
        : params.target.player === "self"
          ? params.controllerId
          : params.target.player === "opponent"
            ? getOpponentId(params.state, params.controllerId)
            : params.target.player;
    if (targetPlayerId === null) {
      return { ok: false, reason: "illegal-object" };
    }
    const objectZone = object.object.zone.zone;
    if (!isSavedFieldObjectZone(objectZone)) {
      return { ok: false, reason: "illegal-object" };
    }
    if (
      !targetZones.includes(objectZone) ||
      object.object.playerId !== targetPlayerId
    ) {
      return { ok: false, reason: "illegal-object" };
    }
    const located = findCardByInstanceId(
      params.state,
      object.object.instanceId,
    );
    if (located === null) {
      return { ok: false, reason: "missing-object" };
    }
    if (!isPublicFieldZone(located.card.zone)) {
      return { ok: false, reason: "hidden-object" };
    }
    if (
      located.playerId !== object.object.playerId ||
      located.card.cardId !== object.object.cardId ||
      located.card.zone.zone !== object.object.zone.zone
    ) {
      return { ok: false, reason: "illegal-object" };
    }
    selectedTargets.push({
      instanceId: located.card.instanceId,
      cardId: located.card.cardId,
      playerId: located.playerId,
      zone: located.card.zone,
    });
  }
  return {
    ok: true,
    selectedTargets,
  };
};

const executeSelectedTargetKoEffect = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Extract<Effect, { type: "ko" }>,
  selectedTargets: readonly CardRef[],
): EngineResult => {
  if (
    effect.target.type !== "choose" ||
    effect.target.request.visibility !== "public"
  ) {
    return toEngineResult(
      state,
      [],
      [
        selectedTargetKoExecutionError(
          entry.effectBlockId,
          "unsupported-target-shape",
        ),
      ],
    );
  }

  if (selectedTargets.length < effect.target.request.min) {
    return toEngineResult(
      state,
      [],
      [
        selectedTargetKoExecutionError(
          entry.effectBlockId,
          "selected-target-count-below-minimum",
        ),
      ],
    );
  }

  if (hasDuplicateTargets(selectedTargets)) {
    return toEngineResult(
      state,
      [],
      [
        selectedTargetKoExecutionError(
          entry.effectBlockId,
          "duplicate-targets",
        ),
      ],
    );
  }

  for (const target of selectedTargets) {
    const located = findCardByInstanceId(state, target.instanceId);
    if (located === null) {
      return toEngineResult(
        state,
        [],
        [selectedTargetKoExecutionError(entry.effectBlockId, "missing-card")],
      );
    }

    if (
      located.zone === "hand" ||
      located.zone === "deck" ||
      located.zone === "donDeck" ||
      located.zone === "life"
    ) {
      return toEngineResult(
        state,
        [],
        [selectedTargetKoExecutionError(entry.effectBlockId, "private-target")],
      );
    }

    if (located.zone === "leaderArea") {
      return toEngineResult(
        state,
        [],
        [
          selectedTargetKoExecutionError(
            entry.effectBlockId,
            "non-character-target",
          ),
        ],
      );
    }

    if (located.zone !== "characterArea" && located.zone !== "stageArea") {
      return toEngineResult(
        state,
        [],
        [selectedTargetKoExecutionError(entry.effectBlockId, "stale-target")],
      );
    }

    if (
      !cardRefsEqual(target, {
        instanceId: located.card.instanceId,
        cardId: located.card.cardId,
        playerId: located.playerId,
        zone: located.card.zone,
      })
    ) {
      return toEngineResult(
        state,
        [],
        [selectedTargetKoExecutionError(entry.effectBlockId, "stale-target")],
      );
    }

    const resolved = state.cardManifest.cards[located.card.cardId];
    if (resolved === undefined) {
      return toEngineResult(
        state,
        [],
        [selectedTargetKoExecutionError(entry.effectBlockId, "missing-card")],
      );
    }
    if (
      (located.zone === "characterArea" && resolved.category !== "character") ||
      (located.zone === "stageArea" && resolved.category !== "stage")
    ) {
      return toEngineResult(
        state,
        [],
        [
          selectedTargetKoExecutionError(
            entry.effectBlockId,
            "non-character-target",
          ),
        ],
      );
    }
  }

  const events: EngineEvent[] = [];
  if (selectedTargets.length === 0) {
    return toEngineResult(
      {
        ...state,
        seq: toStateSeq(state.seq + 1),
      },
      events,
    );
  }
  const process = buildSelectedTargetsFieldRemovalKoReplacementProcess(
    entry,
    selectedTargets,
  );
  const resolvedProcess = executeSelectedTargetFieldRemovalReplacementProcess(
    state,
    events,
    entry.effectBlockId,
    process,
  );
  if ("error" in resolvedProcess) {
    return toEngineResult(state, [], [resolvedProcess.error]);
  }
  if (resolvedProcess.paused === true) {
    return toEngineResult(resolvedProcess.state, events);
  }

  const finalState: GameState = {
    ...resolvedProcess.state,
    seq: toStateSeq(state.seq + 1),
    eventJournal: [...state.eventJournal, ...events],
  };
  return toEngineResult(finalState, events);
};

export const executeSelectedTargetEffectPrimitive = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Effect,
  selectedTargets: readonly CardRef[],
): EngineResult => {
  if (effect.type !== "ko") {
    return toEngineResult(
      state,
      [],
      [
        selectedTargetKoExecutionError(
          entry.effectBlockId,
          "unsupported-effect-shape",
        ),
      ],
    );
  }

  return executeSelectedTargetKoEffect(state, entry, effect, selectedTargets);
};

const isReviewedTargetKoRequestShape = (
  request: Extract<Target, { type: "choose" }>["request"],
): boolean =>
  request.timing === "onResolution" &&
  request.chooser === "self" &&
  request.player === "opponent" &&
  request.zone === "characterArea" &&
  request.filter === undefined &&
  request.min === 0 &&
  request.max === 1 &&
  request.allowFewerIfUnavailable &&
  request.visibility === "public";

type EffectWithTarget = Extract<Effect, { target: unknown }>;

const isChooseTarget = (
  target: EffectWithTarget["target"],
): target is Extract<Target, { type: "choose" }> =>
  typeof target === "object" && "type" in target && target.type === "choose";

export const isSupportedMainEventTargetKoEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "ko" }> & {
    target: Extract<Target, { type: "choose" }>;
  };
} => {
  if (
    effect.sourcePresencePolicy !== "resolveFromDestinationZone" ||
    effect.trigger.type !== "main" ||
    effect.category !== "auto" ||
    effect.optional ||
    effect.oncePerTurn ||
    effect.cost !== undefined ||
    effect.conditionTiming !== undefined ||
    effect.failurePolicy !== undefined ||
    effect.effect.type !== "ko" ||
    !isChooseTarget(effect.effect.target)
  ) {
    return false;
  }
  return isReviewedTargetKoRequestShape(effect.effect.target.request);
};

export const isSupportedMainEventTargetKoEffectAllowingOncePerTurn = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
} => {
  if (isSupportedMainEventTargetKoEffect(effect)) {
    return true;
  }
  if (effect.oncePerTurn !== true) {
    return false;
  }
  const effectWithoutOncePerTurn: EffectDefinition["effects"][number] = {
    ...effect,
  };
  delete effectWithoutOncePerTurn.oncePerTurn;
  return isSupportedMainEventTargetKoEffect(effectWithoutOncePerTurn);
};
