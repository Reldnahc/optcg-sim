import { describe, expect, it } from "vitest";

import { createBehaviorProbeReport } from "./behavior-probe.js";

const expectProbePassed = (text: string, entrypoint: string): void => {
  const report = createBehaviorProbeReport({ text });

  expect(report.exitCode).toBe(0);
  expect(report.lines).toContain("Behavior probe: passed");
  expect(report.lines).toContain(`Scenario 1 entrypoint: ${entrypoint}`);
  expect(report.lines).toContain("Scenario 1 result: passed");
};

describe("card behavior probe OP coverage regressions", () => {
  it("proves opponent-turn card-played reactions when the opponent plays a card", () => {
    expectProbePassed(
      "[Opponent's Turn] [Once Per Turn] When your opponent plays a Character, if your Leader has the {Donquixote Pirates} type, rest up to 1 of your opponent's Characters. Then, rest this Character.",
      "cardPlayed",
    );
  });

  it("proves implicit card-played reactions for cards played from trash", () => {
    expectProbePassed(
      "When a {Land of Wano} type Character card is played from your trash, that Character gains [Rush] during this turn.",
      "cardPlayed",
    );
  });

  it("proves conditional On K.O. top-deck-to-Life effects", () => {
    expectProbePassed(
      "[On K.O.] If your opponent has 3 or less Life cards, add up to 1 card from the top of your deck to the top of your Life cards.",
      "onKO",
    );
  });

  it("proves attack-triggered self power modifiers without stale battle refs", () => {
    expectProbePassed(
      "[When Attacking] If you have 1 or less Characters with 6000 power or more, this Character gains +1000 power during this turn.",
      "declareAttack",
    );
  });

  it("answers Life trigger confirmation decisions during opponent-attack reactions", () => {
    expectProbePassed(
      '[On Your Opponent\'s Attack] [Once Per Turn] This effect can be activated when you only have Characters with a type including "GERMA". Up to 1 of your Leader or Character cards gains +1000 power during this battle. Then, trash 2 cards from the top of your deck.',
      "opponentAttack",
    );
  });

  it("proves distinct-name trash selections by choosing different card names", () => {
    expectProbePassed(
      "[Activate: Main] If your Leader is [Imu], you may rest 1 of your DON!! cards and trash 1 card from your hand: Trash all of your Characters and play up to 5 {Five Elders} type Character cards with 5000 power and different card names from your trash.",
      "activateEffect",
    );
  });

  it("proves optional costed On K.O. play-source effects from trash", () => {
    expectProbePassed(
      "[On K.O.] You may place 3 cards from your trash at the bottom of your deck in any order: Play this Character card from your trash.",
      "onKO",
    );
  });
});
