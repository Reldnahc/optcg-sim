import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { CardId } from "@optcg/types";

import {
  decodeDeckHashSubmission,
  type DeckHashCodecPort,
} from "./deck-submission.js";

const fakeCodec = (
  deck: Awaited<ReturnType<DeckHashCodecPort["decode"]>>,
): DeckHashCodecPort => ({
  decode: () => Promise.resolve(deck),
});

describe("deck hash submissions", () => {
  test("decodes leader and main entries while preserving variant indexes", async () => {
    const submission = await decodeDeckHashSubmission({
      hash: "hash-value",
      donDeckCount: 6,
      codec: fakeCodec({
        leader: {
          card_number: "OP15-058",
          count: 1,
          variant_index: 2,
        },
        main: [
          { card_number: "OP15-061", count: 4, variant_index: 0 },
          { card_number: "OP15-066", count: 2 },
        ],
        don: { card_number: "DON!!", count: 10, variant_index: 9 },
        format: "opcg",
      }),
    });

    assert.equal(submission.status, "ready");
    assert.equal(submission.source, "deckHash");
    assert.equal(submission.hash, "hash-value");
    assert.equal(submission.donDeckCount, 6);
    assert.deepEqual(submission.decoded.leader, {
      cardId: "OP15-058" as CardId,
      count: 1,
      variantIndex: 2,
    });
    assert.deepEqual(submission.decoded.main, [
      { cardId: "OP15-061" as CardId, count: 4, variantIndex: 0 },
      { cardId: "OP15-066" as CardId, count: 2 },
    ]);
  });

  test("ignores decoded DON entries because DON deck setup is separate", async () => {
    const submission = await decodeDeckHashSubmission({
      hash: "hash-value",
      donDeckCount: 10,
      codec: fakeCodec({
        leader: { card_number: "OP15-058", count: 1 },
        main: [{ card_number: "OP15-061", count: 4 }],
        don: { card_number: "DON!!", count: 1, variant_index: 7 },
      }),
    });

    assert.equal(submission.status, "ready");
    assert.equal(JSON.stringify(submission).includes("DON!!"), false);
    assert.equal(submission.donDeckCount, 10);
  });

  test("fails closed when the hash has no one-copy leader", async () => {
    const noLeader = await decodeDeckHashSubmission({
      hash: "hash-value",
      donDeckCount: 10,
      codec: fakeCodec({
        leader: null,
        main: [{ card_number: "OP15-061", count: 4 }],
        don: null,
      }),
    });
    assert.equal(noLeader.status, "invalid");
    assert.match(noLeader.error, /one leader/u);

    const tooManyLeaders = await decodeDeckHashSubmission({
      hash: "hash-value",
      donDeckCount: 10,
      codec: fakeCodec({
        leader: { card_number: "OP15-058", count: 2 },
        main: [],
        don: null,
      }),
    });
    assert.equal(tooManyLeaders.status, "invalid");
    assert.match(tooManyLeaders.error, /one leader/u);
  });

  test("fails closed for invalid counts and codec failures", async () => {
    const badCount = await decodeDeckHashSubmission({
      hash: "hash-value",
      donDeckCount: 10,
      codec: fakeCodec({
        leader: { card_number: "OP15-058", count: 1 },
        main: [{ card_number: "OP15-061", count: 0 }],
        don: null,
      }),
    });
    assert.equal(badCount.status, "invalid");
    assert.match(badCount.error, /positive integer/u);

    const failedDecode = await decodeDeckHashSubmission({
      hash: "hash-value",
      donDeckCount: 10,
      codec: {
        decode: () => Promise.reject(new Error("bad hash")),
      },
    });
    assert.equal(failedDecode.status, "invalid");
    assert.match(failedDecode.error, /bad hash/u);
  });
});
