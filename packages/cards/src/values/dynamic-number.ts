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
        { type: "countMatchingZoneCards" }
      >;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
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
