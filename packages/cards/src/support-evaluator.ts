import type { CardImplementationRecord, EffectDefinition } from "@optcg/types";

import {
  buildGeneratedSupportIndex,
  type EffectDefinitionValidationResult,
  type GeneratedSupportIndexEntry,
  type GeneratedSupportIndexInput,
  type RuntimeCapabilityEvidence,
} from "./generated-support-index.js";
import type { GeneratedSupportBlocker } from "./generated-support-types.js";
import type { NormalizedPoneglyphCard } from "./normalization.js";
import type { RuntimeCapabilityMatrix } from "./runtime-capability-matrix.js";

export interface EvaluateGeneratedSupportPlayabilityInput {
  card: NormalizedPoneglyphCard;
  cardDataVersion: string;
  effectDefinitionsVersion: string;
  rulesVersion: string;
  runtimeCapabilityMatrix?: RuntimeCapabilityMatrix;
  validateEffectDefinition: (
    definition: EffectDefinition,
  ) => EffectDefinitionValidationResult;
}

export interface GeneratedSupportPlayabilityEvaluation {
  blockers: readonly GeneratedSupportBlocker[];
  capabilityEvidence: readonly RuntimeCapabilityEvidence[];
  cardId: NormalizedPoneglyphCard["cardId"];
  effectDefinition?: EffectDefinition;
  effectDefinitionId?: string;
  missingCapabilityIds: readonly string[];
  parseStatus: GeneratedSupportIndexEntry["parseStatus"];
  parserRuleIds: readonly string[];
  playable: boolean;
  sourceTextHash: string;
  status: GeneratedSupportIndexEntry["status"];
  support?: CardImplementationRecord;
}

export function evaluateGeneratedSupportPlayability(
  input: EvaluateGeneratedSupportPlayabilityInput,
): GeneratedSupportPlayabilityEvaluation {
  const sourceText = toSourceText(input.card);
  const indexInput: GeneratedSupportIndexInput = {
    cards: [
      {
        behaviorHash: input.card.behaviorHash,
        cardDataVersion: input.cardDataVersion,
        cardId: input.card.cardId,
        effectDefinitionsVersion: input.effectDefinitionsVersion,
        rulesVersion: input.rulesVersion,
        sourceText,
        sourceTextHash: input.card.sourceTextHash,
      },
    ],
    validateEffectDefinition: input.validateEffectDefinition,
  };
  if (input.runtimeCapabilityMatrix !== undefined) {
    indexInput.runtimeCapabilityMatrix = input.runtimeCapabilityMatrix;
  }
  const entry = buildGeneratedSupportIndex(indexInput).entries[0];

  if (entry === undefined) {
    throw new Error(
      `Generated-support evaluator produced no index entry for ${String(
        input.card.cardId,
      )}.`,
    );
  }

  const result: GeneratedSupportPlayabilityEvaluation = {
    blockers: entry.blockers,
    capabilityEvidence: entry.capabilityEvidence,
    cardId: entry.cardId,
    missingCapabilityIds: entry.missingCapabilityIds,
    parseStatus: entry.parseStatus,
    parserRuleIds: entry.parserRuleIds,
    playable: entry.status === "supported",
    sourceTextHash: entry.sourceTextHash,
    status: entry.status,
  };
  if (entry.effectDefinition !== undefined) {
    result.effectDefinition = entry.effectDefinition;
  }
  if (entry.effectDefinitionId !== undefined) {
    result.effectDefinitionId = entry.effectDefinitionId;
  }
  if (entry.support !== undefined) {
    result.support = entry.support;
  }

  return result;
}

function toSourceText(card: NormalizedPoneglyphCard): string {
  const chunks = [card.effectText, card.triggerText]
    .map((value) => value?.trim() ?? "")
    .filter((value) => value.length > 0);

  return chunks.join("\n");
}
