import type {
  Effect,
  SavedFieldObjectZone,
  SelectionId,
  Target,
} from "@optcg/types";

import {
  attackRestrictionDurationParsers,
  parseDurationFromSet,
} from "../durations/index.js";
import { parseSelectTargetsInstruction } from "../instructions/index.js";
import type { ExpressionParseResult, ParseInput } from "../types.js";

const selectedAttackRestrictionTarget =
  "selected:attack-restriction-target" as SelectionId;

export function selectedAttackRestrictionExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const split =
    /^(?<selection>Select .+?)\.\s+The selected Character cannot attack (?<duration>.+)$/iu.exec(
      input.text,
    );
  const selectionText = split?.groups?.["selection"];
  const durationText = split?.groups?.["duration"];
  if (selectionText === undefined || durationText === undefined) {
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

  const savedTarget = savedFieldObjectTarget(selection.effect);
  if (savedTarget === undefined) {
    return undefined;
  }

  const duration = parseDurationFromSet(
    { text: durationText },
    attackRestrictionDurationParsers,
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
          saveResultAs: selectedAttackRestrictionTarget,
          effect: selection.effect,
        },
        {
          connector: "then",
          effect: {
            type: "cannotAttack",
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
      "instruction:preventActivation",
      ...duration.evidence,
    ],
    rest: "",
  };
}

function savedFieldObjectTarget(
  effect: Extract<Effect, { type: "selectTargets" }>,
): Target | undefined {
  const request = effect.request;
  if ("zone" in request) {
    if (!isSavedFieldObjectZone(request.zone)) {
      return undefined;
    }
    return {
      type: "savedFieldObject",
      binding: {
        family: "selectedTargets",
        saveResultAs: selectedAttackRestrictionTarget,
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
      saveResultAs: selectedAttackRestrictionTarget,
    },
    zones: request.zones,
    player: request.player,
    visibility: "publicOnly",
    onFailure: "failClosed",
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
