import type {
  CardInstance,
  CardRef,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  GameState,
  MatchCardManifest,
  PlayerId,
  ReplacementProcess,
  ResolvedCard,
  Target,
} from "@optcg/types";

import { isSupportedLifeTopToHandEffect } from "./effect-runtime-move-cards.js";
import {
  resolvePublicTargetCandidates,
  resolvePublicTargetCandidatesForRequest,
} from "./target-selection.js";

export type SelectedTargetKoReplacementDetectionFailureReason =
  | "unsupported-replacement-process"
  | "missing-card"
  | "stale-target"
  | "private-target"
  | "non-character-target"
  | "unsupported-support-status"
  | "implemented-custom-status"
  | "unexpected-vanilla-effect-definition"
  | "missing-effect-definition-id"
  | "missing-effect-definition"
  | "definition-card-id-mismatch"
  | "definition-status-mismatch"
  | "support-card-data-version-mismatch"
  | "rules-version-mismatch"
  | "source-text-hash-mismatch"
  | "definition-version-mismatch"
  | "untested-support-metadata"
  | "untested-definition-metadata"
  | "unreviewed-definition-metadata"
  | "unsupported-ko-replacement-shape"
  | "multiple-applicable-ko-replacements";

interface SelectedTargetKoReplacementDetectionErrorDetails {
  reason: SelectedTargetKoReplacementDetectionFailureReason;
}

export interface SelectedTargetKoReplacementCandidate {
  id: string;
  effectBlockId: EffectQueueEntry["effectBlockId"];
  controllerId: PlayerId;
  source: CardRef;
  replacementEffect: Extract<Effect, { type: "replacement" }>;
}

export type DetectSelectedTargetKoReplacementCandidateResult =
  | { ok: true; candidate?: SelectedTargetKoReplacementCandidate }
  | { ok: false; error: EngineError };

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
};

type ReplacementLookup =
  | { ok: true; definition: EffectDefinition }
  | { ok: false; error: EngineError };

type LocatedReplacementSource = {
  card: CardInstance;
  playerId: PlayerId;
  ref: CardRef;
  resolved: ResolvedCard;
};

const detectionError = (
  effectId: string,
  reason: SelectedTargetKoReplacementDetectionFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: {
    reason,
  } satisfies SelectedTargetKoReplacementDetectionErrorDetails,
});

const failure = (
  effectId: string,
  reason: SelectedTargetKoReplacementDetectionFailureReason,
): { ok: false; error: EngineError } => ({
  ok: false,
  error: detectionError(effectId, reason),
});

const hasHumanReviewMetadata = (definition: EffectDefinition): boolean =>
  definition.metadata.reviewer !== undefined ||
  (definition.metadata.reviewedBy !== undefined &&
    definition.metadata.reviewedAt !== undefined);

const resolveReviewedImplementedDslEffectDefinition = (
  card: ResolvedCard,
  manifest: MatchCardManifest,
  effectId: string,
): ReplacementLookup => {
  const support = card.support;
  if (support.status === "implemented-custom") {
    return failure(effectId, "implemented-custom-status");
  }
  if (support.status === "vanilla-confirmed") {
    return failure(
      effectId,
      support.effectDefinitionId === undefined
        ? "unsupported-support-status"
        : "unexpected-vanilla-effect-definition",
    );
  }
  if (support.status !== "implemented-dsl") {
    return failure(effectId, "unsupported-support-status");
  }
  if ((support.customHandlerIds?.length ?? 0) > 0) {
    return failure(effectId, "unsupported-ko-replacement-shape");
  }
  if (support.effectDefinitionId === undefined) {
    return failure(effectId, "missing-effect-definition-id");
  }
  if (!support.tested) {
    return failure(effectId, "untested-support-metadata");
  }
  if (support.cardDataVersion !== manifest.cardDataVersion) {
    return failure(effectId, "support-card-data-version-mismatch");
  }

  const definition = manifest.effectDefinitions?.[support.effectDefinitionId];
  if (definition === undefined)
    return failure(effectId, "missing-effect-definition");
  if (definition.cardId !== support.cardId) {
    return failure(effectId, "definition-card-id-mismatch");
  }
  if (definition.implementationStatus !== support.status) {
    return failure(effectId, "definition-status-mismatch");
  }
  if (definition.metadata.rulesVersion !== support.rulesVersion) {
    return failure(effectId, "rules-version-mismatch");
  }
  if (definition.metadata.sourceTextHash !== support.sourceTextHash) {
    return failure(effectId, "source-text-hash-mismatch");
  }
  if (
    definition.metadata.effectDefinitionsVersion !==
    manifest.effectDefinitionsVersion
  ) {
    return failure(effectId, "definition-version-mismatch");
  }
  if (!definition.metadata.tested)
    return failure(effectId, "untested-definition-metadata");
  if (!hasHumanReviewMetadata(definition)) {
    return failure(effectId, "unreviewed-definition-metadata");
  }
  return { ok: true, definition };
};

const effectIdFromReplacementProcess = (
  process: ReplacementProcess,
): string => {
  if (
    typeof process.payload === "object" &&
    process.payload !== null &&
    "effectId" in process.payload &&
    typeof process.payload.effectId === "string"
  ) {
    return process.payload.effectId;
  }
  return process.id;
};

const cardRefsEqual = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId &&
  left.zone?.zone === right.zone?.zone &&
  left.zone?.playerId === right.zone?.playerId &&
  left.zone?.slot === right.zone?.slot &&
  left.zone?.index === right.zone?.index;

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
      const card = cards.find(
        (candidate) => candidate.instanceId === instanceId,
      );
      if (card !== undefined) return { playerId, zone, card };
    }
  }
  return null;
};

const toPublicFieldCardRef = (
  card: CardInstance,
  playerId: PlayerId,
): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

const replacementSourcesForController = (
  state: GameState,
  playerId: PlayerId,
  effectId: string,
):
  | { ok: true; sources: LocatedReplacementSource[] }
  | { ok: false; error: EngineError } => {
  const player = state.players[playerId];
  if (player === undefined) {
    return failure(effectId, "missing-card");
  }
  const cards = [
    player.leader,
    ...player.characters,
    ...(player.stage === undefined ? [] : [player.stage]),
  ];
  const sources: LocatedReplacementSource[] = [];
  for (const card of cards) {
    const resolved = state.cardManifest.cards[card.cardId];
    if (resolved === undefined) {
      continue;
    }
    if (
      resolved.support.status === "vanilla-confirmed" &&
      resolved.support.effectDefinitionId === undefined
    ) {
      continue;
    }
    sources.push({
      card,
      playerId,
      ref: toPublicFieldCardRef(card, playerId),
      resolved,
    });
  }
  return { ok: true, sources };
};

const isSelfTarget = (
  target: Target,
): target is Extract<Target, { type: "self" }> => target.type === "self";

type SupportedReplacementEffectBlock = EffectDefinition["effects"][number] & {
  trigger: Extract<
    EffectDefinition["effects"][number]["trigger"],
    { type: "replacement" }
  >;
  sourcePresencePolicy: "resolveFromLastKnownInformation";
  effect: Extract<Effect, { type: "replacement" }>;
};

const isSupportedSelfKoDrawReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  effect.category === "replacement" &&
  effect.trigger.type === "replacement" &&
  effect.trigger.replacement.type === "wouldBeKOd" &&
  isSelfTarget(effect.trigger.replacement.target) &&
  effect.optional === true &&
  effect.sourcePresencePolicy === "resolveFromLastKnownInformation" &&
  effect.condition === undefined &&
  effect.conditionTiming === undefined &&
  effect.cost === undefined &&
  effect.failurePolicy === undefined &&
  effect.oncePerTurn === undefined &&
  effect.effect.type === "replacement" &&
  effect.effect.when.type === "wouldBeKOd" &&
  isSelfTarget(effect.effect.when.target) &&
  effect.effect.instead.type === "draw" &&
  effect.effect.instead.count === 1 &&
  effect.effect.instead.player === "self";

const isSupportedOpponentFieldRemovalLifeReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  effect.category === "replacement" &&
  effect.trigger.type === "replacement" &&
  effect.trigger.replacement.type === "wouldMoveZone" &&
  effect.trigger.replacement.from === "characterArea" &&
  effect.trigger.replacement.target.type === "all" &&
  effect.trigger.replacement.target.zone === "characterArea" &&
  effect.trigger.replacement.target.player === "self" &&
  effect.optional === true &&
  effect.sourcePresencePolicy === "resolveFromLastKnownInformation" &&
  effect.condition === undefined &&
  effect.conditionTiming === undefined &&
  effect.cost === undefined &&
  effect.failurePolicy === undefined &&
  effect.oncePerTurn === undefined &&
  effect.effect.type === "replacement" &&
  effect.effect.when.type === "wouldMoveZone" &&
  effect.effect.when.from === "characterArea" &&
  effect.effect.when.target.type === "all" &&
  effect.effect.when.target.zone === "characterArea" &&
  effect.effect.when.target.player === "self" &&
  isSupportedLifeTopToHandEffect(effect.effect.instead);

const isSupportedRestOwnCardsInsteadEffect = (
  effect: Effect,
): effect is Extract<Effect, { type: "rest" }> & {
  target: Extract<Target, { type: "chooseFromZones" }>;
} =>
  effect.type === "rest" &&
  effect.target.type === "chooseFromZones" &&
  effect.target.request.timing === "onResolution" &&
  effect.target.request.chooser === "self" &&
  effect.target.request.player === "self" &&
  effect.target.request.zones.length > 0 &&
  effect.target.request.zones.every(
    (zone) =>
      zone === "leaderArea" ||
      zone === "characterArea" ||
      zone === "stageArea" ||
      zone === "costArea",
  ) &&
  effect.target.request.filter === undefined &&
  Number.isInteger(effect.target.request.min) &&
  Number.isInteger(effect.target.request.max) &&
  effect.target.request.min > 0 &&
  effect.target.request.min === effect.target.request.max &&
  !effect.target.request.allowFewerIfUnavailable &&
  effect.target.request.visibility === "public";

const isSupportedRestSelfInsteadEffect = (
  effect: Effect,
): effect is Extract<Effect, { type: "rest" }> & {
  target: Extract<Target, { type: "self" }>;
} => effect.type === "rest" && isSelfTarget(effect.target);

const isSupportedOpponentEffectFieldRemovalRestCardsReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  effect.category === "replacement" &&
  effect.trigger.type === "replacement" &&
  effect.trigger.replacement.type === "wouldMoveZone" &&
  effect.trigger.replacement.from === "characterArea" &&
  effect.trigger.replacement.sourceKind === "cardEffect" &&
  effect.trigger.replacement.target.type === "all" &&
  effect.trigger.replacement.target.zone === "characterArea" &&
  effect.trigger.replacement.target.player === "self" &&
  effect.optional === true &&
  effect.sourcePresencePolicy === "resolveFromLastKnownInformation" &&
  effect.condition === undefined &&
  effect.conditionTiming === undefined &&
  effect.cost === undefined &&
  effect.failurePolicy === undefined &&
  effect.oncePerTurn === undefined &&
  effect.effect.type === "replacement" &&
  effect.effect.when.type === "wouldMoveZone" &&
  effect.effect.when.from === "characterArea" &&
  effect.effect.when.sourceKind === "cardEffect" &&
  effect.effect.when.target.type === "all" &&
  effect.effect.when.target.zone === "characterArea" &&
  effect.effect.when.target.player === "self" &&
  isSupportedRestOwnCardsInsteadEffect(effect.effect.instead);

const isSupportedOpponentEffectFieldRemovalRestSelfReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  effect.category === "replacement" &&
  effect.trigger.type === "replacement" &&
  effect.trigger.replacement.type === "wouldMoveZone" &&
  effect.trigger.replacement.from === "characterArea" &&
  effect.trigger.replacement.sourceKind === "cardEffect" &&
  effect.trigger.replacement.target.type === "all" &&
  effect.trigger.replacement.target.zone === "characterArea" &&
  effect.trigger.replacement.target.player === "self" &&
  effect.optional === true &&
  effect.sourcePresencePolicy === "resolveFromLastKnownInformation" &&
  effect.condition === undefined &&
  effect.conditionTiming === undefined &&
  effect.cost === undefined &&
  effect.failurePolicy === undefined &&
  effect.oncePerTurn === undefined &&
  effect.effect.type === "replacement" &&
  effect.effect.when.type === "wouldMoveZone" &&
  effect.effect.when.from === "characterArea" &&
  effect.effect.when.sourceKind === "cardEffect" &&
  effect.effect.when.target.type === "all" &&
  effect.effect.when.target.zone === "characterArea" &&
  effect.effect.when.target.player === "self" &&
  isSupportedRestSelfInsteadEffect(effect.effect.instead);

const isSupportedReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  isSupportedSelfKoDrawReplacementEffect(effect) ||
  isSupportedOpponentFieldRemovalLifeReplacementEffect(effect) ||
  isSupportedOpponentEffectFieldRemovalRestCardsReplacementEffect(effect) ||
  isSupportedOpponentEffectFieldRemovalRestSelfReplacementEffect(effect);

const isReplacementTriggerEffect = (
  effect: EffectDefinition["effects"][number],
): boolean =>
  effect.category === "replacement" ||
  effect.trigger.type === "replacement" ||
  effect.effect.type === "replacement";

export const isSupportedReplacementEffectBlock = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  isSupportedReplacementEffect(effect);

const validateKoReplacementTarget = (
  state: GameState,
  effectId: string,
  target: CardRef,
):
  | { ok: true; located: LocatedCard; ref: CardRef; resolved: ResolvedCard }
  | {
      ok: false;
      error: EngineError;
    } => {
  const located = findCardByInstanceId(state, target.instanceId);
  if (located === null) return failure(effectId, "missing-card");
  if (
    located.zone === "hand" ||
    located.zone === "deck" ||
    located.zone === "donDeck" ||
    located.zone === "life"
  ) {
    return failure(effectId, "private-target");
  }
  if (located.zone !== "characterArea" && located.zone !== "stageArea") {
    return failure(
      effectId,
      located.zone === "leaderArea" ? "non-character-target" : "stale-target",
    );
  }

  const ref: CardRef = {
    instanceId: located.card.instanceId,
    cardId: located.card.cardId,
    playerId: located.playerId,
    zone: located.card.zone,
  };
  if (!cardRefsEqual(target, ref)) return failure(effectId, "stale-target");

  const resolved = state.cardManifest.cards[located.card.cardId];
  if (resolved === undefined) return failure(effectId, "missing-card");
  if (
    (located.zone === "characterArea" && resolved.category !== "character") ||
    (located.zone === "stageArea" && resolved.category !== "stage")
  ) {
    return failure(effectId, "non-character-target");
  }
  return { ok: true, located, ref, resolved };
};

export const detectSupportedSelectedTargetKoReplacementCandidate = (
  state: GameState,
  process: ReplacementProcess,
): DetectSelectedTargetKoReplacementCandidateResult => {
  const effectId = effectIdFromReplacementProcess(process);
  const target = process.target;
  if (process.type !== "ko" || target === undefined) {
    return failure(effectId, "unsupported-replacement-process");
  }

  const targetLookup = validateKoReplacementTarget(state, effectId, target);
  if (!targetLookup.ok) return targetLookup;
  const { located, resolved } = targetLookup;
  if (
    resolved.support.status === "vanilla-confirmed" &&
    (resolved.support.customHandlerIds?.length ?? 0) > 0
  ) {
    return failure(effectId, "unsupported-ko-replacement-shape");
  }
  const sourceLookup = replacementSourcesForController(
    state,
    located.card.controller,
    effectId,
  );
  if (!sourceLookup.ok) return sourceLookup;

  const applicable: SelectedTargetKoReplacementCandidate[] = [];
  for (const source of sourceLookup.sources) {
    const lookup = resolveReviewedImplementedDslEffectDefinition(
      source.resolved,
      state.cardManifest,
      effectId,
    );
    if (!lookup.ok) return lookup;

    const replacementEffects = lookup.definition.effects.filter(
      isReplacementTriggerEffect,
    );
    if (replacementEffects.length === 0) continue;

    const supported = replacementEffects.filter(isSupportedReplacementEffect);
    if (supported.length !== replacementEffects.length) {
      return failure(effectId, "unsupported-ko-replacement-shape");
    }

    const unused = supported.filter(
      (effect) => !process.usedReplacementIds.includes(String(effect.id)),
    );
    if (unused.length === 0) continue;
    for (const effect of unused) {
      if (
        isSupportedSelfKoDrawReplacementEffect(effect) &&
        source.card.instanceId !== located.card.instanceId
      ) {
        continue;
      }
      if (
        (isSupportedOpponentFieldRemovalLifeReplacementEffect(effect) ||
          isSupportedOpponentEffectFieldRemovalRestCardsReplacementEffect(
            effect,
          ) ||
          isSupportedOpponentEffectFieldRemovalRestSelfReplacementEffect(
            effect,
          )) &&
        !opponentFieldRemovalReplacementApplies(
          state,
          process,
          source,
          located,
          effect,
        )
      ) {
        continue;
      }
      applicable.push({
        id: String(effect.id),
        effectBlockId: effect.id,
        controllerId: source.card.controller,
        source: source.ref,
        replacementEffect: effect.effect,
      });
    }
  }
  if (applicable.length === 0) return { ok: true };
  if (applicable.length > 1) {
    return failure(effectId, "multiple-applicable-ko-replacements");
  }
  const candidate = applicable[0];
  if (candidate === undefined) return { ok: true };
  return {
    ok: true,
    candidate,
  };
};

const opponentFieldRemovalReplacementApplies = (
  state: GameState,
  process: ReplacementProcess,
  source: LocatedReplacementSource,
  located: LocatedCard,
  effect: SupportedReplacementEffectBlock,
): boolean => {
  if (
    !isOpponentControlledFieldRemovalProcess(process, located.card.controller)
  ) {
    return false;
  }
  const target = effect.trigger.replacement;
  if (target.type !== "wouldMoveZone" || target.target.type !== "all") {
    return false;
  }
  if (!fieldRemovalSourceKindMatches(process, target.sourceKind)) {
    return false;
  }
  if (
    !canPayOpponentFieldRemovalReplacementCost(state, source, located, effect)
  ) {
    return false;
  }
  const request = {
    timing: "onResolution",
    chooser: "self",
    player: target.target.player,
    zone: target.target.zone,
    min: 0,
    max: 99,
    allowFewerIfUnavailable: true,
    visibility: "public",
    ...(target.target.filter === undefined
      ? {}
      : { filter: target.target.filter }),
  } as const;
  const candidates = resolvePublicTargetCandidates(state, request, {
    sourceControllerId: located.card.controller,
  });
  if (!candidates.ok) {
    return false;
  }
  return candidates.candidates.some(
    (candidate) => candidate.card.instanceId === located.card.instanceId,
  );
};

const canPayOpponentFieldRemovalReplacementCost = (
  state: GameState,
  source: LocatedReplacementSource,
  located: LocatedCard,
  effect: SupportedReplacementEffectBlock,
): boolean => {
  const instead = effect.effect.instead;
  if (isSupportedLifeTopToHandEffect(instead)) {
    const player = state.players[located.card.controller];
    return player !== undefined && player.life.length >= instead.count;
  }
  if (isSupportedRestOwnCardsInsteadEffect(instead)) {
    const candidates = resolvePublicTargetCandidatesForRequest(
      state,
      instead.target.request,
      { sourceControllerId: located.card.controller },
    );
    return (
      candidates.ok &&
      candidates.candidates.filter((candidate) =>
        replacementRestCandidateIsActive(state, candidate.card),
      ).length >= instead.target.request.min
    );
  }
  if (isSupportedRestSelfInsteadEffect(instead)) {
    return (
      source.resolved.category === "character" &&
      source.ref.zone?.zone === "characterArea" &&
      source.card.state !== "rested"
    );
  }
  return false;
};

const replacementRestCandidateIsActive = (
  state: GameState,
  target: CardRef,
): boolean => {
  const located = findCardByInstanceId(state, target.instanceId);
  return located !== null && located.card.state !== "rested";
};

const fieldRemovalSourceKindMatches = (
  process: ReplacementProcess,
  sourceKind: Extract<
    Effect,
    { type: "replacement" }
  >["when"] extends infer Trigger
    ? Trigger extends { type: "wouldMoveZone"; sourceKind?: infer Kind }
      ? Kind | undefined
      : never
    : never,
): boolean => {
  if (sourceKind === undefined) {
    return true;
  }
  const payload = process.payload;
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("fieldRemovalAttempt" in payload)
  ) {
    return false;
  }
  const attempt = payload.fieldRemovalAttempt;
  return (
    typeof attempt === "object" &&
    attempt !== null &&
    "sourceKind" in attempt &&
    attempt.sourceKind === sourceKind
  );
};

const isOpponentControlledFieldRemovalProcess = (
  process: ReplacementProcess,
  targetControllerId: PlayerId,
): boolean => {
  const payload = process.payload;
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  if (!("fieldRemovalAttempt" in payload)) {
    return false;
  }
  const attempt = payload.fieldRemovalAttempt;
  if (typeof attempt !== "object" || attempt === null) {
    return false;
  }
  if (
    !("processFamily" in attempt) ||
    attempt.processFamily !== "fieldRemoval" ||
    !("sourceControllerId" in attempt) ||
    typeof attempt.sourceControllerId !== "string"
  ) {
    return false;
  }
  return attempt.sourceControllerId !== targetControllerId;
};
