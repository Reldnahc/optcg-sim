import { parseYourFieldReplacementTarget } from "../../targets/replacement-targets.js";
import { parseInsteadEffect } from "./instead-effects/index.js";
import type { ReplacementTriggerParseResult } from "./shared.js";

export function parseCombinedKoOrFieldRemovalReplacement(
  text: string,
): ReplacementTriggerParseResult | undefined {
  const match =
    /^If (?<target>.+?) would be K\.O\.'d or would be removed from the field by your opponent(?<effectOnly>'s effects?)?,\s*(?<body>.+)$/i.exec(
      text.trim(),
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

  const target = parseYourFieldReplacementTarget({
    text: normalizeFieldRemovalTargetText(targetText),
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

  const koWhen = {
    type: "wouldBeKOd" as const,
    sourceControllerRelation: "any" as const,
    target: target.target,
  };
  const fieldRemovalWhen = {
    type: "wouldMoveZone" as const,
    from: target.target.type === "self" ? "characterArea" : target.target.zone,
    sourceKind: "cardEffect" as const,
    sourceControllerRelation: "opponentControlled" as const,
    target: target.target,
  };
  return {
    when: {
      type: "anyOf",
      replacements: [koWhen, fieldRemovalWhen],
    },
    instead: instead.effect,
    evidence: [
      "composition:triggerAnyOf",
      "replacement:wouldBeKOd",
      "replacement:wouldMoveZone",
      "replacement:fieldRemoval",
      "replacementSource:opponent",
      "replacementSource:cardEffect",
      ...target.evidence,
      ...instead.evidence,
    ],
  };
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
      ...(anyEffectText !== undefined ||
      (opponentEffectOnlyText === undefined && !/by your opponent/i.test(text))
        ? { sourceControllerRelation: "any" as const }
        : {}),
      ...(hasCardEffectSource ? { sourceKind: "cardEffect" as const } : {}),
      target: target.target,
    },
    instead: instead.effect,
    evidence: [
      "replacement:wouldBeKOd",
      ...(/by your opponent/i.test(text)
        ? (["replacementSource:opponent"] as const)
        : []),
      ...(hasCardEffectSource
        ? (["replacementSource:cardEffect"] as const)
        : []),
      ...target.evidence,
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

  const target = parseYourFieldReplacementTarget({
    text: normalizeFieldRemovalTargetText(targetText),
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
      sourceKind: "battle",
      target: target.target,
    },
    instead: instead.effect,
    evidence: [
      "replacement:wouldBeKOd",
      "protectionSource:battle",
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

export function parseAnyFieldRemovalReplacement(
  text: string,
): ReplacementTriggerParseResult | undefined {
  const match =
    /^If (?<target>.+?) would be removed from the field,\s*(?<body>.+)$/i.exec(
      text.trim(),
    );
  const targetText = match?.groups?.["target"];
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
      sourceControllerRelation: "any",
      target: target.target,
    },
    instead: instead.effect,
    evidence: [
      "replacement:wouldMoveZone",
      "replacement:fieldRemoval",
      "replacementSource:any",
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
