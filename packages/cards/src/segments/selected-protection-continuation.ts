import type { SelectionId } from "@optcg/types";

import {
  fieldEffectDurationParsers,
  parseDurationFromSet,
} from "../durations/index.js";
import { parseSelectTargetsInstruction } from "../instructions/index.js";
import { parseProtectionProcess } from "../protection/process.js";
import type { ExpressionParseResult, ParseInput } from "../types.js";
import { savedFieldObjectTarget } from "./saved-field-object-target.js";

const selectedProtectionTarget = "selected:protection-target" as SelectionId;

export function selectedProtectionContinuationExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const split =
    /^(?<selection>Select .+?)\.\s+The selected Character (?<protection>cannot be K\.O\.'d\s+.+)$/iu.exec(
      input.text,
    );
  const selectionText = split?.groups?.["selection"];
  const protectionText = split?.groups?.["protection"];
  if (selectionText === undefined || protectionText === undefined) {
    return undefined;
  }

  const selection = parseSelectTargetsInstruction({
    text: `${selectionText}.`,
  });
  if (
    selection === undefined ||
    selection.rest.length > 0 ||
    selection.effect.type !== "selectTargets"
  ) {
    return undefined;
  }

  const savedTarget = savedFieldObjectTarget(
    selection.effect,
    selectedProtectionTarget,
  );
  if (savedTarget === undefined) {
    return undefined;
  }

  const protection = parseProtectionProcess({ text: protectionText });
  if (protection === undefined || protection.process.type !== "ko") {
    return undefined;
  }

  const duration = parseDurationFromSet(
    { text: protection.rest },
    fieldEffectDurationParsers,
  );
  if (
    duration === undefined ||
    duration.duration === undefined ||
    duration.rest.length > 0
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          saveResultAs: selectedProtectionTarget,
          effect: selection.effect,
        },
        {
          connector: "then",
          effect: {
            type: "protectFromKO",
            target: savedTarget,
            duration: duration.duration,
          },
        },
      ],
    },
    evidence: [
      "composition:selectThenApply",
      ...selection.evidence,
      "target:selectedCharacter",
      "instruction:giveProtection",
      ...protection.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
}
