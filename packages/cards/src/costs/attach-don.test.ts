import { describe, expect, it } from "vitest";

import { parseAttachDonCost } from "./attach-don.js";

describe("attach DON cost parser", () => {
  it("parses direct active DON payment to a named self field card", () => {
    expect(
      parseAttachDonCost({
        text: "give 2 active DON!! cards to 1 of your [Silvers Rayleigh]",
      }),
    ).toMatchObject({
      cost: {
        type: "attachDon",
        count: 2,
        sourcePlayer: "self",
        sourceState: "active",
        target: {
          type: "chooseFromZones",
          request: {
            player: "self",
            zones: ["leaderArea", "characterArea"],
            min: 1,
            max: 1,
            allowFewerIfUnavailable: false,
            filter: { names: ["Silvers Rayleigh"] },
          },
        },
        optional: true,
      },
      evidence: [
        "cost:attachDon",
        "cardinality:exact",
        "count:positiveInteger",
        "state:active",
        "target:yourDonCards",
        "target:yourNamedCards",
        "player:self",
        "filter:name",
      ],
      rest: "",
    });
  });
});
