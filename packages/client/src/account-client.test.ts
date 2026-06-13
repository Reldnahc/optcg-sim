import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { createPoneglyphAccountClient } from "./account-client.js";

interface RecordedRequest {
  readonly url: string;
  readonly init?: RequestInit;
}

const responseJson = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("Poneglyph account client", () => {
  test("lists account deck loadouts through the lean loadouts endpoint", async () => {
    const requests: RecordedRequest[] = [];
    const client = createPoneglyphAccountClient({
      baseUrl: "https://auth.example/",
      fetch(input, init) {
        requests.push({
          url: input instanceof Request ? input.url : String(input),
          ...(init === undefined ? {} : { init }),
        });
        return Promise.resolve(
          responseJson({
            data: [
              {
                id: "loadout-1",
                name: "Enel",
                main_deck_id: "deck-1",
                don_deck_id: "don-1",
                playmat_id: "playmat-1",
                don_sleeve_id: "don-sleeve-1",
                deck_sleeve_id: "deck-sleeve-1",
                icon_id: "icon-1",
                updated_at: "2026-06-02T00:00:00.000Z",
              },
              {
                id: "loadout-2",
                name: "Unfiled Luffy",
                main_deck_id: "deck-2",
                don_deck_id: null,
                playmat_id: "playmat-1",
                don_sleeve_id: "don-sleeve-1",
                deck_sleeve_id: "deck-sleeve-1",
                icon_id: "icon-1",
                updated_at: "2026-06-03T00:00:00.000Z",
              },
            ],
          }),
        );
      },
    });

    const loadouts = await client.listLoadouts();

    const request = requests[0];
    if (request === undefined) {
      throw new Error("Expected a loadout list request.");
    }
    assert.equal(request.url, "https://auth.example/v1/loadouts");
    assert.equal(request.init?.credentials, "include");
    assert.deepEqual(loadouts, [
      {
        id: "loadout-1",
        name: "Enel",
        folderId: null,
        folderName: null,
        favorite: false,
        leaderCardId: null,
        leaderVariantIndex: null,
        leaderImageUrl: null,
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
      {
        id: "loadout-2",
        name: "Unfiled Luffy",
        folderId: null,
        folderName: null,
        favorite: false,
        leaderCardId: null,
        leaderVariantIndex: null,
        leaderImageUrl: null,
        updatedAt: "2026-06-03T00:00:00.000Z",
      },
    ]);
  });

  test("creates sim handoff tokens without sending deck contents", async () => {
    const requests: RecordedRequest[] = [];
    const client = createPoneglyphAccountClient({
      baseUrl: "https://auth.example",
      fetch(input, init) {
        requests.push({
          url: input instanceof Request ? input.url : String(input),
          ...(init === undefined ? {} : { init }),
        });
        return Promise.resolve(
          responseJson({
            data: {
              token: "handoff-token",
              expires_at: "2026-06-02T00:05:00.000Z",
              resolved_loadout: {
                loadout_id: "loadout-1",
                user_id: "user-1",
                main_deck: {
                  deck_id: "deck-1",
                  hash: "server-deck-hash",
                },
                don_deck: {
                  don_deck_id: "don-1",
                  payload: null,
                },
                cosmetics: {
                  playmat_id: "playmat-1",
                  don_sleeve_id: "don-sleeve-1",
                  deck_sleeve_id: "deck-sleeve-1",
                },
              },
            },
          }),
        );
      },
    });

    const token = await client.createSimHandoff({
      loadoutId: "loadout-1",
      lobbyId: "lobby-1",
    });
    const request = requests[0];
    if (request === undefined) {
      throw new Error("Expected a sim handoff request.");
    }

    assert.equal(token, "handoff-token");
    assert.equal(request.url, "https://auth.example/v1/sim/handoff");
    const requestInit = request.init;
    if (requestInit === undefined) {
      throw new Error("Expected a sim handoff request init.");
    }
    assert.equal(requestInit.credentials, "include");
    const requestBody = requestInit.body;
    if (requestBody === undefined) {
      throw new Error("Expected a sim handoff request body.");
    }
    assert.equal(
      requestBody,
      JSON.stringify({
        loadout_id: "loadout-1",
        lobby_id: "lobby-1",
        seat_id: null,
      }),
    );
    assert.equal(
      JSON.stringify(requestBody).includes("server-deck-hash"),
      false,
    );
  });

  test("creates batch sim handoff tokens without sending deck contents", async () => {
    const requests: RecordedRequest[] = [];
    const client = createPoneglyphAccountClient({
      baseUrl: "https://auth.example",
      fetch(input, init) {
        requests.push({
          url: input instanceof Request ? input.url : String(input),
          ...(init === undefined ? {} : { init }),
        });
        return Promise.resolve(
          responseJson({
            data: {
              handoffs: [
                {
                  loadout_id: "loadout-1",
                  status: "created",
                  token: "handoff-token-1",
                  expires_at: "2026-06-02T00:05:00.000Z",
                },
                {
                  loadout_id: "loadout-2",
                  status: "rejected",
                  error: {
                    status: 403,
                    message: "Saved deck hash is required for sim handoff.",
                  },
                },
              ],
            },
          }),
        );
      },
    });

    const handoffs = await client.createSimHandoffs({
      loadoutIds: ["loadout-1", "loadout-2"],
      lobbyId: "lobby-1",
    });
    const request = requests[0];
    if (request === undefined || request.init === undefined) {
      throw new Error("Expected a batch sim handoff request.");
    }

    assert.deepEqual(handoffs, [
      {
        loadoutId: "loadout-1",
        status: "created",
        token: "handoff-token-1",
      },
      {
        loadoutId: "loadout-2",
        status: "rejected",
        error: "Saved deck hash is required for sim handoff.",
      },
    ]);
    assert.equal(request.url, "https://auth.example/v1/sim/handoffs");
    assert.equal(request.init.credentials, "include");
    assert.equal(
      request.init.body,
      JSON.stringify({
        loadout_ids: ["loadout-1", "loadout-2"],
        lobby_id: "lobby-1",
        seat_id: null,
      }),
    );
    assert.equal(
      JSON.stringify(request.init.body).includes("deck_hash"),
      false,
    );
  });
});
