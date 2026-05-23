import type { GeneratedSupportComponentEvidenceCategory } from "./generated-support-types.js";

const parserCertificationIdBoundaryAliases: Record<string, string> = {
  "activate-main-wrapper": "wrapper",
  body: "body",
  "body-action": "body",
  cardinality: "cardinality",
  chooser: "chooser",
  composition: "composition",
  condition: "condition",
  cost: "cost",
  "cost-alternative": "cost",
  "cost-body-separator": "cost",
  "cost-connector": "cost",
  duration: "duration",
  effect: "body",
  filter: "filter",
  marker: "marker",
  "optional-cost-marker": "marker",
  "optional-cost-wrapper": "wrapper",
  "saved-target-ko-consumer": "target",
  "search-window": "target",
  source: "source-presence-policy",
  "source-presence-policy": "source-presence-policy",
  target: "target",
  "target-filter": "target",
  trigger: "wrapper",
  "trigger-wrapper": "wrapper",
  value: "value",
  visibility: "visibility",
  wrapper: "wrapper",
};

function toPrimitiveBoundaryFamily(family: string): string | undefined {
  const normalized = parserCertificationIdBoundaryAliases[family];
  if (normalized !== undefined) {
    return normalized;
  }
  if (family.endsWith("wrapper")) {
    return "wrapper";
  }
  return undefined;
}

export function listPrimitiveBoundaryLabelsForComponents(
  components: readonly GeneratedSupportComponentEvidenceCategory[],
): readonly string[] {
  const primitiveBoundaries = new Set<string>();
  for (const component of components) {
    if (component === "wrapper") {
      primitiveBoundaries.add("wrapper");
      continue;
    }
    if (component === "body-action") {
      primitiveBoundaries.add("body");
      continue;
    }
    if (component === "sequence") {
      primitiveBoundaries.add("composition");
      continue;
    }
    if (
      component === "cost" ||
      component === "condition" ||
      component === "chooser" ||
      component === "target" ||
      component === "cardinality" ||
      component === "duration" ||
      component === "modifier" ||
      component === "restriction" ||
      component === "saved-reference" ||
      component === "source-presence-policy"
    ) {
      primitiveBoundaries.add(component);
    }
  }
  return [...primitiveBoundaries].sort();
}

export function listPrimitiveBoundaryLabels({
  components,
  parserCertificationIds,
}: {
  components: readonly GeneratedSupportComponentEvidenceCategory[];
  parserCertificationIds: readonly string[];
}): readonly string[] {
  const fromCertificationIds = new Set<string>();
  for (const parserCertificationId of parserCertificationIds) {
    const family = parserCertificationId.split(":")[0];
    if (family === undefined) {
      continue;
    }
    const normalized = toPrimitiveBoundaryFamily(family);
    if (normalized !== undefined) {
      fromCertificationIds.add(normalized);
    }
  }

  const merged = new Set<string>([
    ...fromCertificationIds,
    ...listPrimitiveBoundaryLabelsForComponents(components),
  ]);
  return [...merged].sort();
}
