import type {
  EffectDefinition,
  EngineError,
  MatchCardManifest,
  ReplacementProcess,
  ResolvedCard,
} from "@optcg/types";

import { failure } from "./errors.js";

type ReplacementLookup =
  | { ok: true; definition: EffectDefinition }
  | { ok: false; error: EngineError };

const hasHumanReviewMetadata = (definition: EffectDefinition): boolean =>
  definition.metadata.reviewer !== undefined ||
  (definition.metadata.reviewedBy !== undefined &&
    definition.metadata.reviewedAt !== undefined);

export const resolveReviewedImplementedDslEffectDefinition = (
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

export const effectIdFromReplacementProcess = (
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
