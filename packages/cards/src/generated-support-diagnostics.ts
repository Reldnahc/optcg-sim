import {
  parseIfWrapper,
  parseSupportedTriggerWrapper,
  parseUpToCardinality,
} from "./composed-parser-builder.js";
import { deriveConditionalConditionDiagnostics } from "./conditional-parser-components.js";
import type {
  GeneratedSupportDiagnosticDecomposition,
  GeneratedSupportDiagnosticTraceComponent,
} from "./generated-support-types.js";

export function deriveCard020ADiagnosticDecomposition({
  fullSourceText,
  parsedRuleIds,
  spanText,
}: {
  fullSourceText: string;
  parsedRuleIds: readonly string[];
  spanText: string;
}): GeneratedSupportDiagnosticDecomposition | undefined {
  const onKoDrawCandidate = deriveParsedOnKoDrawCandidate(
    fullSourceText,
    parsedRuleIds,
  );

  return (
    deriveSlashCombinedConditionalDiagnosticDecomposition(spanText.trim()) ??
    deriveUnwrappedConditionalDiagnosticDecomposition(
      spanText.trim(),
      onKoDrawCandidate,
    )
  );
}

function deriveSlashCombinedConditionalDiagnosticDecomposition(
  sourceText: string,
): GeneratedSupportDiagnosticDecomposition | undefined {
  const wrapper = parseSlashCombinedTriggerWrapper(sourceText);
  if (wrapper === undefined) {
    return undefined;
  }

  const conditional = parseIfWrapper(wrapper.bodyText);
  const conditionText = conditional?.conditionText;
  const conditions =
    conditionText === undefined
      ? undefined
      : deriveConditionalConditionDiagnostics(conditionText);
  const noOtherFragments = (conditional?.conditions ?? []).filter(
    isNoOtherCharacterConditionFragment,
  );
  const bodyDiagnostics = deriveUnsupportedBodyDiagnostics(
    conditional?.bodyText ?? wrapper.bodyText,
    "slash-combined",
  );

  return {
    recognizedActionCandidates: [],
    recognizedSyntaxFragments: [
      "wrapper:slash-combined",
      ...(conditional === undefined ? [] : ["if-conditional-wrapper"]),
      ...(conditions?.hasSupportedConditionComponents === true
        ? ["condition-components:v1"]
        : []),
    ],
    recognizedTriggerCandidates: wrapper.triggers,
    reason:
      "Slash-combined wrapper and selected condition/action fragments were recognized diagnostically, but unsupported condition/body pieces keep generated support fail-closed.",
    traceComponents: [
      traceComponent("wrapper", "unsupported", wrapper.text),
      ...wrapper.triggers.map((trigger) =>
        traceComponent("trigger", "recognized", trigger),
      ),
      ...(conditional === undefined
        ? []
        : [traceComponent("wrapper", "recognized", "If")]),
      ...toDiagnosticCandidateTraceComponents(
        conditions?.traceComponents ?? [],
      ),
      ...bodyDiagnostics.traceComponents,
    ],
    unsupportedConditionFragments: unique([
      ...(conditions?.unsupportedConditionFragments ?? []),
      ...noOtherFragments,
    ]),
    unsupportedSyntaxFragments: unique([
      "wrapper:slash-combined-unsupported",
      ...(conditions?.unsupportedSyntaxFragments ?? []),
      ...deriveNoOtherCharacterConditionSyntaxFragments(noOtherFragments),
      ...bodyDiagnostics.unsupportedSyntaxFragments,
    ]),
  };
}

function deriveUnwrappedConditionalDiagnosticDecomposition(
  spanText: string,
  onKoDrawCandidate: string | undefined,
): GeneratedSupportDiagnosticDecomposition | undefined {
  const conditional = parseIfWrapper(spanText);
  if (conditional === undefined) {
    return undefined;
  }

  const bodyDiagnostics = deriveUnsupportedBodyDiagnostics(
    conditional.bodyText,
    "unwrapped-continuous-static",
  );

  const conditions = deriveConditionalConditionDiagnostics(
    conditional.conditionText,
  );
  const trashCountFragments =
    conditional.conditions.filter(isTrashCountFragment);

  return {
    recognizedActionCandidates:
      onKoDrawCandidate === undefined ? [] : [onKoDrawCandidate],
    recognizedSyntaxFragments: ["wrapper:unwrapped-continuous-static-if"],
    recognizedTriggerCandidates:
      onKoDrawCandidate === undefined ? [] : ["[On K.O.]"],
    reason:
      "Unsupported unwrapped continuous/static conditional text remains fail-closed while any separate supported child effect is recognized diagnostically.",
    traceComponents: [
      traceComponent(
        "wrapper",
        "unsupported",
        "If <condition>, <body> (unwrapped continuous/static)",
      ),
      ...toDiagnosticCandidateTraceComponents(conditions.traceComponents),
      ...bodyDiagnostics.traceComponents,
      ...(onKoDrawCandidate === undefined
        ? []
        : [
            traceComponent("trigger", "recognized", "[On K.O.]"),
            traceComponent("action", "supported", onKoDrawCandidate),
          ]),
    ],
    unsupportedConditionFragments: unique([
      ...conditions.unsupportedConditionFragments,
      ...trashCountFragments,
    ]),
    unsupportedSyntaxFragments: unique([
      ...conditions.unsupportedSyntaxFragments,
      ...trashCountFragments.map(() => "condition:trash-count-unsupported"),
      ...bodyDiagnostics.unsupportedSyntaxFragments,
    ]),
  };
}

function deriveParsedOnKoDrawCandidate(
  fullSourceText: string,
  parsedRuleIds: readonly string[],
): string | undefined {
  if (
    !parsedRuleIds.includes("exact:on-ko:draw-n:self") &&
    !parsedRuleIds.includes("exact:on-ko:draw-up-to-n:self")
  ) {
    return undefined;
  }

  for (const line of fullSourceText.split(/\r?\n/u)) {
    const match = /^\[On K\.O\.\]\s+(Draw(?: up to)? \d+ cards?)\.?$/iu.exec(
      line.trim(),
    );
    if (match !== null) {
      return match[1];
    }
  }

  return undefined;
}

function parseSlashCombinedTriggerWrapper(
  sourceText: string,
): { bodyText: string; text: string; triggers: readonly string[] } | undefined {
  const match = /^((?:\[[^\]]+\]\/)+\[[^\]]+\])\s+(.+)$/u.exec(sourceText);
  const text = match?.[1] ?? "";
  const bodyText = match?.[2]?.trim() ?? "";
  const triggers = text.split("/");
  if (
    match === null ||
    bodyText.length === 0 ||
    triggers.length < 2 ||
    !triggers.every(isSupportedTriggerCandidate)
  ) {
    return undefined;
  }

  return { bodyText, text, triggers };
}

function parseDonSetActiveBody(
  bodyText: string,
): { cardinalityText: string; targetText: string; text: string } | undefined {
  const normalized = bodyText.trim().replace(/\.$/u, "");
  const match =
    /^set\s+(up to \d+)\s+of\s+(your DON!! cards)\s+as active$/iu.exec(
      normalized,
    );
  const cardinalityText = match?.[1] ?? "";
  const targetText = match?.[2] ?? "";
  if (match === null || parseUpToCardinality(cardinalityText) === undefined) {
    return undefined;
  }

  return { cardinalityText, targetText, text: normalized };
}

function deriveUnsupportedBodyDiagnostics(
  bodyText: string,
  wrapperKind: "slash-combined" | "unwrapped-continuous-static",
): {
  traceComponents: readonly GeneratedSupportDiagnosticTraceComponent[];
  unsupportedSyntaxFragments: readonly string[];
} {
  return (
    deriveDonActiveBodyDiagnostics(bodyText) ??
    deriveThenSequenceBodyDiagnostics(bodyText) ??
    deriveUnsupportedContinuousBodyDiagnostics(bodyText) ?? {
      traceComponents: [
        traceComponent("action", "unsupported", normalizeSentence(bodyText)),
      ],
      unsupportedSyntaxFragments: [
        wrapperKind === "slash-combined"
          ? "body:unsupported"
          : "body:unwrapped-continuous-static-unsupported",
      ],
    }
  );
}

function deriveThenSequenceBodyDiagnostics(bodyText: string):
  | {
      traceComponents: readonly GeneratedSupportDiagnosticTraceComponent[];
      unsupportedSyntaxFragments: readonly string[];
    }
  | undefined {
  const normalized = normalizeSentence(bodyText);
  const segments = normalized.split(/\.\s+Then,\s+/u);
  if (segments.length !== 2) {
    return undefined;
  }

  const traces = segments.flatMap(deriveSequenceSegmentTraceComponents);
  if (traces.length === 0) {
    return undefined;
  }

  return {
    traceComponents: [
      ...traces,
      traceComponent("wrapper", "unsupported", "Then"),
    ],
    unsupportedSyntaxFragments: [
      "body:then-sequence-unsupported",
      ...deriveSequenceSegmentUnsupportedFragments(segments),
    ],
  };
}

function deriveSequenceSegmentTraceComponents(
  segmentText: string,
): readonly GeneratedSupportDiagnosticTraceComponent[] {
  return (
    deriveCostReductionTraceComponents(segmentText) ??
    deriveKoTraceComponents(segmentText) ?? [
      traceComponent("action", "unsupported", segmentText),
    ]
  );
}

function deriveCostReductionTraceComponents(
  segmentText: string,
): readonly GeneratedSupportDiagnosticTraceComponent[] | undefined {
  const match =
    /^Give\s+(up to \d+)\s+of\s+(your opponent's Characters)\s+(-?\d+\s+cost during this turn)$/iu.exec(
      segmentText,
    );
  const cardinalityText = match?.[1] ?? "";
  if (match === null || parseUpToCardinality(cardinalityText) === undefined) {
    return undefined;
  }

  return [
    traceComponent("action", "unsupported", "Give"),
    traceComponent("cardinality", "recognized", cardinalityText),
    traceComponent("target", "recognized", match[2] ?? ""),
    traceComponent("modifier", "unsupported", match[3] ?? ""),
  ];
}

function deriveKoTraceComponents(
  segmentText: string,
): readonly GeneratedSupportDiagnosticTraceComponent[] | undefined {
  const match =
    /^K\.O\.\s+(up to \d+)\s+of\s+(your opponent's Characters)\s+with a (cost of \d+)$/iu.exec(
      segmentText,
    );
  const cardinalityText = match?.[1] ?? "";
  if (match === null || parseUpToCardinality(cardinalityText) === undefined) {
    return undefined;
  }

  return [
    traceComponent("action", "unsupported", "K.O."),
    traceComponent("cardinality", "recognized", cardinalityText),
    traceComponent("target", "recognized", match[2] ?? ""),
    traceComponent("predicate", "recognized", match[3] ?? ""),
  ];
}

function deriveSequenceSegmentUnsupportedFragments(
  segments: readonly string[],
): readonly string[] {
  const fragments: string[] = [];
  if (segments.some((segment) => deriveCostReductionTraceComponents(segment))) {
    fragments.push("modifier:cost-reduction-unsupported");
  }
  if (segments.some((segment) => deriveKoTraceComponents(segment))) {
    fragments.push("action:ko-unsupported");
  }
  return fragments.length === 0 ? ["body:unsupported"] : fragments;
}

function deriveDonActiveBodyDiagnostics(bodyText: string):
  | {
      traceComponents: readonly GeneratedSupportDiagnosticTraceComponent[];
      unsupportedSyntaxFragments: readonly string[];
    }
  | undefined {
  const body = parseDonSetActiveBody(bodyText);
  if (body === undefined) {
    return undefined;
  }

  return {
    traceComponents: [
      traceComponent("action", "unsupported", body.text),
      traceComponent("cardinality", "recognized", body.cardinalityText),
      traceComponent("target", "unsupported", body.targetText),
      traceComponent("modifier", "unsupported", "as active"),
    ],
    unsupportedSyntaxFragments: [
      "action:don-set-active-unsupported",
      "action:own-don-target-unsupported",
      "action:active-state-result-unsupported",
      "body-or-runtime-capability-evidence:missing",
      "runtime-capability:don-set-active-missing",
    ],
  };
}

function deriveUnsupportedContinuousBodyDiagnostics(bodyText: string):
  | {
      traceComponents: readonly GeneratedSupportDiagnosticTraceComponent[];
      unsupportedSyntaxFragments: readonly string[];
    }
  | undefined {
  const normalized = bodyText.trim().replace(/\.$/u, "");
  const protectionText =
    "cannot be removed from the field by your opponent's effects";
  const blockerGrantText = "gains [Blocker]";
  if (
    !normalized.includes(protectionText) ||
    !normalized.includes(blockerGrantText) ||
    !/\sand\s/iu.test(normalized)
  ) {
    return undefined;
  }

  return {
    traceComponents: [
      traceComponent("action", "unsupported", "and"),
      traceComponent("restriction", "unsupported", protectionText),
      traceComponent("modifier", "unsupported", blockerGrantText),
    ],
    unsupportedSyntaxFragments: [
      "body:protection-removal-unsupported",
      "body:keyword-grant-blocker-unsupported",
      "body:and-composition-unsupported",
    ],
  };
}

function normalizeSentence(text: string): string {
  return text.trim().replace(/\.$/u, "");
}

function isSupportedTriggerCandidate(triggerText: string): boolean {
  return parseSupportedTriggerWrapper(`${triggerText} `) !== undefined;
}

function isNoOtherCharacterConditionFragment(conditionText: string): boolean {
  return /^you have no other \[[^\]]+\] Characters$/iu.test(conditionText);
}

function deriveNoOtherCharacterConditionSyntaxFragments(
  fragments: readonly string[],
): readonly string[] {
  return fragments.length === 0
    ? []
    : [
        "condition:field-count-missing",
        "condition:name-filter-missing",
        "condition:exclude-self-or-other-self-missing",
      ];
}

function isTrashCountFragment(conditionText: string): boolean {
  return /^you have \d+ or more cards in your trash$/iu.test(conditionText);
}

function traceComponent(
  kind: GeneratedSupportDiagnosticTraceComponent["kind"],
  status: GeneratedSupportDiagnosticTraceComponent["status"],
  text: string,
): GeneratedSupportDiagnosticTraceComponent {
  return { kind, status, text };
}

function toDiagnosticCandidateTraceComponents(
  components: readonly GeneratedSupportDiagnosticTraceComponent[],
): readonly GeneratedSupportDiagnosticTraceComponent[] {
  return components.map((component) =>
    component.status === "supported"
      ? { ...component, status: "recognized" }
      : component,
  );
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
