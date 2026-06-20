import { describe, expect, it } from "vitest";

import { createBehaviorProbeReport } from "./behavior-probe.js";

describe("card behavior probe", () => {
  it("proves a supported On Play effect through real play-card execution", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play] Draw 1 card.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: playCard");
    expect(report.lines).toContain("Scenario 1 engine primitives: draw");
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.lines).toContain("Scenario 1 pending decisions: drained");
    expect(report.lines).toContain("Scenario 1 effect queue: drained");
    expect(report.scenarios).toEqual([
      {
        index: 1,
        entrypoint: "playCard",
        cardCategory: "character",
        status: "passed",
        primitiveTypes: ["draw"],
      },
    ]);
  });

  it("auto-resolves supported decisions while proving the scenario", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play] Draw up to 2 cards.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 engine primitives: drawUpTo");
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.lines).toContain("Scenario 1 decision policy: max-progress");
    expect(report.lines).toContain("Scenario 1 pending decisions: drained");
  });

  it("plays Main event effects through the event play path", () => {
    const report = createBehaviorProbeReport({
      text: "[Main] Draw 1 card.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Scenario 1 card category: event");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("activates Activate Main effects from a fielded source", () => {
    const report = createBehaviorProbeReport({
      text: "[Activate: Main] Draw 1 card.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: activateEffect");
    expect(report.lines).toContain("Scenario 1 engine primitives: draw");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("proves permanent counter modifiers through field continuous validation", () => {
    const report = createBehaviorProbeReport({
      text: "The counter of all of your Character cards with 8000 power in your hand becomes +2000.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: permanent");
    expect(report.lines).toContain("Scenario 1 card category: character");
    expect(report.lines).toContain(
      "Scenario 1 engine primitives: modifyCounter",
    );
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("keeps hand zone refs stable after fielding an Activate Main source", () => {
    const report = createBehaviorProbeReport({
      text: "[Activate: Main] [Once Per Turn] If your Leader has the {Alabasta} type, give up to 1 of your opponent's Characters \u22121000 power during this turn.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: activateEffect");
    expect(report.lines).toContain("Scenario 1 engine primitives: modifyPower");
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Scenario 1 decisions resolved: [1-9]/u),
      ]),
    );
  });

  it("builds leader metadata to satisfy generated leader type conditions", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play] If your Leader has the {Impel Down} type, draw 1 card.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("builds matching field targets to exercise target decisions", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play] K.O. up to 1 of your opponent's Characters with a cost of 3 or less.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain(
      "Scenario 1 engine primitives: ko, selectTargets, sequence",
    );
    expect(report.lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Scenario 1 decisions resolved: [1-9]/u),
      ]),
    );
  });

  it("builds rested DON to exercise activation decisions", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play] Set up to 1 of your DON!! cards as active.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain(
      "Scenario 1 engine primitives: activate, selectTargets, sequence",
    );
    expect(report.lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Scenario 1 decisions resolved: [1-9]/u),
      ]),
    );
  });

  it("builds multiple matching field targets for exact multi-target decisions", () => {
    const report = createBehaviorProbeReport({
      text: "[Main] Select 2 of your opponent's Characters with 9000 base power or less. Swap the base power of the selected Characters with each other during this turn.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain(
      "Scenario 1 engine primitives: selectTargets, sequence, swapBasePower",
    );
    expect(report.lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Scenario 1 decisions resolved: [1-9]/u),
      ]),
    );
  });

  it("chooses an optional selected target when a later segment consumes it", () => {
    const report = createBehaviorProbeReport({
      text: "[When Attacking] Select up to 1 of your opponent's Characters. This Character's base power becomes the same as the selected Character's power during this turn.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain(
      "Scenario 1 engine primitives: selectTargets, sequence, setBasePower",
    );
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Scenario 1 decisions resolved: [1-9]/u),
      ]),
    );
  });

  it("preserves multiline choice blocks through behavior materialization", () => {
    const report = createBehaviorProbeReport({
      text: `[Main] Choose one:
\u2022 Draw 2 cards.
\u2022 Up to 1 of your {Dressrosa} type Characters gains [Blocker] until the end of your opponent's next End Phase.`,
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain(
      "Scenario 1 engine primitives: choice, draw, giveKeyword",
    );
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.lines).toContain("Scenario 1 pending decisions: drained");
  });

  it("builds enough scenario state to resolve search reveal and remainder ordering", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play] Look at 3 cards from the top of your deck; reveal up to 1 {Land of Wano} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain(
      "Scenario 1 engine primitives: moveSelected, placeSetRemainder, revealSelected, revealTop, selectFromSet, sequence",
    );
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.lines).toContain("Scenario 1 pending decisions: drained");
    expect(report.lines).toContain("Scenario 1 effect queue: drained");
    expect(report.lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Scenario 1 decisions resolved: [2-9]/u),
      ]),
    );
  });

  it("derives searchable card metadata from structured filters instead of broad fixtures", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play] Look at 4 cards from the top of your deck; reveal up to 1 [Sanji] or Event card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 setup filters: 1");
    expect(report.lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Scenario 1 decisions resolved: [2-9]/u),
      ]),
    );
  });

  it("runs When Attacking effects by declaring an attack with the source", () => {
    const report = createBehaviorProbeReport({
      text: "[When Attacking] Draw 1 card.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: declareAttack");
    expect(report.lines).toContain("Scenario 1 card category: character");
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.scenarios).toEqual([
      {
        index: 1,
        entrypoint: "declareAttack",
        cardCategory: "character",
        status: "passed",
        primitiveTypes: ["draw"],
      },
    ]);
  });

  it("runs each supported entry alternative from the same printed line", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play]/[When Attacking] Add up to 1 DON!! card from your DON!! deck and set it as active.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: playCard");
    expect(report.lines).toContain("Scenario 2 entrypoint: declareAttack");
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.lines).toContain("Scenario 2 result: passed");
    expect(report.scenarios).toEqual([
      {
        index: 1,
        entrypoint: "playCard",
        cardCategory: "character",
        status: "passed",
        primitiveTypes: ["moveCards"],
      },
      {
        index: 2,
        entrypoint: "declareAttack",
        cardCategory: "character",
        status: "passed",
        primitiveTypes: ["moveCards"],
      },
    ]);
  });

  it("runs On Your Opponent's Attack effects from the defending Leader", () => {
    const report = createBehaviorProbeReport({
      text: "[On Your Opponent's Attack] [Once Per Turn] You may trash 1 card with a [Trigger] from your hand: Change the target of that attack to this Leader or to one of your {Blackbeard Pirates} type Character cards.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: opponentAttack");
    expect(report.lines).toContain("Scenario 1 card category: leader");
    expect(report.lines).toContain(
      "Scenario 1 engine primitives: changeAttackTarget, payCost, selectTargets, sequence",
    );
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.scenarios).toEqual([
      {
        index: 1,
        entrypoint: "opponentAttack",
        cardCategory: "leader",
        status: "passed",
        primitiveTypes: [
          "changeAttackTarget",
          "payCost",
          "selectTargets",
          "sequence",
        ],
      },
    ]);
  });

  it("builds spare hand cards for costed Counter Event effects", () => {
    const report = createBehaviorProbeReport({
      text: "[Counter] You may trash 1 card from your hand: Up to 1 of your Leader or Character cards gains +3000 power during this battle.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: counter");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("profiles Activate Main sources from field-only matching conditions", () => {
    const report = createBehaviorProbeReport({
      text: "[Activate: Main] [Once Per Turn] If the only Characters on your field are {Impel Down} type Characters, set up to 2 of your DON!! cards as active.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: activateEffect");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("profiles Activate Main sources from self cost filters", () => {
    const report = createBehaviorProbeReport({
      text: "[Activate: Main] You may trash this Character with a cost of 20 or more: If you have 9 or more DON!! cards on your field, play up to 1 [Kouzuki Momonosuke] with a cost of 9 from your trash.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: activateEffect");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("runs Trigger effects by activating the source from Life", () => {
    const report = createBehaviorProbeReport({
      text: "[Trigger] Play this card.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: lifeTrigger");
    expect(report.lines).toContain("Scenario 1 card category: character");
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.scenarios).toEqual([
      {
        index: 1,
        entrypoint: "lifeTrigger",
        cardCategory: "character",
        status: "passed",
        primitiveTypes: ["playSource"],
      },
    ]);
  });

  it("proves referenced Main activation triggers with same-card context", () => {
    const report = createBehaviorProbeReport({
      text: [
        "[Main] Look at 3 cards from the top of your deck; reveal up to 1 {Celestial Dragons} type card other than [The Five Elders Are at Your Service!!!] and add it to your hand. Then, trash the rest.",
        "[Trigger] Activate this card's [Main] effect.",
      ].join("\n"),
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: lifeTrigger");
    expect(report.lines).toContain(
      "Scenario 1 engine primitives: activateReferencedEffect, moveSelected, placeSetRemainder, revealSelected, revealTop, selectFromSet, sequence",
    );
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("proves Life-removed reactions through combat damage", () => {
    const report = createBehaviorProbeReport({
      text: "[Your Turn] When a card is removed from your or your opponent's Life cards, draw 1 card. Then, you cannot draw cards using your own effects during this turn.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: lifeRemoved");
    expect(report.lines).toContain("Scenario 1 card category: character");
    expect(report.lines).toContain(
      "Scenario 1 engine primitives: draw, preventDraw, sequence",
    );
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.lines).toContain("Scenario 1 pending decisions: drained");
    expect(report.lines).toContain("Scenario 1 effect queue: drained");
  });

  it("proves End of Your Turn effects through the turn transition", () => {
    const report = createBehaviorProbeReport({
      text: "[End of Your Turn] Set up to 1 of your DON!! cards as active.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: endOfYourTurn");
    expect(report.lines).toContain("Scenario 1 card category: character");
    expect(report.lines).toContain(
      "Scenario 1 engine primitives: activate, selectTargets, sequence",
    );
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.lines).toContain("Scenario 1 pending decisions: drained");
    expect(report.lines).toContain("Scenario 1 effect queue: drained");
  });

  it("proves card-played reactions by playing a matching card", () => {
    const report = createBehaviorProbeReport({
      text: "[Your Turn] When you play a Character, draw 1 card.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: cardPlayed");
    expect(report.lines).toContain("Scenario 1 card category: character");
    expect(report.lines).toContain("Scenario 1 engine primitives: draw");
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.lines).toContain("Scenario 1 pending decisions: drained");
    expect(report.lines).toContain("Scenario 1 effect queue: drained");
  });

  it("proves field-removed reactions by removing a matching field card with an effect", () => {
    const report = createBehaviorProbeReport({
      text: "[Your Turn] When a Character is removed from the field by your effect, draw 1 card.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: fieldRemoved");
    expect(report.lines).toContain("Scenario 1 card category: character");
    expect(report.lines).toContain("Scenario 1 engine primitives: draw");
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.lines).toContain("Scenario 1 pending decisions: drained");
    expect(report.lines).toContain("Scenario 1 effect queue: drained");
  });

  it("proves self K.O. replacement effects through a real replacement decision", () => {
    const report = createBehaviorProbeReport({
      text: "If this Character would be K.O.'d, you may rest 2 of your cards instead.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: replacement");
    expect(report.lines).toContain("Scenario 1 card category: character");
    expect(report.lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Scenario 1 engine primitives: .*replacement/u),
      ]),
    );
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.lines).toContain("Scenario 1 pending decisions: drained");
    expect(report.lines).toContain("Scenario 1 effect queue: drained");
  });

  it("proves field-removal replacement effects that protect another matching Character", () => {
    const report = createBehaviorProbeReport({
      text: "If one of your Characters would be removed from the field by your opponent's effect, you may K.O. this Character instead.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: replacement");
    expect(report.lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Scenario 1 engine primitives: .*replacement/u),
      ]),
    );
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("proves replacement effects with reusable hand-trash costs", () => {
    const report = createBehaviorProbeReport({
      text: "[Once Per Turn] If your {Red-Haired Pirates} type Character would be K.O.'d, you may trash 1 Character card with 6000 power or more from your hand instead.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: replacement");
    expect(report.lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Scenario 1 engine primitives: .*replacement/u),
      ]),
    );
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("proves On K.O. effects through combat K.O.", () => {
    const report = createBehaviorProbeReport({
      text: "[On K.O.] You may turn 1 card from the top of your Life cards face-up: Play up to 1 Character card with 6000 power or less from your hand.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: onKO");
    expect(report.lines).toContain("Scenario 1 card category: character");
    expect(report.lines).toContain(
      "Scenario 1 engine primitives: payCost, playSelected, selectCards, sequence",
    );
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.lines).toContain("Scenario 1 pending decisions: drained");
    expect(report.lines).toContain("Scenario 1 effect queue: drained");
  });

  it("builds return-to-hand optional cost targets", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play] You may return 1 of your Characters with a cost of 2 or more to the owner's hand: Draw 2 cards and trash 1 card from your hand.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: playCard");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("reports materialization failures as structured probe failures", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play] Do something unknown.",
    });

    expect(report.exitCode).toBe(1);
    expect(report.failure?.kind).toBe("materializationFailed");
    expect(report.failure?.diagnostics).toEqual(
      expect.arrayContaining([
        "line 1 parse failed: no expression parser matched",
      ]),
    );
    expect(report.scenarios).toEqual([]);
  });

  it("builds DON metadata for broad field targeting scenarios", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play] Rest up to 1 of your opponent's cards. Then, you may trash 1 card from your hand. If you do, give up to 3 rested DON!! cards to your Leader.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 pending decisions: drained");
    expect(report.lines).toContain("Scenario 1 effect queue: drained");
    expect(report.lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Scenario 1 decisions resolved: [3-9]/u),
      ]),
    );
  });

  it("seeds event history for Activate Main conditions", () => {
    const report = createBehaviorProbeReport({
      text: "[Activate: Main] [Once Per Turn] If you have activated an Event with a base cost of 3 or more during this turn, draw 1 card.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: activateEffect");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("profiles Activate Main sources that must have been played this turn with attached DON", () => {
    const report = createBehaviorProbeReport({
      text: "[Activate: Main] [Once Per Turn] If this Character was played on this turn, give all of your opponent's Characters \u22121000 power during this turn for every DON!! card given to that Character.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: activateEffect");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("seeds trash-count conditions for counter event scenarios", () => {
    const report = createBehaviorProbeReport({
      text: "[Counter] If you have 15 or more cards in your trash, up to 1 of your Leader or Character cards gains +4000 power during this battle.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: counter");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("selects optional saved targets when a following condition consumes them", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play] Select up to 1 of your opponent's rested Characters. If the chosen Character has a cost equal to the number of DON!! cards given to it, K.O. it.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: playCard");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("seeds opponent trash cards for opponent trash-to-deck movement", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play] Place up to 1 card from your opponent's trash at the bottom of the owner's deck.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: playCard");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("proves opponent-activated event reactions through a generated scenario", () => {
    const report = createBehaviorProbeReport({
      text: "When your opponent activates an Event or [Blocker], draw 1 card.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: opponentActivated");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("proves card-rested reactions through a generated rest scenario", () => {
    const report = createBehaviorProbeReport({
      text: "[Your Turn] When this Character becomes rested, rest up to 1 of your opponent's Characters with 7000 base power or less.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: cardRested");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("proves hand-trashed-by-effect reactions through a generated discard scenario", () => {
    const report = createBehaviorProbeReport({
      text: "When a card is trashed from your hand by an effect, this Character gains [Rush] during this turn.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain(
      "Scenario 1 entrypoint: handTrashedByEffect",
    );
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("proves DON-returned reactions through a generated return-DON scenario", () => {
    const report = createBehaviorProbeReport({
      text: "[Opponent's Turn] [Once Per Turn] When a DON!! card on your field is returned to your DON!! deck, if your Leader has the {Donquixote Pirates} type, add up to 1 DON!! card from your DON!! deck and rest it.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: donReturned");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("proves On K.O. effects with attached-DON marker conditions", () => {
    const report = createBehaviorProbeReport({
      text: "[DON!! x2] [On K.O.] Draw 1 card.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: onKO");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("resolves reveal-top conditional effects that require a matching revealed card", () => {
    const report = createBehaviorProbeReport({
      text: '[On Play] Reveal 1 card from the top of your deck. If that card\'s type includes "Whitebeard Pirates", draw 2 cards and trash 1 card from your hand.',
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: playCard");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("builds hand cards for reveal-from-hand activation costs", () => {
    const report = createBehaviorProbeReport({
      text: "[Activate: Main] [Once Per Turn] You may reveal 3 {Amazon Lily} or {Kuja Pirates} type cards from your hand: Give your Leader and all of your Characters up to 1 rested DON!! card each.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: activateEffect");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("resolves optional field-cost bodies with nested optional sequence tails", () => {
    const report = createBehaviorProbeReport({
      text: '[Activate: Main] [Once Per Turn] You may K.O. 1 of your Characters with a type including "Baroque Works": Give up to 1 of your opponent\'s Characters \u221210 cost during this turn. Then, you may trash 2 cards from the top of your deck.',
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: activateEffect");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });
});
