import type {
  ConditionParseResult,
  ConditionParser,
  PrimitiveEvidence,
} from "../types.js";
import {
  type CountComparisonParseResult,
  parseLeadingCountComparison,
} from "./comparison.js";

export const donFieldCountConditionPrimitive = {
  primitiveId: "condition:donFieldCount",
  childPrimitiveIds: [
    "player:self",
    "condition:comparator:lte",
    "condition:comparator:gte",
    "condition:comparator:eq",
    "condition:threshold:positiveInteger",
    "filter:category:don",
    "filter:state:attached",
    "filter:state:active",
    "filter:state:rested",
    "player:opponent",
  ],
} as const;

type DonFieldCountState = "active" | "attached" | "rested";

const donStateEvidenceByState = {
  active: "filter:state:active",
  attached: "filter:state:attached",
  rested: "filter:state:rested",
} as const satisfies Record<DonFieldCountState, PrimitiveEvidence>;

const isDonCardsOnPlayersField = (
  text: string,
  player: "self" | "opponent",
): boolean => {
  const fieldOwner = player === "opponent" ? "their" : "your";

  return new RegExp(`^DON!! cards on ${fieldOwner} field$`, "i").test(text);
};

const stateFromDonCountText = (
  text: string,
): DonFieldCountState | undefined => {
  if (/^given DON!! cards$/i.test(text)) return "attached";
  if (/^active DON!! cards$/i.test(text)) return "active";
  if (/^rested DON!! cards$/i.test(text)) return "rested";
  return undefined;
};

const buildStateFilteredDonCount = (
  player: "self" | "opponent",
  state: DonFieldCountState,
  comparison: Pick<CountComparisonParseResult, "op" | "value">,
  comparisonEvidence: readonly PrimitiveEvidence[],
): ConditionParseResult => ({
  condition: {
    type: "fieldCount",
    player,
    filter: { categories: ["don"], state },
    op: comparison.op,
    value: comparison.value,
  },
  evidence: [
    "condition:donFieldCount",
    ...comparisonEvidence,
    player === "self" ? "player:self" : "player:opponent",
    "filter:category:don",
    donStateEvidenceByState[state],
  ],
  rest: "",
});

export const parseDonFieldCountCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const allDonInState = parseAllDonInStateCondition(input.text);
  if (allDonInState !== undefined) {
    return allDonInState;
  }

  const eitherPlayer = parseEitherPlayerDonFieldCountCondition(input.text);
  if (eitherPlayer !== undefined) {
    return eitherPlayer;
  }

  const directMoreThan = parseDirectMoreThanDonFieldComparison(input.text);
  if (directMoreThan !== undefined) {
    return directMoreThan;
  }

  const relativeMatch =
    /^the number of DON!! cards on your field is at least (?<value>[1-9]\d*) less than the number on your opponent's field$/i.exec(
      input.text,
    );
  const relativeValueText = relativeMatch?.groups?.["value"];
  if (relativeValueText !== undefined) {
    return {
      condition: {
        type: "fieldCountDifference",
        minuend: {
          player: "opponent",
          filter: { categories: ["don"] },
        },
        subtrahend: {
          player: "self",
          filter: { categories: ["don"] },
        },
        op: "gte",
        value: Number.parseInt(relativeValueText, 10),
      },
      evidence: [
        "condition:fieldCountDifference",
        "player:opponent",
        "player:self",
        "filter:category:don",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "valueOffset:fieldCountDifference",
      ],
      rest: "",
    };
  }

  const relativeEqualOrLessMatch =
    /^the number of DON!! cards on your field is equal to or less than the number on your opponent's field$/i.exec(
      input.text,
    );
  if (relativeEqualOrLessMatch !== null) {
    return {
      condition: {
        type: "fieldCountDifference",
        minuend: {
          player: "opponent",
          filter: { categories: ["don"] },
        },
        subtrahend: {
          player: "self",
          filter: { categories: ["don"] },
        },
        op: "gte",
        value: 0,
      },
      evidence: [
        "condition:fieldCountDifference",
        "player:opponent",
        "player:self",
        "filter:category:don",
        "condition:comparator:gte",
        "condition:threshold:nonNegativeInteger",
        "valueOffset:fieldCountDifference",
      ],
      rest: "",
    };
  }

  const subjectMatch =
    /^(?<player>you|your opponent) (?:have|has)\s+(?<comparison>.+)$/i.exec(
      input.text,
    );
  const comparisonText = subjectMatch?.groups?.["comparison"];
  if (comparisonText === undefined) {
    return undefined;
  }
  const player =
    subjectMatch?.groups?.["player"]?.toLowerCase() === "your opponent"
      ? "opponent"
      : "self";

  if (/^any DON!! cards given$/i.test(comparisonText)) {
    return {
      condition: {
        type: "fieldCount",
        player,
        filter: { categories: ["don"], state: "attached" },
        op: "gte",
        value: 1,
      },
      evidence: [
        "condition:donFieldCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        player === "self" ? "player:self" : "player:opponent",
        "filter:category:don",
        "filter:state:attached",
      ],
      rest: "",
    };
  }

  if (/^any DON!! cards on your field$/i.test(comparisonText)) {
    return {
      condition: {
        type: "fieldCount",
        player,
        filter: { categories: ["don"] },
        op: "gte",
        value: 1,
      },
      evidence: [
        "condition:donFieldCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        player === "self" ? "player:self" : "player:opponent",
        "filter:category:don",
      ],
      rest: "",
    };
  }

  const normalizedComparisonText = comparisonText
    .replace(/^a total of\s+/iu, "")
    .trim();
  const comparison = parseLeadingCountComparison({
    text: normalizedComparisonText,
  });
  if (comparison === undefined) {
    return undefined;
  }

  const state = stateFromDonCountText(comparison.rest);
  if (state !== undefined) {
    return buildStateFilteredDonCount(player, state, comparison, [
      ...comparison.evidence,
    ]);
  }

  if (!isDonCardsOnPlayersField(comparison.rest, player)) {
    return undefined;
  }

  return {
    condition: {
      type: "fieldCount",
      player,
      filter: { categories: ["don"] },
      op: comparison.op,
      value: comparison.value,
    },
    evidence: [
      "condition:donFieldCount",
      ...comparison.evidence,
      player === "self" ? "player:self" : "player:opponent",
      "filter:category:don",
    ],
    rest: "",
  };
};

function parseAllDonInStateCondition(
  text: string,
): ConditionParseResult | undefined {
  const match =
    /^all of (?<player>your|your opponent's) DON!! cards are (?<state>active|rested)$/iu.exec(
      text,
    );
  const state = match?.groups?.["state"]?.toLowerCase() as
    | "active"
    | "rested"
    | undefined;
  if (state === undefined) {
    return undefined;
  }

  const player =
    match?.groups?.["player"]?.toLowerCase() === "your opponent's"
      ? "opponent"
      : "self";
  return {
    condition: {
      type: "and",
      conditions: [
        {
          type: "fieldCount",
          player,
          filter: { categories: ["don"] },
          op: "gte",
          value: 1,
        },
        {
          type: "fieldCount",
          player,
          filter: { categories: ["don"], state: oppositeDonState(state) },
          op: "eq",
          value: 0,
        },
      ],
    },
    evidence: [
      "composition:conditionAnd",
      "condition:donFieldCount",
      "condition:donFieldCount",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "condition:comparator:eq",
      "condition:threshold:nonNegativeInteger",
      player === "self" ? "player:self" : "player:opponent",
      "filter:category:don",
      donStateEvidenceByState[oppositeDonState(state)],
    ],
    rest: "",
  };
}

function oppositeDonState(state: "active" | "rested"): "active" | "rested" {
  return state === "active" ? "rested" : "active";
}

function parseDirectMoreThanDonFieldComparison(
  text: string,
): ConditionParseResult | undefined {
  const match =
    /^(?<left>you|your opponent) (?:have|has) more DON!! cards on (?<fieldOwner>your|their) field than (?<right>you|your opponent)$/iu.exec(
      text,
    );
  const left = parseDonComparisonPlayer(match?.groups?.["left"]);
  const right = parseDonComparisonPlayer(match?.groups?.["right"]);
  const fieldOwner = match?.groups?.["fieldOwner"]?.toLowerCase();
  if (
    left === undefined ||
    right === undefined ||
    left === right ||
    fieldOwner !== (left === "self" ? "your" : "their")
  ) {
    return undefined;
  }

  return {
    condition: {
      type: "fieldCountDifference",
      minuend: {
        player: left,
        filter: { categories: ["don"] },
      },
      subtrahend: {
        player: right,
        filter: { categories: ["don"] },
      },
      op: "gte",
      value: 1,
    },
    evidence: [
      "condition:fieldCountDifference",
      left === "opponent" ? "player:opponent" : "player:self",
      right === "opponent" ? "player:opponent" : "player:self",
      "filter:category:don",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "valueOffset:fieldCountDifference",
    ],
    rest: "",
  };
}

function parseEitherPlayerDonFieldCountCondition(
  text: string,
): ConditionParseResult | undefined {
  const match = /^either you or your opponent has (?<comparison>.+)$/iu.exec(
    text,
  );
  const comparisonText = match?.groups?.["comparison"];
  if (comparisonText === undefined) {
    return undefined;
  }

  const comparison = parseLeadingCountComparison({ text: comparisonText });
  if (
    comparison === undefined ||
    !/^DON!! cards on the field$/iu.test(comparison.rest)
  ) {
    return undefined;
  }

  return {
    condition: {
      type: "or",
      conditions: [
        {
          type: "fieldCount",
          player: "self",
          filter: { categories: ["don"] },
          op: comparison.op,
          value: comparison.value,
        },
        {
          type: "fieldCount",
          player: "opponent",
          filter: { categories: ["don"] },
          op: comparison.op,
          value: comparison.value,
        },
      ],
    },
    evidence: [
      "composition:conditionOr",
      "condition:donFieldCount",
      "condition:donFieldCount",
      ...comparison.evidence,
      "player:self",
      "player:opponent",
      "filter:category:don",
    ],
    rest: "",
  };
}

function parseDonComparisonPlayer(
  text: string | undefined,
): "self" | "opponent" | undefined {
  if (text === undefined) {
    return undefined;
  }
  return text.toLowerCase() === "your opponent" ? "opponent" : "self";
}
