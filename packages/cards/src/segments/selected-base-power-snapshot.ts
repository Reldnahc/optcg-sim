import type { SelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import {
  parseDurationFromSet,
  thisTurnOnlyDurationParsers,
} from "../durations/index.js";
import { parseOpponentFieldTarget } from "../targets/index.js";
import type { ExpressionParseResult, ParseInput } from "../types.js";

const selectedCharacterPowerSnapshot =
  "selected:base-power-source" as SelectionId;

export function selectedBasePowerSnapshotExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const match =
    /^Select (?<selection>up to [^.]+?)\. This Character's base power becomes the same as the selected Character's power(?<duration>.*)$/iu.exec(
      input.text,
    );
  const selectionText = match?.groups?.["selection"];
  const durationText = match?.groups?.["duration"]?.trim() ?? "";
  if (selectionText === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: selectionText });
  if (cardinality === undefined) {
    return undefined;
  }
  const target = parseOpponentFieldTarget({ text: cardinality.rest });
  if (
    target === undefined ||
    target.rest.length > 0 ||
    target.filter?.categories?.[0] !== "character"
  ) {
    return undefined;
  }
  const duration = parseDurationFromSet(
    { text: durationText },
    thisTurnOnlyDurationParsers,
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
          id: "select:base-power-source",
          connector: "always",
          saveResultAs: selectedCharacterPowerSnapshot,
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "opponent",
              zone: "characterArea",
              min: cardinality.cardinality.min,
              max: cardinality.cardinality.max,
              allowFewerIfUnavailable: true,
              visibility: "public",
              filter: target.filter,
            },
          },
        },
        {
          id: "base-power:selected-source",
          connector: "then",
          effect: {
            type: "setBasePower",
            target: { type: "self" },
            value: {
              type: "snapshotCardStat",
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: selectedCharacterPowerSnapshot,
                },
                zone: "characterArea",
                player: "opponent",
                visibility: "publicOnly",
                onFailure: "failClosed",
              },
              stat: "currentPower",
            },
            duration: duration.duration,
          },
        },
      ],
    },
    evidence: [
      "expression:sequence",
      "composition:selectThenApply",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      "instruction:setBasePower",
      "target:thisCharacter",
      "target:selectedCharacter",
      "value:basePower:snapshotCurrentPower",
      ...duration.evidence,
    ],
    rest: "",
  };
}
