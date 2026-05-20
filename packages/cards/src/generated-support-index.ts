import type {
  CardCategory,
  CardId,
  CardImplementationRecord,
  Condition,
  EffectDefinition,
  Keyword,
} from "@optcg/types";

import { parseCertifiedCardText } from "./certified-card-text-parser.js";
import { deriveParserDiagnosticDecomposition } from "./composed-parser-builder.js";
import {
  scanGenericCardTextDiagnostics,
  type GenericDiagnosticComponent,
} from "./generic-card-text-diagnostic-scanner.js";
import {
  type GeneratedSupportDiagnosticDecomposition,
  findGeneratedSupportComponentEvidenceByShapeId,
  isCompleteGeneratedSupportParseResult,
  listRequiredRuntimeCapabilityIdsForComponentEvidenceId,
  listComponentEvidenceIdsForParserRuleIds,
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
  componentEvidenceIds: readonly string[];
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
  const componentEvidenceIds =
    listComponentEvidenceIdsForParserRuleIds(parserRuleIds);
  const unmappedParserRuleIds = parserRuleIds.filter(
    (parserRuleId) =>
      listComponentEvidenceIdsForParserRuleIds([parserRuleId]).length === 0,
  );
  const coverage = resolveCapabilityCoverage({
    componentEvidenceIds,
    matrix,
  });
  const parserRuleIdsByComponent = new Map<string, readonly string[]>();
  for (const componentEvidenceId of componentEvidenceIds) {
    parserRuleIdsByComponent.set(
      componentEvidenceId,
      parserRuleIds.filter((parserRuleId) => {
        const mapped = listComponentEvidenceIdsForParserRuleIds([
          parserRuleId,
        ])[0];
        return mapped === componentEvidenceId;
      }),
    );
  }
  const evidence = coverage.evidence.flatMap((item) => {
    const mappedParserRuleIds =
      parserRuleIdsByComponent.get(item.component ?? "") ?? [];
    return mappedParserRuleIds.length === 0
      ? [item]
      : mappedParserRuleIds.map((parserRuleId) => ({ ...item, parserRuleId }));
  });
  const missing = coverage.missing.flatMap((item) => {
    const mappedParserRuleIds =
      parserRuleIdsByComponent.get(item.component ?? "") ?? [];
    return mappedParserRuleIds.length === 0
      ? [item]
      : mappedParserRuleIds.map((parserRuleId) => ({ ...item, parserRuleId }));
  });
  for (const parserRuleId of unmappedParserRuleIds) {
    missing.push({
      capabilityId: `parser-rule-mapping:${parserRuleId}`,
      component: parserRuleId,
      parserRuleId,
    });
  }
  const missingCapabilityIds = [
    ...new Set(missing.map((missingItem) => missingItem.capabilityId)),
  ].sort();

  return {
    blockers: missing.map((missingItem) =>
      toMissingRuntimeCapabilityBlocker(missingItem),
    ),
    evidence,
    missing,
    missingCapabilityIds,
  };
}

export function evaluateRuntimeCapabilityCoverageForComponentEvidenceIds({
  componentEvidenceIds,
  matrix = generatedSupportRuntimeCapabilityMatrix,
}: {
  componentEvidenceIds: readonly string[];
  matrix?: RuntimeCapabilityMatrix;
}): RuntimeCapabilityCoverageResult {
  const coverage = resolveCapabilityCoverage({
    componentEvidenceIds,
    matrix,
  });
  const missingCapabilityIds = [
    ...new Set(coverage.missing.map((missingItem) => missingItem.capabilityId)),
  ].sort();

  return {
    blockers: coverage.missing.map((missingItem) =>
      toMissingRuntimeCapabilityBlocker(missingItem),
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
      componentEvidenceIds: [],
      parserRuleIds: [],
    });
  }

  if (card.sourceText.length === 0) {
    if (!hasEmptyEffectSupportMetadata(card)) {
      return unsupportedMetadataEntry({
        card,
        componentEvidenceIds: [],
        diagnosticLayer: undefined,
        message:
          "Normalized card metadata does not satisfy certified empty-effect support preconditions.",
        parserRuleIds: [],
      });
    }

    return supportedVanillaEntry({
      capabilityEvidence: [],
      card,
      componentEvidenceIds: [],
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
      componentEvidenceIds:
        "parsedComponentEvidenceIds" in parseResult
          ? parseResult.parsedComponentEvidenceIds
          : [],
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
      componentEvidenceIds: parseResult.componentEvidenceIds,
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
      componentEvidenceIds: parseResult.componentEvidenceIds,
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
      componentEvidenceIds: parseResult.componentEvidenceIds,
      parseStatus: parseResult.status,
      parserRuleIds: parseResult.parserRuleIds,
    });
  }

  const capabilityCoverage =
    evaluateRuntimeCapabilityCoverageForComponentEvidenceIds({
      matrix:
        input.runtimeCapabilityMatrix ??
        generatedSupportRuntimeCapabilityMatrix,
      componentEvidenceIds: parseResult.componentEvidenceIds,
    });
  const existingCapabilityIds = new Set(
    capabilityCoverage.evidence.map((item) => item.capabilityId),
  );
  const componentRequiredCapabilityIds = new Set(
    parseResult.componentEvidenceIds.flatMap((componentEvidenceId) =>
      listRequiredRuntimeCapabilityIdsForComponentEvidenceId(
        componentEvidenceId,
      ),
    ),
  );
  const conditionCapabilityCoverage =
    evaluateConditionRuntimeCapabilityCoverage(
      parseResult.effectDefinition,
      input.runtimeCapabilityMatrix ?? generatedSupportRuntimeCapabilityMatrix,
      existingCapabilityIds,
      componentRequiredCapabilityIds,
    );
  const missingCapabilityIds = [
    ...new Set([
      ...capabilityCoverage.missingCapabilityIds,
      ...conditionCapabilityCoverage.missingCapabilityIds,
    ]),
  ].sort();
  const capabilityEvidenceWithTrace = withParserRuleTrace({
    capabilityEvidence: [
      ...capabilityCoverage.evidence,
      ...conditionCapabilityCoverage.evidence,
    ],
    parserRuleIds: parseResult.parserRuleIds,
  });
  if (
    capabilityCoverage.missing.length > 0 ||
    conditionCapabilityCoverage.missing.length > 0
  ) {
    return unsupportedEntry({
      blockers: [
        ...capabilityCoverage.blockers,
        ...conditionCapabilityCoverage.blockers,
      ].map((blocker) => ({
        ...blocker,
        schemaValidated: true,
      })),
      card,
      componentEvidenceIds: parseResult.componentEvidenceIds,
      missingCapabilityIds,
      parseStatus: parseResult.status,
      parserRuleIds: parseResult.parserRuleIds,
    });
  }

  if (
    parseResult.effectDefinition.implementationStatus === "vanilla-confirmed"
  ) {
    return supportedVanillaEntry({
      capabilityEvidence: capabilityEvidenceWithTrace,
      card,
      componentEvidenceIds: parseResult.componentEvidenceIds,
      parseStatus: parseResult.status,
      parserRuleIds: parseResult.parserRuleIds,
    });
  }

  const effectDefinitionId = toGeneratedEffectDefinitionId(card.cardId);
  return {
    blockers: [],
    capabilityEvidence: capabilityEvidenceWithTrace,
    cardId: card.cardId,
    componentEvidenceIds: parseResult.componentEvidenceIds,
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

function evaluateConditionRuntimeCapabilityCoverage(
  definition: EffectDefinition,
  matrix: RuntimeCapabilityMatrix,
  existingCapabilityIds: ReadonlySet<string>,
  componentRequiredCapabilityIds: ReadonlySet<string>,
): RuntimeCapabilityCoverageResult {
  const required = collectConditionCapabilityIds(definition.effects);
  const evidence: RuntimeCapabilityEvidence[] = [];
  const missing: RuntimeCapabilityEvidence[] = [];

  for (const capabilityId of required) {
    if (existingCapabilityIds.has(capabilityId)) {
      continue;
    }
    if (componentRequiredCapabilityIds.has(capabilityId)) {
      continue;
    }
    const record = {
      capabilityId,
      component: "condition-expression",
    } satisfies RuntimeCapabilityEvidence;
    if (
      matrix.capabilities.some(
        (cap) => cap.id === capabilityId && cap.supported,
      )
    ) {
      evidence.push(record);
    } else {
      missing.push(record);
    }
  }

  const missingCapabilityIds = [
    ...new Set(missing.map((item) => item.capabilityId)),
  ].sort();
  return {
    blockers: missing.map((item) => toMissingRuntimeCapabilityBlocker(item)),
    evidence: evidence.sort(compareCapabilityEvidence),
    missing: missing.sort(compareCapabilityEvidence),
    missingCapabilityIds,
  };
}

function collectConditionCapabilityIds(
  effects: readonly EffectDefinition["effects"][number][],
): readonly string[] {
  const ids = new Set<string>();
  for (const block of effects) {
    if (block.condition !== undefined) {
      addConditionCapabilityIds(block.condition, ids);
    }
  }
  return [...ids].sort();
}

function addConditionCapabilityIds(
  condition: Condition,
  ids: Set<string>,
): void {
  switch (condition.type) {
    case "yourTurn":
      ids.add("condition:yourTurn");
      return;
    case "attachedDonCount":
      ids.add("condition:selfAttachedDonCount");
      return;
    case "leaderColorCount":
      ids.add("condition:leaderColorCount");
      return;
    case "hasCardInZone":
      if (
        condition.player === "self" &&
        condition.zone === "leaderArea" &&
        condition.filter.categories?.includes("leader")
      ) {
        if (
          (condition.filter.typesAny?.length ?? 0) > 0 ||
          (condition.filter.attributesAny?.length ?? 0) > 0
        ) {
          ids.add("condition:hasCardInZone");
          return;
        }
      }
      ids.add("condition:unsupported-shape");
      return;
    case "handCount":
      ids.add("condition:handCount");
      return;
    case "lifeCount":
      ids.add("condition:lifeCount");
      return;
    case "trashCount":
      if (
        (condition.player === "self" || condition.player === "opponent") &&
        condition.filter === undefined
      ) {
        ids.add("condition:trashCount");
        return;
      }
      ids.add("condition:unsupported-shape");
      return;
    case "fieldCount":
      if (isPublicDonFieldCountCondition(condition)) {
        ids.add("condition:fieldCount:don:public");
        return;
      }
      ids.add("condition:unsupported-shape");
      return;
    case "and":
      ids.add("condition-connector:and");
      for (const child of condition.conditions) {
        addConditionCapabilityIds(child, ids);
      }
      return;
    case "or":
      ids.add("condition-connector:or");
      for (const child of condition.conditions) {
        addConditionCapabilityIds(child, ids);
      }
      return;
    case "not":
    case "custom":
    case "donCount":
    case "opponentTurn":
    case "attackTarget":
    case "cardState":
    case "sourceStillInZone":
    case "eventPayload":
      ids.add("condition:unsupported-shape");
      return;
  }
}

function isPublicDonFieldCountCondition(
  condition: Extract<Condition, { type: "fieldCount" }>,
): boolean {
  const filter = condition.filter;
  return (
    (condition.player === "self" || condition.player === "opponent") &&
    filter !== undefined &&
    Object.keys(filter).length === 1 &&
    filter.categories?.length === 1 &&
    filter.categories[0] === "don"
  );
}

function attachParserDiagnosticDecomposition(
  blockers: readonly GeneratedSupportBlocker[],
  sourceText: string,
): readonly GeneratedSupportBlocker[] {
  return blockers.map((blocker) => {
    if (blocker.code !== "unparsed-span") {
      return blocker;
    }

    const decomposition =
      deriveParserDiagnosticDecomposition(
        blocker.span?.text ?? sourceText,
        sourceText,
      ) ??
      deriveGenericDiagnosticDecomposition(blocker.span?.text ?? sourceText);
    if (decomposition === undefined) {
      return blocker;
    }

    return {
      ...blocker,
      decomposition,
    };
  });
}

function deriveGenericDiagnosticDecomposition(
  sourceText: string,
): GeneratedSupportDiagnosticDecomposition | undefined {
  const scan = scanGenericCardTextDiagnostics(sourceText);
  const recognized = scan.components.filter(
    (component) => component.status !== "unsupported",
  );
  const unsupported = scan.components.filter(
    (component) => component.status === "unsupported",
  );

  if (recognized.length === 0) {
    return undefined;
  }

  return {
    recognizedActionCandidates: recognized
      .filter((component) => component.kind === "action")
      .map((component) => component.text),
    recognizedSyntaxFragments: deriveGenericSyntaxFragments(
      sourceText,
      recognized,
    ),
    recognizedTriggerCandidates: recognized
      .filter((component) => isTriggerLikeComponent(component))
      .map((component) => component.text),
    reason:
      "Parser components were recognized by generic diagnostics, but generated support remains fail-closed for unsupported or uncertified composition.",
    traceComponents: scan.components.map((component) => ({
      id: component.id,
      kind: component.kind,
      span: component.span,
      status: component.status,
      text: component.text,
    })),
    unsupportedConditionFragments: [
      ...unsupported
        .filter((component) => component.kind === "condition")
        .map((component) => component.text),
      ...extractUnsupportedConditionFragments(sourceText),
    ],
    unsupportedSyntaxFragments: unsupported
      .map((component) => component.text)
      .map((text) => `unparsed-fragment:${text}`),
  };
}

function extractUnsupportedConditionFragments(
  sourceText: string,
): readonly string[] {
  const fragments: string[] = [];
  const noOtherNamedCharacter =
    /\byou have no other \[[^\]]+\] Characters\b/i.exec(sourceText)?.[0];
  if (noOtherNamedCharacter !== undefined) {
    fragments.push(noOtherNamedCharacter);
  }
  return fragments;
}

function deriveGenericSyntaxFragments(
  sourceText: string,
  recognized: readonly GenericDiagnosticComponent[],
): readonly string[] {
  const fragments = new Set<string>();
  if (sourceText.includes("]/[")) {
    fragments.add("wrapper:slash");
  }
  if (
    recognized.some(
      (component) =>
        component.kind === "sequence" && /then/i.test(component.text),
    )
  ) {
    fragments.add("sequence:then");
  }
  if (
    recognized.some(
      (component) =>
        component.kind === "modifier" && /[−-]\d+\s+cost/i.test(component.text),
    )
  ) {
    fragments.add("modifier:cost-negative");
  }
  if (
    recognized.some((component) => component.kind === "condition-connector")
  ) {
    fragments.add("condition-components:v1");
  }
  if (recognized.some((component) => component.kind === "cardinality")) {
    fragments.add("cardinality:up-to");
  }
  return [...fragments].sort();
}

function isTriggerLikeComponent(
  component: GenericDiagnosticComponent,
): boolean {
  if (component.kind === "wrapper") {
    return /^\[(on play|when attacking|on k\.o\.|trigger)\]$/i.test(
      component.text,
    );
  }
  if (component.kind === "trigger") {
    return true;
  }
  return false;
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
  componentEvidenceIds,
  parseStatus,
  parserRuleIds,
}: {
  capabilityEvidence: readonly RuntimeCapabilityEvidence[];
  card: GeneratedSupportCardTextInput;
  componentEvidenceIds: readonly string[];
  parseStatus: GeneratedSupportParserResultStatus;
  parserRuleIds: readonly string[];
}): GeneratedSupportIndexEntry {
  return {
    blockers: [],
    capabilityEvidence,
    cardId: card.cardId,
    componentEvidenceIds,
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
  componentEvidenceIds,
  component = "metadata:precondition",
  diagnosticLayer,
  message,
  parserRuleIds,
}: {
  card: GeneratedSupportCardTextInput;
  componentEvidenceIds: readonly string[];
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
    componentEvidenceIds,
    parseStatus: "unsupportedPrimitive",
    parserRuleIds,
  });
}

function unsupportedEntry({
  blockers,
  card,
  componentEvidenceIds,
  missingCapabilityIds = [],
  parseStatus,
  parserRuleIds,
}: {
  blockers: readonly GeneratedSupportBlocker[];
  card: GeneratedSupportCardTextInput;
  componentEvidenceIds: readonly string[];
  missingCapabilityIds?: readonly string[];
  parseStatus: GeneratedSupportParserResultStatus;
  parserRuleIds: readonly string[];
}): GeneratedSupportIndexEntry {
  return {
    blockers,
    capabilityEvidence: [],
    cardId: card.cardId,
    componentEvidenceIds,
    missingCapabilityIds,
    parseStatus,
    parserRuleIds,
    sourceTextHash: card.sourceTextHash,
    status: "unsupported",
  };
}

function resolveCapabilityCoverage({
  componentEvidenceIds,
  matrix,
}: {
  componentEvidenceIds: readonly string[];
  matrix: RuntimeCapabilityMatrix;
}): {
  evidence: readonly RuntimeCapabilityEvidence[];
  missing: readonly RuntimeCapabilityEvidence[];
} {
  const evidence: RuntimeCapabilityEvidence[] = [];
  const missing: RuntimeCapabilityEvidence[] = [];

  for (const componentEvidenceId of componentEvidenceIds) {
    const inventoryEntry =
      findGeneratedSupportComponentEvidenceByShapeId(componentEvidenceId);
    if (inventoryEntry === undefined) {
      missing.push({
        capabilityId: `component-evidence-inventory:${componentEvidenceId}`,
        component: componentEvidenceId,
      });
      continue;
    }

    const capabilityIds = inventoryEntry.runtimeCapabilityIds;
    for (const capabilityId of capabilityIds) {
      if (
        !inventoryEntry.missingRuntimeCapabilityIds?.includes(capabilityId) &&
        hasRuntimeCapability({
          capabilityId,
          component: componentEvidenceId,
          matrix,
        })
      ) {
        evidence.push({ capabilityId, component: componentEvidenceId });
        continue;
      }

      missing.push({ capabilityId, component: componentEvidenceId });
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

  const parserRuleOrder = (left.parserRuleId ?? "").localeCompare(
    right.parserRuleId ?? "",
  );
  if (parserRuleOrder !== 0) {
    return parserRuleOrder;
  }

  return (left.component ?? left.parserRuleId ?? "").localeCompare(
    right.component ?? right.parserRuleId ?? "",
  );
}

function withParserRuleTrace({
  capabilityEvidence,
  parserRuleIds,
}: {
  capabilityEvidence: readonly RuntimeCapabilityEvidence[];
  parserRuleIds: readonly string[];
}): readonly RuntimeCapabilityEvidence[] {
  const parserRuleIdsByComponent = new Map<string, readonly string[]>();
  for (const componentEvidenceId of listComponentEvidenceIdsForParserRuleIds(
    parserRuleIds,
  )) {
    parserRuleIdsByComponent.set(
      componentEvidenceId,
      parserRuleIds.filter((parserRuleId) => {
        const mapped = listComponentEvidenceIdsForParserRuleIds([
          parserRuleId,
        ])[0];
        return mapped === componentEvidenceId;
      }),
    );
  }

  return capabilityEvidence
    .flatMap((evidence) => {
      const mappedParserRuleIds =
        parserRuleIdsByComponent.get(evidence.component ?? "") ?? [];
      return mappedParserRuleIds.length === 0
        ? [evidence]
        : mappedParserRuleIds.map((parserRuleId) => ({
            ...evidence,
            parserRuleId,
          }));
    })
    .sort(compareCapabilityEvidence);
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

function toGeneratedEffectDefinitionId(cardId: CardId): string {
  return `${String(cardId).toLowerCase()}.generated-support`;
}
