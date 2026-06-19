import type { CardFilter, Duration, Target } from "@optcg/types";

import type { InstructionParser, PrimitiveEvidence } from "../../types.js";

const paidCostTrashFromHandReference = "paidCost:trashFromHand";
const paidCostRestDonReference = "paidCost:restDon";
const paidCostReturnToOwnerHandReference = "paidCost:returnToOwnerHand";

export const parsePaidCostCardCountPower: InstructionParser = (input) => {
  const text = input.text.trim();
  const leadingReference = parseLeadingPaidCostReference(text);
  const effectText = leadingReference?.rest ?? text;
  const trailingReference =
    leadingReference === undefined
      ? parseTrailingPaidCostReference(effectText)
      : undefined;
  const paidCostReference = leadingReference ?? trailingReference;
  if (paidCostReference === undefined) {
    return undefined;
  }

  const match =
    /^(?<target>.+?) gains? \+(?<amount>[1-9]\d*) power (?<duration>during this battle|during this turn)\.?$/iu.exec(
      paidCostReference.rest,
    );
  const targetText = match?.groups?.["target"];
  const amountText = match?.groups?.["amount"];
  const durationText = match?.groups?.["duration"];
  if (
    targetText === undefined ||
    amountText === undefined ||
    durationText === undefined
  ) {
    return undefined;
  }

  const amount = Number.parseInt(amountText, 10);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return undefined;
  }

  const duration = parseDuration(durationText);
  const target = parsePaidCostPowerTarget(targetText);
  if (target === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyPower",
      target: target.target,
      value: {
        type: "paidCostCardCount",
        cost: paidCostReference.cost,
        multiplier: amount,
      },
      duration: duration.duration,
    },
    evidence: [
      "instruction:modifyPower",
      ...target.evidence,
      "value:dynamic:paidCostCardCount",
      paidCostReference.evidence,
      "modifier:positivePower",
      duration.evidence,
    ],
    rest: "",
  };
};

const parseLeadingPaidCostReference = (
  text: string,
):
  | {
      readonly cost: string;
      readonly evidence: PrimitiveEvidence;
      readonly rest: string;
    }
  | undefined => {
  const restedDon =
    /^For every DON!! card rested this way,\s+(?<rest>.+)$/iu.exec(text);
  const rest = restedDon?.groups?.["rest"]?.trim();
  if (rest === undefined) {
    return undefined;
  }
  return {
    cost: paidCostRestDonReference,
    evidence: "cost:restDon",
    rest,
  };
};

const parseTrailingPaidCostReference = (
  text: string,
):
  | {
      readonly cost: string;
      readonly evidence: PrimitiveEvidence;
      readonly rest: string;
    }
  | undefined => {
  const match =
    /^(?<rest>.+?)\s+for every (?<reference>card trashed|DON!! card rested this way|returned Characters?)\.?$/iu.exec(
      text,
    );
  const rest = match?.groups?.["rest"]?.trim();
  const reference = match?.groups?.["reference"]?.toLowerCase();
  if (rest === undefined || reference === undefined) {
    return undefined;
  }
  if (reference === "card trashed") {
    return {
      cost: paidCostTrashFromHandReference,
      evidence: "cost:trashFromHand",
      rest,
    };
  }
  if (reference === "don!! card rested this way") {
    return {
      cost: paidCostRestDonReference,
      evidence: "cost:restDon",
      rest,
    };
  }
  return {
    cost: paidCostReturnToOwnerHandReference,
    evidence: "cost:returnToOwnerHand",
    rest,
  };
};

const parseSelfTarget = (
  text: string,
):
  | { readonly target: Target; readonly evidence: readonly PrimitiveEvidence[] }
  | undefined => {
  const normalized = text.toLowerCase();
  if (normalized !== "this character" && normalized !== "this leader") {
    return undefined;
  }
  return {
    target: { type: "self" },
    evidence: [
      normalized === "this character"
        ? "target:thisCharacter"
        : "target:thisCard",
    ],
  };
};

const parsePaidCostPowerTarget = (
  text: string,
):
  | { readonly target: Target; readonly evidence: readonly PrimitiveEvidence[] }
  | undefined =>
  parseThisLeaderOrTypedCharacterTarget(text) ?? parseSelfTarget(text);

const parseThisLeaderOrTypedCharacterTarget = (
  text: string,
):
  | { readonly target: Target; readonly evidence: readonly PrimitiveEvidence[] }
  | undefined => {
  const leaderOrCharacterMatch = /^your Leader or 1 of your Characters$/iu.exec(
    text,
  );
  if (leaderOrCharacterMatch !== null) {
    return {
      target: {
        type: "chooseFromZones",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "self",
          zones: ["leaderArea", "characterArea"],
          min: 1,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
          filter: {
            anyOf: [{ categories: ["leader"] }, { categories: ["character"] }],
          },
        },
      },
      evidence: [
        "target:yourLeaderOrCharacters",
        "player:self",
        "count:positiveInteger",
        "filter:anyOf",
        "filter:category:leader",
        "filter:category:character",
      ],
    };
  }

  const upToLeaderOrCharacterMatch =
    /^up to 1 of your Leader or Character cards$/iu.exec(text);
  if (upToLeaderOrCharacterMatch !== null) {
    return {
      target: {
        type: "chooseFromZones",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "self",
          zones: ["leaderArea", "characterArea"],
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
          filter: {
            anyOf: [{ categories: ["leader"] }, { categories: ["character"] }],
          },
        },
      },
      evidence: [
        "target:yourLeaderOrCharacters",
        "player:self",
        "cardinality:upTo",
        "count:positiveInteger",
        "filter:anyOf",
        "filter:category:leader",
        "filter:category:character",
      ],
    };
  }

  const match =
    /^this Leader or up to 1 of your \{(?<type>[^}]+)\} type Characters$/iu.exec(
      text,
    );
  const type = match?.groups?.["type"]?.trim();
  if (type === undefined || type.length === 0) {
    return undefined;
  }

  const filter: CardFilter = {
    anyOf: [
      { categories: ["leader"] },
      { categories: ["character"], typesAny: [type] },
    ],
  };
  return {
    target: {
      type: "chooseFromZones",
      request: {
        timing: "onResolution",
        chooser: "self",
        player: "self",
        zones: ["leaderArea", "characterArea"],
        min: 0,
        max: 1,
        allowFewerIfUnavailable: true,
        visibility: "public",
        filter,
      },
    },
    evidence: [
      "target:yourLeaderOrCharacters",
      "player:self",
      "cardinality:upTo",
      "count:positiveInteger",
      "filter:anyOf",
      "filter:category:leader",
      "filter:category:character",
      "filter:type",
    ],
  };
};

const parseDuration = (
  text: string,
): { readonly duration: Duration; readonly evidence: PrimitiveEvidence } =>
  text.toLowerCase() === "during this battle"
    ? { duration: { type: "thisBattle" }, evidence: "duration:thisBattle" }
    : { duration: { type: "thisTurn" }, evidence: "duration:thisTurn" };
