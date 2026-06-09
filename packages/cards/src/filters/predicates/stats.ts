import type { Comparator } from "@optcg/types";

import type { PredicateParser } from "./types.js";
import type { PrimitiveEvidence } from "../../types.js";

export const parsePowerPredicate: PredicateParser = (
  text,
  current,
  options,
) => {
  const powerOfThresholdMatch =
    /^a (?<base>base )?power of (?<value>0|[1-9]\d*) (?<direction>or more|or less)\b\s*(?<thresholdRest>.*)$/i.exec(
      text,
    );
  const normalizedPowerOfThreshold =
    powerOfThresholdMatch === null
      ? text
      : `${powerOfThresholdMatch.groups?.["value"] ?? ""} ${
          powerOfThresholdMatch.groups?.["base"] ?? ""
        }power ${powerOfThresholdMatch.groups?.["direction"] ?? ""} ${
          powerOfThresholdMatch.groups?.["thresholdRest"] ?? ""
        }`.trim();
  const thresholdMatch =
    /^(?<value>0|[1-9]\d*) (?<base>base )?power (?<direction>or more|or less)\b\s*(?<thresholdRest>.*)$/i.exec(
      normalizedPowerOfThreshold,
    );
  const thresholdValueText = thresholdMatch?.groups?.["value"];
  const isBasePower = thresholdMatch?.groups?.["base"] !== undefined;
  const direction = thresholdMatch?.groups?.["direction"];
  if (thresholdValueText !== undefined && direction !== undefined) {
    const op: Comparator =
      direction.toLowerCase() === "or more" ? "gte" : "lte";
    const powerFilter =
      op === "gte"
        ? { min: Number.parseInt(thresholdValueText, 10) }
        : { max: Number.parseInt(thresholdValueText, 10) };
    const useCurrentPower =
      !isBasePower && options.powerSemantics === "current";
    return {
      filter: {
        ...current,
        ...(useCurrentPower
          ? { currentPower: powerFilter }
          : { power: powerFilter }),
      },
      evidence: [
        useCurrentPower ? "filter:currentPower" : "filter:power",
        op === "gte" ? "condition:comparator:gte" : "condition:comparator:lte",
        thresholdEvidence(thresholdValueText),
      ],
      rest: thresholdMatch?.groups?.["thresholdRest"] ?? "",
    };
  }

  const powerOfExactMatch =
    /^a (?<base>base )?power of (?<value>0|[1-9]\d*)\b\s*(?<rest>.*)$/i.exec(
      text,
    );
  const normalizedPowerOfExact =
    powerOfExactMatch === null
      ? text
      : `${powerOfExactMatch.groups?.["value"] ?? ""} ${
          powerOfExactMatch.groups?.["base"] ?? ""
        }power ${powerOfExactMatch.groups?.["rest"] ?? ""}`.trim();
  const match =
    /^(?<value>0|[1-9]\d*) (?<base>base )?power\b\s*(?<rest>.*)$/i.exec(
      normalizedPowerOfExact,
    );
  const valueText = match?.groups?.["value"];
  if (valueText === undefined) {
    return undefined;
  }
  const useCurrentPower =
    match?.groups?.["base"] === undefined &&
    options.powerSemantics === "current";

  return {
    filter: {
      ...current,
      ...(useCurrentPower
        ? { currentPower: { op: "eq", value: Number.parseInt(valueText, 10) } }
        : { power: { op: "eq", value: Number.parseInt(valueText, 10) } }),
    },
    evidence: [
      useCurrentPower ? "filter:currentPower" : "filter:power",
      "condition:comparator:eq",
      thresholdEvidence(valueText),
    ],
    rest: match?.groups?.["rest"] ?? "",
  };
};

export const parseCostPredicate: PredicateParser = (text, current) => {
  const rangeMatch =
    /^a (?<base>base )?cost of (?<min>0|[1-9]\d*) to (?<max>0|[1-9]\d*)\b\s*(?<rangeRest>.*)$/i.exec(
      text,
    );
  const minText = rangeMatch?.groups?.["min"];
  const maxText = rangeMatch?.groups?.["max"];
  if (minText !== undefined && maxText !== undefined) {
    const min = Number.parseInt(minText, 10);
    const max = Number.parseInt(maxText, 10);
    if (min > max) {
      return undefined;
    }
    const key =
      rangeMatch?.groups?.["base"] === undefined ? "cost" : "baseCost";
    return {
      filter: { ...current, [key]: { min, max } },
      evidence: [
        "filter:cost",
        "condition:comparator:gte",
        "condition:comparator:lte",
        thresholdEvidence(minText),
        thresholdEvidence(maxText),
      ],
      rest: rangeMatch?.groups?.["rangeRest"] ?? "",
    };
  }

  const exactMatch =
    /^a (?<base>base )?cost of (?<exact>0|[1-9]\d*)\b(?!\s+or\s+(?:more|less)\b)\s*(?<exactRest>.*)$/i.exec(
      text,
    );
  const exactValueText = exactMatch?.groups?.["exact"];
  if (exactValueText !== undefined) {
    const key =
      exactMatch?.groups?.["base"] === undefined ? "cost" : "baseCost";
    return {
      filter: {
        ...current,
        [key]: { op: "eq", value: Number.parseInt(exactValueText, 10) },
      },
      evidence: [
        "filter:cost",
        "condition:comparator:eq",
        thresholdEvidence(exactValueText),
      ],
      rest: exactMatch?.groups?.["exactRest"] ?? "",
    };
  }

  const match =
    /^a (?<base>base )?cost of (?<value>0|[1-9]\d*) (?<direction>or more|or less)\b\s*(?<rest>.*)$/i.exec(
      text,
    );
  const valueText = match?.groups?.["value"];
  const direction = match?.groups?.["direction"];
  if (valueText === undefined || direction === undefined) {
    return undefined;
  }

  const op: Comparator = direction.toLowerCase() === "or more" ? "gte" : "lte";
  const key = match?.groups?.["base"] === undefined ? "cost" : "baseCost";
  return {
    filter: {
      ...current,
      [key]:
        op === "gte"
          ? { min: Number.parseInt(valueText, 10) }
          : { max: Number.parseInt(valueText, 10) },
    },
    evidence: [
      "filter:cost",
      op === "gte" ? "condition:comparator:gte" : "condition:comparator:lte",
      thresholdEvidence(valueText),
    ],
    rest: match?.groups?.["rest"] ?? "",
  };
};

export const parseDynamicDonFieldCostPredicate: PredicateParser = (
  text,
  current,
) => {
  const match =
    /^a cost equal to or less than the number of DON!! cards on your field\b\s*(?<rest>.*)$/i.exec(
      text,
    );
  if (match === null) {
    return undefined;
  }

  return {
    filter: { ...current, custom: "costLteSelfDonFieldCount" },
    evidence: [
      "filter:cost",
      "condition:comparator:lte",
      "valueSource:donFieldCount:self",
    ],
    rest: match.groups?.["rest"] ?? "",
  };
};

const thresholdEvidence = (valueText: string): PrimitiveEvidence =>
  valueText === "0"
    ? "condition:threshold:nonNegativeInteger"
    : "condition:threshold:positiveInteger";
