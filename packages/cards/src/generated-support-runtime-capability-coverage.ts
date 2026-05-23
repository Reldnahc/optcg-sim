import type { Condition, EffectDefinition } from "@optcg/types";
import {
  type GeneratedSupportBlocker,
  findGeneratedSupportComponentEvidenceByShapeId,
  listComponentEvidenceIdsForParserRuleIds,
} from "./generated-support-types.js";
import {
  generatedSupportRuntimeCapabilityMatrix,
  type RuntimeCapabilityMatrix,
} from "./runtime-capability-matrix.js";

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

export function evaluateRuntimeCapabilityCoverageForParserRuleIds({
  matrix = generatedSupportRuntimeCapabilityMatrix,
  parserRuleIds,
}: {
  matrix?: RuntimeCapabilityMatrix;
  parserRuleIds: readonly string[];
}): RuntimeCapabilityCoverageResult {
  void matrix;
  const missing = parserRuleIds.map((parserRuleId) => ({
    capabilityId: `parser-rule-mapping:${parserRuleId}`,
    component: parserRuleId,
    parserRuleId,
  }));
  const missingCapabilityIds = [
    ...new Set(missing.map((missingItem) => missingItem.capabilityId)),
  ].sort();

  return {
    blockers: missing.map((missingItem) =>
      toMissingRuntimeCapabilityBlocker(missingItem),
    ),
    evidence: [],
    missing: missing.sort(compareCapabilityEvidence),
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

export function evaluateConditionRuntimeCapabilityCoverage(
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
        (capability) => capability.id === capabilityId && capability.supported,
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

export function withParserRuleTrace({
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
