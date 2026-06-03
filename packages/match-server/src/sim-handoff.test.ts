import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  createPoneglyphSimHandoffVerifier,
  normalizeResolvedLoadout,
} from "./sim-handoff.js";

interface RecordedRequest {
  readonly url: string;
  readonly init?: RequestInit;
}

const responseJson = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const resolvedLoadoutBody = () => ({
  loadout_id: "loadout-1",
  user_id: "user-1",
  main_deck: {
    deck_id: "deck-1",
    hash: "deck-hash",
    deck: {
      leader: { card: "OP15-058", count: 1, variantIndex: 2 },
      main: [
        { card: "OP15-061", count: 4, variantIndex: 3 },
        { card_number: "OP15-066", count: 2 },
      ],
      don: null,
      format: "opcg",
    },
  },
  don_deck: {
    don_deck_id: "don-1",
    payload: {
      cards: [
        { id: "don-a", count: 4 },
        { id: "don-b", count: 2 },
      ],
    },
  },
  cosmetics: {
    playmat_id: "playmat-1",
    don_sleeve_id: "don-sleeve-1",
    deck_sleeve_id: "deck-sleeve-1",
  },
});

describe("sim handoff verification client", () => {
  test("posts a handoff token and normalizes verified claims and loadout", async () => {
    const requests: RecordedRequest[] = [];
    const verifier = createPoneglyphSimHandoffVerifier({
      authBaseUrl: "https://auth.example/",
      fetch: (input, init) => {
        requests.push({
          url: input instanceof Request ? input.url : String(input),
          ...(init === undefined ? {} : { init }),
        });
        return Promise.resolve(
          responseJson({
            data: {
              claims: {
                jti: "token-1",
                sub: "user-1",
                sid: "session-1",
                loadout_id: "loadout-1",
                lobby_id: "lobby-1",
                seat_id: "p1",
                aud: "optcg-sim",
                iat: 1,
                exp: 2,
              },
              resolved_loadout: resolvedLoadoutBody(),
            },
          }),
        );
      },
    });

    const result = await verifier.verify("handoff-token");
    const request = requests[0];
    if (request === undefined) {
      throw new Error("Expected the handoff verifier to call auth.");
    }

    assert.equal(request.url, "https://auth.example/v1/sim/handoff/verify");
    assert.equal(
      request.init?.body,
      JSON.stringify({ token: "handoff-token" }),
    );
    assert.deepEqual(result.claims, {
      jti: "token-1",
      sub: "user-1",
      sid: "session-1",
      loadout_id: "loadout-1",
      lobby_id: "lobby-1",
      seat_id: "p1",
      aud: "optcg-sim",
      iat: 1,
      exp: 2,
    });
    assert.equal(result.resolvedLoadout.mainDeck.leader.variantIndex, 2);
    assert.equal(result.resolvedLoadout.mainDeck.main[0]?.variantIndex, 3);
    assert.equal(result.resolvedLoadout.donDeck.count, 6);
  });

  test("rejects auth service failures with the service error message", async () => {
    const verifier = createPoneglyphSimHandoffVerifier({
      fetch: () =>
        Promise.resolve(
          responseJson(
            { error: { status: 401, message: "Invalid sim handoff token." } },
            401,
          ),
        ),
    });

    await assert.rejects(
      () => verifier.verify("bad-token"),
      /Invalid sim handoff token/u,
    );
  });
});

describe("resolved loadout normalization", () => {
  test("fails closed when leader is not exactly one copy", () => {
    const body = resolvedLoadoutBody();
    body.main_deck.deck.leader.count = 2;

    assert.throws(() => normalizeResolvedLoadout(body), /leader/u);
  });
});
