import type { CardImplementationRecord, EffectDefinition } from "@optcg/types";

import {
  buildGeneratedSupportIndex,
  type GeneratedSupportCardTextInput,
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
  expectedBehaviorHash?: string;
  expectedSourceTextHash?: string;
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
  if (
    input.expectedBehaviorHash !== undefined &&
    input.expectedBehaviorHash !== input.card.behaviorHash
  ) {
    return {
      blockers: [
        {
          code: "stale-hash",
          expectedHash: input.expectedBehaviorHash,
          message: "Poneglyph behavior hash changed.",
          receivedHash: input.card.behaviorHash,
        },
      ],
      capabilityEvidence: [],
      cardId: input.card.cardId,
      missingCapabilityIds: [],
      parseStatus: "staleHash",
      parserRuleIds: [],
      playable: false,
      sourceTextHash: input.card.sourceTextHash,
      status: "unsupported",
    };
  }

  const cardInput: GeneratedSupportCardTextInput = {
    behaviorHash: input.card.behaviorHash,
    cardDataVersion: input.cardDataVersion,
    cardId: input.card.cardId,
    effectDefinitionsVersion: input.effectDefinitionsVersion,
    rulesVersion: input.rulesVersion,
    sourceText,
    sourceTextHash: input.card.sourceTextHash,
  };
  if (input.expectedSourceTextHash !== undefined) {
    cardInput.expectedSourceTextHash = input.expectedSourceTextHash;
  }

  const indexInput: GeneratedSupportIndexInput = {
    cards: [cardInput],
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
  return normalizeText(`${card.raw.effect ?? ""}\n${card.raw.trigger ?? ""}`);
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}
