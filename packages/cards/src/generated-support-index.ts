import type {
  CardId,
  CardImplementationRecord,
  EffectDefinition,
} from "@optcg/types";

import { parseCertifiedCardText } from "./certified-card-text-parser.js";
import {
  isCompleteGeneratedSupportParseResult,
  type GeneratedSupportBlocker,
  type GeneratedSupportParserResultStatus,
} from "./generated-support-types.js";
import {
  generatedSupportRuntimeCapabilityMatrix,
  type RuntimeCapabilityMatrix,
} from "./runtime-capability-matrix.js";

export interface GeneratedSupportCardTextInput {
  behaviorHash: string;
  cardDataVersion: string;
  cardId: CardId;
  effectDefinitionsVersion: string;
  expectedSourceTextHash?: string;
  rulesVersion: string;
  sourceText: string;
  sourceTextHash: string;
}

export type EffectDefinitionValidationResult =
  | { valid: true }
  | { errors: readonly string[]; valid: false };

export interface GeneratedSupportIndexInput {
  cards: readonly GeneratedSupportCardTextInput[];
  runtimeCapabilityMatrix?: RuntimeCapabilityMatrix;
  validateEffectDefinition: (
    definition: EffectDefinition,
  ) => EffectDefinitionValidationResult;
}

export interface GeneratedSupportIndex {
  effectDefinitions: Record<string, EffectDefinition>;
  entries: readonly GeneratedSupportIndexEntry[];
}

export interface GeneratedSupportIndexEntry {
  blockers: readonly GeneratedSupportBlocker[];
  capabilityEvidence: readonly RuntimeCapabilityEvidence[];
  cardId: CardId;
  effectDefinition?: EffectDefinition;
  effectDefinitionId?: string;
  missingCapabilityIds: readonly string[];
  parseStatus: GeneratedSupportParserResultStatus;
  parserRuleIds: readonly string[];
  sourceTextHash: string;
  status: "supported" | "unsupported";
  support?: CardImplementationRecord;
}

export interface GeneratedSupportManifestEvidence {
  effectDefinitions: Record<string, EffectDefinition>;
  generatedSupport: Record<CardId, GeneratedSupportIndexEntry>;
  support: Record<CardId, CardImplementationRecord>;
}

export interface RuntimeCapabilityEvidence {
  capabilityId: string;
  parserRuleId: string;
}

export function buildGeneratedSupportIndex(
  input: GeneratedSupportIndexInput,
): GeneratedSupportIndex {
  const entries = input.cards
    .map((card) => buildGeneratedSupportIndexEntry(card, input))
    .sort((left, right) =>
      String(left.cardId).localeCompare(String(right.cardId)),
    );
  const effectDefinitionEntries: [string, EffectDefinition][] = entries
    .filter(
      (
        entry,
      ): entry is GeneratedSupportIndexEntry & {
        effectDefinition: EffectDefinition;
        effectDefinitionId: string;
      } =>
        entry.effectDefinition !== undefined &&
        entry.effectDefinitionId !== undefined,
    )
    .map((entry) => [entry.effectDefinitionId, entry.effectDefinition]);
  const effectDefinitions = Object.fromEntries(
    effectDefinitionEntries.sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );

  return {
    effectDefinitions,
    entries,
  };
}

export function toGeneratedSupportManifestEvidence(
  index: GeneratedSupportIndex,
): GeneratedSupportManifestEvidence {
  const supportEntries = index.entries
    .filter(
      (
        entry,
      ): entry is GeneratedSupportIndexEntry & {
        support: CardImplementationRecord;
      } => entry.support !== undefined,
    )
    .map((entry) => [entry.cardId, entry.support] as const)
    .sort(([left], [right]) => String(left).localeCompare(String(right)));

  return {
    effectDefinitions: { ...index.effectDefinitions },
    generatedSupport: Object.fromEntries(
      index.entries
        .map((entry) => [entry.cardId, entry] as const)
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
    ),
    support: Object.fromEntries(supportEntries),
  };
}

function buildGeneratedSupportIndexEntry(
  card: GeneratedSupportCardTextInput,
  input: GeneratedSupportIndexInput,
): GeneratedSupportIndexEntry {
  if (
    card.expectedSourceTextHash !== undefined &&
    card.expectedSourceTextHash !== card.sourceTextHash
  ) {
    return unsupportedEntry({
      blockers: [
        {
          code: "stale-hash",
          expectedHash: card.expectedSourceTextHash,
          message: "Poneglyph text hash changed.",
          receivedHash: card.sourceTextHash,
        },
      ],
      card,
      parseStatus: "staleHash",
      parserRuleIds: [],
    });
  }

  const parseResult = parseCertifiedCardText({
    cardId: card.cardId,
    effectDefinitionsVersion: card.effectDefinitionsVersion,
    rulesVersion: card.rulesVersion,
    sourceText: card.sourceText,
    sourceTextHash: card.sourceTextHash,
  });

  if (!isCompleteGeneratedSupportParseResult(parseResult)) {
    return unsupportedEntry({
      blockers: parseResult.blockers,
      card,
      parseStatus: parseResult.status,
      parserRuleIds:
        "parsedRuleIds" in parseResult ? parseResult.parsedRuleIds : [],
    });
  }

  const capabilityCoverage = resolveCapabilityCoverage({
    matrix:
      input.runtimeCapabilityMatrix ?? generatedSupportRuntimeCapabilityMatrix,
    parserRuleIds: parseResult.parserRuleIds,
  });
  if (capabilityCoverage.missing.length > 0) {
    return unsupportedEntry({
      blockers: capabilityCoverage.missing.map((missing) => ({
        capabilityId: missing.capabilityId,
        code: "missing-runtime-capability",
        component: missing.parserRuleId,
        message: `Missing runtime capability ${missing.capabilityId} for parser rule ${missing.parserRuleId}.`,
      })),
      card,
      missingCapabilityIds: [
        ...new Set(
          capabilityCoverage.missing.map((missing) => missing.capabilityId),
        ),
      ].sort(),
      parseStatus: parseResult.status,
      parserRuleIds: parseResult.parserRuleIds,
    });
  }

  const validation = input.validateEffectDefinition(
    parseResult.effectDefinition,
  );
  if (!validation.valid) {
    return unsupportedEntry({
      blockers: [
        {
          code: "invalid-dsl-schema",
          component: validation.errors.join("\n"),
          message: "Generated DSL failed effect DSL schema validation.",
        },
      ],
      card,
      parseStatus: parseResult.status,
      parserRuleIds: parseResult.parserRuleIds,
    });
  }

  const effectDefinitionId = toGeneratedEffectDefinitionId(card.cardId);
  return {
    blockers: [],
    capabilityEvidence: capabilityCoverage.evidence,
    cardId: card.cardId,
    effectDefinition: parseResult.effectDefinition,
    effectDefinitionId,
    missingCapabilityIds: [],
    parseStatus: parseResult.status,
    parserRuleIds: parseResult.parserRuleIds,
    sourceTextHash: card.sourceTextHash,
    status: "supported",
    support: {
      behaviorHash: card.behaviorHash,
      cardDataVersion: card.cardDataVersion,
      cardId: card.cardId,
      effectDefinitionId,
      rulesVersion: card.rulesVersion,
      sourceTextHash: card.sourceTextHash,
      status: "implemented-dsl",
      tested: true,
    },
  };
}

function unsupportedEntry({
  blockers,
  card,
  missingCapabilityIds = [],
  parseStatus,
  parserRuleIds,
}: {
  blockers: readonly GeneratedSupportBlocker[];
  card: GeneratedSupportCardTextInput;
  missingCapabilityIds?: readonly string[];
  parseStatus: GeneratedSupportParserResultStatus;
  parserRuleIds: readonly string[];
}): GeneratedSupportIndexEntry {
  return {
    blockers,
    capabilityEvidence: [],
    cardId: card.cardId,
    missingCapabilityIds,
    parseStatus,
    parserRuleIds,
    sourceTextHash: card.sourceTextHash,
    status: "unsupported",
  };
}

function resolveCapabilityCoverage({
  matrix,
  parserRuleIds,
}: {
  matrix: RuntimeCapabilityMatrix;
  parserRuleIds: readonly string[];
}): {
  evidence: readonly RuntimeCapabilityEvidence[];
  missing: readonly RuntimeCapabilityEvidence[];
} {
  const evidence: RuntimeCapabilityEvidence[] = [];
  const missing: RuntimeCapabilityEvidence[] = [];

  for (const parserRuleId of parserRuleIds) {
    for (const capabilityId of capabilityIdsForParserRuleId(parserRuleId)) {
      if (
        hasRuntimeCapabilityForParserRule({
          capabilityId,
          matrix,
          parserRuleId,
        })
      ) {
        evidence.push({ capabilityId, parserRuleId });
      } else {
        missing.push({ capabilityId, parserRuleId });
      }
    }
  }

  return {
    evidence: evidence.sort(compareCapabilityEvidence),
    missing: missing.sort(compareCapabilityEvidence),
  };
}

function hasRuntimeCapabilityForParserRule({
  capabilityId,
  matrix,
  parserRuleId,
}: {
  capabilityId: string;
  matrix: RuntimeCapabilityMatrix;
  parserRuleId: string;
}): boolean {
  const capability = matrix.capabilities.find(
    (candidate) => candidate.id === capabilityId,
  );

  return (
    capability !== undefined &&
    capability.supported &&
    capability.supportedParserRuleIds.includes(parserRuleId)
  );
}

function compareCapabilityEvidence(
  left: RuntimeCapabilityEvidence,
  right: RuntimeCapabilityEvidence,
): number {
  const capabilityOrder = left.capabilityId.localeCompare(right.capabilityId);
  if (capabilityOrder !== 0) {
    return capabilityOrder;
  }

  return left.parserRuleId.localeCompare(right.parserRuleId);
}

function capabilityIdsForParserRuleId(parserRuleId: string): readonly string[] {
  if (parserRuleId === "exact:on-play:draw-n:self") {
    return [
      "category:auto",
      "effect:draw:self:count:positive-safe-integer",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ];
  }

  if (parserRuleId === "exact:when-attacking:draw-n:self") {
    return [
      "category:auto",
      "effect:draw:self:count:positive-safe-integer",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:whenAttacking",
    ];
  }

  if (parserRuleId === "line-separated-effect-blocks:v1") {
    return ["composition:line-separated-effect-blocks:v1"];
  }

  return [parserRuleId];
}

function toGeneratedEffectDefinitionId(cardId: CardId): string {
  return `${String(cardId).toLowerCase()}.generated-support`;
}
