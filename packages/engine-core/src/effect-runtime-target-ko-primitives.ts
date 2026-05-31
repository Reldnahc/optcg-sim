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
  ReplacementProcess,
  SavedFieldObjectReference,
  SavedFieldObjectTarget,
  SequenceSavedResultReference,
  Target,
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "./action-results.js";
import { getOpponentId } from "./action-state.js";
import {
  KO_TRASH_MOVEMENT_REASON,
  moveConcreteCardsToTrash,
} from "./concrete-card-movement.js";
import {
  buildSelectedTargetKoReplacementProcess,
  detectSupportedSelectedTargetKoReplacementCandidate,
  normalizeSelectedTargetKoProcess,
  pauseSelectedTargetKoReplacementProcess,
} from "./effect-runtime-ko-replacement-process.js";
import { applyFieldRemovalProtection } from "./field-removal-protection.js";

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
  family: SavedFieldObjectTarget["binding"]["family"],
):
  | {
      ok: true;
      objects: SavedFieldObjectReference[];
    }
  | { ok: false; reason: SavedFieldObjectKoSelectionFailureReason } => {
  if (saved === undefined) {
    return { ok: false, reason: "missing-saved-reference" };
  }
  if (family === "selectedTargets") {
    return saved.kind === "selectedTargets"
      ? { ok: true, objects: saved.targets }
      : { ok: false, reason: "unsupported-saved-reference-family" };
  }
  return saved.kind === "producedObjects"
    ? { ok: true, objects: saved.objects }
    : { ok: false, reason: "unsupported-saved-reference-family" };
};

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
    params.target.binding.family,
  );
  if (!refs.ok) {
    return refs;
  }
  const objectIndex = params.target.binding.objectIndex ?? 0;
  if (!Number.isInteger(objectIndex) || objectIndex < 0) {
    return { ok: false, reason: "invalid-object-index" };
  }
  const object = refs.objects[objectIndex];
  if (object === undefined) {
    return { ok: false, reason: "missing-object" };
  }
  if (
    object.binding.saveResultAs !== params.target.binding.saveResultAs ||
    object.binding.family !== params.target.binding.family ||
    (params.target.binding.sourceSegmentId !== undefined &&
      object.binding.sourceSegmentId !== params.target.binding.sourceSegmentId)
  ) {
    return { ok: false, reason: "illegal-object" };
  }
  if (!isPublicFieldZone(object.object.zone)) {
    return { ok: false, reason: "hidden-object" };
  }
  if (!Object.hasOwn(params.state.players, params.controllerId)) {
    return { ok: false, reason: "illegal-object" };
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
  if (
    object.object.zone.zone !== params.target.zone ||
    object.object.playerId !== targetPlayerId
  ) {
    return { ok: false, reason: "illegal-object" };
  }
  const located = findCardByInstanceId(params.state, object.object.instanceId);
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
  return {
    ok: true,
    selectedTargets: [
      {
        instanceId: located.card.instanceId,
        cardId: located.card.cardId,
        playerId: located.playerId,
        zone: located.card.zone,
      },
    ],
  };
};

export const executeUnreplacedSelectedTargetKoProcess = (
  state: GameState,
  events: EngineEvent[],
  effectId: string,
  process: ReplacementProcess,
): { state: GameState } | { error: EngineError } => {
  const target = process.target;
  if (process.type !== "ko" || target === undefined) {
    return {
      error: selectedTargetKoExecutionError(
        effectId,
        "unsupported-effect-shape",
      ),
    };
  }

  const located = findCardByInstanceId(state, target.instanceId);
  if (
    located === null ||
    (located.zone !== "characterArea" && located.zone !== "stageArea")
  ) {
    return {
      error: selectedTargetKoExecutionError(effectId, "stale-target"),
    };
  }

  const player = state.players[located.playerId];
  if (player === undefined) {
    return {
      error: selectedTargetKoExecutionError(effectId, "missing-card"),
    };
  }

  const targetIndex =
    located.zone === "characterArea"
      ? player.characters.findIndex(
          (candidate) => candidate.instanceId === located.card.instanceId,
        )
      : player.stage?.instanceId === located.card.instanceId
        ? 0
        : -1;
  const koCard =
    located.zone === "characterArea"
      ? player.characters[targetIndex]
      : player.stage;
  if (targetIndex < 0 || koCard === undefined) {
    return {
      error: selectedTargetKoExecutionError(effectId, "stale-target"),
    };
  }

  const protection = applyFieldRemovalProtection(state, koCard, process);
  if (!protection.ok) {
    return {
      error: selectedTargetKoExecutionError(effectId, protection.reason),
    };
  }
  if (protection.prevented) {
    return { state };
  }

  const attachedDonIds = new Set(koCard.attachedDon);
  const nextCostArea = player.costArea.map((card) =>
    attachedDonIds.has(card.instanceId)
      ? { ...card, state: "rested" as const }
      : card,
  );

  const nextPlayer = {
    ...player,
    costArea: nextCostArea,
  };
  const stateWithRestedAttachedDon = {
    ...state,
    players: {
      ...state.players,
      [located.playerId]: nextPlayer,
    },
  };

  appendEvent(stateWithRestedAttachedDon, events, "cardKOd", {
    playerId: located.playerId,
    instanceId: koCard.instanceId,
  });
  const movedResult = moveConcreteCardsToTrash(
    stateWithRestedAttachedDon,
    events,
    [koCard],
    {
      cardMovedPayloadShape: "zoneRefs",
      clearAttachedDon: true,
      emitCardTrashed: false,
      includeCardIdentityInCardMoved: true,
      playerId: located.playerId,
      reason: KO_TRASH_MOVEMENT_REASON,
      sourceZone: located.zone,
    },
  );
  for (const donId of koCard.attachedDon) {
    appendEvent(
      movedResult.state,
      events,
      "donReturned",
      { playerId: located.playerId, donInstanceId: donId, state: "rested" },
      { type: "replayOnly" },
    );
  }

  return { state: movedResult.state };
};

const executeSelectedTargetKoReplacementProcess = (
  state: GameState,
  events: EngineEvent[],
  effectId: string,
  process: ReplacementProcess,
): { state: GameState; paused?: true } | { error: EngineError } => {
  const currentProcess = normalizeSelectedTargetKoProcess(state, process);
  const detected = detectSupportedSelectedTargetKoReplacementCandidate(
    state,
    currentProcess,
  );
  if (!detected.ok) {
    return { error: detected.error };
  }
  if (detected.candidate === undefined) {
    return executeUnreplacedSelectedTargetKoProcess(
      state,
      events,
      effectId,
      currentProcess,
    );
  }

  return pauseSelectedTargetKoReplacementProcess(
    state,
    events,
    currentProcess,
    detected.candidate,
  );
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
  let nextState = state;

  for (const [targetIndex, target] of selectedTargets.entries()) {
    const process = buildSelectedTargetKoReplacementProcess(
      entry,
      target,
      targetIndex,
    );
    const resolvedProcess = executeSelectedTargetKoReplacementProcess(
      nextState,
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
    nextState = resolvedProcess.state;
  }

  const finalState: GameState = {
    ...nextState,
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
