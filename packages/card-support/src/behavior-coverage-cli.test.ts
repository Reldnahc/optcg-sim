import { describe, expect, it } from "vitest";

import { createBehaviorCoverageCliReport } from "./behavior-coverage-cli.js";

describe("behavior coverage CLI", () => {
  it("keeps text coverage output compatible after the CLI becomes async", async () => {
    const report = await createBehaviorCoverageCliReport([
      "--",
      "--text",
      "[On Play] Draw 1 card.",
    ]);

    expect(report.exitCode).toBe(0);
    expect(report.errors).toEqual([]);
    expect(report.lines).toContain("Behavior coverage source: text");
    expect(report.lines).toContain("Behavior coverage entries: 1");
    expect(report.lines).toContain("Behavior coverage passed scenarios: 1");
    expect(report.lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Behavior coverage primitive coverage: 1\/\d+/u),
      ]),
    );
  });

  it("accepts multiple text entries", async () => {
    const report = await createBehaviorCoverageCliReport([
      "--",
      "--text",
      "[On Play] Draw 1 card.",
      "--text",
      "[Main] Draw 1 card.",
    ]);

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior coverage entries: 2");
    expect(report.lines).toContain("Behavior coverage passed scenarios: 2");
  });

  it("runs coverage for a card id", async () => {
    const report = await createBehaviorCoverageCliReport(
      ["--", "--card", "OP01-001"],
      {
        baseUrl: "https://example.test",
        fetchPoneglyph: () =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                data: {
                  "OP01-001": {
                    card_number: "OP01-001",
                    effect: "[On Play] Draw 1 card.",
                    trigger: null,
                  },
                },
                missing: [],
              }),
          }),
      },
    );

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior coverage source: card OP01-001");
    expect(report.lines).toContain("Behavior coverage entries: 1");
    expect(report.lines).toContain("Behavior coverage passed scenarios: 1");
  });

  it("probes referenced trigger lines with same-card context and skips deck construction metadata", async () => {
    const report = await createBehaviorCoverageCliReport(
      ["--", "--card", "OP16-102", "--card", "OP16-042"],
      {
        baseUrl: "https://example.test",
        fetchPoneglyph: () =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                data: {
                  "OP16-042": {
                    card_number: "OP16-042",
                    effect:
                      "Under the rules of this game, you may have any number of this card in your deck.",
                    trigger: null,
                  },
                  "OP16-102": {
                    card_number: "OP16-102",
                    effect:
                      "[On K.O.] Draw 1 card, then play up to 1 [Fullalead] from your hand or trash.",
                    trigger: "[Trigger] Activate this card's [On K.O.] effect.",
                  },
                },
                missing: [],
              }),
          }),
      },
    );

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain(
      "Behavior coverage source: card OP16-102, OP16-042",
    );
    expect(report.lines).toContain("Behavior coverage entries: 2");
    expect(report.lines).toContain("Behavior coverage passed scenarios: 2");
    expect(report.lines).toContain("Manifest view probe entries: 2");
    expect(report.lines).toContain("Manifest view probe failed: 0");
    expect(report.lines).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("unsupported referenced effect target"),
        expect.stringContaining("OP16-042"),
      ]),
    );
  });

  it("runs coverage for a set", async () => {
    const report = await createBehaviorCoverageCliReport(
      ["--", "--set", "OP01"],
      {
        baseUrl: "https://example.test",
        fetchPoneglyph: (url) => {
          if (String(url).includes("/v1/search?")) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({ data: [{ card_number: "OP01-001" }] }),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                data: {
                  "OP01-001": {
                    card_number: "OP01-001",
                    effect: "[On Play] Draw 1 card.",
                    trigger: null,
                  },
                },
                missing: [],
              }),
          });
        },
      },
    );

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior coverage source: set OP01");
  });

  it("runs coverage for multiple sets", async () => {
    const report = await createBehaviorCoverageCliReport(
      ["--", "--set", "OP01", "--set", "OP02"],
      {
        baseUrl: "https://example.test",
        fetchPoneglyph: (url) => {
          if (String(url).includes("/v1/search?")) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({
                  data: [
                    { card_number: "OP01-001" },
                    { card_number: "OP02-001" },
                  ],
                  pagination: { has_more: false },
                }),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                data: {
                  "OP01-001": {
                    card_number: "OP01-001",
                    effect: "[On Play] Draw 1 card.",
                    trigger: null,
                  },
                  "OP02-001": {
                    card_number: "OP02-001",
                    effect: "[On Play] Draw 1 card.",
                    trigger: null,
                  },
                },
                missing: [],
              }),
          });
        },
      },
    );

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior coverage source: sets OP01, OP02");
    expect(report.lines).toContain("Behavior coverage entries: 2");
    expect(report.lines).toContain("Behavior coverage passed scenarios: 2");
  });

  it("runs coverage for a deck hash", async () => {
    const report = await createBehaviorCoverageCliReport(
      ["--", "--deck-hash", "hash"],
      {
        baseUrl: "https://example.test",
        deckHashCodec: {
          decode: () =>
            Promise.resolve({
              leader: null,
              main: [{ card_number: "OP01-001", count: 4 }],
              don: null,
            }),
        },
        fetchPoneglyph: () =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                data: {
                  "OP01-001": {
                    card_number: "OP01-001",
                    effect: "[On Play] Draw 1 card.",
                    trigger: null,
                  },
                },
                missing: [],
              }),
          }),
      },
    );

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior coverage source: deck hash");
  });

  it("returns source-failed coverage when source loading fails", async () => {
    const report = await createBehaviorCoverageCliReport(
      ["--", "--card", "OP01-001"],
      {
        baseUrl: "https://example.test",
        fetchPoneglyph: () =>
          Promise.resolve({
            ok: false,
            status: 503,
            json: () => Promise.resolve({}),
          }),
      },
    );

    expect(report.exitCode).toBe(1);
    expect(report.bucketSummary.sourceFailed).toBe(1);
    expect(report.lines).toContain("Behavior coverage source: card OP01-001");
    expect(report.lines).toContain("Behavior coverage bucket sourceFailed: 1");
  });

  it("rejects conflicting source families instead of silently choosing one", async () => {
    const report = await createBehaviorCoverageCliReport([
      "--",
      "--text",
      "[On Play] Draw 1 card.",
      "--set",
      "OP01",
    ]);

    expect(report.exitCode).toBe(1);
    expect(report.errors).toEqual([
      "Choose exactly one behavior coverage source family: --text, --card, --set, --deck-hash, or --fixture",
    ]);
  });

  it("rejects multiple deck hash and fixture singleton source values", async () => {
    const deckHashReport = await createBehaviorCoverageCliReport([
      "--",
      "--deck-hash",
      "hash-1",
      "--deck-hash",
      "hash-2",
    ]);
    const fixtureReport = await createBehaviorCoverageCliReport([
      "--",
      "--fixture",
      "corpus",
      "--fixture",
      "other",
    ]);

    expect(deckHashReport.errors).toEqual([
      "Expected exactly one value for --deck-hash.",
    ]);
    expect(fixtureReport.errors).toEqual([
      "Expected exactly one value for --fixture.",
    ]);
  });

  it("rejects missing source values and stray positional args before source work", async () => {
    const missingCard = await createBehaviorCoverageCliReport([
      "--",
      "--card",
      "--set",
    ]);
    const missingDeckHash = await createBehaviorCoverageCliReport([
      "--",
      "--deck-hash",
    ]);
    const strayValue = await createBehaviorCoverageCliReport([
      "--",
      "OP01-001",
    ]);

    expect(missingCard.errors).toEqual(["Expected a value after --card."]);
    expect(missingDeckHash.errors).toEqual([
      "Expected a value after --deck-hash.",
    ]);
    expect(strayValue.errors).toEqual([
      "Unexpected behavior coverage argument: OP01-001",
    ]);
  });

  it("runs coverage for the curated fixture corpus", async () => {
    const report = await createBehaviorCoverageCliReport([
      "--",
      "--fixture",
      "corpus",
    ]);

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior coverage source: fixture corpus");
    expect(report.lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Behavior coverage entries: [1-9]\d*/u),
      ]),
    );
  });

  it("reports usage when text is missing", async () => {
    const report = await createBehaviorCoverageCliReport([]);

    expect(report.exitCode).toBe(1);
    expect(report.lines).toEqual([]);
    expect(report.errors).toEqual([
      "Usage: behavior:coverage -- --text <effect line> | --card <card id> | --set <set code> | --deck-hash <hash> | --fixture corpus",
    ]);
  });
});
