import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { CardId, EngineEvent, InstanceId, PlayerId } from "@optcg/types";

import { createActionLogEntries } from "./action-log.js";
import type { MatchCardCatalog } from "./transport.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

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
    [p2]: {
      cards: {
        ["OP13-091" as CardId]: {
          cardId: "OP13-091" as CardId,
          name: "Saint Marcus Mars",
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
      [
        "A player resolved decision: 1 card",
        "Saint Shepherd Ju Peter effect queued",
      ],
    );
  });

  test("keeps log row ids unique when engine event ids repeat", () => {
    const entries = createActionLogEntries({
      events: [
        event({
          id: "event:64:1:decisionResolved" as EngineEvent["id"],
          type: "decisionResolved",
          seq: 64,
          payload: { selectedCount: 1 },
        }),
        event({
          id: "event:64:1:decisionResolved" as EngineEvent["id"],
          type: "decisionResolved",
          seq: 64,
          payload: { selectedCount: 0 },
        }),
      ],
      catalog,
    });

    assert.equal(new Set(entries.map((entry) => entry.id)).size, 2);
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
    assert.deepEqual(
      entries.map((entry) =>
        entry.cardMentions?.map((mention) => mention.label),
      ),
      [
        ["Saint Shepherd Ju Peter"],
        ["Saint Shepherd Ju Peter"],
        ["Saint Shepherd Ju Peter"],
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
      ["A card moved from deck to hand"],
    );
  });

  test("formats gameplay flow events with safe visible details", () => {
    const entries = createActionLogEntries({
      events: [
        event({
          type: "phaseStarted",
          seq: 1,
          payload: { phase: "main", playerId: p1 },
        }),
        event({
          type: "cardMoved",
          seq: 2,
          payload: {
            playerId: p1,
            instanceId: "source-1",
            cardId: "OP13-089",
            from: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
            to: {
              zone: "characterArea",
              playerId: p1,
              slot: "character",
              index: 0,
            },
            reason: "playCard",
          },
        }),
        event({
          type: "costPaid",
          seq: 3,
          payload: {
            playerId: p1,
            optionId: "restDon",
            selectedDonCount: 4,
          },
        }),
        event({
          type: "attackDeclared",
          seq: 4,
          payload: {
            attacker: {
              playerId: p1,
              instanceId: "source-1",
              cardId: "OP13-089",
            },
            target: {
              playerId: p2,
              instanceId: "target-1",
              cardId: "OP13-091",
            },
          },
        }),
        event({
          type: "lifeTaken",
          seq: 5,
          payload: { damagedPlayerId: p2, amount: 1 },
        }),
        event({
          type: "decisionCreated",
          seq: 6,
          payload: {
            decisionType: "selectCards",
            playerId: p1,
            prompt: "Choose a card.",
          },
        }),
      ],
      catalog,
    });

    assert.deepEqual(
      entries.map((entry) => entry.text),
      [
        "p1 decision: Choose a card.",
        "p2 took 1 life",
        "Saint Shepherd Ju Peter attacked Saint Marcus Mars",
        "p1 paid cost: rested 4 DON!!",
        "Saint Shepherd Ju Peter moved from hand to character area",
        "p1 started main phase",
      ],
    );
  });

  test("projects server rollback points onto their action log rows", () => {
    const entries = createActionLogEntries({
      events: [
        event({
          id: "event:play-card" as EngineEvent["id"],
          type: "cardPlayed",
          seq: 7,
          payload: {
            playerId: p1,
            instanceId: "source-1",
            cardId: "OP13-089",
          },
        }),
      ],
      catalog,
      rollbackPoints: [
        {
          rollbackPointId: "rollback:before-play",
          eventId: "event:play-card",
          eventSeq: 7,
          stateSeq: 5,
          actionSeq: 2,
          label: "Before Played Saint Shepherd Ju Peter",
        },
      ],
    });

    assert.deepEqual(entries, [
      {
        id: "event:play-card:0",
        seq: 7,
        text: "Played Saint Shepherd Ju Peter",
        cardMentions: [
          {
            label: "Saint Shepherd Ju Peter",
            card: {
              cardId: "OP13-089" as CardId,
              playerId: p1,
              instanceId: "source-1" as InstanceId,
              name: "Saint Shepherd Ju Peter",
              category: "Character",
            },
          },
        ],
        rollback: {
          rollbackPointId: "rollback:before-play",
          label: "Before Played Saint Shepherd Ju Peter",
        },
      },
    ]);
  });
});
