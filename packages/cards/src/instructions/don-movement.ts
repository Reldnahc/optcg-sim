import type { SelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import type { InstructionParser } from "../types.js";

const donAttachSelection = "donSelection:attach" as SelectionId;
const donAttachTarget = "targetSelection:attach-don";

export const parseAddActiveDonFromDonDeckInstruction: InstructionParser = (
  input,
) => {
  const match =
    /^add (?<quantity>up to [1-9]\d*) DON!! card from your DON!! deck and set it as active\.?$/i.exec(
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
      type: "moveCards",
      min: quantity.cardinality.min,
      count: quantity.cardinality.max,
      from: { player: "self", zone: "donDeck", position: "top" },
      to: { player: "self", zone: "costArea" },
      order: "original",
      destinationState: "active",
    },
    evidence: [
      "instruction:moveCards",
      ...quantity.evidence,
      "player:self",
      "zone:donDeck",
      "position:top",
      "destination:costArea",
      "state:active",
      "filter:category:don",
      "order:original",
    ],
    rest: "",
  };
};

export const parseAddRestedDonFromDonDeckInstruction: InstructionParser = (
  input,
) => {
  const match =
    /^add (?<quantity>up to [1-9]\d*) additional DON!! cards and rest them\.?$/i.exec(
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
      type: "moveCards",
      min: quantity.cardinality.min,
      count: quantity.cardinality.max,
      from: { player: "self", zone: "donDeck", position: "top" },
      to: { player: "self", zone: "costArea" },
      order: "original",
      destinationState: "rested",
    },
    evidence: [
      "instruction:moveCards",
      ...quantity.evidence,
      "player:self",
      "zone:donDeck",
      "position:top",
      "destination:costArea",
      "state:rested",
      "filter:category:don",
      "order:original",
    ],
    rest: "",
  };
};

export const parseAttachRestedDonInstruction: InstructionParser = (input) => {
  const match =
    /^give (?<quantity>up to [1-9]\d*) rested DON!! cards to 1 of your Characters\.?$/i.exec(
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
          id: "select:rested-don",
          connector: "always",
          saveResultAs: donAttachSelection,
          effect: {
            type: "selectCards",
            zone: "costArea",
            player: "self",
            chooser: "self",
            min: quantity.cardinality.min,
            max: quantity.cardinality.max,
            filter: { categories: ["don"], state: "rested" },
            saveAs: donAttachSelection,
            visibility: "bothPlayers",
          },
        },
        {
          id: "select:don-attach-target",
          connector: "ifYouDo",
          saveResultAs: donAttachTarget,
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              zone: "characterArea",
              player: "self",
              filter: { categories: ["character"] },
              min: 1,
              max: 1,
              allowFewerIfUnavailable: false,
              visibility: "public",
            },
          },
        },
        {
          id: "attach:selected-don",
          connector: "then",
          effect: {
            type: "attachSelectedDon",
            selection: donAttachSelection,
            target: {
              type: "savedFieldObject",
              binding: {
                family: "selectedTargets",
                saveResultAs: donAttachTarget,
              },
              zone: "characterArea",
              player: "self",
              filter: { categories: ["character"] },
              visibility: "publicOnly",
              onFailure: "failClosed",
            },
          },
        },
      ],
    },
    evidence: [
      "instruction:selectCards",
      "instruction:attachDon",
      ...quantity.evidence,
      "player:self",
      "chooser:self:upTo",
      "zone:costArea",
      "filter:category:don",
      "filter:state:rested",
      "filter:category:character",
      "zone:characterArea",
      "composition:selectThenApply",
    ],
    rest: "",
  };
};
