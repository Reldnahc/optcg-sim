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

  it("parses rest-own-DON instead as a narrowed cost-area rest target", () => {
    expect(
      parseReplacementInsteadFromSet(
        "you may rest 1 of your DON!! cards instead.",
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
            zones: ["costArea"],
            min: 1,
            max: 1,
            allowFewerIfUnavailable: false,
            visibility: "public",
            filter: { categories: ["don"] },
          },
        },
      },
      evidence: [
        "instruction:rest",
        "target:yourDonCards",
        "zone:costArea",
        "filter:category:don",
        "cardinality:exact",
        "count:positiveInteger",
      ],
    });
  });

  it("reuses rest-Characters instead for opponent-owned targets", () => {
    expect(
      parseReplacementInsteadFromSet(
        "you may rest 1 of your opponent's Characters instead.",
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
            player: "opponent",
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
        "target:opponentCharacters",
        "zone:characterArea",
        "cardinality:exact",
        "count:positiveInteger",
      ],
    });
  });

  it("parses up-to filtered rest-Characters instead as the same rest primitive", () => {
    expect(
      parseReplacementInsteadFromSet(
        "you may rest up to 1 of your Characters with a cost of 3 or more other than [Pica] instead.",
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
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            visibility: "public",
            filter: {
              categories: ["character"],
              cost: { min: 3 },
              nameNot: ["Pica"],
            },
          },
        },
      },
      evidence: [
        "instruction:rest",
        "target:yourCharacters",
        "zone:characterArea",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "filter:nameNot",
        "cardinality:upTo",
        "count:positiveInteger",
      ],
    });
  });

  it("parses replacement-subject Life placement instead as a bounce primitive", () => {
    expect(
      parseReplacementInsteadFromSet(
        "you may add it to the top of your Life cards face-down instead.",
        replacementInsteadBodyParsers,
      ),
    ).toEqual({
      effect: {
        type: "bounce",
        target: { type: "replacementTarget" },
        destination: "lifeTop",
        destinationFaceUp: false,
      },
      evidence: [
        "instruction:bounce",
        "target:replacementTarget",
        "destination:life",
        "position:top",
        "visibility:faceDown",
      ],
    });
  });
});
