import { expect, test } from "vitest";

import type {
  CardFilter,
  Effect,
  SelectionSetId,
  TargetRequest,
} from "./index.js";

test("effect concern contracts compile", () => {
  const filter: CardFilter = { categories: ["character"], colorsAny: ["red"] };
  const request: TargetRequest = {
    timing: "onActivation",
    chooser: "self",
    zone: "characterArea",
    player: "opponent",
    filter,
    min: 1,
    max: 1,
    allowFewerIfUnavailable: false,
  };
  const effect: Effect = {
    type: "revealTop",
    player: "self",
    count: 1,
    saveAs: "set-1" as SelectionSetId,
    visibility: "bothPlayers",
  };

  expect(request.max).toBe(1);
  expect(effect.type).toBe("revealTop");
});
