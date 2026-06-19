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

  it("reports runtime-supported entrypoints that do not have generated scenarios yet", () => {
    const report = createBehaviorProbeReport({
      text: "[When Attacking] Draw 1 card.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: skipped");
    expect(report.lines).toContain(
      "Scenario 1 result: skipped - no generated scenario for trigger whenAttacking",
    );
    expect(report.scenarios).toEqual([
      {
        index: 1,
        status: "skipped",
        primitiveTypes: ["draw"],
        reason: "no generated scenario for trigger whenAttacking",
      },
    ]);
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
});
