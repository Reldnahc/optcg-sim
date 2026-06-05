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

import {
  cardMatchesHandSelectionFilter,
  isSupportedHandSelectionCardFilter,
} from "../actions/state.js";
import { isSupportedLifeTopToHandEffect } from "../effect-runtime-move-cards.js";
import { getReturnDonEligibleCount } from "../runtime/primitives/return-don.js";
import {
  resolvePublicTargetCandidates,
  resolvePublicTargetCandidatesForRequest,
} from "../selection/candidates.js";
import { isOncePerTurnUsed, toOncePerTurnKey } from "../rules/once-per-turn.js";
import {
  cardRefsEqual,
  fieldRemovalProcessTargets,
} from "./field-removal-targets.js";
import { isSupportedOwnerDeckBottomInsteadEffect } from "./instead-effects.js";

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
  oncePerTurn?: true;
  source: CardRef;
  coveredTargets?: readonly CardRef[];
  replacementEffect: Extract<Effect, { type: "replacement" }>;
}

export type FieldRemovalReplacementCandidate =
  SelectedTargetKoReplacementCandidate;

export type DetectSelectedTargetKoReplacementCandidateResult =
  | {
      ok: true;
      candidate?: SelectedTargetKoReplacementCandidate;
      candidates?: readonly SelectedTargetKoReplacementCandidate[];
    }
  | { ok: false; error: EngineError };

export type DetectFieldRemovalReplacementCandidateResult =
  | {
      ok: true;
      candidate?: FieldRemovalReplacementCandidate;
      candidates?: readonly FieldRemovalReplacementCandidate[];
    }
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

const isSupportedTrashFromHandInsteadEffect = (
  effect: Effect,
): effect is Extract<Effect, { type: "trashFromHand" }> =>
  effect.type === "trashFromHand" &&
  effect.player === "self" &&
  effect.chooser === "self" &&
  isSupportedHandSelectionCardFilter(effect.filter) &&
  Number.isInteger(effect.count) &&
  effect.count > 0;

const isSupportedReturnDonInsteadEffect = (
  effect: Effect,
): effect is Extract<Effect, { type: "returnDon" }> =>
  effect.type === "returnDon" &&
  effect.player === "self" &&
  Number.isInteger(effect.count) &&
  effect.count > 0;

const isSupportedModifyLeaderPowerInsteadEffect = (
  effect: Effect,
): effect is Extract<Effect, { type: "modifyPower" }> =>
  effect.type === "modifyPower" &&
  effect.target.type === "myLeader" &&
  typeof effect.value === "number" &&
  effect.duration.type === "thisTurn";

const isSupportedTrashSelfInsteadEffect = (
  effect: Effect,
): effect is Extract<Effect, { type: "trash" }> & {
  target: Extract<Effect, { type: "trash" }>["target"] & { type: "self" };
} => effect.type === "trash" && isSelfTarget(effect.target);

const isSupportedOpponentEffectFieldRemovalInsteadEffect = (
  effect: Effect,
): boolean =>
  isSupportedLifeTopToHandEffect(effect) ||
  isSupportedRestOwnCardsInsteadEffect(effect) ||
  isSupportedRestSelfInsteadEffect(effect) ||
  isSupportedTrashFromHandInsteadEffect(effect) ||
  isSupportedReturnDonInsteadEffect(effect) ||
  isSupportedModifyLeaderPowerInsteadEffect(effect) ||
  isSupportedTrashSelfInsteadEffect(effect) ||
  isSupportedOwnerDeckBottomInsteadEffect(effect);

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

const isSupportedOpponentEffectFieldRemovalReplacementEffect = (
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
  isSupportedOpponentEffectFieldRemovalInsteadEffect(effect.effect.instead);

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

const isSupportedOpponentEffectKoRestSelfReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  effect.category === "replacement" &&
  effect.trigger.type === "replacement" &&
  effect.trigger.replacement.type === "wouldBeKOd" &&
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
  effect.effect.when.type === "wouldBeKOd" &&
  effect.effect.when.sourceKind === "cardEffect" &&
  effect.effect.when.target.type === "all" &&
  effect.effect.when.target.zone === "characterArea" &&
  effect.effect.when.target.player === "self" &&
  isSupportedRestSelfInsteadEffect(effect.effect.instead);

const isSupportedOpponentKoTrashFromHandReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  effect.category === "replacement" &&
  effect.trigger.type === "replacement" &&
  effect.trigger.replacement.type === "wouldBeKOd" &&
  effect.trigger.replacement.target.type === "all" &&
  effect.trigger.replacement.target.zone === "characterArea" &&
  effect.trigger.replacement.target.player === "self" &&
  effect.optional === true &&
  effect.sourcePresencePolicy === "resolveFromLastKnownInformation" &&
  effect.condition === undefined &&
  effect.conditionTiming === undefined &&
  effect.cost === undefined &&
  effect.failurePolicy === undefined &&
  effect.oncePerTurn !== false &&
  effect.effect.type === "replacement" &&
  effect.effect.when.type === "wouldBeKOd" &&
  effect.effect.when.target.type === "all" &&
  effect.effect.when.target.zone === "characterArea" &&
  effect.effect.when.target.player === "self" &&
  effect.effect.when.sourceKind === effect.trigger.replacement.sourceKind &&
  effect.effect.when.sourceControllerRelation ===
    effect.trigger.replacement.sourceControllerRelation &&
  isSupportedTrashFromHandInsteadEffect(effect.effect.instead);

const isSupportedSelfKoTrashFromHandReplacementEffect = (
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
  isSupportedTrashFromHandInsteadEffect(effect.effect.instead);

const isSupportedReplacementEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedReplacementEffectBlock =>
  isSupportedSelfKoDrawReplacementEffect(effect) ||
  isSupportedOpponentFieldRemovalLifeReplacementEffect(effect) ||
  isSupportedOpponentEffectFieldRemovalReplacementEffect(effect) ||
  isSupportedOpponentEffectFieldRemovalRestCardsReplacementEffect(effect) ||
  isSupportedOpponentEffectFieldRemovalRestSelfReplacementEffect(effect) ||
  isSupportedOpponentEffectKoRestSelfReplacementEffect(effect) ||
  isSupportedOpponentKoTrashFromHandReplacementEffect(effect) ||
  isSupportedSelfKoTrashFromHandReplacementEffect(effect);

const isReplacementTriggerEffect = (
  effect: EffectDefinition["effects"][number],
): boolean =>
  effect.category === "replacement" ||
  effect.trigger.type === "replacement" ||
  effect.effect.type === "replacement";

const toReplacementCandidateId = (
  source: LocatedReplacementSource,
  effect: SupportedReplacementEffectBlock,
): string => `${String(source.ref.instanceId)}:${String(effect.id)}`;

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

type ValidatedReplacementTarget = Extract<
  ReturnType<typeof validateKoReplacementTarget>,
  { ok: true }
>;

const validateKoReplacementTargets = (
  state: GameState,
  effectId: string,
  targets: readonly CardRef[],
):
  | { ok: true; targets: readonly ValidatedReplacementTarget[] }
  | { ok: false; error: EngineError } => {
  if (targets.length === 0) {
    return failure(effectId, "unsupported-replacement-process");
  }
  const validated: ValidatedReplacementTarget[] = [];
  for (const target of targets) {
    const lookup = validateKoReplacementTarget(state, effectId, target);
    if (!lookup.ok) {
      return lookup;
    }
    validated.push(lookup);
  }
  return { ok: true, targets: validated };
};

export const detectSupportedSelectedTargetKoReplacementCandidate = (
  state: GameState,
  process: ReplacementProcess,
): DetectSelectedTargetKoReplacementCandidateResult => {
  const effectId = effectIdFromReplacementProcess(process);
  if (process.type !== "ko" && process.type !== "moveZone") {
    return failure(effectId, "unsupported-replacement-process");
  }

  const targetLookups = validateKoReplacementTargets(
    state,
    effectId,
    fieldRemovalProcessTargets(process),
  );
  if (!targetLookups.ok) return targetLookups;
  for (const { resolved } of targetLookups.targets) {
    if (
      resolved.support.status === "vanilla-confirmed" &&
      (resolved.support.customHandlerIds?.length ?? 0) > 0
    ) {
      return failure(effectId, "unsupported-ko-replacement-shape");
    }
  }

  const applicable: SelectedTargetKoReplacementCandidate[] = [];
  const controllers = [
    ...new Set(
      targetLookups.targets.map(({ located }) => located.card.controller),
    ),
  ];
  for (const controllerId of controllers) {
    const controllerTargets = targetLookups.targets.filter(
      ({ located }) => located.card.controller === controllerId,
    );
    const sourceLookup = replacementSourcesForController(
      state,
      controllerId,
      effectId,
    );
    if (!sourceLookup.ok) return sourceLookup;

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

      for (const effect of supported) {
        const candidateId = toReplacementCandidateId(source, effect);
        if (process.usedReplacementIds.includes(candidateId)) {
          continue;
        }
        let coveredTargets: readonly CardRef[] = [];
        if (isSupportedSelfKoDrawReplacementEffect(effect)) {
          if (process.type !== "ko") {
            continue;
          }
          coveredTargets = controllerTargets
            .filter(
              ({ located }) =>
                source.card.instanceId === located.card.instanceId,
            )
            .map(({ ref }) => ref);
        } else if (isSupportedSelfKoTrashFromHandReplacementEffect(effect)) {
          if (process.type !== "ko") {
            continue;
          }
          coveredTargets = controllerTargets
            .filter(
              ({ located }) =>
                source.card.instanceId === located.card.instanceId,
            )
            .map(({ ref }) => ref);
        } else if (
          isSupportedOpponentEffectKoRestSelfReplacementEffect(effect) &&
          process.type !== "ko"
        ) {
          continue;
        } else if (
          isSupportedOpponentFieldRemovalLifeReplacementEffect(effect) ||
          isSupportedOpponentEffectFieldRemovalRestCardsReplacementEffect(
            effect,
          ) ||
          isSupportedOpponentEffectFieldRemovalRestSelfReplacementEffect(
            effect,
          ) ||
          isSupportedOpponentEffectKoRestSelfReplacementEffect(effect) ||
          isSupportedOpponentEffectFieldRemovalReplacementEffect(effect)
        ) {
          coveredTargets = opponentFieldRemovalReplacementCoveredTargets(
            state,
            process,
            source,
            controllerTargets,
            effect,
          );
        } else {
          coveredTargets = controllerTargets.map(({ ref }) => ref);
        }
        if (coveredTargets.length === 0) {
          continue;
        }
        const processTargets = fieldRemovalProcessTargets(process);
        const needsCoveredTargets =
          processTargets.length !== 1 ||
          coveredTargets.length !== 1 ||
          !cardRefsEqual(
            processTargets[0] as CardRef,
            coveredTargets[0] as CardRef,
          );
        applicable.push({
          id: candidateId,
          effectBlockId: effect.id,
          controllerId: source.card.controller,
          ...(effect.oncePerTurn === true ? { oncePerTurn: true } : {}),
          source: source.ref,
          ...(needsCoveredTargets ? { coveredTargets } : {}),
          replacementEffect: effect.effect,
        });
      }
    }
  }
  if (applicable.length === 0) return { ok: true };
  if (applicable.length > 1) {
    return {
      ok: true,
      candidates: applicable,
    };
  }
  const candidate = applicable[0];
  if (candidate === undefined) return { ok: true };
  return {
    ok: true,
    candidate,
  };
};

export const detectSupportedFieldRemovalReplacementCandidate =
  detectSupportedSelectedTargetKoReplacementCandidate;

const opponentFieldRemovalReplacementCoveredTargets = (
  state: GameState,
  process: ReplacementProcess,
  source: LocatedReplacementSource,
  targetLookups: readonly ValidatedReplacementTarget[],
  effect: SupportedReplacementEffectBlock,
): readonly CardRef[] => {
  const target = effect.trigger.replacement;
  const sourceControllerRelation =
    target.type === "wouldBeKOd" || target.type === "wouldMoveZone"
      ? target.sourceControllerRelation
      : undefined;
  const eligibleTargetLookups =
    sourceControllerRelation === "any"
      ? targetLookups
      : targetLookups.filter(({ located }) =>
          isOpponentControlledFieldRemovalProcess(
            process,
            located.card.controller,
          ),
        );
  if (eligibleTargetLookups.length === 0) {
    return [];
  }
  if (
    (target.type !== "wouldMoveZone" && target.type !== "wouldBeKOd") ||
    target.target.type !== "all"
  ) {
    return [];
  }
  if (!fieldRemovalSourceKindMatches(process, target.sourceKind)) {
    return [];
  }
  if (!canPayOpponentFieldRemovalReplacementCost(state, source, effect)) {
    return [];
  }
  if (
    effect.oncePerTurn === true &&
    isOncePerTurnUsed(
      state,
      toOncePerTurnKey({
        cardInstanceId: source.card.instanceId,
        effectId: effect.id,
        turnNumber: state.turn.globalTurn,
      }),
    )
  ) {
    return [];
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
    sourceControllerId: source.card.controller,
    source: source.ref,
  });
  if (!candidates.ok) {
    return [];
  }
  return eligibleTargetLookups
    .filter(({ ref }) =>
      candidates.candidates.some((candidate) =>
        cardRefsEqual(candidate.card, ref),
      ),
    )
    .map(({ ref }) => ref);
};

const canPayOpponentFieldRemovalReplacementCost = (
  state: GameState,
  source: LocatedReplacementSource,
  effect: SupportedReplacementEffectBlock,
): boolean => {
  const instead = effect.effect.instead;
  if (isSupportedLifeTopToHandEffect(instead)) {
    const player = state.players[source.card.controller];
    return player !== undefined && player.life.length >= instead.count;
  }
  if (isSupportedRestOwnCardsInsteadEffect(instead)) {
    const candidates = resolvePublicTargetCandidatesForRequest(
      state,
      instead.target.request,
      { sourceControllerId: source.card.controller },
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
  if (isSupportedTrashFromHandInsteadEffect(instead)) {
    const player = state.players[source.card.controller];
    if (player === undefined) {
      return false;
    }
    const matchingCards = player.hand.filter((card) =>
      cardMatchesHandSelectionFilter(
        state,
        source.card.controller,
        card,
        instead.filter,
      ),
    );
    return matchingCards.length >= instead.count;
  }
  if (isSupportedReturnDonInsteadEffect(instead)) {
    const player = state.players[source.card.controller];
    return (
      player !== undefined && getReturnDonEligibleCount(player) >= instead.count
    );
  }
  if (isSupportedModifyLeaderPowerInsteadEffect(instead)) {
    return state.players[source.card.controller] !== undefined;
  }
  if (isSupportedTrashSelfInsteadEffect(instead)) {
    return (
      source.resolved.category === "character" &&
      source.ref.zone?.zone === "characterArea"
    );
  }
  if (isSupportedOwnerDeckBottomInsteadEffect(instead)) {
    const request = instead.effects[0]?.effect;
    if (request?.type !== "selectTargets") {
      return false;
    }
    const candidates = resolvePublicTargetCandidatesForRequest(
      state,
      request.request,
      { sourceControllerId: source.card.controller },
    );
    return candidates.ok && candidates.candidates.length >= request.request.min;
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
  sourceKind: "battle" | "cardEffect" | undefined,
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
