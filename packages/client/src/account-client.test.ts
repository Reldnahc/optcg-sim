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
  test("creates loadouts from deck hashes without client-side deck payloads", async () => {
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
            data: {
              id: "loadout-1",
              user_id: "user-1",
              name: "Imported deck",
              main_deck_id: "deck-1",
              don_deck_id: null,
              playmat_cosmetic_id: null,
              don_sleeve_cosmetic_id: null,
              deck_sleeve_cosmetic_id: null,
              created_at: "2026-06-02T00:00:00.000Z",
              updated_at: "2026-06-02T00:00:00.000Z",
            },
          }),
        );
      },
    });

    const loadout = await client.createLoadoutFromDeckHash({
      name: "Imported deck",
      deckHash: "deck-hash-with-variants",
    });

    const request = requests[0];
    if (request === undefined) {
      throw new Error("Expected a deck-hash loadout import request.");
    }
    assert.equal(
      request.url,
      "https://auth.example/v1/loadouts/import-deck-hash",
    );
    const requestInit = request.init;
    if (requestInit === undefined) {
      throw new Error("Expected a deck-hash loadout import request init.");
    }
    assert.equal(requestInit.credentials, "include");
    assert.equal(
      requestInit.body,
      JSON.stringify({
        name: "Imported deck",
        deck_hash: "deck-hash-with-variants",
      }),
    );
    assert.equal(JSON.stringify(requestInit.body).includes('"deck"'), false);
    assert.deepEqual(loadout, {
      id: "loadout-1",
      name: "Imported deck",
      folderId: null,
      folderName: null,
      updatedAt: "2026-06-02T00:00:00.000Z",
    });
  });

  test("lists account deck loadouts through foldered deck library", async () => {
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
            data: {
              folders: [
                {
                  id: "folder-1",
                  user_id: "user-1",
                  name: "Ranked",
                  sort_order: 0,
                  created_at: "2026-06-01T00:00:00.000Z",
                  updated_at: "2026-06-01T00:00:00.000Z",
                },
              ],
              decks: [
                {
                  id: "deck-collection-1",
                  user_id: "user-1",
                  name: "Enel",
                  deck_hash: "deck-hash",
                  deck: null,
                  folder_id: "folder-1",
                  kind: "deck",
                  leader_card_number: "OP05-098",
                  leader_variant_index: null,
                  leader_copy_count: 1,
                  preview_card_number: null,
                  preview_variant_index: null,
                  max_copies_of_single_card: 4,
                  main_count: 50,
                  favorite: false,
                  loadout_id: "loadout-1",
                  don_deck_id: "don-1",
                  playmat_cosmetic_id: "playmat-1",
                  don_sleeve_cosmetic_id: "don-sleeve-1",
                  deck_sleeve_cosmetic_id: "deck-sleeve-1",
                  created_at: "2026-06-01T00:00:00.000Z",
                  updated_at: "2026-06-02T00:00:00.000Z",
                },
                {
                  id: "list-1",
                  user_id: "user-1",
                  name: "Maybe board",
                  deck_hash: "list-hash",
                  deck: null,
                  folder_id: "folder-1",
                  kind: "list",
                  leader_card_number: null,
                  leader_variant_index: null,
                  leader_copy_count: 0,
                  preview_card_number: null,
                  preview_variant_index: null,
                  max_copies_of_single_card: 4,
                  main_count: 8,
                  favorite: false,
                  loadout_id: null,
                  don_deck_id: null,
                  playmat_cosmetic_id: null,
                  don_sleeve_cosmetic_id: null,
                  deck_sleeve_cosmetic_id: null,
                  created_at: "2026-06-01T00:00:00.000Z",
                  updated_at: "2026-06-02T00:00:00.000Z",
                },
                {
                  id: "deck-collection-2",
                  user_id: "user-1",
                  name: "Unfiled Luffy",
                  deck_hash: "deck-hash-2",
                  deck: null,
                  folder_id: null,
                  kind: "deck",
                  leader_card_number: "OP05-060",
                  leader_variant_index: null,
                  leader_copy_count: 1,
                  preview_card_number: null,
                  preview_variant_index: null,
                  max_copies_of_single_card: 4,
                  main_count: 50,
                  favorite: false,
                  loadout_id: "loadout-2",
                  don_deck_id: null,
                  playmat_cosmetic_id: null,
                  don_sleeve_cosmetic_id: null,
                  deck_sleeve_cosmetic_id: null,
                  created_at: "2026-06-01T00:00:00.000Z",
                  updated_at: "2026-06-03T00:00:00.000Z",
                },
                {
                  id: "deck-collection-without-loadout",
                  user_id: "user-1",
                  name: "Broken deck",
                  deck_hash: "deck-hash-3",
                  deck: null,
                  folder_id: null,
                  kind: "deck",
                  leader_card_number: "OP05-060",
                  leader_variant_index: null,
                  leader_copy_count: 1,
                  preview_card_number: null,
                  preview_variant_index: null,
                  max_copies_of_single_card: 4,
                  main_count: 50,
                  favorite: false,
                  loadout_id: null,
                  don_deck_id: null,
                  playmat_cosmetic_id: null,
                  don_sleeve_cosmetic_id: null,
                  deck_sleeve_cosmetic_id: null,
                  created_at: "2026-06-01T00:00:00.000Z",
                  updated_at: "2026-06-03T00:00:00.000Z",
                },
              ],
            },
          }),
        );
      },
    });

    const loadouts = await client.listLoadouts();

    const request = requests[0];
    if (request === undefined) {
      throw new Error("Expected a loadout list request.");
    }
    assert.equal(request.url, "https://auth.example/v1/deck-library");
    assert.equal(request.init?.credentials, "include");
    assert.deepEqual(loadouts, [
      {
        id: "loadout-1",
        name: "Enel",
        folderId: "folder-1",
        folderName: "Ranked",
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
      {
        id: "loadout-2",
        name: "Unfiled Luffy",
        folderId: null,
        folderName: null,
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
});
