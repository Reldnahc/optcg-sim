import type {
  CompleteGeneratedSupportParseResult,
  GeneratedSupportBlocker,
  GeneratedSupportParserCertificationEvidence,
} from "./generated-support-types.js";
import {
  conditionalContinuousCompositionNonBaseParserRuleIds,
  listConditionalContinuousConditionPrimitiveCertificationIds,
} from "./conditional-continuous-composition-evidence.js";
import { evaluateParserCertificationBlockers } from "./generated-support-types.js";

export const externalDeckConstructionRuleParserRuleId =
  "exact:external-deck-rule:category-cost-gte-in-your-deck";
const externalDeckConstructionRuleCertificationId =
  "non-runtime:external-deck-construction-rule";
const externalDeckConstructionRuleComponentId =
  "external-deck-rule-category-cost-gte-in-your-deck";

export interface ExternalDeckConstructionRuleEvidence {
  categoryPlural: string;
  comparator: "gte";
  deckScope: "your-deck";
  normalizedCategory: "event" | "stage";
  nonRuntimeClassification: "external-deck-construction-rule";
  parserRuleId: typeof externalDeckConstructionRuleParserRuleId;
  threshold: number;
}

export interface ParsedExternalDeckConstructionRuleClause {
  readonly nonRuntimeEvidence: ExternalDeckConstructionRuleEvidence;
  readonly parserRuleId: typeof externalDeckConstructionRuleParserRuleId;
}

const supportedCategoryMap = {
  Events: "event",
  Stages: "stage",
} as const satisfies Record<
  string,
  ExternalDeckConstructionRuleEvidence["normalizedCategory"]
>;

const externalDeckConstructionRulePattern =
  /^Under the rules of this game, you cannot include (?<categoryPlural>Events|Stages) with a cost of (?<threshold>\d+) or more in your deck\.$/;

function toNormalizedCategory(
  categoryPlural: "Events" | "Stages",
): ExternalDeckConstructionRuleEvidence["normalizedCategory"] {
  return categoryPlural === "Events" ? "event" : "stage";
}

export function parseExternalDeckConstructionRuleClause(
  sourceText: string,
): ParsedExternalDeckConstructionRuleClause | undefined {
  const match = externalDeckConstructionRulePattern.exec(sourceText);
  const categoryPlural = match?.groups?.["categoryPlural"];
  const thresholdText = match?.groups?.["threshold"];
  if (categoryPlural === undefined || thresholdText === undefined) {
    return undefined;
  }

  if (!Object.hasOwn(supportedCategoryMap, categoryPlural)) {
    return undefined;
  }
  const normalizedCategory = toNormalizedCategory(
    categoryPlural as keyof typeof supportedCategoryMap,
  );

  const threshold = Number.parseInt(thresholdText, 10);
  if (
    !Number.isSafeInteger(threshold) ||
    threshold < 0 ||
    String(threshold) !== thresholdText
  ) {
    return undefined;
  }

  return {
    nonRuntimeEvidence: {
      categoryPlural,
      comparator: "gte",
      deckScope: "your-deck",
      nonRuntimeClassification: "external-deck-construction-rule",
      normalizedCategory,
      parserRuleId: externalDeckConstructionRuleParserRuleId,
      threshold,
    },
    parserRuleId: externalDeckConstructionRuleParserRuleId,
  };
}

export function isExternalDeckConstructionRuleParserRuleId(
  parserRuleId: string,
): boolean {
  return parserRuleId === externalDeckConstructionRuleParserRuleId;
}

export function hasOnlyExternalDeckConstructionRuleParserRuleIds(
  parserRuleIds: readonly string[],
): boolean {
  return (
    parserRuleIds.length > 0 &&
    parserRuleIds.every(isExternalDeckConstructionRuleParserRuleId)
  );
}

export function evaluateExternalDeckRuleParserCertificationBlockers({
  evidence,
  nonRuntimeEvidence,
  parserRuleIds,
}: {
  evidence: GeneratedSupportParserCertificationEvidence | undefined;
  nonRuntimeEvidence: CompleteGeneratedSupportParseResult["nonRuntimeEvidence"];
  parserRuleIds: readonly string[];
}): readonly GeneratedSupportBlocker[] {
  const hasExternalDeckRule =
    parserRuleIds.includes(externalDeckConstructionRuleParserRuleId) &&
    (nonRuntimeEvidence ?? []).length > 0;
  if (!hasExternalDeckRule) {
    return [];
  }
  const current = new Set(evidence?.currentCertificationIds ?? []);
  const stale = new Set(evidence?.staleCertificationIds ?? []);
  const isStale = stale.has(externalDeckConstructionRuleCertificationId);
  return isStale || !current.has(externalDeckConstructionRuleCertificationId)
    ? [
        {
          code: "unsupported-primitive",
          component: externalDeckConstructionRuleComponentId,
          diagnosticLayer: "review",
          message: `${isStale ? "Stale" : "Missing"} parser certification ${externalDeckConstructionRuleCertificationId} for component ${externalDeckConstructionRuleComponentId}.`,
        },
      ]
    : [];
}

export function evaluateParserCertificationBlockersForParseResult(
  parseResult: CompleteGeneratedSupportParseResult,
  evidence: GeneratedSupportParserCertificationEvidence | undefined,
): readonly GeneratedSupportBlocker[] {
  return [
    ...evaluateParserCertificationBlockers(
      parseResult.componentEvidenceIds,
      evidence,
    ),
    ...evaluateExternalDeckRuleParserCertificationBlockers({
      evidence,
      nonRuntimeEvidence: parseResult.nonRuntimeEvidence,
      parserRuleIds: parseResult.parserRuleIds,
    }),
    ...evaluateConditionalContinuousConditionParserCertificationBlockers({
      evidence,
      parseResult,
    }),
  ];
}

function evaluateConditionalContinuousConditionParserCertificationBlockers({
  evidence,
  parseResult,
}: {
  evidence: GeneratedSupportParserCertificationEvidence | undefined;
  parseResult: CompleteGeneratedSupportParseResult;
}): readonly GeneratedSupportBlocker[] {
  const nonBaseRuleIdSet = new Set<string>(
    conditionalContinuousCompositionNonBaseParserRuleIds,
  );
  const hasNonBaseConditionalContinuousRule = parseResult.parserRuleIds.some(
    (id) => nonBaseRuleIdSet.has(id),
  );
  if (!hasNonBaseConditionalContinuousRule) {
    return [];
  }

  const current = new Set(evidence?.currentCertificationIds ?? []);
  const stale = new Set(evidence?.staleCertificationIds ?? []);
  const component =
    parseResult.componentEvidenceIds.find((id) =>
      id.startsWith("conditional-continuous-condition-body-part-composition-"),
    ) ?? "conditional-continuous-condition-body-part-composition";
  const conditionCertificationIds =
    listConditionalContinuousConditionPrimitiveCertificationIds(
      parseResult.effectDefinition.effects.find(
        (effect) => effect.trigger.type === "permanent",
      )?.condition,
    );

  return conditionCertificationIds.flatMap((id) => {
    const isStale = stale.has(id);
    return isStale || !current.has(id)
      ? [
          {
            code: "unsupported-primitive",
            component,
            diagnosticLayer: "review",
            message: `${isStale ? "Stale" : "Missing"} parser certification ${id} for component ${component} (primitive boundaries: condition).`,
          },
        ]
      : [];
  });
}
