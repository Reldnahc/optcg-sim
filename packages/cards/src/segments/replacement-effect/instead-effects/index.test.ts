import { describe, expect, it } from "vitest";

import {
  parseReplacementInsteadFromSet,
  replacementInsteadBodyParsers,
} from "./index.js";

describe("replacement instead-effect parser groups", () => {
  it("parses replacement instead bodies through a semantic parser group", () => {
    expect(
      parseReplacementInsteadFromSet(
        "you may draw 1 card instead.",
        replacementInsteadBodyParsers,
      ),
    ).toEqual({
      effect: {
        type: "draw",
        count: 1,
        player: "self",
      },
      evidence: ["instruction:draw", "count:positiveInteger"],
    });
  });

  it("parses rest-own-Characters instead as a narrowed rest target", () => {
    expect(
      parseReplacementInsteadFromSet(
        "you may rest 1 of your Characters instead.",
        replacementInsteadBodyParsers,
      ),
    ).toEqual({
      effect: {
        type: "rest",
        target: {
          type: "chooseFromZones",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "self",
            zones: ["characterArea"],
            min: 1,
            max: 1,
            allowFewerIfUnavailable: false,
            visibility: "public",
          },
        },
      },
      evidence: [
        "instruction:rest",
        "target:yourCharacters",
        "zone:characterArea",
        "cardinality:exact",
        "count:positiveInteger",
      ],
    });
  });
});
