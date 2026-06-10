import { parseUpToCardinality } from "../../cardinality/index.js";
import type { InstructionParser } from "../../types.js";
import { donActivationTarget } from "./shared.js";

export const parseSetDonActiveInstruction: InstructionParser = (input) => {
  const match =
    /^set (?<quantity>up to [1-9]\d*) of your DON!! cards as active(?<delayed> at the end of this turn)?\.?$/i.exec(
      input.text,
    );
  const quantityText = match?.groups?.["quantity"];
  const delayed = match?.groups?.["delayed"] !== undefined;
  if (quantityText === undefined) {
    return undefined;
  }
  const quantity = parseUpToCardinality({ text: quantityText });
  if (quantity === undefined || quantity.rest.length > 0) {
    return undefined;
  }

  const effect = {
    type: "sequence" as const,
    effects: [
      {
        id: "select:don-to-activate",
        connector: "always" as const,
        saveResultAs: donActivationTarget,
        effect: {
          type: "selectTargets" as const,
          request: {
            timing: "onResolution" as const,
            chooser: "self" as const,
            zone: "costArea" as const,
            player: "self" as const,
            filter: { categories: ["don" as const], state: "rested" as const },
            min: quantity.cardinality.min,
            max: quantity.cardinality.max,
            allowFewerIfUnavailable: true,
            visibility: "public" as const,
          },
        },
      },
      {
        id: "activate:selected-don",
        connector: "then" as const,
        effect: {
          type: "activate" as const,
          target: {
            type: "savedFieldObject" as const,
            binding: {
              family: "selectedTargets" as const,
              saveResultAs: donActivationTarget,
            },
            zone: "costArea" as const,
            player: "self" as const,
            visibility: "publicOnly" as const,
            onFailure: "failClosed" as const,
          },
        },
      },
    ],
  };

  return {
    effect: delayed
      ? {
          type: "delayed",
          timing: { type: "endOfTurn", turn: "current" },
          effect,
        }
      : effect,
    evidence: [
      "instruction:activate",
      ...quantity.evidence,
      "player:self",
      "chooser:self:upTo",
      "target:yourDonCards",
      "zone:costArea",
      "filter:category:don",
      "filter:state:rested",
      "state:active",
      ...(delayed
        ? (["duration:endOfTurn", "composition:delayed"] as const)
        : []),
      "composition:selectThenApply",
    ],
    rest: "",
  };
};
