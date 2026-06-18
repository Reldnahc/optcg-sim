import type { Effect, Target, Zone } from "@optcg/types";

import { parseYourFieldReplacementTarget } from "../../targets/replacement-targets.js";
import type { PrimitiveEvidence } from "../../types.js";
import { parseInsteadEffect } from "./instead-effects/index.js";
import type { ReplacementTriggerParseResult } from "./shared.js";

export function parseCombinedKoOrFieldRemovalReplacement(
  text: string,
): ReplacementTriggerParseResult | undefined {
  const trimmed = text.trim();
  const match =
    /^If (?<target>.+?) would be K\.O\.'d or would (?:be removed from|leave) the field by your opponent(?<effectOnly>'s effects?)?,\s*(?<body>.+)$/i.exec(
      trimmed,
    ) ??
    /^If (?<target>.+?) would (?:be removed from|leave) the field by your opponent(?<effectOnly>'s effects?)? or (?:would be )?K\.O\.'d,\s*(?<body>.+)$/i.exec(
      trimmed,
    );
  const targetText = match?.groups?.["target"];
  const effectOnlyText = match?.groups?.["effectOnly"];
  const bodyText = match?.groups?.["body"];
  if (
    targetText === undefined ||
    effectOnlyText === undefined ||
    bodyText === undefined
  ) {
    return undefined;
  }

  const parts = parseFieldReplacementParts(targetText, bodyText);
  if (parts === undefined) {
    return undefined;
  }

  const koWhen = {
    type: "wouldBeKOd" as const,
    sourceControllerRelation: "any" as const,
    target: parts.target,
  };
  const fieldRemovalWhen = {
    type: "wouldMoveZone" as const,
    from: fieldReplacementTargetZone(parts.target),
    sourceKind: "cardEffect" as const,
    sourceControllerRelation: "opponentControlled" as const,
    target: parts.target,
  };

  return buildReplacementTriggerResult({
    parts,
    when: {
      type: "anyOf",
      replacements: [koWhen, fieldRemovalWhen],
    },
    evidence: [
      "composition:triggerAnyOf",
      "replacement:wouldBeKOd",
      "replacement:wouldMoveZone",
      "replacement:fieldRemoval",
      "replacementSource:opponent",
      "replacementSource:cardEffect",
    ],
  });
}

export function parseOpponentKoReplacement(
  text: string,
): ReplacementTriggerParseResult | undefined {
  const battle = parseBattleKoReplacement(text);
  if (battle !== undefined) {
    return battle;
  }

  const match =
    /^If (?<target>.+?) would be K\.O\.'d(?: by (?:(?<anyEffect>an effect)|your opponent(?<opponentEffectOnly>'s effects?)))?,\s*(?<body>.+)$/i.exec(
      text.trim(),
    );
  const targetText = match?.groups?.["target"];
  const anyEffectText = match?.groups?.["anyEffect"];
  const opponentEffectOnlyText = match?.groups?.["opponentEffectOnly"];
  const bodyText = match?.groups?.["body"];
  if (targetText === undefined || bodyText === undefined) {
    return undefined;
  }
  const hasCardEffectSource =
    anyEffectText !== undefined || opponentEffectOnlyText !== undefined;

  const parts = parseFieldReplacementParts(targetText, bodyText);
  if (parts === undefined) {
    return undefined;
  }

  return buildReplacementTriggerResult({
    parts,
    when: {
      type: "wouldBeKOd",
      ...(anyEffectText !== undefined ||
      (opponentEffectOnlyText === undefined && !/by your opponent/i.test(text))
        ? { sourceControllerRelation: "any" as const }
        : {}),
      ...(hasCardEffectSource ? { sourceKind: "cardEffect" as const } : {}),
      target: parts.target,
    },
    evidence: [
      "replacement:wouldBeKOd",
      ...(/by your opponent/i.test(text)
        ? (["replacementSource:opponent"] as const)
        : []),
      ...(hasCardEffectSource
        ? (["replacementSource:cardEffect"] as const)
        : []),
    ],
  });
}

export function parseOpponentRestReplacement(
  text: string,
): ReplacementTriggerParseResult | undefined {
  const match =
    /^If this Character would be rested by your opponent's (?<source>Leader|Character|Event|Stage)'s effect,\s*(?<body>.+)$/iu.exec(
      text.trim(),
    );
  const sourceText = match?.groups?.["source"]?.toLowerCase();
  const bodyText = match?.groups?.["body"];
  if (
    (sourceText !== "leader" &&
      sourceText !== "character" &&
      sourceText !== "event" &&
      sourceText !== "stage") ||
    bodyText === undefined
  ) {
    return undefined;
  }
  const instead = parseInsteadEffect(bodyText);
  if (instead === undefined) {
    return undefined;
  }
  const sourceCategory =
    sourceText === "leader"
      ? "leader"
      : sourceText === "character"
        ? "character"
        : sourceText === "event"
          ? "event"
          : "stage";

  return {
    when: {
      type: "wouldBeRested",
      sourceKind: "cardEffect",
      sourceControllerRelation: "opponentControlled",
      sourceCardFilter: { categories: [sourceCategory] },
      target: { type: "self" },
    },
    instead: instead.effect,
    optional: instead.optional ?? true,
    evidence: [
      "replacement:wouldBeRested",
      "replacementSource:opponent",
      "replacementSource:cardEffect",
      `filter:category:${sourceCategory}` as const,
      ...instead.evidence,
    ],
  };
}

function parseBattleKoReplacement(
  text: string,
): ReplacementTriggerParseResult | undefined {
  const match =
    /^If (?<target>.+?) would be K\.O\.'d in battle,\s*(?<body>.+)$/i.exec(
      text.trim(),
    );
  const targetText = match?.groups?.["target"];
  const bodyText = match?.groups?.["body"];
  if (targetText === undefined || bodyText === undefined) {
    return undefined;
  }

  const parts = parseFieldReplacementParts(targetText, bodyText);
  if (parts === undefined) {
    return undefined;
  }

  return buildReplacementTriggerResult({
    parts,
    when: {
      type: "wouldBeKOd",
      sourceKind: "battle",
      target: parts.target,
    },
    evidence: ["replacement:wouldBeKOd", "protectionSource:battle"],
  });
}

export function parseOpponentFieldRemovalReplacement(
  text: string,
): ReplacementTriggerParseResult | undefined {
  const match =
    /^If (?<target>.+?) would (?:be removed from|leave) the field by your opponent(?<effectOnly>'s effects?)?,\s*(?<body>.+)$/i.exec(
      text.trim(),
    );
  const targetText = match?.groups?.["target"];
  const effectOnlyText = match?.groups?.["effectOnly"];
  const bodyText = match?.groups?.["body"];
  if (targetText === undefined || bodyText === undefined) {
    return undefined;
  }

  const parts = parseFieldReplacementParts(targetText, bodyText);
  if (parts === undefined) {
    return undefined;
  }

  return buildReplacementTriggerResult({
    parts,
    when: {
      type: "wouldMoveZone",
      from: fieldReplacementTargetZone(parts.target),
      ...(effectOnlyText === undefined ? {} : { sourceKind: "cardEffect" }),
      sourceControllerRelation: "opponentControlled",
      target: parts.target,
    },
    evidence: [
      "replacement:wouldMoveZone",
      "replacement:fieldRemoval",
      "replacementSource:opponent",
      ...(effectOnlyText === undefined
        ? []
        : ["replacementSource:cardEffect" as const]),
    ],
  });
}

export function parseAnyFieldRemovalReplacement(
  text: string,
): ReplacementTriggerParseResult | undefined {
  const match =
    /^If (?<target>.+?) would (?:be removed from|leave) the field,\s*(?<body>.+)$/i.exec(
      text.trim(),
    );
  const targetText = match?.groups?.["target"];
  const bodyText = match?.groups?.["body"];
  if (targetText === undefined || bodyText === undefined) {
    return undefined;
  }

  const parts = parseFieldReplacementParts(targetText, bodyText);
  if (parts === undefined) {
    return undefined;
  }

  return buildReplacementTriggerResult({
    parts,
    when: {
      type: "wouldMoveZone",
      from: fieldReplacementTargetZone(parts.target),
      sourceControllerRelation: "any",
      target: parts.target,
    },
    evidence: [
      "replacement:wouldMoveZone",
      "replacement:fieldRemoval",
      "replacementSource:any",
    ],
  });
}

type FieldReplacementTarget =
  | Extract<Target, { type: "all" }>
  | Extract<Target, { type: "self" }>;

interface FieldReplacementParts {
  readonly target: FieldReplacementTarget;
  readonly instead: Effect;
  readonly optional: boolean;
  readonly targetEvidence: readonly PrimitiveEvidence[];
  readonly insteadEvidence: readonly PrimitiveEvidence[];
}

function parseFieldReplacementParts(
  targetText: string,
  bodyText: string,
): FieldReplacementParts | undefined {
  const target = parseYourFieldReplacementTarget({
    text: normalizeFieldRemovalTargetText(targetText),
  });
  if (
    target === undefined ||
    target.rest.length > 0 ||
    !isSupportedFieldReplacementTarget(target.target)
  ) {
    return undefined;
  }

  const instead = parseInsteadEffect(bodyText);
  if (instead === undefined) {
    return undefined;
  }

  return {
    target: target.target,
    instead: instead.effect,
    optional: instead.optional ?? true,
    targetEvidence: target.evidence,
    insteadEvidence: instead.evidence,
  };
}

function buildReplacementTriggerResult(options: {
  readonly when: ReplacementTriggerParseResult["when"];
  readonly parts: FieldReplacementParts;
  readonly evidence: readonly PrimitiveEvidence[];
}): ReplacementTriggerParseResult {
  return {
    when: options.when,
    instead: options.parts.instead,
    optional: options.parts.optional,
    evidence: [
      ...options.evidence,
      ...options.parts.targetEvidence,
      ...options.parts.insteadEvidence,
    ],
  };
}

function isSupportedFieldReplacementTarget(
  target: Target,
): target is FieldReplacementTarget {
  return target.type === "all" || target.type === "self";
}

function fieldReplacementTargetZone(target: FieldReplacementTarget): Zone {
  return target.type === "self" ? "characterArea" : target.zone;
}

function normalizeFieldRemovalTargetText(text: string): string {
  const trimmed = text.trim();
  const ownedSubject = /^you have an?\s+(?<predicate>.+?)\s+that$/i.exec(
    trimmed,
  );
  const predicate = ownedSubject?.groups?.["predicate"];
  if (predicate !== undefined) {
    return `your ${predicate}`;
  }

  const oneOfYourPredicate = /^one of your\s+(?<predicate>.+)$/i.exec(trimmed)
    ?.groups?.["predicate"];
  if (oneOfYourPredicate !== undefined) {
    return `your ${oneOfYourPredicate}`;
  }

  return trimmed;
}
