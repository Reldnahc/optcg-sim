import type { DynamicNumberValue, Duration } from "@optcg/types";

import {
  fieldEffectDurationParsers,
  parseDurationFromSet,
} from "../durations/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import { selfTrashToDeckPlacementSelection } from "../instructions/hand-to-deck-bottom.js";
import type { PrimitiveEvidence } from "../types.js";

export function parseAttachedDonScaledValue(
  multiplier: number,
  text: string,
):
  | {
      readonly duration: Duration;
      readonly value: DynamicNumberValue;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  const match =
    /^(?<duration>[\s\S]+?)\s+for every DON!! card given to (?<target>this Character|that Character)\.?$/iu.exec(
      text.trim(),
    );
  const durationText = match?.groups?.["duration"];
  const targetText = match?.groups?.["target"];
  if (durationText === undefined || targetText === undefined) {
    return undefined;
  }
  const duration = parseDurationFromSet(
    { text: durationText },
    fieldEffectDurationParsers,
  );
  if (duration?.duration === undefined || duration.rest.length > 0) {
    return undefined;
  }
  const target =
    targetText.toLowerCase() === "that character"
      ? ({ type: "affectedCard" } as const)
      : ({ type: "self" } as const);
  const targetEvidence =
    target.type === "affectedCard"
      ? ("target:thatCharacter" as const)
      : ("target:thisCharacter" as const);
  return {
    duration: duration.duration,
    value: {
      type: "countAttachedDon",
      target,
      per: 1,
      multiplier,
    },
    evidence: [
      ...duration.evidence,
      "value:dynamic:attachedDonCount",
      targetEvidence,
    ],
  };
}

export function parseMatchingZoneCardsScaledSuffix(
  multiplier: number,
  text: string,
):
  | {
      readonly prefixText: string;
      readonly value: Extract<
        DynamicNumberValue,
        { type: "countMatchingFieldCards" | "countMatchingZoneCards" }
      >;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  const handMatch =
    /^(?<prefixText>.+?)\s+for every cards? in your hand\.?$/iu.exec(text);
  const handPrefixText = handMatch?.groups?.["prefixText"]?.trim();
  if (handPrefixText !== undefined && handPrefixText.length > 0) {
    return {
      prefixText: handPrefixText,
      value: {
        type: "countMatchingZoneCards",
        player: "self",
        zone: "hand",
        per: 1,
        multiplier,
      },
      evidence: ["value:dynamic:matchingZoneCards", "zone:hand"],
    };
  }

  const fieldMatch =
    /^(?<prefixText>.+?)\s+for each of your (?<filter>.+?)\.?$/iu.exec(text);
  const fieldPrefixText = fieldMatch?.groups?.["prefixText"]?.trim();
  const fieldFilterText = fieldMatch?.groups?.["filter"]?.trim();
  if (
    fieldPrefixText !== undefined &&
    fieldPrefixText.length > 0 &&
    fieldFilterText !== undefined
  ) {
    const fieldCount = parseMatchingFieldCountValue({
      filterText: fieldFilterText,
      multiplier,
    });
    if (fieldCount !== undefined) {
      return {
        prefixText: fieldPrefixText,
        value: fieldCount.value,
        evidence: fieldCount.evidence,
      };
    }
  }

  const restedDonMatch =
    /^(?<prefixText>.+?)\s+for every (?<per>[1-9]\d*) of your rested DON!! cards\.?$/iu.exec(
      text,
    );
  const restedDonPrefixText = restedDonMatch?.groups?.["prefixText"]?.trim();
  const restedDonPerText = restedDonMatch?.groups?.["per"];
  if (
    restedDonPrefixText !== undefined &&
    restedDonPrefixText.length > 0 &&
    restedDonPerText !== undefined
  ) {
    return {
      prefixText: restedDonPrefixText,
      value: {
        type: "countMatchingZoneCards",
        player: "self",
        zone: "costArea",
        filter: { categories: ["don"], state: "rested" },
        per: Number.parseInt(restedDonPerText, 10),
        multiplier,
      },
      evidence: [
        "value:dynamic:matchingZoneCards",
        "zone:costArea",
        "filter:category:don",
        "filter:state:rested",
      ],
    };
  }

  const match =
    /^(?<prefixText>.+?)\s+for every (?<per>[1-9]\d*) (?<filter>cards?|.+?) in your trash\.?$/iu.exec(
      text,
    );
  const prefixText = match?.groups?.["prefixText"]?.trim();
  const perText = match?.groups?.["per"];
  const filterText = match?.groups?.["filter"]?.trim();
  if (
    prefixText === undefined ||
    prefixText.length === 0 ||
    perText === undefined ||
    filterText === undefined
  ) {
    return undefined;
  }

  const evidence: PrimitiveEvidence[] = [
    "value:dynamic:matchingZoneCards",
    "zone:trash",
  ];
  const filter =
    /^cards?$/iu.test(filterText) || filterText.length === 0
      ? undefined
      : parseCardFilterPredicates({ text: filterText });
  if (filter === undefined && !/^cards?$/iu.test(filterText)) {
    return undefined;
  }
  if (filter !== undefined) {
    if (filter.rest.trim().length > 0) {
      return undefined;
    }
    evidence.push(...filter.evidence);
  }

  return {
    prefixText,
    value: {
      type: "countMatchingZoneCards",
      player: "self",
      zone: "trash",
      ...(filter?.filter === undefined ? {} : { filter: filter.filter }),
      per: Number.parseInt(perText, 10),
      multiplier,
    },
    evidence,
  };
}

export function parseMatchingZoneCardsScaledDuration(
  multiplier: number,
  text: string,
):
  | {
      readonly duration: Duration;
      readonly value: Extract<
        DynamicNumberValue,
        { type: "countMatchingFieldCards" | "countMatchingZoneCards" }
      >;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  const handMatch = /^for every cards? in your hand\s+(?<duration>.+)$/iu.exec(
    text.trim(),
  );
  const handDurationText = handMatch?.groups?.["duration"];
  if (handDurationText !== undefined) {
    const duration = parseDurationFromSet(
      { text: handDurationText },
      fieldEffectDurationParsers,
    );
    if (duration?.duration !== undefined && duration.rest.length === 0) {
      return {
        duration: duration.duration,
        value: {
          type: "countMatchingZoneCards",
          player: "self",
          zone: "hand",
          per: 1,
          multiplier,
        },
        evidence: [
          ...duration.evidence,
          "value:dynamic:matchingZoneCards",
          "zone:hand",
        ],
      };
    }
  }

  const fieldMatch =
    /^for each of your (?<filter>.+?)\s+(?<duration>during this (?:turn|battle)|until .+)\.?$/iu.exec(
      text.trim(),
    );
  const fieldSuffixMatch =
    /^(?<duration>during this (?:turn|battle)|until .+?)\s+for each (?<filter>.+?) you control\.?$/iu.exec(
      text.trim(),
    );
  const fieldFilterText =
    fieldMatch?.groups?.["filter"]?.trim() ??
    fieldSuffixMatch?.groups?.["filter"]?.trim();
  const fieldDurationText =
    fieldMatch?.groups?.["duration"] ??
    fieldSuffixMatch?.groups?.["duration"];
  if (fieldFilterText === undefined || fieldDurationText === undefined) {
    return undefined;
  }
  const duration = parseDurationFromSet(
    { text: fieldDurationText },
    fieldEffectDurationParsers,
  );
  const fieldCount = parseMatchingFieldCountValue({
    filterText: normalizeControlledFieldFilterText(fieldFilterText),
    multiplier,
  });
  if (
    duration?.duration === undefined ||
    duration.rest.length > 0 ||
    fieldCount === undefined
  ) {
    return undefined;
  }

  return {
    duration: duration.duration,
    value: fieldCount.value,
    evidence: [...duration.evidence, ...fieldCount.evidence],
  };
}

const parseMatchingFieldCountValue = ({
  filterText,
  multiplier,
}: {
  readonly filterText: string;
  readonly multiplier: number;
}):
  | {
      readonly value: Extract<
        DynamicNumberValue,
        { type: "countMatchingFieldCards" }
      >;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined => {
  const parsed = parseCardFilterPredicates(
    { text: filterText },
    { powerSemantics: "printed" },
  );
  if (parsed === undefined || parsed.rest.trim().length > 0) {
    return undefined;
  }
  const zone = matchingFieldZoneForFilter(parsed.filter);
  if (zone === undefined) {
    return undefined;
  }

  return {
    value: {
      type: "countMatchingFieldCards",
      player: "self",
      zone,
      filter: parsed.filter,
      multiplier,
    },
    evidence: [
      "valueSource:fieldCount",
      ...(zone === "field"
        ? ([
            "zone:leaderArea",
            "zone:characterArea",
            "zone:stageArea",
          ] as const)
        : zone === "leaderArea"
          ? (["zone:leaderArea"] as const)
          : zone === "stageArea"
            ? (["zone:stageArea"] as const)
            : (["zone:characterArea"] as const)),
      ...parsed.evidence,
    ],
  };
};

const normalizeControlledFieldFilterText = (text: string): string =>
  text.replace(/\s+cards?\s*$/iu, "");

const matchingFieldZoneForFilter = (
  filter: NonNullable<
    Extract<DynamicNumberValue, { type: "countMatchingFieldCards" }>["filter"]
  >,
):
  | Extract<DynamicNumberValue, { type: "countMatchingFieldCards" }>["zone"]
  | undefined => {
  const categories = filter.categories ?? [];
  if (categories.includes("leader")) {
    return "leaderArea";
  }
  if (categories.includes("character")) {
    return "characterArea";
  }
  if (categories.includes("stage")) {
    return "stageArea";
  }
  if (
    filter.names !== undefined ||
    filter.typesAny !== undefined ||
    filter.typesIncludeAny !== undefined
  ) {
    return "field";
  }
  return undefined;
};

export function parseSelectedCardCountScaledValue(
  multiplier: number,
  text: string,
):
  | {
      readonly duration: Duration;
      readonly value: DynamicNumberValue;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  const match =
    /^(?<duration>[\s\S]+?)\s+for every (?<per>[1-9]\d*) cards? placed at the bottom of your deck\.?$/iu.exec(
      text.trim(),
    );
  const durationText = match?.groups?.["duration"];
  const perText = match?.groups?.["per"];
  if (durationText === undefined || perText === undefined) {
    return undefined;
  }
  const duration = parseDurationFromSet(
    { text: durationText },
    fieldEffectDurationParsers,
  );
  if (duration?.duration === undefined || duration.rest.length > 0) {
    return undefined;
  }

  return {
    duration: duration.duration,
    value: {
      type: "selectedCardCount",
      selection: selfTrashToDeckPlacementSelection,
      per: Number.parseInt(perText, 10),
      multiplier,
    },
    evidence: [
      ...duration.evidence,
      "value:dynamic:selectedCardCount",
      "count:selectedCardCount",
    ],
  };
}
