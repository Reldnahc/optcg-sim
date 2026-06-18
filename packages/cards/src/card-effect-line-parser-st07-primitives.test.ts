import { expect, it } from "vitest";

import {
  parseCardEffectLine,
  parseCardEffectLinesDetailed,
} from "./card-effect-line-parser.js";

it("parses On Play top-Life inspect placement with yours-or-opponent wording", () => {
  const result = parseCardEffectLine(
    "[On Play] Look at up to 1 card from the top of yours or your opponent's Life cards, and place it at the top or bottom of the Life cards.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "placeTopLifeCard",
        players: ["self", "opponent"],
        viewer: "self",
        position: "topOrBottom",
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:lookAt",
      "zone:life",
      "player:self",
      "player:opponent",
      "visibility:private",
      "position:top",
      "position:bottom",
    ]),
  );
});

it.each(["On Play", "Main"])(
  "parses %s opponent-chosen Life trash or Life add choice with hyphen bullets",
  (entry) => {
    const result =
      parseCardEffectLinesDetailed(`[${entry}] Your opponent chooses one:
- Trash 1 card from the top of your opponent's Life cards.
- Add 1 card from the top of your deck to the top of your Life cards.`);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.diagnostic.reason);
    }
    const parsed = result.value[0];
    if (parsed === undefined || parsed.kind === "metadata") {
      throw new Error("expected parsed runtime effect line");
    }
    expect(parsed.block.category).toBe("auto");
    expect(parsed.block.effect).toMatchObject({
      type: "choice",
      chooser: "opponent",
      min: 1,
      max: 1,
      options: [
        { effect: { type: "moveCards", to: { zone: "trash" } } },
        { effect: { type: "moveCards", to: { zone: "life" } } },
      ],
    });
    expect(parsed.evidence).toEqual(
      expect.arrayContaining([
        "expression:choice",
        "composition:chooseOne",
        "chooser:opponent",
        "choice:option",
        "instruction:moveCards",
        "zone:life",
      ]),
    );
  },
);
