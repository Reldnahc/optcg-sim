import type {
  CardRef,
  ContinuousEffectRecord,
  EffectId,
  GameState,
  PlayerId,
  ReplacementProcess,
} from "@optcg/types";

import {
  cardRefsEqual,
  fieldRemovalProcessTargets,
} from "../field-removal-targets.js";
import { createOncePerTurnGate } from "../../rules/once-per-turn.js";
import { replacementAlreadyUsed } from "../process-gate.js";
import { opponentFieldRemovalReplacementCoveredTargets } from "./applicability.js";
import {
  effectIdFromReplacementProcess,
  resolveReviewedImplementedDslEffectDefinition,
} from "./definition-lookup.js";
import { failure } from "./errors.js";
import {
  findCardByInstanceId,
  replacementSourcesForController,
} from "./source-lookup.js";
import {
  isReplacementTriggerEffect,
  isSupportedAnyOfReplacementEffect,
  isSupportedKoInsteadReplacementEffect,
  isSupportedKoLifeTopToHandReplacementEffect,
  isSupportedOpponentEffectFieldRemovalReplacementEffect,
  isSupportedOpponentEffectFieldRemovalRestCardsReplacementEffect,
  isSupportedOpponentEffectFieldRemovalRestSelfReplacementEffect,
  isSupportedOpponentEffectKoRestSelfReplacementEffect,
  isSupportedOpponentFieldRemovalLifeReplacementEffect,
  isSupportedOpponentKoTrashFromHandReplacementEffect,
  isSupportedReplacementEffect,
  isSupportedSelfKoDrawReplacementEffect,
  isSupportedSelfKoTrashFromHandReplacementEffect,
} from "./support-shapes.js";
import { validateKoReplacementTargets } from "./target-validation.js";
import type {
  DetectSelectedTargetKoReplacementCandidateResult,
  LocatedReplacementSource,
  SelectedTargetKoReplacementCandidate,
  SupportedReplacementEffectBlock,
  ValidatedReplacementTarget,
} from "./types.js";

const toReplacementCandidateId = (
  source: LocatedReplacementSource,
  effect: SupportedReplacementEffectBlock,
): string => `${String(source.ref.instanceId)}:${String(effect.id)}`;

const coveredTargetsForSupportedEffect = (
  state: GameState,
  process: ReplacementProcess,
  source: LocatedReplacementSource,
  controllerTargets: readonly ValidatedReplacementTarget[],
  effect: SupportedReplacementEffectBlock,
): readonly CardRef[] | null => {
  if (isSupportedSelfKoDrawReplacementEffect(effect)) {
    if (process.type !== "ko") {
      return null;
    }
    return controllerTargets
      .filter(
        ({ located }) => source.card.instanceId === located.card.instanceId,
      )
      .map(({ ref }) => ref);
  }
  if (isSupportedSelfKoTrashFromHandReplacementEffect(effect)) {
    if (process.type !== "ko") {
      return null;
    }
    return controllerTargets
      .filter(
        ({ located }) => source.card.instanceId === located.card.instanceId,
      )
      .map(({ ref }) => ref);
  }
  if (
    isSupportedOpponentEffectKoRestSelfReplacementEffect(effect) &&
    process.type !== "ko"
  ) {
    return null;
  }
  if (
    isSupportedKoLifeTopToHandReplacementEffect(effect) ||
    isSupportedKoInsteadReplacementEffect(effect) ||
    isSupportedOpponentKoTrashFromHandReplacementEffect(effect) ||
    isSupportedOpponentFieldRemovalLifeReplacementEffect(effect) ||
    isSupportedOpponentEffectFieldRemovalRestCardsReplacementEffect(effect) ||
    isSupportedOpponentEffectFieldRemovalRestSelfReplacementEffect(effect) ||
    isSupportedOpponentEffectKoRestSelfReplacementEffect(effect) ||
    isSupportedOpponentEffectFieldRemovalReplacementEffect(effect) ||
    isSupportedAnyOfReplacementEffect(effect)
  ) {
    return opponentFieldRemovalReplacementCoveredTargets(
      state,
      process,
      source,
      controllerTargets,
      effect,
    );
  }
  return controllerTargets.map(({ ref }) => ref);
};

const temporaryReplacementBlocksForController = (
  state: GameState,
  controllerId: PlayerId,
): {
  readonly effect: SupportedReplacementEffectBlock;
  readonly source: LocatedReplacementSource;
}[] => {
  const blocks: {
    readonly effect: SupportedReplacementEffectBlock;
    readonly source: LocatedReplacementSource;
  }[] = [];
  for (const record of state.continuousEffects) {
    const block = temporaryReplacementBlock(record);
    if (block === undefined || record.controller !== controllerId) {
      continue;
    }
    const located = findCardByInstanceId(state, record.source.instanceId);
    const resolved = state.cardManifest.cards[record.source.cardId];
    if (located === null || resolved === undefined) {
      continue;
    }
    blocks.push({
      effect: block,
      source: {
        card: located.card,
        playerId: located.playerId,
        ref: record.source,
        resolved,
      },
    });
  }
  return blocks;
};

const temporaryReplacementBlock = (
  record: ContinuousEffectRecord,
): SupportedReplacementEffectBlock | undefined => {
  if (
    record.modifier.layer !== "replacement" ||
    record.modifier.operation.type !== "replacement"
  ) {
    return undefined;
  }
  const replacement = record.modifier.operation.replacement;
  const block: SupportedReplacementEffectBlock = {
    id: record.id as EffectId,
    category: "replacement",
    trigger: { type: "replacement", replacement: replacement.when },
    optional: true,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    effect: replacement,
  };
  return isSupportedReplacementEffect(block) ? block : undefined;
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
        if (replacementAlreadyUsed(process, candidateId)) {
          continue;
        }
        if (
          !createOncePerTurnGate({
            sourceInstanceId: source.card.instanceId,
            effectId: effect.id,
            turnNumber: state.turn.globalTurn,
            oncePerTurn: effect.oncePerTurn === true,
          }).canUse(state)
        ) {
          continue;
        }
        const coveredTargets = coveredTargetsForSupportedEffect(
          state,
          process,
          source,
          controllerTargets,
          effect,
        );
        if (coveredTargets === null) continue;
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

    for (const { effect, source } of temporaryReplacementBlocksForController(
      state,
      controllerId,
    )) {
      const candidateId = `temporary:${String(effect.id)}`;
      if (replacementAlreadyUsed(process, candidateId)) {
        continue;
      }
      const coveredTargets = coveredTargetsForSupportedEffect(
        state,
        process,
        source,
        controllerTargets,
        effect,
      );
      if (coveredTargets === null || coveredTargets.length === 0) {
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
        controllerId,
        source: source.ref,
        ...(needsCoveredTargets ? { coveredTargets } : {}),
        replacementEffect: effect.effect,
      });
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
