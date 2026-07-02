import type { CardFilter } from "@optcg/types";

import { parseUpToCardinality } from "../../cardinality/index.js";
import { parseCardFilterPredicates } from "../../filters/index.js";
import type { PrimitiveEvidence } from "../../types.js";

export type RestedDonAttachmentTarget = {
  readonly evidence: readonly PrimitiveEvidence[];
  readonly filter: CardFilter;
  readonly cardinality?: { readonly min: number; readonly max: number };
  readonly requestZone:
    | { readonly zone: "leaderArea" }
    | { readonly zone: "characterArea" }
    | { readonly zones: ["leaderArea", "characterArea"] };
  readonly savedTargetZone:
    | { readonly zone: "leaderArea" }
    | { readonly zone: "characterArea" }
    | { readonly zones: ["leaderArea", "characterArea"] };
};

export const parseRestedDonAttachmentTarget = (
  targetText: string,
): RestedDonAttachmentTarget | undefined => {
  if (/^(?:(?:1 of )?your|this) Leader\.?$/iu.test(targetText)) {
    return {
      evidence: ["zone:leaderArea", "filter:category:leader"],
      filter: { categories: ["leader"] },
      requestZone: { zones: ["leaderArea", "characterArea"] },
      savedTargetZone: { zones: ["leaderArea", "characterArea"] },
    };
  }
  const namedLeaderMatch = /^your \[(?<name>[^\]]+)\] Leader\.?$/iu.exec(
    targetText,
  );
  const namedLeader = namedLeaderMatch?.groups?.["name"]?.trim();
  if (namedLeader !== undefined && namedLeader.length > 0) {
    return {
      evidence: ["zone:leaderArea", "filter:category:leader", "filter:name"],
      filter: { categories: ["leader"], names: [namedLeader] },
      requestZone: { zones: ["leaderArea", "characterArea"] },
      savedTargetZone: { zones: ["leaderArea", "characterArea"] },
    };
  }
  if (/^(?:your|this) Leader or 1 of your Characters\.?$/iu.test(targetText)) {
    const zoneTarget = {
      zones: ["leaderArea", "characterArea"] as ["leaderArea", "characterArea"],
    };
    return {
      evidence: [
        "zone:leaderArea",
        "zone:characterArea",
        "filter:category:leader",
        "filter:category:character",
      ],
      filter: { categories: ["leader", "character"] },
      requestZone: zoneTarget,
      savedTargetZone: zoneTarget,
    };
  }
  if (
    /^(?:1 of your Leader or Character cards?|1 of your Leaders? or Characters?)\.?$/iu.test(
      targetText,
    )
  ) {
    const zoneTarget = {
      zones: ["leaderArea", "characterArea"] as ["leaderArea", "characterArea"],
    };
    return {
      evidence: [
        "zone:leaderArea",
        "zone:characterArea",
        "filter:category:leader",
        "filter:category:character",
      ],
      filter: { categories: ["leader", "character"] },
      requestZone: zoneTarget,
      savedTargetZone: zoneTarget,
    };
  }
  const typeIncludingLeaderOrCharacter =
    parseTypeIncludingLeaderOrCharacterAttachmentTarget(targetText);
  if (typeIncludingLeaderOrCharacter !== undefined) {
    return typeIncludingLeaderOrCharacter;
  }
  const targetCardinality = parseUpToCardinality({ text: targetText });
  const normalizedTargetText = (
    targetCardinality === undefined ? targetText : targetCardinality.rest
  ).replace(/^(?:of )?(?:1 of )?your /iu, "");
  const parsed = parseCardFilterPredicates(
    { text: normalizedTargetText },
    { powerSemantics: "current" },
  );
  const rest = parsed?.rest.trim().replace(/\.$/u, "");
  if (parsed === undefined || rest !== "") {
    return undefined;
  }
  const categories = parsed.filter.categories ?? [];
  const nameOnlyCardsTarget =
    categories.length === 0 && (parsed.filter.names?.length ?? 0) > 0;
  const supportsCharacters =
    nameOnlyCardsTarget || categories.includes("character");
  const supportsLeaders = nameOnlyCardsTarget || categories.includes("leader");
  if (!supportsCharacters && !supportsLeaders) {
    return undefined;
  }
  const filter = nameOnlyCardsTarget
    ? ({
        ...parsed.filter,
        categories: ["leader", "character"],
      } satisfies CardFilter)
    : parsed.filter;
  const requestZone =
    supportsLeaders && supportsCharacters
      ? {
          zones: ["leaderArea", "characterArea"] as [
            "leaderArea",
            "characterArea",
          ],
        }
      : supportsLeaders
        ? { zone: "leaderArea" as const }
        : { zone: "characterArea" as const };
  const leaderEvidence: PrimitiveEvidence[] = supportsLeaders
    ? ["zone:leaderArea"]
    : [];
  const characterEvidence: PrimitiveEvidence[] = supportsCharacters
    ? ["zone:characterArea"]
    : [];
  const inferredCategoryEvidence: PrimitiveEvidence[] = nameOnlyCardsTarget
    ? ["filter:category:leader", "filter:category:character"]
    : [];

  return {
    evidence: [
      ...leaderEvidence,
      ...characterEvidence,
      ...inferredCategoryEvidence,
      ...(targetCardinality?.evidence ?? []),
      ...parsed.evidence,
    ],
    filter,
    ...(targetCardinality === undefined
      ? {}
      : { cardinality: targetCardinality.cardinality }),
    requestZone,
    savedTargetZone: requestZone,
  };
};

function parseTypeIncludingLeaderOrCharacterAttachmentTarget(
  targetText: string,
): RestedDonAttachmentTarget | undefined {
  const match =
    /^your Leader with a type including "(?<leaderType>[^"]+)" or 1 (?:of your )?Characters? with a type including "(?<characterType>[^"]+)"\.?$/iu.exec(
      targetText,
    );
  const leaderType = match?.groups?.["leaderType"]?.trim();
  const characterType = match?.groups?.["characterType"]?.trim();
  if (
    leaderType === undefined ||
    characterType === undefined ||
    leaderType.length === 0 ||
    leaderType !== characterType
  ) {
    return undefined;
  }

  const parsed = parseCardFilterPredicates({
    text: `with a type including "${leaderType}"`,
  });
  if (parsed === undefined || parsed.rest.trim() !== "") {
    return undefined;
  }

  const zoneTarget = {
    zones: ["leaderArea", "characterArea"] as ["leaderArea", "characterArea"],
  };
  return {
    evidence: [
      "zone:leaderArea",
      "zone:characterArea",
      "filter:category:leader",
      "filter:category:character",
      ...parsed.evidence,
    ],
    filter: {
      categories: ["leader", "character"],
      ...parsed.filter,
    },
    requestZone: zoneTarget,
    savedTargetZone: zoneTarget,
  };
}
