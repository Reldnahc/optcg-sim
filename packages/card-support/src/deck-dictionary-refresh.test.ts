import { afterEach, expect, it, vi } from "vitest";
import {
  createDeckHashCodec,
  getBundledDeckHashDictionary,
} from "optcg-deck-hash";

import { createPoneglyphDeckHashCodec } from "./poneglyph-card-source.js";

afterEach(() => vi.unstubAllGlobals());

it("refreshes future card IDs from the canonical dictionary for card probes", async () => {
  const dictionary = [...getBundledDeckHashDictionary().cards, "OP99-991"];
  const expected = {
    leader: { card_number: "OP99-991", count: 1 },
    main: [],
    don: null,
  };
  const hash = await createDeckHashCodec({ dictionary }).encode(expected);
  const fetchDictionary = vi.fn((url: unknown) => {
    expect(String(url)).toBe("https://api.poneglyph.one/v1/decks/dictionary");
    return Promise.resolve(
      new Response(JSON.stringify({ data: dictionary }), { status: 200 }),
    );
  });
  vi.stubGlobal("fetch", fetchDictionary);
  expect(await createPoneglyphDeckHashCodec().decode(hash)).toEqual(expected);
  expect(fetchDictionary).toHaveBeenCalledTimes(1);
});
