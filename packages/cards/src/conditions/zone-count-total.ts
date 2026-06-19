import type { ConditionParseResult, ConditionParser } from "../types.js";
import { parseLeadingCountComparison } from "./comparison.js";

type SupportedZone = "hand" | "life";

const parseZoneList = (text: string): SupportedZone[] | undefined => {
  const normalized = text
    .split(/\s+and\s+/iu)
    .map((part) => part.trim().toLowerCase());
  if (normalized.length < 2) {
    return undefined;
  }
  const zones: SupportedZone[] = [];
  for (const part of normalized) {
    if (part === "hand") {
      zones.push("hand");
      continue;
    }
    if (part === "life area" || part === "life cards") {
      zones.push("life");
      continue;
    }
    return undefined;
  }
  return zones;
};

export const parseZoneCountTotalCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const match =
    /^you have a total of (?<comparison>.+?) cards? in your (?<zones>.+)$/iu.exec(
      input.text,
    );
  const comparisonText = match?.groups?.["comparison"];
  const zoneText = match?.groups?.["zones"];
  if (comparisonText === undefined || zoneText === undefined) {
    return undefined;
  }

  const comparison = parseLeadingCountComparison({ text: comparisonText });
  const zones = parseZoneList(zoneText);
  if (
    comparison === undefined ||
    comparison.rest.length > 0 ||
    zones === undefined
  ) {
    return undefined;
  }

  return {
    condition: {
      type: "zoneCountTotal",
      counts: zones.map((zone) => ({ player: "self" as const, zone })),
      op: comparison.op,
      value: comparison.value,
    },
    evidence: [
      "condition:zoneCountTotal",
      "player:self",
      ...zones.map((zone) =>
        zone === "life" ? ("zone:life" as const) : ("zone:hand" as const),
      ),
      ...comparison.evidence,
    ],
    rest: "",
  };
};
