import type {
  CardCategory,
  CardId,
  CardImplementationRecord,
  EffectDefinition,
  Keyword,
} from "@optcg/types";

import { parseCertifiedCardText } from "./certified-card-text-parser.js";
import { deriveParserDiagnosticDecomposition } from "./composed-parser-builder.js";
import {
  findGeneratedSupportComponentEvidenceByParserRuleId,
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
  category?: CardCategory;
  printedKeywords?: readonly Keyword[];
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
  component?: string;
  parserRuleId?: string;
}

export interface RuntimeCapabilityCoverageResult {
  blockers: readonly GeneratedSupportBlocker[];
  evidence: readonly RuntimeCapabilityEvidence[];
  missing: readonly RuntimeCapabilityEvidence[];
  missingCapabilityIds: readonly string[];
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

export function evaluateRuntimeCapabilityCoverageForParserRuleIds({
  matrix = generatedSupportRuntimeCapabilityMatrix,
  parserRuleIds,
}: {
  matrix?: RuntimeCapabilityMatrix;
  parserRuleIds: readonly string[];
}): RuntimeCapabilityCoverageResult {
  const coverage = resolveCapabilityCoverage({ matrix, parserRuleIds });
  const missingCapabilityIds = [
    ...new Set(coverage.missing.map((missing) => missing.capabilityId)),
  ].sort();

  return {
    blockers: coverage.missing.map((missing) =>
      toMissingRuntimeCapabilityBlocker(missing),
    ),
    evidence: coverage.evidence,
    missing: coverage.missing,
    missingCapabilityIds,
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

  if (card.sourceText.length === 0) {
    if (!hasEmptyEffectSupportMetadata(card)) {
      return unsupportedMetadataEntry({
        card,
        diagnosticLayer: undefined,
        message:
          "Normalized card metadata does not satisfy certified empty-effect support preconditions.",
        parserRuleIds: [],
      });
    }

    return supportedVanillaEntry({
      capabilityEvidence: [],
      card,
      parseStatus: "complete",
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
      blockers: attachParserDiagnosticDecomposition(
        parseResult.blockers,
        card.sourceText,
      ),
      card,
      parseStatus: parseResult.status,
      parserRuleIds:
        "parsedRuleIds" in parseResult ? parseResult.parsedRuleIds : [],
    });
  }

  if (
    parseResult.parserRuleIds.includes("exact:keyword:blocker:standalone") &&
    !hasBlockerKeywordSupportMetadata(card)
  ) {
    return unsupportedMetadataEntry({
      card,
      component: "metadata:blocker-keyword-precondition",
      diagnosticLayer: "metadata",
      message:
        "Normalized card metadata does not satisfy certified Blocker keyword support preconditions.",
      parserRuleIds: parseResult.parserRuleIds,
    });
  }

  const keywordMetadataPrecondition = getKeywordMetadataPrecondition(
    parseResult.parserRuleIds,
  );
  if (
    keywordMetadataPrecondition !== undefined &&
    !hasKeywordSupportMetadata(card, keywordMetadataPrecondition.keyword)
  ) {
    return unsupportedMetadataEntry({
      card,
      component: `metadata:keyword-precondition:${keywordMetadataPrecondition.keyword}`,
      diagnosticLayer: "metadata",
      message: `Normalized card metadata does not satisfy certified ${keywordMetadataPrecondition.label} keyword support preconditions.`,
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

  const capabilityCoverage = evaluateRuntimeCapabilityCoverageForParserRuleIds({
    matrix:
      input.runtimeCapabilityMatrix ?? generatedSupportRuntimeCapabilityMatrix,
    parserRuleIds: parseResult.parserRuleIds,
  });
  if (capabilityCoverage.missing.length > 0) {
    return unsupportedEntry({
      blockers: capabilityCoverage.blockers.map((blocker) => ({
        ...blocker,
        schemaValidated: true,
      })),
      card,
      missingCapabilityIds: capabilityCoverage.missingCapabilityIds,
      parseStatus: parseResult.status,
      parserRuleIds: parseResult.parserRuleIds,
    });
  }

  if (
    parseResult.effectDefinition.implementationStatus === "vanilla-confirmed"
  ) {
    return supportedVanillaEntry({
      capabilityEvidence: capabilityCoverage.evidence,
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

function attachParserDiagnosticDecomposition(
  blockers: readonly GeneratedSupportBlocker[],
  sourceText: string,
): readonly GeneratedSupportBlocker[] {
  return blockers.map((blocker) => {
    if (blocker.code !== "unparsed-span") {
      return blocker;
    }

    const decomposition = deriveParserDiagnosticDecomposition(
      blocker.span?.text ?? sourceText,
      sourceText,
    );
    if (decomposition === undefined) {
      return blocker;
    }

    return {
      ...blocker,
      decomposition,
    };
  });
}

function hasBlockerKeywordSupportMetadata(
  card: GeneratedSupportCardTextInput,
): boolean {
  return card.category === "character" && hasPrintedKeyword(card, "blocker");
}

function hasKeywordSupportMetadata(
  card: GeneratedSupportCardTextInput,
  keyword: Keyword,
): boolean {
  return card.category === "character" && hasPrintedKeyword(card, keyword);
}

function hasEmptyEffectSupportMetadata(
  card: GeneratedSupportCardTextInput,
): boolean {
  return card.category === "character" && card.printedKeywords?.length === 0;
}

function hasPrintedKeyword(
  card: GeneratedSupportCardTextInput,
  keyword: Keyword,
): boolean {
  return card.printedKeywords?.includes(keyword) === true;
}

function getKeywordMetadataPrecondition(
  parserRuleIds: readonly string[],
): { keyword: Keyword; label: string } | undefined {
  if (parserRuleIds.includes("exact:keyword:rush:standalone")) {
    return { keyword: "rush", label: "Rush" };
  }

  if (parserRuleIds.includes("exact:keyword:rush-character:standalone")) {
    return { keyword: "rushCharacter", label: "Rush: Character" };
  }

  if (parserRuleIds.includes("exact:keyword:double-attack:standalone")) {
    return { keyword: "doubleAttack", label: "Double Attack" };
  }

  if (parserRuleIds.includes("exact:keyword:banish:standalone")) {
    return { keyword: "banish", label: "Banish" };
  }

  return undefined;
}

function supportedVanillaEntry({
  capabilityEvidence,
  card,
  parseStatus,
  parserRuleIds,
}: {
  capabilityEvidence: readonly RuntimeCapabilityEvidence[];
  card: GeneratedSupportCardTextInput;
  parseStatus: GeneratedSupportParserResultStatus;
  parserRuleIds: readonly string[];
}): GeneratedSupportIndexEntry {
  return {
    blockers: [],
    capabilityEvidence,
    cardId: card.cardId,
    missingCapabilityIds: [],
    parseStatus,
    parserRuleIds,
    sourceTextHash: card.sourceTextHash,
    status: "supported",
    support: {
      behaviorHash: card.behaviorHash,
      cardDataVersion: card.cardDataVersion,
      cardId: card.cardId,
      rulesVersion: card.rulesVersion,
      sourceTextHash: card.sourceTextHash,
      status: "vanilla-confirmed",
      tested: true,
    },
  };
}

function unsupportedMetadataEntry({
  card,
  component = "metadata:precondition",
  diagnosticLayer,
  message,
  parserRuleIds,
}: {
  card: GeneratedSupportCardTextInput;
  component?: string;
  diagnosticLayer?: GeneratedSupportBlocker["diagnosticLayer"];
  message: string;
  parserRuleIds: readonly string[];
}): GeneratedSupportIndexEntry {
  const blocker: GeneratedSupportBlocker = {
    code: "unsupported-primitive",
    component,
    message,
  };
  if (diagnosticLayer !== undefined) {
    blocker.diagnosticLayer = diagnosticLayer;
  }

  return unsupportedEntry({
    blockers: [blocker],
    card,
    parseStatus: "unsupportedPrimitive",
    parserRuleIds,
  });
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
    const inventoryEntry =
      findGeneratedSupportComponentEvidenceByParserRuleId(parserRuleId);
    const component = inventoryEntry?.shapeId ?? parserRuleId;
    const capabilityIds =
      inventoryEntry?.runtimeCapabilityIds ??
      listRuntimeCapabilityIdsFromMatrixParserLink({ matrix, parserRuleId });

    for (const capabilityId of capabilityIds) {
      if (hasRuntimeCapability({ capabilityId, component, matrix })) {
        evidence.push({ capabilityId, component, parserRuleId });
        continue;
      }

      missing.push({ capabilityId, component, parserRuleId });
    }
  }

  return {
    evidence: evidence.sort(compareCapabilityEvidence),
    missing: missing.sort(compareCapabilityEvidence),
  };
}

function hasRuntimeCapability({
  capabilityId,
  component,
  matrix,
}: {
  capabilityId: string;
  component: string;
  matrix: RuntimeCapabilityMatrix;
}): boolean {
  const capability = matrix.capabilities.find(
    (candidate) => candidate.id === capabilityId,
  );

  return (
    capability !== undefined &&
    capability.supported &&
    (capability.supportedComponentIds ?? []).includes(component)
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

  return (left.component ?? left.parserRuleId ?? "").localeCompare(
    right.component ?? right.parserRuleId ?? "",
  );
}

function toMissingRuntimeCapabilityBlocker(
  missing: RuntimeCapabilityEvidence,
): GeneratedSupportBlocker {
  const component =
    missing.component ?? missing.parserRuleId ?? "unknown-component";
  return {
    capabilityId: missing.capabilityId,
    code: "missing-runtime-capability",
    component,
    message: `Missing runtime capability ${missing.capabilityId} for component ${component}.`,
  };
}

function listRuntimeCapabilityIdsFromMatrixParserLink({
  matrix,
  parserRuleId,
}: {
  matrix: RuntimeCapabilityMatrix;
  parserRuleId: string;
}): readonly string[] {
  return matrix.capabilities
    .filter(
      (capability) =>
        capability.supportedParserRuleIds.includes(parserRuleId) &&
        capability.supported,
    )
    .map((capability) => capability.id)
    .sort();
}

function toGeneratedEffectDefinitionId(cardId: CardId): string {
  return `${String(cardId).toLowerCase()}.generated-support`;
}
