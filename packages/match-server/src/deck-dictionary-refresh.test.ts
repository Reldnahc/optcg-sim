import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDeckHashCodec,
  getBundledDeckHashDictionary,
} from "optcg-deck-hash";

import {
  createPoneglyphDeckHashCodec,
  decodeDeckHashSubmission,
} from "./deck-submission.js";

afterEach(() => vi.unstubAllGlobals());

describe("live deck dictionary refresh", () => {
  it.each(["auto", "raw"] as const)(
    "accepts future dictionary entries in %s hashes",
    async (compression) => {
      const dictionary = [
        ...getBundledDeckHashDictionary().cards,
        "OP99-991",
        "OP99-992",
      ];
      const hash = await createDeckHashCodec({ dictionary }).encode(
        {
          leader: { card_number: "OP99-991", count: 1 },
          main: [{ card_number: "OP99-992", count: 4, variant_index: 2 }],
          don: null,
        },
        { compression },
      );
      expect(hash.startsWith("!")).toBe(compression === "raw");
      const fetchDictionary = vi.fn((url: unknown) => {
        expect(String(url)).toBe(
          "https://api.poneglyph.one/v1/decks/dictionary",
        );
        return Promise.resolve(
          new Response(JSON.stringify({ data: dictionary }), {
            status: 200,
          }),
        );
      });
      vi.stubGlobal("fetch", fetchDictionary);
      const codec = createPoneglyphDeckHashCodec();
      for (let index = 0; index < 2; index += 1) {
        const submission = await decodeDeckHashSubmission({
          hash,
          donDeckCount: 10,
          codec,
        });
        expect(submission).toMatchObject({
          status: "ready",
          decoded: {
            leader: { cardId: "OP99-991", count: 1 },
            main: [{ cardId: "OP99-992", count: 4, variantIndex: 2 }],
          },
        });
      }
      expect(fetchDictionary).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects the submission when dictionary refresh is unavailable", async () => {
    const dictionary = [...getBundledDeckHashDictionary().cards, "OP99-991"];
    const hash = await createDeckHashCodec({ dictionary }).encode({
      leader: { card_number: "OP99-991", count: 1 },
      main: [],
      don: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 503 }))),
    );
    const submission = await decodeDeckHashSubmission({
      hash,
      donDeckCount: 10,
      codec: createPoneglyphDeckHashCodec(),
    });
    expect(submission).toMatchObject({
      status: "invalid",
      error: "Failed to fetch deck dictionary: 503 ",
    });
  });
});
