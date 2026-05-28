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
});
