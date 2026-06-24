import assert from "node:assert/strict";
import { test } from "vitest";

import type { EngineEvent, InstanceId } from "@optcg/types";

import {
  createActiveState,
  p1,
  p2,
  toCardId,
  toEngineEventId,
  toStateSeq,
} from "../action-test-fixtures.js";
import { toPlayerEvent } from "./filter-state-events.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

test("preserves safe visible card identity in player event payloads", () => {
  const state = createActiveState();
  const cardId = toCardId("OP13-089");
  const instanceId = "visible-card-1" as InstanceId;
  const events: EngineEvent[] = [
    {
      id: toEngineEventId("event:visible-card-played"),
      seq: 1,
      type: "cardPlayed",
      actor: p1,
      payload: {
        playerId: p1,
        instanceId,
        cardId,
        category: "character",
        hiddenDeckIndex: 12,
      },
      visibility: { type: "public" },
      createdAtStateSeq: toStateSeq(state.seq),
    },
    {
      id: toEngineEventId("event:visible-card-trashed"),
      seq: 2,
      type: "cardTrashed",
      actor: p1,
      payload: {
        playerId: p1,
        instanceId,
        cardId,
        reason: "trashFromHand",
        hiddenDeckIndex: 13,
      },
      visibility: { type: "public" },
      createdAtStateSeq: toStateSeq(state.seq),
    },
    {
      id: toEngineEventId("event:visible-card-moved"),
      seq: 3,
      type: "cardMoved",
      actor: p1,
      payload: {
        playerId: p1,
        instanceId,
        cardId,
        from: {
          zone: "characterArea",
          playerId: p1,
          slot: "character",
          index: 0,
          faceDownCardId: toCardId("SECRET"),
        },
        to: {
          zone: "trash",
          playerId: p1,
          slot: "trash",
          index: 0,
          faceDownCardId: toCardId("SECRET"),
        },
        reason: "effect",
        hiddenDeckIndex: 14,
      },
      visibility: { type: "public" },
      createdAtStateSeq: toStateSeq(state.seq),
    },
  ];
  state.eventJournal = events;

  const view = filterStateForPlayer(state, p2);

  assert.deepEqual(
    view.events.map((event) => event.payload),
    [
      {
        playerId: p1,
        instanceId,
        cardId,
        category: "character",
      },
      {
        playerId: p1,
        instanceId,
        cardId,
        reason: "trashFromHand",
      },
      {
        playerId: p1,
        instanceId,
        cardId,
        from: {
          zone: "characterArea",
          playerId: p1,
          slot: "character",
          index: 0,
        },
        to: {
          zone: "trash",
          playerId: p1,
          slot: "trash",
          index: 0,
        },
        reason: "effect",
      },
    ],
  );
  assert.equal(JSON.stringify(view.events).includes("hiddenDeckIndex"), false);
  assert.equal(JSON.stringify(view.events).includes("faceDownCardId"), false);
});

test("player event filtering preserves public DON attachment presentation payload", () => {
  const state = createActiveState();
  const event: EngineEvent = {
    id: toEngineEventId("event:don-attached"),
    seq: 1,
    type: "donAttached",
    payload: {
      playerId: p1,
      donInstanceId: "don-1",
      from: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      to: { zone: "leaderArea", playerId: p1, slot: "leader" },
      target: {
        instanceId: "leader-1",
        cardId: toCardId("OP00-001"),
        playerId: p1,
      },
      hiddenDebugField: "must not leak",
    },
    visibility: { type: "public" },
    createdAtStateSeq: toStateSeq(state.seq),
  };

  const filtered = toPlayerEvent(event);

  assert.deepEqual(filtered.payload, {
    playerId: p1,
    donInstanceId: "don-1",
    from: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
    to: { zone: "leaderArea", playerId: p1, slot: "leader" },
    target: {
      instanceId: "leader-1",
      cardId: toCardId("OP00-001"),
      playerId: p1,
    },
  });
});

test("preserves safe gameplay event details for player logs", () => {
  const state = createActiveState();
  const attackerCardId = toCardId("OP13-089");
  const targetCardId = toCardId("OP13-091");
  const blockerCardId = toCardId("OP13-092");
  const events: EngineEvent[] = [
    {
      id: toEngineEventId("event:phase-started"),
      seq: 1,
      type: "phaseStarted",
      actor: p1,
      payload: { phase: "main", playerId: p1, internalPhaseGate: true },
      visibility: { type: "public" },
      createdAtStateSeq: toStateSeq(state.seq),
    },
    {
      id: toEngineEventId("event:attack-declared"),
      seq: 2,
      type: "attackDeclared",
      actor: p1,
      payload: {
        attacker: {
          playerId: p1,
          instanceId: "attacker-1",
          cardId: attackerCardId,
          privatePowerSnapshot: 9000,
        },
        target: {
          playerId: p2,
          instanceId: "target-1",
          cardId: targetCardId,
          privatePowerSnapshot: 5000,
        },
        attackerPower: 7000,
        defenderPower: 5000,
      },
      visibility: { type: "public" },
      createdAtStateSeq: toStateSeq(state.seq),
    },
    {
      id: toEngineEventId("event:cost-paid"),
      seq: 3,
      type: "costPaid",
      actor: p1,
      payload: {
        playerId: p1,
        optionId: "restDon",
        selectedDonInstanceIds: ["don-1", "don-2"],
        selectedCardInstanceIds: ["card-1"],
      },
      visibility: { type: "public" },
      createdAtStateSeq: toStateSeq(state.seq),
    },
    {
      id: toEngineEventId("event:blocker-activated"),
      seq: 4,
      type: "blockerActivated",
      actor: p2,
      payload: {
        attacker: {
          playerId: p1,
          instanceId: "attacker-1",
          cardId: attackerCardId,
          privatePowerSnapshot: 7000,
        },
        blocker: {
          playerId: p2,
          instanceId: "blocker-1",
          cardId: blockerCardId,
          privatePowerSnapshot: 3000,
        },
        previousTarget: {
          playerId: p2,
          instanceId: "target-1",
          cardId: targetCardId,
          privatePowerSnapshot: 5000,
        },
        currentTarget: {
          playerId: p2,
          instanceId: "blocker-1",
          cardId: blockerCardId,
          privatePowerSnapshot: 3000,
        },
        attackerPower: 7000,
        defenderPower: 3000,
      },
      visibility: { type: "public" },
      createdAtStateSeq: toStateSeq(state.seq),
    },
  ];
  state.eventJournal = events;

  const view = filterStateForPlayer(state, p2);

  assert.deepEqual(
    view.events.map((event) => event.payload),
    [
      { phase: "main", playerId: p1 },
      {
        attacker: {
          playerId: p1,
          instanceId: "attacker-1",
          cardId: attackerCardId,
        },
        target: {
          playerId: p2,
          instanceId: "target-1",
          cardId: targetCardId,
        },
        attackerPower: 7000,
        defenderPower: 5000,
      },
      {
        playerId: p1,
        optionId: "restDon",
        selectedDonCount: 2,
        selectedCardCount: 1,
      },
      {
        attacker: {
          playerId: p1,
          instanceId: "attacker-1",
          cardId: attackerCardId,
        },
        blocker: {
          playerId: p2,
          instanceId: "blocker-1",
          cardId: blockerCardId,
        },
        previousTarget: {
          playerId: p2,
          instanceId: "target-1",
          cardId: targetCardId,
        },
        currentTarget: {
          playerId: p2,
          instanceId: "blocker-1",
          cardId: blockerCardId,
        },
        attackerPower: 7000,
        defenderPower: 3000,
      },
    ],
  );
  assert.equal(
    JSON.stringify(view.events).includes("internalPhaseGate"),
    false,
  );
  assert.equal(
    JSON.stringify(view.events).includes("privatePowerSnapshot"),
    false,
  );
  assert.equal(JSON.stringify(view.events).includes("don-1"), false);
  assert.equal(JSON.stringify(view.events).includes("card-1"), false);
});

test("redacts effectResolved presentation from player event payloads", () => {
  const state = createActiveState();
  const cardId = toCardId("OP13-089");
  const instanceId = "resolved-effect-source" as InstanceId;
  state.eventJournal = [
    {
      id: toEngineEventId("event:effect-resolved"),
      seq: 1,
      type: "effectResolved",
      source: {
        instanceId,
        cardId,
        playerId: p1,
      },
      payload: {
        status: "resolved",
        queueEntryId: "private-queue-entry",
        presentation: {
          source: {
            instanceId,
            cardId,
            playerId: p1,
          },
          textKind: "effect",
          activeSpanIds: ["span:body"],
          targetLinks: [
            {
              spanId: "span:body",
              relation: "selectedTarget",
              cards: [
                {
                  instanceId: "target-card-1",
                  cardId: toCardId("OP13-090"),
                  playerId: p2,
                  privatePowerSnapshot: 6000,
                },
              ],
              privateSelectionFrame: "hidden",
            },
            {
              spanId: "not-a-span",
              relation: "selectedTarget",
              cards: [
                {
                  instanceId: "target-card-2",
                  cardId: toCardId("OP13-091"),
                  playerId: p2,
                },
              ],
            },
          ],
          privateExecutionFrame: "hidden",
        },
      },
      visibility: { type: "public" },
      createdAtStateSeq: toStateSeq(state.seq),
    },
  ];

  const view = filterStateForPlayer(state, p2);

  assert.deepEqual(view.events[0]?.payload, { status: "resolved" });
  assert.equal(JSON.stringify(view.events).includes("presentation"), false);
  assert.equal(JSON.stringify(view.events).includes("target-card-1"), false);
  assert.equal(JSON.stringify(view.events).includes("private"), false);
});

test("redacts replacementApplied presentation from player event payloads", () => {
  const state = createActiveState();
  const cardId = toCardId("OP13-089");
  const instanceId = "replacement-source" as InstanceId;
  state.eventJournal = [
    {
      id: toEngineEventId("event:replacement-applied"),
      seq: 1,
      type: "replacementApplied",
      source: {
        instanceId,
        cardId,
        playerId: p1,
      },
      payload: {
        processId: "process:hidden",
        replacementId: "replacement:hidden",
        previousPayloadHash: "previous-private-hash",
        transformedPayloadHash: "transformed-private-hash",
        presentation: {
          source: {
            instanceId,
            cardId,
            playerId: p1,
          },
          textKind: "effect",
          activeSpanIds: ["span:replacement"],
          privateExecutionFrame: "hidden",
        },
      },
      visibility: { type: "public" },
      createdAtStateSeq: toStateSeq(state.seq),
    },
  ];

  const view = filterStateForPlayer(state, p2);

  assert.deepEqual(view.events[0]?.payload, { status: "applied" });
  assert.equal(JSON.stringify(view.events).includes("presentation"), false);
  assert.equal(JSON.stringify(view.events).includes("private"), false);
  assert.equal(JSON.stringify(view.events).includes("hidden"), false);
});

test("keeps public selected reveal events after transient reveal cleanup", () => {
  const state = createActiveState();
  const cardId = toCardId("OP13-089");
  const instanceId = "revealed-card-1" as InstanceId;
  state.revealedCards = [];
  state.eventJournal = [
    {
      id: toEngineEventId("event:set-reveal-selected"),
      seq: 1,
      type: "cardRevealed",
      actor: p1,
      payload: {
        revealId: "reveal:sequence-selected:choice-1",
        cards: [
          {
            playerId: p1,
            instanceId,
            cardId,
            hiddenDeckIndex: 0,
          },
        ],
      },
      visibility: { type: "public" },
      createdAtStateSeq: toStateSeq(state.seq),
    },
  ];

  const view = filterStateForPlayer(state, p2);

  assert.deepEqual(
    view.events.map((event) => event.payload),
    [
      {
        revealId: "reveal:sequence-selected:choice-1",
        cards: [{ instanceId, cardId, playerId: p1 }],
      },
    ],
  );
  assert.equal(JSON.stringify(view.events).includes("hiddenDeckIndex"), false);
});

test("censors stale transient set reveal candidates instead of omitting the log row", () => {
  const state = createActiveState();
  const cardId = toCardId("OP13-089");
  const instanceId = "stale-revealed-card-1" as InstanceId;
  state.revealedCards = [];
  state.eventJournal = [
    {
      id: toEngineEventId("event:stale-set-reveal"),
      seq: 1,
      type: "cardRevealed",
      actor: p1,
      payload: {
        revealId: "reveal:sequence:candidate:choice-1",
        selectionSetId: "set:looked-cards:choice-1",
        cards: [
          {
            playerId: p1,
            instanceId,
            cardId,
            hiddenDeckIndex: 0,
          },
        ],
      },
      visibility: { type: "public" },
      createdAtStateSeq: toStateSeq(state.seq),
    },
  ];

  const view = filterStateForPlayer(state, p2);

  assert.deepEqual(
    view.events.map((event) => event.payload),
    [
      {
        censored: true,
        reason: "hidden-info",
        revealId: "reveal:sequence:candidate:choice-1",
        selectionSetId: "set:looked-cards:choice-1",
        revealedCount: 1,
      },
    ],
  );
  assert.equal(JSON.stringify(view.events).includes(String(cardId)), false);
  assert.equal(JSON.stringify(view.events).includes(String(instanceId)), false);
  assert.equal(JSON.stringify(view.events).includes("hiddenDeckIndex"), false);
});

test("malformed spotlight disclosure redacts unsafe spotlight payloads", () => {
  const state = createActiveState();
  const hiddenSource = {
    instanceId: "hidden-spotlight-source" as InstanceId,
    cardId: toCardId("OP13-099"),
    playerId: p1,
  };
  state.eventJournal = [
    {
      id: toEngineEventId("event:malformed-spotlight"),
      seq: 1,
      type: "spotlightEntryCreated",
      payload: {
        disclosure: {
          entryRefs: [
            null,
            {
              role: "effectSource",
              cardInstanceId: hiddenSource.instanceId,
              visibility: null,
            },
          ],
          targetLinks: [
            null,
            {
              spanId: "span:body",
              relation: "selectedTarget",
              cardInstanceId: hiddenSource.instanceId,
              visibility: null,
            },
          ],
        },
        entry: {
          kind: "effectText",
          id: "unsafe-authored-id",
          key: "unsafe-authored-key",
          semanticKey: "unsafe-authored-semantic",
          mode: "resolved",
          status: "resolved",
          active: {
            source: hiddenSource,
            textKind: "effect",
            activeSpanIds: ["span:body"],
          },
          resolvedEventId: toEngineEventId("event:hidden-anchor"),
        },
      },
      visibility: { type: "public" },
      createdAtStateSeq: toStateSeq(state.seq),
    },
  ];

  const view = filterStateForPlayer(state, p2);

  assert.deepEqual(view.events[0]?.payload, {});
  assert.equal(view.effectSpotlightHistory, undefined);
});
