import { afterEach, expect, it, vi } from "vitest";
import {
  createDeckHashCodec,
  getBundledDeckHashDictionary,
} from "optcg-deck-hash";

import { createSupportProbeReport } from "./support-probe-report.js";

afterEach(() => vi.unstubAllGlobals());

it("refreshes future card IDs from the canonical dictionary for card probes", async () => {
  const dictionary = [...getBundledDeckHashDictionary().cards, "OP99-991"];
  const hash = await createDeckHashCodec({ dictionary }).encode({
    leader: { card_number: "OP99-991", count: 1 },
    main: [],
    don: null,
  });
  const fetchDictionary = vi.fn((url: unknown) => {
    expect(String(url)).toBe("https://api.poneglyph.one/v1/decks/dictionary");
    return Promise.resolve(
      new Response(JSON.stringify({ data: dictionary }), { status: 200 }),
    );
  });
  vi.stubGlobal("fetch", fetchDictionary);
  const report = await createSupportProbeReport({
    deckHash: hash,
    fetchCard: (url) => {
      expect(url).toBe("https://api.poneglyph.one/v1/cards/OP99-991");
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: { card_number: "OP99-991", effect: null, trigger: null },
          }),
      });
    },
  });
  expect(report.exitCode).toBe(0);
  expect(report.errors).toEqual([]);
  expect(fetchDictionary).toHaveBeenCalledTimes(1);
});
