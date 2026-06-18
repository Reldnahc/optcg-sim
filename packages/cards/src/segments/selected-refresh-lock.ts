import type { Effect, SelectionId, Target } from "@optcg/types";

import {
  parseDurationFromSet,
  refreshRestrictionDurationParsers,
} from "../durations/index.js";
import type { ExpressionParseResult, ParseInput } from "../types.js";

const selectedRefreshLockLeaderTarget =
  "selected:refresh-lock-leader-target" as SelectionId;
const selectedRefreshLockCharacterTarget =
  "selected:refresh-lock-character-target" as SelectionId;

export function selectedRefreshLockExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const split =
    /^Select up to 1 each of your opponent's rested Leader and Character cards?\.\s+The selected cards will not become active (?<duration>.+)$/iu.exec(
      input.text,
    );
  const durationText = split?.groups?.["duration"];
  if (durationText === undefined) {
    return undefined;
  }

  const duration = parseDurationFromSet(
    { text: durationText },
    refreshRestrictionDurationParsers,
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
          saveResultAs: selectedRefreshLockLeaderTarget,
          effect: selectRestedOpponentLeader(),
        },
        {
          connector: "then",
          saveResultAs: selectedRefreshLockCharacterTarget,
          effect: selectRestedOpponentCharacter(),
        },
        {
          connector: "then",
          effect: cannotBecomeActiveForSavedTarget(
            selectedOpponentLeader(),
            duration.duration,
          ),
        },
        {
          connector: "then",
          effect: cannotBecomeActiveForSavedTarget(
            selectedOpponentCharacter(),
            duration.duration,
          ),
        },
      ],
    },
    evidence: [
      "composition:selectThenApply",
      "instruction:selectTargets",
      "instruction:preventActivation",
      "target:opponentLeader",
      "target:opponentCharacters",
      "player:opponent",
      "zone:leaderArea",
      "zone:characterArea",
      "filter:category:leader",
      "filter:category:character",
      "filter:state:rested",
      ...duration.evidence,
    ],
    rest: "",
  };
}

function selectRestedOpponentLeader(): Extract<
  Effect,
  { type: "selectTargets" }
> {
  return {
    type: "selectTargets",
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "opponent",
      zones: ["leaderArea"],
      min: 0,
      max: 1,
      allowFewerIfUnavailable: true,
      visibility: "public",
      filter: { categories: ["leader"], state: "rested" },
    },
  };
}

function selectRestedOpponentCharacter(): Extract<
  Effect,
  { type: "selectTargets" }
> {
  return {
    type: "selectTargets",
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "opponent",
      zones: ["characterArea"],
      min: 0,
      max: 1,
      allowFewerIfUnavailable: true,
      visibility: "public",
      filter: { categories: ["character"], state: "rested" },
    },
  };
}

function selectedOpponentLeader(): Target {
  return selectedOpponentFieldObject(
    selectedRefreshLockLeaderTarget,
    "leaderArea",
  );
}

function selectedOpponentCharacter(): Target {
  return selectedOpponentFieldObject(
    selectedRefreshLockCharacterTarget,
    "characterArea",
  );
}

function selectedOpponentFieldObject(
  saveResultAs: SelectionId,
  zone: "leaderArea" | "characterArea",
): Target {
  return {
    type: "savedFieldObject",
    binding: {
      family: "selectedTargets",
      saveResultAs,
    },
    zone,
    player: "opponent",
    visibility: "publicOnly",
    onFailure: "failClosed",
  };
}

function cannotBecomeActiveForSavedTarget(
  target: Target,
  duration: Extract<Effect, { type: "cannotBecomeActive" }>["duration"],
): Effect {
  return {
    type: "cannotBecomeActive",
    target,
    duration,
  };
}
