export const returnDonCostWrapperParserRuleId =
  "component:cost:return-don:self:count-exact";
export const returnDonCostWrapperComponentEvidenceId =
  "return-don-cost-wrapper";
export const returnDonCostWrapperRuntimeCapabilityIds = [
  "payCost:returnDon:self:count-exact",
  "returnDon:cost:self:count-exact",
] as const;

export type ReturnDonCostWrapperParse = {
  readonly bodyText: string;
  readonly componentEvidenceId: typeof returnDonCostWrapperComponentEvidenceId;
  readonly costText: string;
  readonly count: number;
  readonly parserRuleId: typeof returnDonCostWrapperParserRuleId;
  readonly runtimeCapabilityIds: typeof returnDonCostWrapperRuntimeCapabilityIds;
};

export type ReturnDonCostWrapperResidueClause = {
  readonly clause: {
    readonly parserRuleId: typeof returnDonCostWrapperParserRuleId;
  };
  readonly prefix: "";
};

export type ReturnDonCostWrapperDiagnosticDecomposition = {
  readonly recognizedActionCandidates: readonly string[];
  readonly recognizedSyntaxFragments: readonly string[];
  readonly recognizedTriggerCandidates: readonly string[];
  readonly reason: string;
  readonly traceComponents: readonly {
    readonly kind: "action" | "cost" | "trigger";
    readonly status: "recognized" | "unsupported";
    readonly text: string;
  }[];
  readonly unsupportedConditionFragments: readonly string[];
  readonly unsupportedSyntaxFragments: readonly string[];
};

type SupportedTriggerPrefix =
  | "[On K.O.] "
  | "[On Play] "
  | "[Trigger] "
  | "[When Attacking] ";

const supportedTriggerPrefixes = [
  "[On Play] ",
  "[On K.O.] ",
  "[Trigger] ",
  "[When Attacking] ",
] as const satisfies readonly SupportedTriggerPrefix[];

export function parseReturnDonCostWrapper(
  sourceText: string,
): ReturnDonCostWrapperParse | undefined {
  const match = /^(DON!! [-\u2212](\d+):) (.+)$/.exec(sourceText.trim());
  if (match === null) {
    return undefined;
  }

  const count = parseExactPositiveSafeInteger(match[2] ?? "");
  const costText = match[1] ?? "";
  const bodyText = match[3]?.trim() ?? "";
  if (count === undefined || bodyText.length === 0) {
    return undefined;
  }

  return {
    bodyText,
    componentEvidenceId: returnDonCostWrapperComponentEvidenceId,
    costText,
    count,
    parserRuleId: returnDonCostWrapperParserRuleId,
    runtimeCapabilityIds: returnDonCostWrapperRuntimeCapabilityIds,
  };
}

export function parseReturnDonCostWrapperResidueClause(
  sourceText: string,
): ReturnDonCostWrapperResidueClause | undefined {
  const trigger = parseSupportedTriggerPrefix(sourceText);
  if (trigger === undefined) {
    return undefined;
  }

  const wrapper = parseReturnDonCostWrapper(
    sourceText.slice(trigger.length).trim(),
  );
  if (wrapper === undefined) {
    return undefined;
  }

  return {
    clause: { parserRuleId: returnDonCostWrapperParserRuleId },
    prefix: "",
  };
}

export function deriveReturnDonCostWrapperDiagnosticDecomposition(
  text: string,
  fullSourceText: string,
): ReturnDonCostWrapperDiagnosticDecomposition | undefined {
  for (const line of fullSourceText.split(/\r?\n/)) {
    const normalizedLine = line.trim();
    const trigger = parseSupportedTriggerPrefix(normalizedLine);
    if (trigger === undefined) {
      continue;
    }

    const bodyText = normalizedLine.slice(trigger.length).trim();
    const parsedWrapper = parseReturnDonCostWrapper(bodyText);
    if (parsedWrapper !== undefined) {
      if (text !== normalizedLine && text !== parsedWrapper.bodyText) {
        continue;
      }

      return {
        recognizedActionCandidates: [],
        recognizedSyntaxFragments: [
          `trigger-wrapper:${toTriggerSyntaxId(trigger)}`,
          "cost:return-don",
        ],
        recognizedTriggerCandidates: [trigger.trim()],
        reason:
          "DON-minus cost wrapper was recognized with runtime capability requirements, but the wrapped body is not certified; generated support remains fail-closed.",
        traceComponents: [
          { kind: "trigger", status: "recognized", text: trigger.trim() },
          { kind: "cost", status: "recognized", text: parsedWrapper.costText },
          {
            kind: "action",
            status: "unsupported",
            text: parsedWrapper.bodyText,
          },
        ],
        unsupportedConditionFragments: [],
        unsupportedSyntaxFragments: [
          "return-don-cost-wrapper:unsupported-body",
        ],
      };
    }

    const nonDonReturnCost = parseNonDonReturnCostWording(bodyText);
    if (nonDonReturnCost !== undefined && text === normalizedLine) {
      return {
        recognizedActionCandidates: [],
        recognizedSyntaxFragments: [
          `trigger-wrapper:${toTriggerSyntaxId(trigger)}`,
        ],
        recognizedTriggerCandidates: [trigger.trim()],
        reason:
          "Return-DON cost wording was recognized, but only the DON!! -N: wrapper is certified; generated support remains fail-closed.",
        traceComponents: [
          { kind: "trigger", status: "recognized", text: trigger.trim() },
          { kind: "cost", status: "unsupported", text: nonDonReturnCost },
        ],
        unsupportedConditionFragments: [],
        unsupportedSyntaxFragments: ["return-don-cost-wrapper:non-don-wording"],
      };
    }

    const malformedCost = parseMalformedReturnDonCostWrapper(bodyText);
    if (malformedCost === undefined || text !== normalizedLine) {
      continue;
    }

    return {
      recognizedActionCandidates: [],
      recognizedSyntaxFragments: [
        `trigger-wrapper:${toTriggerSyntaxId(trigger)}`,
      ],
      recognizedTriggerCandidates: [trigger.trim()],
      reason:
        "DON-minus cost wording resembles a return-DON cost wrapper, but its count or separator is malformed; generated support remains fail-closed.",
      traceComponents: [
        { kind: "trigger", status: "recognized", text: trigger.trim() },
        { kind: "cost", status: "unsupported", text: malformedCost },
      ],
      unsupportedConditionFragments: [],
      unsupportedSyntaxFragments: ["return-don-cost-wrapper:malformed"],
    };
  }

  return undefined;
}

function parseSupportedTriggerPrefix(
  sourceText: string,
): SupportedTriggerPrefix | undefined {
  return supportedTriggerPrefixes.find((prefix) =>
    sourceText.startsWith(prefix),
  );
}

function parseExactPositiveSafeInteger(countText: string): number | undefined {
  const count = Number.parseInt(countText, 10);
  if (!Number.isSafeInteger(count) || count <= 0) {
    return undefined;
  }

  return countText === String(count) ? count : undefined;
}

function parseMalformedReturnDonCostWrapper(
  sourceText: string,
): string | undefined {
  const match = /^(DON!!\s+[-\u2212][^\s:]*:?)/.exec(sourceText.trim());
  if (match === null) {
    return undefined;
  }

  return parseReturnDonCostWrapper(sourceText) === undefined
    ? match[1]
    : undefined;
}

function parseNonDonReturnCostWording(sourceText: string): string | undefined {
  return /^(Return\s+\d+\s+DON!!:)/.exec(sourceText.trim())?.[1];
}

function toTriggerSyntaxId(trigger: SupportedTriggerPrefix): string {
  switch (trigger) {
    case "[On K.O.] ":
      return "onKO";
    case "[On Play] ":
      return "onPlay";
    case "[Trigger] ":
      return "trigger";
    case "[When Attacking] ":
      return "whenAttacking";
  }
}
