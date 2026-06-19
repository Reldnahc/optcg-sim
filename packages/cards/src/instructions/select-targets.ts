import type { Effect, SavedFieldObjectZone, Target } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { chosenCharacterSelectionId } from "../targets/chosen-character.js";
import {
  opponentFieldTargetParsers,
  parseTargetFromSet,
  yourFieldEffectTargetParsers,
  type FieldTargetParseResult,
} from "../targets/index.js";
import type { InstructionParser } from "../types.js";

const selectedTarget = (
  zone: "characterArea" | "stageArea",
  player: "opponent",
  selectionId: string,
): Target => ({
  type: "savedFieldObject",
  binding: {
    family: "selectedTargets",
    saveResultAs: selectionId,
  },
  zone,
  player,
  visibility: "publicOnly",
  onFailure: "failClosed",
});

export const parseSelectTargetsInstruction: InstructionParser = (input) => {
  const match = /^Select\s+(?<target>.+)$/iu.exec(input.text);
  const targetText = match?.groups?.["target"];
  if (targetText === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: targetText });
  if (cardinality === undefined) {
    return undefined;
  }
  const target = parseTargetFromSet({ text: cardinality.rest }, [
    ...opponentFieldTargetParsers(),
    ...yourFieldEffectTargetParsers(cardinality.cardinality),
  ]);
  if (target === undefined || (target.rest.length > 0 && target.rest !== ".")) {
    return undefined;
  }

  const request = selectTargetsRequest(target, cardinality.cardinality);
  if (request === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "selectTargets",
      request,
    },
    saveResultAs: chosenCharacterSelectionId,
    evidence: [
      "instruction:selectTargets",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
    ],
    rest: "",
  };
};

export { selectedTarget };

function selectTargetsRequest(
  target: FieldTargetParseResult,
  cardinality: { readonly min: number; readonly max: number },
): Extract<Effect, { type: "selectTargets" }>["request"] | undefined {
  if (target.target?.type === "choose") {
    const request = target.target.request;
    if (!isSavedFieldObjectZone(request.zone)) {
      return undefined;
    }
    return {
      timing: request.timing,
      chooser: request.chooser,
      player: request.player,
      zone: request.zone,
      min: cardinality.min,
      max: cardinality.max,
      allowFewerIfUnavailable: request.allowFewerIfUnavailable,
      visibility: "public",
      ...(request.filter === undefined ? {} : { filter: request.filter }),
      ...(request.selectionConstraints === undefined
        ? {}
        : { selectionConstraints: request.selectionConstraints }),
    };
  }

  if (target.target?.type === "chooseFromZones") {
    const request = target.target.request;
    return {
      timing: request.timing,
      chooser: request.chooser,
      player: request.player,
      zones: [...request.zones],
      min: cardinality.min,
      max: cardinality.max,
      allowFewerIfUnavailable: request.allowFewerIfUnavailable,
      visibility: "public",
      ...(request.filter === undefined ? {} : { filter: request.filter }),
      ...(request.selectionConstraints === undefined
        ? {}
        : { selectionConstraints: request.selectionConstraints }),
    };
  }

  const category = target.filter?.categories?.[0];
  const filter = target.filter;
  if (
    (category !== "character" && category !== "stage") ||
    filter === undefined
  ) {
    return undefined;
  }
  return {
    timing: "onResolution",
    chooser: "self",
    player: "opponent",
    zone: category === "stage" ? "stageArea" : "characterArea",
    min: cardinality.min,
    max: cardinality.max,
    allowFewerIfUnavailable: true,
    visibility: "public",
    filter,
  };
}

function isSavedFieldObjectZone(zone: string): zone is SavedFieldObjectZone {
  return (
    zone === "leaderArea" ||
    zone === "characterArea" ||
    zone === "stageArea" ||
    zone === "costArea"
  );
}
