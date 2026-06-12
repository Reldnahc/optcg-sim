import type {
  Duration,
  MultiZoneTargetRequest,
  SavedFieldObjectZone,
  SavedFieldObjectTarget,
  SelectedTargetsRequest,
} from "@optcg/types";

import { parseExactCardinality } from "../cardinality/index.js";
import {
  parseThisBattleDuration,
  parseThisTurnDuration,
} from "../durations/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type {
  ExpressionParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";

const basePowerSwapSelection = "selected:base-power-swap";
const basePowerSwapLeftSelection = "selected:base-power-swap:left";
const basePowerSwapRightSelection = "selected:base-power-swap:right";

type SwapDuration = {
  readonly duration: Duration;
  readonly evidence: readonly PrimitiveEvidence[];
};

const isSavedFieldObjectZone = (zone: string): zone is SavedFieldObjectZone =>
  zone === "leaderArea" ||
  zone === "characterArea" ||
  zone === "stageArea" ||
  zone === "costArea";

const parseSwapDuration = (text: string): SwapDuration | undefined => {
  const parsed =
    parseThisTurnDuration({ text }) ?? parseThisBattleDuration({ text });
  if (
    parsed === undefined ||
    parsed.duration === undefined ||
    parsed.rest.length > 0
  ) {
    return undefined;
  }
  return { duration: parsed.duration, evidence: parsed.evidence };
};

const savedTarget = (
  saveResultAs: string,
  request: SelectedTargetsRequest | MultiZoneTargetRequest,
  objectIndex = 0,
): SavedFieldObjectTarget | undefined => {
  if ("zone" in request) {
    return {
      type: "savedFieldObject",
      binding: {
        family: "selectedTargets",
        saveResultAs,
        objectIndex,
      },
      zone: request.zone,
      player: request.player,
      visibility: "publicOnly",
      onFailure: "failClosed",
    };
  }
  if (!request.zones.every(isSavedFieldObjectZone)) {
    return undefined;
  }
  return {
    type: "savedFieldObject",
    binding: {
      family: "selectedTargets",
      saveResultAs,
      objectIndex,
    },
    zones: request.zones,
    player: request.player,
    visibility: "publicOnly",
    onFailure: "failClosed",
  };
};

const parseTwoCharacterSelection = (
  text: string,
):
  | {
      readonly evidence: readonly PrimitiveEvidence[];
      readonly request: SelectedTargetsRequest;
    }
  | undefined => {
  const cardinality = parseExactCardinality({ text });
  if (cardinality === undefined || cardinality.count !== 2) {
    return undefined;
  }

  const self = /^of your\s+(?<predicates>.+)$/iu.exec(cardinality.rest);
  const opponent = /^of your opponent's\s+(?<predicates>.+)$/iu.exec(
    cardinality.rest,
  );
  const player = opponent === null ? "self" : "opponent";
  const predicateText =
    opponent?.groups?.["predicates"] ?? self?.groups?.["predicates"];
  if (predicateText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({ text: predicateText });
  if (
    predicates === undefined ||
    predicates.rest.length > 0 ||
    !predicates.filter.categories?.includes("character")
  ) {
    return undefined;
  }

  return {
    request: {
      timing: "onResolution",
      chooser: "self",
      player,
      zone: "characterArea",
      min: 2,
      max: 2,
      allowFewerIfUnavailable: false,
      visibility: "public",
      filter: predicates.filter,
    },
    evidence: [
      ...cardinality.evidence,
      player === "self" ? "player:self" : "player:opponent",
      player === "self" ? "target:yourCharacters" : "target:opponentCharacters",
      ...predicates.evidence,
    ],
  };
};

const parseSelectedCharacterBasePowerSwap = (
  input: ParseInput,
): ExpressionParseResult | undefined => {
  const match =
    /^Select (?<selection>2 .+?)\. Swap the base power of the selected Characters with each other (?<duration>during this (?:turn|battle)\.?)$/iu.exec(
      input.text,
    );
  const selectionText = match?.groups?.["selection"];
  const durationText = match?.groups?.["duration"];
  if (selectionText === undefined || durationText === undefined) {
    return undefined;
  }

  const selection = parseTwoCharacterSelection(selectionText);
  const duration = parseSwapDuration(durationText);
  if (selection === undefined || duration === undefined) {
    return undefined;
  }
  const leftTarget = savedTarget(basePowerSwapSelection, selection.request, 0);
  const rightTarget = savedTarget(basePowerSwapSelection, selection.request, 1);
  if (leftTarget === undefined || rightTarget === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:base-power-swap",
          connector: "always",
          saveResultAs: basePowerSwapSelection,
          effect: {
            type: "selectTargets",
            request: selection.request,
          },
        },
        {
          id: "swap-base-power:selected-targets",
          connector: "ifPreviousSucceeded",
          effect: {
            type: "swapBasePower",
            left: leftTarget,
            right: rightTarget,
            duration: duration.duration,
          },
        },
      ],
    },
    evidence: [
      "expression:sequence",
      "composition:selectThenApply",
      "instruction:selectTargets",
      "instruction:swapBasePower",
      "value:basePower:snapshotBasePower",
      ...selection.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
};

const parseLeaderAndCharacterBasePowerSwap = (
  input: ParseInput,
): ExpressionParseResult | undefined => {
  const match =
    /^Select your Leader and 1 Character\. Swap the base power of the selected cards with each other (?<duration>during this (?:turn|battle)\.?)$/iu.exec(
      input.text,
    );
  const durationText = match?.groups?.["duration"];
  if (durationText === undefined) {
    return undefined;
  }

  const duration = parseSwapDuration(durationText);
  if (duration === undefined) {
    return undefined;
  }

  const leaderRequest: SelectedTargetsRequest = {
    timing: "onResolution",
    chooser: "self",
    player: "self",
    zone: "leaderArea",
    min: 1,
    max: 1,
    allowFewerIfUnavailable: false,
    visibility: "public",
    filter: { categories: ["leader"] },
  };
  const characterRequest: SelectedTargetsRequest = {
    timing: "onResolution",
    chooser: "self",
    player: "self",
    zone: "characterArea",
    min: 1,
    max: 1,
    allowFewerIfUnavailable: false,
    visibility: "public",
    filter: { categories: ["character"] },
  };
  const leftTarget = savedTarget(basePowerSwapLeftSelection, leaderRequest);
  const rightTarget = savedTarget(
    basePowerSwapRightSelection,
    characterRequest,
  );
  if (leftTarget === undefined || rightTarget === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:base-power-swap-leader",
          connector: "always",
          saveResultAs: basePowerSwapLeftSelection,
          effect: { type: "selectTargets", request: leaderRequest },
        },
        {
          id: "select:base-power-swap-character",
          connector: "ifPreviousSucceeded",
          saveResultAs: basePowerSwapRightSelection,
          effect: { type: "selectTargets", request: characterRequest },
        },
        {
          id: "swap-base-power:selected-leader-character",
          connector: "ifPreviousSucceeded",
          effect: {
            type: "swapBasePower",
            left: leftTarget,
            right: rightTarget,
            duration: duration.duration,
          },
        },
      ],
    },
    evidence: [
      "expression:sequence",
      "composition:selectThenApply",
      "instruction:selectTargets",
      "instruction:swapBasePower",
      "target:yourLeader",
      "target:yourCharacters",
      "player:self",
      "filter:category:leader",
      "filter:category:character",
      "value:basePower:snapshotBasePower",
      ...duration.evidence,
    ],
    rest: "",
  };
};

export const basePowerSwapExpressionParser = (
  input: ParseInput,
): ExpressionParseResult | undefined =>
  parseSelectedCharacterBasePowerSwap(input) ??
  parseLeaderAndCharacterBasePowerSwap(input);
