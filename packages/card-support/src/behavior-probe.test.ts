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

  it("keeps deck zone refs stable after life-count setup for attack scenarios", () => {
    const report = createBehaviorProbeReport({
      text: "[When Attacking] If you have 3 or less Life cards, add up to 1 DON!! card from your DON!! deck and set it as active.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: declareAttack");
    expect(report.lines).toContain("Scenario 1 result: passed");
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

  it("profiles Activate Main sources from self stat conditions", () => {
    const report = createBehaviorProbeReport({
      text: "[Activate: Main] [Once Per Turn] If this Character has 7000 power or more, play up to 1 {Revolutionary Army} type Character card with 5000 power or less other than [Emporio.Ivankov] from your hand.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: activateEffect");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("seeds field cards for Activate Main trash-from-field costs", () => {
    const report = createBehaviorProbeReport({
      text: "[Activate: Main] [Once Per Turn] You may trash 1 of your Characters with 6000 power or more: Play up to 1 {FILM} type Character card with 2000 to 5000 power from your trash rested.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: activateEffect");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("seeds Stage cards for Activate Main move-from-stage costs", () => {
    const report = createBehaviorProbeReport({
      text: "[Activate: Main] [Once Per Turn] You may place 1 Stage with a cost of 1 at the bottom of the owner's deck: K.O. up to 1 of your opponent's Characters with a cost of 2 or less.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: activateEffect");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("does not seed an extra matching field card for no-other self conditions", () => {
    const report = createBehaviorProbeReport({
      text: "[Activate: Main] [Once Per Turn] If your Leader has the {Foxy Pirates} type and you have no other [Itomimizu], add up to 1 DON!! card from your DON!! deck and rest it.",
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

  it("keeps a trigger card in Life while setting up zero-life trigger conditions", () => {
    const report = createBehaviorProbeReport({
      text: "[Trigger] If you have 0 Life cards, you may add up to 1 card from the top of your deck to the top of your Life cards. Then, trash 1 card from your hand.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: lifeTrigger");
    expect(report.lines).toContain("Scenario 1 result: passed");
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

  it("builds matching Counter Event targets from type-filtered Leader or Character requests", () => {
    const report = createBehaviorProbeReport({
      text: "[Counter] Up to 1 of your {Thriller Bark Pirates} type Leader or Character cards gains +3000 power during this battle.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: counter");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("runs Counter Event sequences with reusable rest-from-field costs", () => {
    const report = createBehaviorProbeReport({
      text: "[Counter] You may rest 1 of your cards: Up to 1 of your Leader or Character cards gains +4000 power during this battle.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: counter");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("runs Counter Event sequences with draw before battle power", () => {
    const report = createBehaviorProbeReport({
      text: "[Counter] Draw 1 card and your Leader gains +3000 power during this battle.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: counter");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("runs Counter Event sequences with reusable return-DON costs and continued power", () => {
    const report = createBehaviorProbeReport({
      text: "[Counter] DON!! \u22121: If your Leader has the {Donquixote Pirates} type, up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, that card gains an additional +2000 power during this turn.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: counter");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("runs Counter Event sequences with non-power target restrictions", () => {
    const report = createBehaviorProbeReport({
      text: "[Counter] If you have 2 or less Life cards, up to 1 of your opponent's active Characters cannot attack during this turn.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: counter");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("builds trash cards for trash-to-deck activation costs", () => {
    const report = createBehaviorProbeReport({
      text: "[Activate: Main] [Once Per Turn] You may place 1 card from your trash at the bottom of your deck: Give up to 1 rested DON!! card to your Leader or 1 of your Characters.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: activateEffect");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("resolves rested-DON attachment before optional bounce-play tails", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play] Give up to 1 rested DON!! card to your Leader. Then, you may return up to 1 of your opponent's Characters with a cost of 5 or less to the owner's hand. If you do, your opponent plays up to 1 Character card with a cost of 4 or less from their hand.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: playCard");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("routes trigger-activation anyOf reactions to behavior scenarios", () => {
    const report = createBehaviorProbeReport({
      text: "[Opponent's Turn] When a [Trigger] activates, this Character gains [Blocker] during this turn.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: triggerActivated");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("routes self Event activation reactions during the opponent turn", () => {
    const report = createBehaviorProbeReport({
      text: "[Opponent's Turn] [Once Per Turn] When you activate an Event, add up to 1 DON!! card from your DON!! deck and set it as active.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: effectQueued");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("routes outside-draw-phase card-drawn reactions through behavior scenarios", () => {
    const report = createBehaviorProbeReport({
      text: "[Your Turn] [Once Per Turn] When you draw a card outside of your Draw Phase, this Character gains +2000 power during this turn.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: cardDrawn");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("routes On Block reactions through blocker activation", () => {
    const report = createBehaviorProbeReport({
      text: "[On Block] Rest up to 1 of your opponent's Characters with a cost of 5 or less.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: onBlock");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("routes start-of-turn activations through behavior scenarios", () => {
    const report = createBehaviorProbeReport({
      text: "This effect can be activated at the start of your turn. If you have 8 or more DON!! cards on your field, look at 5 cards from the top of your deck; reveal up to 1 {Straw Hat Crew} type card and add it to your hand. Then, place the rest at the top or bottom of the deck in any order.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: startOfYourTurn");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("routes leader attack-declared reactions through behavior scenarios", () => {
    const report = createBehaviorProbeReport({
      text: "When this Leader attacks your opponent's Leader, if you have 2 or more Characters with a cost of 8 or more, draw 1 card.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: attackDeclared");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("answers top-or-bottom Life placement decisions", () => {
    const report = createBehaviorProbeReport({
      text: "[Main] Look at up to 1 card from the top of your or your opponent's Life cards and place it at the top or bottom of the Life cards. Then, K.O. up to 1 of your opponent's Characters with a cost of 5 or less.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: playCard");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("runs Counter Event power effects with trailing field activation", () => {
    const report = createBehaviorProbeReport({
      text: "[Counter] If you have 1 or less Life cards, up to 1 of your Leader or Character cards gains +3000 power during this battle. Then, set up to 1 of your Characters with a cost of 5 or less as active.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: counter");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("runs DON-attached Leader activations with delayed attack restrictions", () => {
    const report = createBehaviorProbeReport({
      text: "[DON!! x3] [Activate: Main] [Once Per Turn] If this Leader battles your opponent's Character during this turn, set this Leader as active. Then, this Leader cannot attack your opponent's Characters with a base cost of 7 or less during this turn.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: activateEffect");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("runs optional rest-DON and rest-self activation costs before search bodies", () => {
    const report = createBehaviorProbeReport({
      text: "[Activate: Main] You may rest 1 of your DON!! cards and this Character: If your Leader is [Roronoa Zoro], look at 5 cards from the top of your deck; reveal up to 1 <Slash> attribute card or green Event and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: activateEffect");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("builds any-player targets for other-character bounce effects", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play] If your Leader has the {The Seven Warlords of the Sea} type, return up to 1 Character with a cost of 1 or less other than this Character to the owner's hand.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: playCard");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("runs Counter Event power effects with trailing hand trash", () => {
    const report = createBehaviorProbeReport({
      text: "[Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, trash 1 card from your hand.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: counter");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("runs optional trash-to-deck costs before conditional trash play bodies", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play] You may place 3 {Revolutionary Army} type cards from your trash at the bottom of your deck in any order: If your Leader has the {Revolutionary Army} type, play up to 1 Character card with a cost of 6 or less from your trash.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: playCard");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("runs Life Trigger draw-then-trash sequences after drawing into hand", () => {
    const report = createBehaviorProbeReport({
      text: "[Trigger] If your Leader is [Nico Robin], draw 3 cards and trash 2 cards from your hand.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: lifeTrigger");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("runs Life Trigger top-deck-to-Life sequences before hand trash", () => {
    const report = createBehaviorProbeReport({
      text: "[Trigger] If your Leader has the {Egghead} type, add up to 1 card from the top of your deck to the top of your Life cards. Then, trash 2 cards from your hand.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: lifeTrigger");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("runs Life Trigger optional return costs before target bounce bodies", () => {
    const report = createBehaviorProbeReport({
      text: "[Trigger] You may return 1 of your Characters to the owner's hand: Return up to 1 of your opponent's Characters with a cost of 5 or less to the owner's hand.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: lifeTrigger");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("runs optional trash-to-deck costs before opponent hand trash and trash bottoming", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play] You may place 3 cards from your trash at the bottom of your deck in any order: Your opponent trashes 1 card from their hand. Then, you may place up to 1 card from your opponent's trash at the bottom of their deck.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: playCard");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("continues sequences through multiple hand-trash decisions", () => {
    const report = createBehaviorProbeReport({
      text: "[When Attacking] Draw 1 card and trash 1 card from your hand. Then, trash up to 3 cards from your hand.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: declareAttack");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("continues sequences through opponent hand-trash decisions", () => {
    const report = createBehaviorProbeReport({
      text: "[When Attacking] DON!! \u22121: Your opponent trashes 1 card from their hand.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: declareAttack");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("does not over-seed field cards for low field-count activation conditions", () => {
    const report = createBehaviorProbeReport({
      text: "[Activate: Main] [Once Per Turn] If you have 1 or less Characters, the next time you play a {Land of Wano} type Character card with a cost of 3 or more from your hand during this turn, the cost will be reduced by 1.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: activateEffect");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("seeds Trigger cards for trigger-filtered activation costs", () => {
    const report = createBehaviorProbeReport({
      text: "[Activate: Main] [Once Per Turn] You may trash 1 card with a [Trigger] from your hand: Rest up to 1 of your opponent's Characters with a cost of 2 or less.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: activateEffect");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("proves DON-attached reactions through generated scenarios", () => {
    const report = createBehaviorProbeReport({
      text: "[Your Turn] When this Leader or any of your Characters is given a DON!! card, give up to 1 of your opponent's Characters with a cost of 7 or less \u22121 cost during this turn.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: donAttached");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("proves damage-dealt reactions through generated combat scenarios", () => {
    const report = createBehaviorProbeReport({
      text: "[DON!! x1] When this Character's attack deals damage to your opponent's Life, you may trash 7 cards from the top of your deck.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: damageDealt");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("proves end-of-battle reactions through generated battle scenarios", () => {
    const report = createBehaviorProbeReport({
      text: "[Your Turn] At the end of a battle in which this Character battles your opponent's Character with a cost of 5 or less, place the opponent's Character you battled with at the bottom of the owner's deck.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: endOfBattle");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("runs counter power effects with trailing deck trash", () => {
    const report = createBehaviorProbeReport({
      text: "[Counter] You may trash 1 card from your hand: Up to 1 of your Leader gains +4000 power during this battle. Then, you may trash 2 cards from the top of your deck.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: counter");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });
});
