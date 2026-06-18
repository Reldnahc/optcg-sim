import type { Trigger } from "@optcg/types";

import { supportedEntryPoints } from "../entry-point-definitions.js";
import type { PrimitiveEvidence } from "../types.js";

export interface ReferencedEffectEntryPointParseResult {
  readonly trigger: Trigger;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export function parseReferencedEffectEntryPointText(
  text: string,
): ReferencedEffectEntryPointParseResult | undefined {
  const match =
    /^(?:the\s+)?(?<entry>\[[^\]]+\])\s+effect(?:\s+of\b)?\s*(?<rest>.*)$/iu.exec(
      text.trim(),
    );
  const entryText = match?.groups?.["entry"];
  if (entryText === undefined) {
    return undefined;
  }

  const entryPoint = supportedEntryPoints.find(
    (candidate) => candidate.text.toLowerCase() === entryText.toLowerCase(),
  );
  if (entryPoint === undefined) {
    return undefined;
  }

  const rawRest = match?.groups?.["rest"]?.trim() ?? "";
  return {
    trigger: entryPoint.trigger,
    evidence: referencedEffectEntryPointEvidence(entryPoint.trigger),
    rest: rawRest === "." ? "" : rawRest,
  };
}

export function referencedEffectEntryPointEvidence(
  trigger: Trigger,
): readonly PrimitiveEvidence[] {
  return trigger.type === "main"
    ? ["reference:effectEntryPoint", "reference:eventMain"]
    : ["reference:effectEntryPoint"];
}
