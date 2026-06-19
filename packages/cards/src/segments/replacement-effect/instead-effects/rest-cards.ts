import type { CardFilter, PlayerRef, Zone } from "@optcg/types";

import { parseCardFilterPredicates } from "../../../filters/index.js";
import type { PrimitiveEvidence } from "../../../types.js";
import type { ReplacementInsteadParseResult } from "../shared.js";

export function parseRestCardsInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  const leaderOrNamedCard = parseLeaderOrNamedCardRestInstead(text);
  if (leaderOrNamedCard !== undefined) {
    return leaderOrNamedCard;
  }

  const namedLeader = parseNamedLeaderRestInstead(text);
  if (namedLeader !== undefined) {
    return namedLeader;
  }

  const match =
    /^you may rest (?<quantity>up to [1-9]\d*|[1-9]\d*) of (?<owner>your|your opponent's) (?<target>cards|Characters) instead\.?$/i.exec(
      text.trim(),
    );
  const quantityText = match?.groups?.["quantity"];
  const ownerText = match?.groups?.["owner"];
  const targetText = match?.groups?.["target"];
  if (
    quantityText === undefined ||
    ownerText === undefined ||
    targetText === undefined
  ) {
    return parseFilteredRestInstead(text);
  }
  const cardinality = parseRestCardinality(quantityText);
  const owner = parseRestOwner(ownerText);
  if (owner === undefined || cardinality === undefined) {
    return undefined;
  }
  const target = targetText.toLowerCase();
  const zones: Zone[] =
    target === "characters"
      ? ["characterArea"]
      : ["leaderArea", "characterArea", "stageArea", "costArea"];

  return {
    effect: {
      type: "rest",
      target: {
        type: "chooseFromZones",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: owner.player,
          zones,
          min: cardinality.min,
          max: cardinality.max,
          allowFewerIfUnavailable: cardinality.allowFewerIfUnavailable,
          visibility: "public",
        },
      },
    },
    evidence: [
      "instruction:rest",
      target === "characters" ? owner.characterEvidence : owner.cardEvidence,
      ...(target === "characters" ? [] : (["zone:leaderArea"] as const)),
      "zone:characterArea",
      ...(target === "characters"
        ? []
        : (["zone:stageArea", "zone:costArea"] as const)),
      cardinality.evidence,
      "count:positiveInteger",
    ],
  };
}

function parseFilteredRestInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  const match =
    /^you may rest (?<quantity>up to [1-9]\d*|[1-9]\d*) of (?<owner>your|your opponent's) (?<target>.+?) instead\.?$/iu.exec(
      text.trim(),
    );
  const quantityText = match?.groups?.["quantity"];
  const ownerText = match?.groups?.["owner"];
  const targetText = match?.groups?.["target"];
  if (
    quantityText === undefined ||
    ownerText === undefined ||
    targetText === undefined
  ) {
    return undefined;
  }

  const owner = parseRestOwner(ownerText);
  if (owner === undefined) {
    return undefined;
  }

  const parsedTarget = parseRestTargetFilter(targetText, owner);
  const cardinality = parseRestCardinality(quantityText);
  if (parsedTarget === undefined || cardinality === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "rest",
      target: {
        type: "chooseFromZones",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: owner.player,
          zones: parsedTarget.zones,
          min: cardinality.min,
          max: cardinality.max,
          allowFewerIfUnavailable: cardinality.allowFewerIfUnavailable,
          visibility: "public",
          filter: parsedTarget.filter,
        },
      },
    },
    evidence: [
      "instruction:rest",
      ...parsedTarget.evidence,
      cardinality.evidence,
      "count:positiveInteger",
    ],
  };
}

function parseRestCardinality(text: string):
  | {
      readonly allowFewerIfUnavailable: boolean;
      readonly evidence: Extract<
        PrimitiveEvidence,
        "cardinality:exact" | "cardinality:upTo"
      >;
      readonly max: number;
      readonly min: number;
    }
  | undefined {
  const upTo = /^up to (?<count>[1-9]\d*)$/iu.exec(text.trim())?.groups?.[
    "count"
  ];
  if (upTo !== undefined) {
    return {
      allowFewerIfUnavailable: true,
      evidence: "cardinality:upTo",
      max: Number.parseInt(upTo, 10),
      min: 0,
    };
  }
  if (!/^[1-9]\d*$/u.test(text.trim())) {
    return undefined;
  }
  const count = Number.parseInt(text, 10);
  return {
    allowFewerIfUnavailable: false,
    evidence: "cardinality:exact",
    max: count,
    min: count,
  };
}

function parseRestTargetFilter(
  text: string,
  owner: RestOwner,
):
  | {
      readonly filter: CardFilter;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly zones: Zone[];
    }
  | undefined {
  const normalized = text.trim();
  if (/^other Characters$/iu.test(normalized)) {
    return {
      filter: { categories: ["character"], excludeSelf: true },
      evidence: [
        owner.characterEvidence,
        "zone:characterArea",
        "filter:category:character",
        "filter:excludeSelf",
      ],
      zones: ["characterArea"],
    };
  }

  const donMatch = /^(?:(?<state>active|rested) )?DON!! cards?$/iu.exec(
    normalized,
  );
  const donState = donMatch?.groups?.["state"]?.toLowerCase();
  if (
    donMatch !== null &&
    (donState === undefined || donState === "active" || donState === "rested")
  ) {
    return {
      filter: {
        categories: ["don"],
        ...(donState === undefined ? {} : { state: donState }),
      },
      evidence: [
        owner.donEvidence,
        "zone:costArea",
        "filter:category:don",
        ...(donState === undefined
          ? []
          : donState === "active"
            ? (["filter:state:active"] as const)
            : (["filter:state:rested"] as const)),
      ],
      zones: ["costArea"],
    };
  }

  const predicates = parseCardFilterPredicates({ text: normalized });
  if (predicates === undefined || predicates.rest.trim().length > 0) {
    return undefined;
  }
  const category = predicates.filter.categories?.[0];
  if (category !== "character") {
    return undefined;
  }

  return {
    filter: predicates.filter,
    evidence: [
      owner.characterEvidence,
      "zone:characterArea",
      ...predicates.evidence,
    ],
    zones: ["characterArea"],
  };
}

type RestOwner = {
  readonly player: Extract<PlayerRef, "self" | "opponent">;
  readonly characterEvidence: Extract<
    PrimitiveEvidence,
    "target:yourCharacters" | "target:opponentCharacters"
  >;
  readonly cardEvidence: Extract<
    PrimitiveEvidence,
    "target:yourCards" | "target:opponentCards"
  >;
  readonly donEvidence: Extract<
    PrimitiveEvidence,
    "target:yourDonCards" | "target:opponentDonCards"
  >;
};

function parseRestOwner(text: string): RestOwner | undefined {
  const normalized = text.toLowerCase();
  if (normalized === "your") {
    return {
      player: "self",
      characterEvidence: "target:yourCharacters",
      cardEvidence: "target:yourCards",
      donEvidence: "target:yourDonCards",
    };
  }
  if (normalized === "your opponent's") {
    return {
      player: "opponent",
      characterEvidence: "target:opponentCharacters",
      cardEvidence: "target:opponentCards",
      donEvidence: "target:opponentDonCards",
    };
  }
  return undefined;
}

function parseLeaderOrNamedCardRestInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  const normalized = text.trim();
  const leaderFirst =
    /^you may rest your Leader or (?<count>[1-9]\d*) \[(?<name>[^\]]+)\](?: cards?)? instead\.?$/iu.exec(
      normalized,
    );
  const namedFirst =
    /^you may rest (?<count>[1-9]\d*) \[(?<name>[^\]]+)\](?: cards?)? or your Leader instead\.?$/iu.exec(
      normalized,
    );
  const match = leaderFirst ?? namedFirst;
  const countText = match?.groups?.["count"];
  const name = match?.groups?.["name"]?.trim();
  if (countText === undefined || name === undefined || name.length === 0) {
    return undefined;
  }
  const count = Number.parseInt(countText, 10);
  if (count !== 1) {
    return undefined;
  }

  return {
    effect: {
      type: "rest",
      target: {
        type: "chooseFromZones",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "self",
          zones: ["leaderArea", "characterArea", "stageArea"],
          min: 1,
          max: 1,
          allowFewerIfUnavailable: false,
          visibility: "public",
          filter: {
            anyOf: [{ categories: ["leader"] }, { names: [name] }],
          },
        },
      },
    },
    evidence: [
      "instruction:rest",
      "target:yourLeader",
      "target:yourCards",
      "zone:leaderArea",
      "zone:characterArea",
      "zone:stageArea",
      "filter:anyOf",
      "filter:category:leader",
      "filter:name",
      "cardinality:exact",
      "count:positiveInteger",
    ],
  };
}

function parseNamedLeaderRestInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  const match =
    /^you may rest (?<count>[1-9]\d*) of your (?<names>.+?) Leaders? instead\.?$/iu.exec(
      text.trim(),
    );
  const countText = match?.groups?.["count"];
  const namesText = match?.groups?.["names"];
  if (countText === undefined || namesText === undefined) {
    return undefined;
  }
  const names = [...namesText.matchAll(/\[([^\]]+)\]/giu)].map(
    (nameMatch) => nameMatch[1],
  );
  if (names.length === 0 || names.some((name) => name === undefined)) {
    return undefined;
  }
  const count = Number.parseInt(countText, 10);

  return {
    effect: {
      type: "rest",
      target: {
        type: "chooseFromZones",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "self",
          zones: ["leaderArea"],
          min: count,
          max: count,
          allowFewerIfUnavailable: false,
          visibility: "public",
          filter: {
            categories: ["leader"],
            names: names as string[],
          },
        },
      },
    },
    evidence: [
      "instruction:rest",
      "target:yourLeader",
      "zone:leaderArea",
      "filter:category:leader",
      "filter:name",
      "cardinality:exact",
      "count:positiveInteger",
    ],
  };
}
