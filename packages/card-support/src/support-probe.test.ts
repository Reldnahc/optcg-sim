import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "@optcg/cards";
import { createSupportProbeReport } from "./support-probe-report.js";

describe("text-only support probe parser backend", () => {
  it("parses text without requiring card IDs or fixtures", () => {
    expect(parseCardEffectLine("[On Play] Draw 1 card.")).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: { type: "draw", count: 1, player: "self" },
      },
    });
  });

  it("reports engine runtime support for parsed reusable primitives", async () => {
    const report = await createSupportProbeReport({
      text: "[On Play] Trash 1 card from your hand.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports source span diagnostics for parsed text reports", async () => {
    const report = await createSupportProbeReport({
      text: "[On Play] Draw 1 card.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Source spans:");
    expect(report.lines).toContain("- span:entry [0, 9] entry:onPlay");
    expect(report.lines).toContain("- span:body [10, 22] instruction:draw");
  });

  it("reports primitive-first parser and runtime sections for parsed text", async () => {
    const report = await createSupportProbeReport({
      text: "[On Play] Draw 1 card.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Primitive parser: passed");
    expect(report.lines).toContain("Primitive runtime: passed");
    expect(report.lines).toContain("Parser certificate records:");
    expect(report.lines).toContain(
      "- parser entryPoint:onPlay spans span:entry",
    );
    expect(report.lines).toContain("Runtime support records:");
    expect(report.lines).toContain("- runtime body:draw passed");
    expect(report.lines).toContain("Diagnostics:");
    expect(report.lines).toContain("Parser evidence diagnostics:");
    expect(report.lines).not.toContain("Evidence:");
  });

  it("reports engine runtime support for deck-top trash movement", async () => {
    const report = await createSupportProbeReport({
      text: "[On Play] Trash 1 card from the top of your deck.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports engine runtime support for trigger DON deck movement", async () => {
    const report = await createSupportProbeReport({
      text: "[Trigger] Add up to 1 DON!! card from your DON!! deck and set it as active.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports engine runtime support for trigger activating this card's On K.O. effect", async () => {
    const report = await createSupportProbeReport({
      text: "[Trigger] Activate this card's [On K.O.] effect.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
    expect(report.lines).toContain(
      "- parser body:activateReferencedEffect spans span:body",
    );
  });

  it("reports engine runtime support for opponent-turn named-card base power", async () => {
    const report = await createSupportProbeReport({
      text: "[Opponent's Turn] All of your [Ohm] cards' base power and this Character's base power become 6000.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports engine runtime support for opponent-turn all-own-character cost gain", async () => {
    const report = await createSupportProbeReport({
      text: "[Opponent's Turn] All of your Characters gain +1 cost.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports engine runtime support for relative DON-count self hand cost reduction", async () => {
    const report = await createSupportProbeReport({
      text: "If the number of DON!! cards on your field is at least 2 less than the number on your opponent's field, give this card in your hand −3 cost.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports engine runtime support for named-card plus self keyword grants", async () => {
    const report = await createSupportProbeReport({
      text: "All of your [Ohm] cards and this Character gain [Double Attack].",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports engine runtime support for filtered trash-count power and cost gains", async () => {
    const report = await createSupportProbeReport({
      text: "If you have 4 or more Events in your trash, this Character gains +2000 power and +5 cost.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports engine runtime support for DON return, filtered trash-to-hand, and DON activation sequence", async () => {
    const report = await createSupportProbeReport({
      text: "[On Play] DON!! \u22121 (You may return the specified number of DON!! cards from your field to your DON!! deck.): Add up to 1 purple Event with a cost of 5 or less from your trash to your hand. Then, set up to 1 of your DON!! cards as active.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports engine runtime support for looked-set Life placement and deck-bottom remainder", async () => {
    const report = await createSupportProbeReport({
      text: "[On Play] Look at 3 cards from the top of your deck; add up to 1 card to the top of your Life cards. Then, place the rest at the bottom of your deck in any order.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports support for revealed filtered looked-set Life placement face-up", async () => {
    const report = await createSupportProbeReport({
      text: "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Blackbeard Pirates} type card and add it to the top of your Life cards face-up. Then, place the rest at the bottom of your deck in any order.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports support for hidden filtered looked-set bottom-Life placement", async () => {
    const report = await createSupportProbeReport({
      text: "[On Play] Look at 4 cards from the top of your deck; add up to 1 Character card with a cost of 4 or less to the bottom of your Life cards. Then, place the rest at the bottom of your deck in any order.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports support for optional hand-trash into selected trash-to-Life placement", async () => {
    const report = await createSupportProbeReport({
      text: "[On Play] You may trash 1 card from your hand: Add up to 1 {Blackbeard Pirates} type card with a cost of 6 or less from your trash to the top of your Life cards face-up.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports support for conditional Counter cannot-attack active Character restrictions", async () => {
    const report = await createSupportProbeReport({
      text: "[Counter] If you have 2 or less Life cards, up to 1 of your opponent's active Characters cannot attack during this turn.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
    expect(report.lines).toContain(
      "- parser duration:thisTurn spans span:body",
    );
    expect(report.lines).toContain(
      "- parser filter:state:active spans span:body",
    );
  });

  it("reports engine runtime support for DON return into conditional opponent hand trash", async () => {
    const report = await createSupportProbeReport({
      text: "[On Play] DON!! \u22121 (You may return the specified number of DON!! cards from your field to your DON!! deck.): If your opponent has 7 or more cards in their hand, trash 2 cards from your opponent's hand.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports engine runtime support for optional field-removal replacement effects", async () => {
    const report = await createSupportProbeReport({
      text: "If your {Sky Island} type Character with 6000 base power or more would be removed from the field by your opponent, you may add 1 card from the top of your Life cards to your hand instead.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports engine runtime support for opponent-attack optional rest-DON target-rest effects", async () => {
    const report = await createSupportProbeReport({
      text: "[On Your Opponent's Attack] [Once Per Turn] You may rest 1 of your DON!! cards: Rest up to 1 of your opponent's Leader or Character cards.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports raw keyword reminder lines as metadata-supported", async () => {
    const report = await createSupportProbeReport({
      text: "[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Kind: raw keyword");
    expect(report.lines).toContain("Keyword: blocker");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("ignores fully parenthesized reminder lines from fetched card text", async () => {
    const report = await createSupportProbeReport({
      cardId: "OP01-001",
      fetchCard: () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                card_number: "OP01-001",
                effect: [
                  "If you have 6 or less DON!! cards on your field, this Character gains [Rush].",
                  "(This card can attack on the turn in which it is played.)",
                  "[On Play] DON!! \u22121: Draw 1 card.",
                ].join("\n"),
              },
            }),
        }),
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Line 1 parse: passed");
    expect(report.lines).toContain("Line 2 parse: passed");
    expect(report.lines).not.toContain(
      "Line 2 text: (This card can attack on the turn in which it is played.)",
    );
    expect(report.lines).toContain(
      "Line 2 text: [On Play] DON!! \u22121: Draw 1 card.",
    );
  });

  it("reports parser success separately from unsupported engine runtime bodies", async () => {
    const report = await createSupportProbeReport({
      text: "[Your Turn] Draw 1 card.",
    });

    expect(report.exitCode).toBe(1);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: failed");
    expect(report.lines).toContain(
      "Engine runtime reason: unsupported permanent effect body",
    );
    expect(report.lines).toContain("Missing runtime capability evidence:");
    expect(report.lines).toContain(
      "- runtime body:draw missing unsupported permanent effect body",
    );
  });

  it("fetches card probe text from Poneglyph API instead of local fixtures", async () => {
    const requestedUrls: string[] = [];
    const report = await createSupportProbeReport({
      cardId: "OP10-045",
      fetchCard: (url) => {
        requestedUrls.push(String(url));
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                card_number: "OP10-045",
                effect:
                  "[When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.",
              },
            }),
        });
      },
    });

    expect(report.exitCode).toBe(0);
    expect(requestedUrls).toEqual([
      "https://api.poneglyph.one/v1/cards/OP10-045",
    ]);
    expect(report.lines).toContain("Card ID: OP10-045");
    expect(report.lines).toContain("Line 1 parse: passed");
    expect(report.lines).toContain("Line 1 engine runtime: passed");
  });

  it("includes primitive missing runtime sections in card probe failures", async () => {
    const report = await createSupportProbeReport({
      cardId: "OP01-002",
      fetchCard: () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                card_number: "OP01-002",
                effect: "[Your Turn] Draw 1 card.",
                trigger: null,
              },
            }),
        }),
    });

    expect(report.exitCode).toBe(1);
    expect(report.lines).toContain("Line 1 primitive parser: passed");
    expect(report.lines).toContain("Line 1 primitive runtime: failed");
    expect(report.lines).toContain("Line 1 runtime support records:");
    expect(report.lines).toContain("Line 1 - runtime body:draw failed");
    expect(report.lines).toContain(
      "Line 1 missing runtime capability evidence:",
    );
    expect(report.lines).toContain(
      "Line 1 - runtime body:draw missing unsupported permanent effect body",
    );
  });

  it("includes separately fetched trigger text in card probe mode", async () => {
    const report = await createSupportProbeReport({
      cardId: "OP01-003",
      fetchCard: () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                card_number: "OP01-003",
                effect: "[On Play] Draw 1 card.",
                trigger: "[Trigger] Draw 1 card.",
              },
            }),
        }),
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Line 1 text: [On Play] Draw 1 card.");
    expect(report.lines).toContain("Line 1 parse: passed");
    expect(report.lines).toContain("Line 2 text: [Trigger] Draw 1 card.");
    expect(report.lines).toContain("Line 2 parse: passed");
    expect(report.lines).toContain("Line 2 engine runtime: passed");
  });

  it("includes separately fetched trigger text in deck-hash probe mode", async () => {
    const report = await createSupportProbeReport({
      deckHash: "hash-with-trigger-card",
      deckHashCodec: {
        decode: () =>
          Promise.resolve({
            leader: null,
            main: [{ card_number: "OP01-004", count: 1 }],
            don: null,
          }),
      },
      fetchCard: () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                "OP01-004": {
                  card_number: "OP01-004",
                  effect: "",
                  trigger: "[Trigger] Draw 1 card.",
                },
              },
              missing: [],
            }),
        }),
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Failures: none");
    expect(report.lines).not.toContain("Card ID: OP01-004 x1");
    expect(report.lines).not.toContain(
      "OP01-004 line 1 text: [Trigger] Draw 1 card.",
    );
  });

  it("reports Poneglyph API fetch failures in card probe mode", async () => {
    const report = await createSupportProbeReport({
      cardId: "OP10-999",
      fetchCard: () =>
        Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({}),
        }),
    });

    expect(report).toEqual({
      exitCode: 1,
      lines: [],
      errors: ["Poneglyph card fetch failed for OP10-999: HTTP 404"],
    });
  });

  it("probes decoded deck-hash card lists without requiring a leader", async () => {
    const requestedUrls: string[] = [];
    const requestedBodies: unknown[] = [];
    const report = await createSupportProbeReport({
      deckHash: "hash-with-card-list",
      deckHashCodec: {
        decode: () =>
          Promise.resolve({
            leader: null,
            main: [
              { card_number: "OP01-001", count: 4, variant_index: 2 },
              { card_number: "OP01-002", count: 1 },
              { card_number: "OP01-001", count: 1, variant_index: 3 },
            ],
            don: null,
          }),
      },
      fetchCard: (url, init) => {
        requestedUrls.push(String(url));
        requestedBodies.push(JSON.parse(init?.body ?? "{}"));
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
                "OP01-002": {
                  card_number: "OP01-002",
                  effect: "[On Play] Draw 1 card.",
                  trigger: null,
                },
              },
              missing: [],
            }),
        });
      },
    });

    expect(report.exitCode).toBe(0);
    expect(requestedUrls).toEqual(["https://api.poneglyph.one/v1/cards/batch"]);
    expect(requestedBodies).toEqual([
      { card_numbers: ["OP01-001", "OP01-002"] },
    ]);
    expect(report.lines).toContain("Deck hash: hash-with-card-list");
    expect(report.lines).toContain("Cards: 2 unique / 6 total");
    expect(report.lines).toContain("Failures: none");
    expect(report.lines).not.toContain("Card ID: OP01-001 x5 variants: 2, 3");
    expect(report.lines).not.toContain("Card ID: OP01-002 x1");
    expect(report.lines).not.toContain("OP01-001 line 1 parse: passed");
    expect(report.lines).not.toContain(
      "OP01-002 line 1 engine runtime: passed",
    );
  });

  it("probes every card in a set with batched card detail fetches", async () => {
    const requestedUrls: string[] = [];
    const requestedBodies: unknown[] = [];
    const report = await createSupportProbeReport({
      setCode: "op16",
      fetchCard: (url, init) => {
        requestedUrls.push(String(url));
        if (String(url).includes("/v1/search?")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                data: [
                  { card_number: "OP16-001" },
                  { card_number: "OP16-002" },
                  { card_number: "OP15-001" },
                ],
                pagination: { has_more: false },
              }),
          });
        }

        requestedBodies.push(JSON.parse(init?.body ?? "{}"));
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                "OP16-001": {
                  card_number: "OP16-001",
                  effect: "[On Play] Draw 1 card.",
                  trigger: null,
                },
                "OP16-002": {
                  card_number: "OP16-002",
                  effect: "[On Play] Draw 1 card.",
                  trigger: null,
                },
              },
              missing: [],
            }),
        });
      },
    });

    expect(report.exitCode).toBe(0);
    expect(requestedUrls).toEqual([
      "https://api.poneglyph.one/v1/search?page=1&limit=500&sort=card_number&order=asc&collapse=card",
      "https://api.poneglyph.one/v1/cards/batch",
    ]);
    expect(requestedBodies).toEqual([
      { card_numbers: ["OP16-001", "OP16-002"] },
    ]);
    expect(report.lines).toContain("Set: OP16");
    expect(report.lines).toContain("Cards: 2");
    expect(report.lines).toContain("Failures: none");
    expect(report.lines).not.toContain("Card ID: OP15-001 x1");
  });

  it("prints only failing cards in deck-hash probe mode", async () => {
    const report = await createSupportProbeReport({
      deckHash: "hash-with-one-failure",
      deckHashCodec: {
        decode: () =>
          Promise.resolve({
            leader: null,
            main: [
              { card_number: "OP01-001", count: 4 },
              { card_number: "OP01-002", count: 1 },
            ],
            don: null,
          }),
      },
      fetchCard: () => {
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
                "OP01-002": {
                  card_number: "OP01-002",
                  effect: "[Your Turn] Draw 1 card.",
                  trigger: null,
                },
              },
              missing: [],
            }),
        });
      },
    });

    expect(report.exitCode).toBe(1);
    expect(report.lines).toContain("Failures: 1 card");
    expect(report.lines).not.toContain("Card ID: OP01-001 x4");
    expect(report.lines).not.toContain("OP01-001 line 1 parse: passed");
    expect(report.lines).toContain("Card ID: OP01-002 x1");
    expect(report.lines).toContain(
      "OP01-002 line 1 text: [Your Turn] Draw 1 card.",
    );
    expect(report.lines).toContain("OP01-002 line 1 parse: passed");
    expect(report.lines).toContain("OP01-002 line 1 engine runtime: failed");
    expect(report.lines).toContain("OP01-002 line 1 primitive parser: passed");
    expect(report.lines).toContain("OP01-002 line 1 primitive runtime: failed");
    expect(report.lines).toContain("OP01-002 line 1 runtime support records:");
    expect(report.lines).toContain(
      "OP01-002 line 1 - runtime body:draw failed",
    );
    expect(report.lines).toContain(
      "OP01-002 line 1 missing runtime capability evidence:",
    );
    expect(report.lines).toContain(
      "OP01-002 line 1 - runtime body:draw missing unsupported permanent effect body",
    );
  });

  it("prints only raw unsupported text lines in deck-hash raw mode", async () => {
    const report = await createSupportProbeReport({
      deckHash: "hash-with-raw-failures",
      deckHashOutput: "unsupportedTextLines",
      deckHashCodec: {
        decode: () =>
          Promise.resolve({
            leader: null,
            main: [
              { card_number: "OP01-001", count: 4 },
              { card_number: "OP01-002", count: 1 },
            ],
            don: null,
          }),
      },
      fetchCard: () => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                "OP01-001": {
                  card_number: "OP01-001",
                  effect: "[On Play] Draw 1 card.\n[Your Turn] Draw 1 card.",
                  trigger: null,
                },
                "OP01-002": {
                  card_number: "OP01-002",
                  effect: "[Main] unsupported body.",
                  trigger: null,
                },
              },
              missing: [],
            }),
        });
      },
    });

    expect(report).toEqual({
      exitCode: 1,
      lines: ["[Your Turn] Draw 1 card.", "[Main] unsupported body."],
      errors: [],
    });
  });
});
