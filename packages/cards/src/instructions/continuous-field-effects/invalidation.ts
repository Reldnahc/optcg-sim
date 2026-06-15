import type { Effect } from "@optcg/types";

import { parseEntryPointEffectInvalidationInstruction } from "../invalidate-effects.js";
import type { PrimitiveEvidence } from "../../types.js";
import {
  continuousDuration,
  continuousDurationEvidence,
  type ContinuousInstructionParser,
} from "./shared.js";

export const parseContinuousInvalidateEffectsInstruction: ContinuousInstructionParser =
  (input, context) => {
    const entryPointInvalidation = parseEntryPointEffectInvalidationInstruction(
      input,
      {
        defaultDuration: continuousDuration(context.condition),
        defaultDurationEvidence: continuousDurationEvidence(context.condition),
      },
    );
    if (entryPointInvalidation !== undefined) {
      return entryPointInvalidation;
    }

    const leaderAndFilteredCharacters =
      parseYourLeaderAndFilteredCharactersInvalidation(input.text, context);
    if (leaderAndFilteredCharacters !== undefined) {
      return leaderAndFilteredCharacters;
    }

    return undefined;
  };

const parseYourLeaderAndFilteredCharactersInvalidation = (
  text: string,
  context: Parameters<ContinuousInstructionParser>[1],
):
  | {
      readonly effect: Effect;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly rest: "";
    }
  | undefined => {
  const match =
    /^Your Leader and all of your Characters that do not have a type including "(?<typeText>[^"]+)" have their effects negated\.?$/iu.exec(
      text,
    );
  const typeText = match?.groups?.["typeText"]?.trim();
  if (typeText === undefined || typeText.length === 0) {
    return undefined;
  }

  const duration = continuousDuration(context.condition);
  const durationEvidence = continuousDurationEvidence(context.condition);
  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: {
            type: "invalidateEffects",
            target: { type: "myLeader" },
            duration,
          },
        },
        {
          connector: "always",
          effect: {
            type: "invalidateEffects",
            target: {
              type: "all",
              player: "self",
              zone: "characterArea",
              filter: {
                categories: ["character"],
                typesNotIncludeAny: [typeText],
              },
            },
            duration,
          },
        },
      ],
    },
    evidence: [
      "instruction:invalidateEffects",
      "target:yourLeader",
      "target:yourCharacters",
      "cardinality:all",
      "player:self",
      "zone:characterArea",
      "filter:category:character",
      "filter:type",
      durationEvidence,
      "composition:sequence",
    ],
    rest: "",
  };
};
