import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { CardId, EngineEvent, InstanceId, PlayerId } from "@optcg/types";

import { createActionLogEntries } from "./action-log.js";
import type { MatchCardCatalog } from "./transport.js";

const p1 = "p1" as PlayerId;

const event = (
  overrides: Partial<EngineEvent> & Pick<EngineEvent, "type">,
): EngineEvent => ({
  id: `event:${overrides.type}` as EngineEvent["id"],
  seq: 1,
  payload: {},
  visibility: { type: "public" },
  createdAtStateSeq: 1 as EngineEvent["createdAtStateSeq"],
  ...overrides,
});

const catalog: MatchCardCatalog = {
  players: {
    [p1]: {
      cards: {
        ["OP13-089" as CardId]: {
          cardId: "OP13-089" as CardId,
          name: "Saint Shepherd Ju Peter",
          category: "Character",
        },
      },
    },
  },
};

describe("action log", () => {
  test("formats visible engine events into newest-first stable log rows", () => {
    const entries = createActionLogEntries({
      events: [
        event({
          type: "effectQueued",
          seq: 4,
          source: {
            instanceId: "source-1" as InstanceId,
            cardId: "OP13-089" as CardId,
            playerId: p1,
          },
        }),
        event({
          type: "decisionResolved",
          seq: 5,
          payload: { decisionType: "selectCards", selectedCount: 1 },
        }),
      ],
      catalog,
    });

    assert.deepEqual(
      entries.map((entry) => entry.text),
      ["Decision resolved: 1 card", "Saint Shepherd Ju Peter effect queued"],
    );
  });

  test("names cards from visible event payload identity", () => {
    const entries = createActionLogEntries({
      events: [
        event({
          type: "cardPlayed",
          seq: 1,
          payload: {
            playerId: p1,
            instanceId: "source-1",
            cardId: "OP13-089",
            category: "character",
          },
        }),
        event({
          type: "cardTrashed",
          seq: 2,
          payload: {
            playerId: p1,
            instanceId: "source-1",
            cardId: "OP13-089",
            reason: "trashFromHand",
          },
        }),
        event({
          type: "cardRevealed",
          seq: 3,
          payload: {
            cards: [
              {
                playerId: p1,
                instanceId: "source-1",
                cardId: "OP13-089",
              },
            ],
          },
        }),
      ],
      catalog,
    });

    assert.deepEqual(
      entries.map((entry) => entry.text),
      [
        "Revealed Saint Shepherd Ju Peter",
        "Trashed Saint Shepherd Ju Peter",
        "Played Saint Shepherd Ju Peter",
      ],
    );
  });

  test("keeps card movement generic when projected payload has no card identity", () => {
    const entries = createActionLogEntries({
      events: [
        event({
          type: "cardMoved",
          seq: 1,
          payload: {
            from: "deck",
            to: "hand",
            reason: "draw",
          },
        }),
      ],
      catalog,
    });

    assert.deepEqual(
      entries.map((entry) => entry.text),
      ["A card moved"],
    );
  });
});
