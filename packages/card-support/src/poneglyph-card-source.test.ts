import { describe, expect, it } from "vitest";

import {
  createPoneglyphCoverageEntriesFromCardIds,
  createPoneglyphCoverageEntriesFromDeckHash,
  createPoneglyphCoverageEntriesFromSet,
  type DeckHashCodecPort,
  type PoneglyphFetch,
} from "./poneglyph-card-source.js";

const jsonResponse = (payload: unknown) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(payload),
});

describe("poneglyph card source", () => {
  it("loads gameplay text entries for card ids", async () => {
    const fetchPoneglyph: PoneglyphFetch = () =>
      Promise.resolve(
        jsonResponse({
          data: {
            "OP01-001": {
              card_number: "OP01-001",
              effect: "[On Play] Draw 1 card.",
              trigger: null,
            },
          },
          missing: [],
        }),
      );

    const entries = await createPoneglyphCoverageEntriesFromCardIds(
      ["OP01-001"],
      { baseUrl: "https://example.test", fetchPoneglyph },
    );

    expect(entries).toEqual({
      ok: true,
      entries: [
        {
          label: "OP01-001 line 1",
          cardId: "OP01-001",
          lineNumber: 1,
          focusLineNumber: 1,
          text: "[On Play] Draw 1 card.",
        },
      ],
    });
  });

  it("filters raw keyword reminder lines without renumbering gameplay lines", async () => {
    const fetchPoneglyph: PoneglyphFetch = () =>
      Promise.resolve(
        jsonResponse({
          data: {
            "ST17-004": {
              card_number: "ST17-004",
              effect:
                "[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)\n[On Play] Draw 1 card.",
              trigger: null,
            },
          },
          missing: [],
        }),
      );

    const entries = await createPoneglyphCoverageEntriesFromCardIds(
      ["ST17-004"],
      { baseUrl: "https://example.test", fetchPoneglyph },
    );

    expect(entries).toEqual({
      ok: true,
      entries: [
        {
          label: "ST17-004 line 2",
          cardId: "ST17-004",
          lineNumber: 2,
          focusLineNumber: 1,
          text: "[On Play] Draw 1 card.",
        },
      ],
    });
  });

  it("uses full card runtime text as sibling context for focused coverage entries", async () => {
    const fetchPoneglyph: PoneglyphFetch = () =>
      Promise.resolve(
        jsonResponse({
          data: {
            "OP16-102": {
              card_number: "OP16-102",
              effect:
                "[On K.O.] Draw 1 card, then play up to 1 [Fullalead] from your hand or trash.",
              trigger: "[Trigger] Activate this card's [On K.O.] effect.",
            },
          },
          missing: [],
        }),
      );

    const entries = await createPoneglyphCoverageEntriesFromCardIds(
      ["OP16-102"],
      { baseUrl: "https://example.test", fetchPoneglyph },
    );

    expect(entries).toEqual({
      ok: true,
      entries: [
        {
          label: "OP16-102 line 1",
          cardId: "OP16-102",
          lineNumber: 1,
          focusLineNumber: 1,
          text: [
            "[On K.O.] Draw 1 card, then play up to 1 [Fullalead] from your hand or trash.",
            "[Trigger] Activate this card's [On K.O.] effect.",
          ].join("\n"),
        },
        {
          label: "OP16-102 line 2",
          cardId: "OP16-102",
          lineNumber: 2,
          focusLineNumber: 2,
          text: [
            "[On K.O.] Draw 1 card, then play up to 1 [Fullalead] from your hand or trash.",
            "[Trigger] Activate this card's [On K.O.] effect.",
          ].join("\n"),
        },
      ],
    });
  });

  it("skips deck construction metadata in behavior coverage entries", async () => {
    const fetchPoneglyph: PoneglyphFetch = () =>
      Promise.resolve(
        jsonResponse({
          data: {
            "OP16-042": {
              card_number: "OP16-042",
              effect:
                "Under the rules of this game, you may have any number of this card in your deck.",
              trigger: null,
            },
          },
          missing: [],
        }),
      );

    const entries = await createPoneglyphCoverageEntriesFromCardIds(
      ["OP16-042"],
      { baseUrl: "https://example.test", fetchPoneglyph },
    );

    expect(entries).toEqual({ ok: true, entries: [] });
  });

  it("skips alternate-name rules metadata in behavior coverage entries", async () => {
    const fetchPoneglyph: PoneglyphFetch = () =>
      Promise.resolve(
        jsonResponse({
          data: {
            "OP01-121": {
              card_number: "OP01-121",
              effect:
                "Also treat this card's name as [Kouzuki Oden] according to the rules.\n[Double Attack] (This card deals 2 damage.)",
              trigger: null,
            },
          },
          missing: [],
        }),
      );

    const entries = await createPoneglyphCoverageEntriesFromCardIds(
      ["OP01-121"],
      { baseUrl: "https://example.test", fetchPoneglyph },
    );

    expect(entries).toEqual({ ok: true, entries: [] });
  });

  it("skips deck-out replacement rules metadata in behavior coverage entries", async () => {
    const fetchPoneglyph: PoneglyphFetch = () =>
      Promise.resolve(
        jsonResponse({
          data: {
            "OP03-040": {
              card_number: "OP03-040",
              effect:
                "When your deck is reduced to 0, you win the game instead of losing, according to the rules.\n[DON!! x1] When this Leader's attack deals damage to your opponent's Life, you may trash 1 card from the top of your deck.",
              trigger: null,
            },
          },
          missing: [],
        }),
      );

    const entries = await createPoneglyphCoverageEntriesFromCardIds(
      ["OP03-040"],
      { baseUrl: "https://example.test", fetchPoneglyph },
    );

    expect(entries).toEqual({
      ok: true,
      entries: [
        {
          label: "OP03-040 line 2",
          cardId: "OP03-040",
          lineNumber: 2,
          focusLineNumber: 1,
          text: "[DON!! x1] When this Leader's attack deals damage to your opponent's Life, you may trash 1 card from the top of your deck.",
        },
      ],
    });
  });

  it("loads gameplay text entries for a set code", async () => {
    const seenUrls: string[] = [];
    const fetchPoneglyph: PoneglyphFetch = (url, init) => {
      seenUrls.push(String(url));
      if (String(url).includes("/v1/search?")) {
        return Promise.resolve(
          jsonResponse({ data: [{ card_number: "OP01-001" }] }),
        );
      }
      expect(String(url)).toBe("https://example.test/v1/cards/batch");
      expect(JSON.parse(String(init?.body))).toEqual({
        card_numbers: ["OP01-001"],
      });
      return Promise.resolve(
        jsonResponse({
          data: {
            "OP01-001": {
              card_number: "OP01-001",
              effect: "[On Play] Draw 1 card.",
              trigger: null,
            },
          },
          missing: [],
        }),
      );
    };

    const entries = await createPoneglyphCoverageEntriesFromSet("op01", {
      baseUrl: "https://example.test",
      fetchPoneglyph,
    });

    expect(entries.ok).toBe(true);
    expect(
      entries.ok ? entries.entries.map((entry) => entry.label) : [],
    ).toEqual(["OP01-001 line 1"]);
    expect(seenUrls).toEqual([
      "https://example.test/v1/search?page=1&limit=500&sort=card_number&order=asc&collapse=card",
      "https://example.test/v1/cards/batch",
    ]);
  });

  it("loads unique gameplay text entries for a deck hash", async () => {
    const deckHashCodec: DeckHashCodecPort = {
      decode: () =>
        Promise.resolve({
          leader: { card_number: "OP01-001", count: 1 },
          main: [{ card_number: "OP01-002", count: 4 }],
          don: null,
        }),
    };
    const fetchPoneglyph: PoneglyphFetch = () =>
      Promise.resolve(
        jsonResponse({
          data: {
            "OP01-001": {
              card_number: "OP01-001",
              effect: "[Activate: Main] Draw 1 card.",
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
      );

    const entries = await createPoneglyphCoverageEntriesFromDeckHash("hash", {
      baseUrl: "https://example.test",
      deckHashCodec,
      fetchPoneglyph,
    });

    expect(entries).toEqual({
      ok: true,
      entries: [
        {
          label: "OP01-001 line 1",
          cardId: "OP01-001",
          lineNumber: 1,
          focusLineNumber: 1,
          text: "[Activate: Main] Draw 1 card.",
        },
        {
          label: "OP01-002 line 1",
          cardId: "OP01-002",
          lineNumber: 1,
          focusLineNumber: 1,
          text: "[On Play] Draw 1 card.",
        },
      ],
    });
  });

  it("returns source errors instead of throwing for failed fetch and json parsing", async () => {
    const thrownFetch = await createPoneglyphCoverageEntriesFromCardIds(
      ["OP01-001"],
      {
        baseUrl: "https://example.test",
        fetchPoneglyph: () => Promise.reject(new Error("network down")),
      },
    );
    expect(thrownFetch).toEqual({
      ok: false,
      error: "Poneglyph card batch fetch failed: network down",
    });

    const thrownJson = await createPoneglyphCoverageEntriesFromCardIds(
      ["OP01-001"],
      {
        baseUrl: "https://example.test",
        fetchPoneglyph: () =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.reject(new Error("bad json")),
          }),
      },
    );
    expect(thrownJson).toEqual({
      ok: false,
      error: "Poneglyph card batch fetch failed: bad json",
    });
  });

  it("returns source errors for invalid batch payloads, missing cards, and set catalog HTTP failures", async () => {
    const invalidBatch = await createPoneglyphCoverageEntriesFromCardIds(
      ["OP01-001"],
      {
        baseUrl: "https://example.test",
        fetchPoneglyph: () => Promise.resolve(jsonResponse({ nope: true })),
      },
    );
    expect(invalidBatch).toEqual({
      ok: false,
      error: "Poneglyph card batch fetch failed: invalid response payload",
    });

    const missingBatch = await createPoneglyphCoverageEntriesFromCardIds(
      ["OP01-001"],
      {
        baseUrl: "https://example.test",
        fetchPoneglyph: () =>
          Promise.resolve(
            jsonResponse({
              data: {},
              missing: ["OP01-001"],
            }),
          ),
      },
    );
    expect(missingBatch).toEqual({
      ok: false,
      error: "Poneglyph card batch fetch failed: missing OP01-001",
    });

    const setHttpFailure = await createPoneglyphCoverageEntriesFromSet("OP01", {
      baseUrl: "https://example.test",
      fetchPoneglyph: () =>
        Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({}),
        }),
    });
    expect(setHttpFailure).toEqual({
      ok: false,
      error: "Poneglyph set catalog fetch failed for OP01: HTTP 503",
    });
  });

  it("returns source errors for deck hash decode rejection", async () => {
    const deckHashCodec: DeckHashCodecPort = {
      decode: () => Promise.reject(new Error("bad deck")),
    };

    const result = await createPoneglyphCoverageEntriesFromDeckHash("hash", {
      baseUrl: "https://example.test",
      deckHashCodec,
      fetchPoneglyph: () =>
        Promise.resolve(jsonResponse({ data: {}, missing: [] })),
    });

    expect(result).toEqual({
      ok: false,
      error: "Deck hash decode failed: bad deck",
    });
  });
});
