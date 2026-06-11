import { parseYourFieldReplacementTarget } from "../../targets/replacement-targets.js";
import { parseInsteadEffect } from "./instead-effects/index.js";
import type { ReplacementTriggerParseResult } from "./shared.js";

export function parseOpponentKoReplacement(
  text: string,
): ReplacementTriggerParseResult | undefined {
  const match =
    /^If (?<target>.+?) would be K\.O\.'d(?: by your opponent(?<effectOnly>'s effects?))?,\s*(?<body>.+)$/i.exec(
      text.trim(),
    );
  const targetText = match?.groups?.["target"];
  const effectOnlyText = match?.groups?.["effectOnly"];
  const bodyText = match?.groups?.["body"];
  if (targetText === undefined || bodyText === undefined) {
    return undefined;
  }

  const normalizedTargetText = normalizeFieldRemovalTargetText(targetText);
  const target = parseYourFieldReplacementTarget({
    text: normalizedTargetText,
  });
  if (
    target === undefined ||
    target.rest.length > 0 ||
    (target.target.type !== "all" && target.target.type !== "self")
  ) {
    return undefined;
  }
  const instead = parseInsteadEffect(bodyText);
  if (instead === undefined) {
    return undefined;
  }

  return {
    when: {
      type: "wouldBeKOd",
      ...(effectOnlyText === undefined && !/by your opponent/i.test(text)
        ? { sourceControllerRelation: "any" as const }
        : {}),
      ...(effectOnlyText === undefined ? {} : { sourceKind: "cardEffect" }),
      target: target.target,
    },
    instead: instead.effect,
    evidence: [
      "replacement:wouldBeKOd",
      ...(/by your opponent/i.test(text)
        ? (["replacementSource:opponent"] as const)
        : []),
      ...(effectOnlyText === undefined
        ? []
        : ["replacementSource:cardEffect" as const]),
      ...target.evidence,
      ...instead.evidence,
    ],
  };
}

export function parseOpponentFieldRemovalReplacement(
  text: string,
): ReplacementTriggerParseResult | undefined {
  const match =
    /^If (?<target>.+?) would be removed from the field by your opponent(?<effectOnly>'s effects?)?,\s*(?<body>.+)$/i.exec(
      text.trim(),
    );
  const targetText = match?.groups?.["target"];
  const effectOnlyText = match?.groups?.["effectOnly"];
  const bodyText = match?.groups?.["body"];
  if (targetText === undefined || bodyText === undefined) {
    return undefined;
  }

  const normalizedTargetText = normalizeFieldRemovalTargetText(targetText);
  const target = parseYourFieldReplacementTarget({
    text: normalizedTargetText,
  });
  if (
    target === undefined ||
    target.rest.length > 0 ||
    (target.target.type !== "all" && target.target.type !== "self")
  ) {
    return undefined;
  }
  const instead = parseInsteadEffect(bodyText);
  if (instead === undefined) {
    return undefined;
  }

  return {
    when: {
      type: "wouldMoveZone",
      from:
        target.target.type === "self" ? "characterArea" : target.target.zone,
      ...(effectOnlyText === undefined ? {} : { sourceKind: "cardEffect" }),
      sourceControllerRelation: "opponentControlled",
      target: target.target,
    },
    instead: instead.effect,
    evidence: [
      "replacement:wouldMoveZone",
      "replacement:fieldRemoval",
      "replacementSource:opponent",
      ...(effectOnlyText === undefined
        ? []
        : ["replacementSource:cardEffect" as const]),
      ...target.evidence,
      ...instead.evidence,
    ],
  };
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
