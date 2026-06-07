import { parseUpToCardinality } from "../../cardinality/index.js";
import type { InstructionParser } from "../../types.js";
import { donActivationTarget } from "./shared.js";

export const parseSetDonActiveInstruction: InstructionParser = (input) => {
  const match =
    /^set (?<quantity>up to [1-9]\d*) of your DON!! cards as active\.?$/i.exec(
      input.text,
    );
  const quantityText = match?.groups?.["quantity"];
  if (quantityText === undefined) {
    return undefined;
  }
  const quantity = parseUpToCardinality({ text: quantityText });
  if (quantity === undefined || quantity.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:don-to-activate",
          connector: "always",
          saveResultAs: donActivationTarget,
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              zone: "costArea",
              player: "self",
              filter: { categories: ["don"], state: "rested" },
              min: quantity.cardinality.min,
              max: quantity.cardinality.max,
              allowFewerIfUnavailable: true,
              visibility: "public",
            },
          },
        },
        {
          id: "activate:selected-don",
          connector: "then",
          effect: {
            type: "activate",
            target: {
              type: "savedFieldObject",
              binding: {
                family: "selectedTargets",
                saveResultAs: donActivationTarget,
              },
              zone: "costArea",
              player: "self",
              visibility: "publicOnly",
              onFailure: "failClosed",
            },
          },
        },
      ],
    },
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
      "composition:selectThenApply",
    ],
    rest: "",
  };
};
