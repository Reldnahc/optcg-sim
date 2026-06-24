import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardRef,
  DecisionId,
  EffectId,
  EffectQueueEntry,
  EffectTextSpotlightHistoryEntry,
  EngineEventId,
  InstanceId,
  PublicPendingDecisionId,
  QueueEntryId,
  SpotlightEntryCreatedPayload,
  StateSeq,
  TimingWindowId,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "../action-test-fixtures.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

const toDecisionId = (value: string): DecisionId => value as DecisionId;
const toEngineEventId = (value: string): EngineEventId =>
  value as EngineEventId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toInstanceId = (value: string): InstanceId => value as InstanceId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;
const toStateSeq = (value: number): StateSeq => value as StateSeq;
const toTimingWindowId = (value: string): TimingWindowId =>
  value as TimingWindowId;

const queuedEffect = (source: CardRef): EffectQueueEntry => ({
  id: toQueueEntryId("queue-entry:effect-presentation"),
  state: "pending",
  timingWindowId: toTimingWindowId("timing-window:effect-presentation"),
  generation: 1,
  controllerId: source.playerId,
  source,
  sourceSnapshot: {
    instanceId: source.instanceId,
    cardId: source.cardId,
    ownerId: source.playerId,
    controllerId: source.playerId,
    zone: must(source.zone, "source zone"),
    category: "character",
    colors: ["red"],
    cost: 1,
    power: 5000,
    keywords: [],
  },
  effectBlockId: toEffectId("effect:block:draw"),
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 1,
  queuedAtStateSeq: toStateSeq(1),
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "effect-presentation-test" },
  presentation: {
    source,
    textKind: "effect",
    activeSpanIds: ["span:body:draw"],
  },
});

test("public pending spotlight event payload hides pending id from non-acting player", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const sourceCard = must(p1State.hand.shift(), "source card");
  sourceCard.instanceId = toInstanceId("public-pending-source-instance");
  sourceCard.zone = {
    zone: "characterArea",
    playerId: p1,
    slot: "character",
    index: 0,
  };
  p1State.characters.push(sourceCard);
  const source: CardRef = {
    instanceId: sourceCard.instanceId,
    cardId: sourceCard.cardId,
    playerId: p1,
    zone: sourceCard.zone,
  };
  const decisionAnchorEventId = toEngineEventId("event:public-decision-anchor");
  const pendingDecisionId =
    "spotlight:pending:event:public-decision-anchor:recipient:p1" as PublicPendingDecisionId;
  const entry = queuedEffect(source);
  const decisionId = toDecisionId("decision:public-pending-spotlight");
  const decisionCausedBy = {
    type: "effect" as const,
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  };
  state.effectQueue = [entry];
  state.pendingDecision = {
    id: decisionId,
    decisionAnchorEventId,
    type: "selectTargets",
    playerId: p1,
    prompt: "Select targets.",
    causedBy: decisionCausedBy,
    visibility: { type: "public" },
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "opponent",
      zone: "characterArea",
      min: 0,
      max: 1,
      allowFewerIfUnavailable: true,
    },
    candidates: [],
  };
  state.eventJournal.push({
    id: toEngineEventId("event:public-pending-spotlight"),
    seq: state.eventJournal.length + 1,
    type: "spotlightEntryCreated",
    visibility: { type: "public" },
    createdAtStateSeq: state.seq,
    payload: {
      entry: {
        id: "spotlight:pending:event:public-decision-anchor:span:body:draw",
        key: "spotlight:pending:event:public-decision-anchor:span:body:draw",
        semanticKey:
          "pending|event:public-decision-anchor|effect|span:body:draw",
        mode: "live",
        status: "pending",
        active: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:body:draw"],
        },
        pendingDecisionId,
      },
    } satisfies SpotlightEntryCreatedPayload,
  });

  const ownerEvent = must(
    filterStateForPlayer(state, p1).events.find(
      (event) => event.type === "spotlightEntryCreated",
    ),
    "owner spotlight event",
  );
  const opponentEvent = must(
    filterStateForPlayer(state, p2).events.find(
      (event) => event.type === "spotlightEntryCreated",
    ),
    "opponent spotlight event",
  );
  assert.equal(
    (
      (ownerEvent.payload as SpotlightEntryCreatedPayload)
        .entry as EffectTextSpotlightHistoryEntry
    ).pendingDecisionId,
    pendingDecisionId,
  );
  assert.equal(
    "pendingDecisionId" in
      (opponentEvent.payload as SpotlightEntryCreatedPayload).entry,
    false,
  );
});

test("resolved authored spotlight event payload survives player event filtering", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const sourceCard = must(p1State.hand.shift(), "source card");
  sourceCard.instanceId = toInstanceId("resolved-authored-source-instance");
  sourceCard.zone = {
    zone: "characterArea",
    playerId: p1,
    slot: "character",
    index: 0,
  };
  p1State.characters.push(sourceCard);
  const source: CardRef = {
    instanceId: sourceCard.instanceId,
    cardId: sourceCard.cardId,
    playerId: p1,
    zone: sourceCard.zone,
  };
  const resolvedEventId = toEngineEventId("event:resolved-authored-anchor");
  state.eventJournal.push({
    id: resolvedEventId,
    seq: state.eventJournal.length + 1,
    type: "effectResolved",
    source,
    payload: {
      status: "resolved",
      presentation: {
        source,
        textKind: "effect",
        activeSpanIds: ["span:body:draw"],
      },
    },
    visibility: { type: "public" },
    createdAtStateSeq: state.seq,
  });
  state.eventJournal.push({
    id: toEngineEventId("event:resolved-authored-spotlight"),
    seq: state.eventJournal.length + 1,
    type: "spotlightEntryCreated",
    visibility: { type: "public" },
    createdAtStateSeq: state.seq,
    payload: {
      entry: {
        id: "spotlight:effect:event:resolved-authored-anchor:span:body:draw",
        key: "spotlight:effect:event:resolved-authored-anchor:span:body:draw",
        semanticKey:
          "effect|event:resolved-authored-anchor|effect|span:body:draw",
        mode: "resolved",
        status: "resolved",
        active: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:body:draw"],
        },
        resolvedEventId,
      },
    } satisfies SpotlightEntryCreatedPayload,
  });

  const view = filterStateForPlayer(state, p1);
  const spotlightEvent = must(
    view.events.find((event) => event.type === "spotlightEntryCreated"),
    "resolved authored spotlight event",
  );

  assert.equal(
    (
      (spotlightEvent.payload as SpotlightEntryCreatedPayload)
        .entry as EffectTextSpotlightHistoryEntry
    ).resolvedEventId,
    resolvedEventId,
  );
  assert.deepEqual(view.effectSpotlightHistory?.entries, [
    {
      id: "spotlight:effectText:event:resolved-authored-anchor:0",
      key: "spotlight:effectText:event:resolved-authored-anchor:0",
      semanticKey:
        "effectText|event:resolved-authored-anchor|0|effect|span:body:draw|resolved|resolved",
      mode: "resolved",
      status: "resolved",
      active: {
        source: {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: source.playerId,
        },
        textKind: "effect",
        activeSpanIds: ["span:body:draw"],
      },
      resolvedEventId,
    },
  ]);
});

test("sanitized spotlight payload replaces unsafe resolved anchors", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const sourceCard = must(p1State.hand.shift(), "source card");
  sourceCard.instanceId = toInstanceId("unsafe-anchor-source-instance");
  sourceCard.zone = {
    zone: "characterArea",
    playerId: p1,
    slot: "character",
    index: 0,
  };
  p1State.characters.push(sourceCard);
  const source: CardRef = {
    instanceId: sourceCard.instanceId,
    cardId: sourceCard.cardId,
    playerId: p1,
    zone: sourceCard.zone,
  };
  const spotlightEventId = toEngineEventId("event:unsafe-anchor-spotlight");
  state.eventJournal.push({
    id: spotlightEventId,
    seq: state.eventJournal.length + 1,
    type: "spotlightEntryCreated",
    visibility: { type: "public" },
    createdAtStateSeq: state.seq,
    payload: {
      entry: {
        id: "unsafe-authored-id",
        key: "unsafe-authored-key",
        semanticKey: "unsafe-authored-semantic",
        mode: "resolved",
        status: "resolved",
        active: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:body:draw"],
        },
        resolvedEventId: toEngineEventId("event:hidden-anchor"),
      },
    } satisfies SpotlightEntryCreatedPayload,
  });

  const view = filterStateForPlayer(state, p1);
  const spotlightEvent = must(
    view.events.find((event) => event.type === "spotlightEntryCreated"),
    "sanitized spotlight event",
  );
  const entry = (spotlightEvent.payload as SpotlightEntryCreatedPayload)
    .entry as EffectTextSpotlightHistoryEntry;

  assert.equal(entry.resolvedEventId, spotlightEventId);
  assert.equal(
    entry.id,
    "spotlight:effectText:event:unsafe-anchor-spotlight:0",
  );
  assert.equal(JSON.stringify(entry).includes("event:hidden-anchor"), false);
});

test("sanitized split spotlight entries receive distinct anchor ordinals", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const sourceCard = must(p1State.hand.shift(), "source card");
  sourceCard.instanceId = toInstanceId("split-anchor-source-instance");
  sourceCard.zone = {
    zone: "characterArea",
    playerId: p1,
    slot: "character",
    index: 0,
  };
  p1State.characters.push(sourceCard);
  const source: CardRef = {
    instanceId: sourceCard.instanceId,
    cardId: sourceCard.cardId,
    playerId: p1,
    zone: sourceCard.zone,
  };
  const resolvedEventId = toEngineEventId("event:split-anchor");
  state.eventJournal.push({
    id: resolvedEventId,
    seq: state.eventJournal.length + 1,
    type: "effectResolved",
    source,
    payload: {
      status: "resolved",
      presentation: {
        source,
        textKind: "effect",
        activeSpanIds: ["span:first", "span:second"],
      },
    },
    visibility: { type: "public" },
    createdAtStateSeq: state.seq,
  });
  for (const [index, spanId] of (
    ["span:first", "span:second"] as const
  ).entries()) {
    state.eventJournal.push({
      id: toEngineEventId(`event:split-spotlight:${String(index)}`),
      seq: state.eventJournal.length + 1,
      type: "spotlightEntryCreated",
      source,
      payload: {
        entry: {
          id: `unsafe-split-id:${String(index)}`,
          key: `unsafe-split-key:${String(index)}`,
          semanticKey: `unsafe-split-semantic:${String(index)}`,
          mode: "resolved",
          status: "resolved",
          active: {
            source,
            textKind: "effect",
            activeSpanIds: [spanId],
          },
          resolvedEventId,
        },
      } satisfies SpotlightEntryCreatedPayload,
      visibility: { type: "public" },
      createdAtStateSeq: state.seq,
    });
  }

  const view = filterStateForPlayer(state, p1);

  assert.deepEqual(
    view.effectSpotlightHistory?.entries.map((entry) => entry.key),
    [
      "spotlight:effectText:event:split-anchor:0",
      "spotlight:effectText:event:split-anchor:1",
    ],
  );
});

test("player view projects resolved spotlight history from visible authored spotlight events", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const sourceCard = must(p1State.hand.shift(), "source card");
  sourceCard.instanceId = toInstanceId("history-source-instance");
  sourceCard.zone = {
    zone: "characterArea",
    playerId: p1,
    slot: "character",
    index: 0,
  };
  p1State.characters.push(sourceCard);
  state.cardManifest.cards[sourceCard.cardId] = resolvedCard({
    cardId: sourceCard.cardId,
    category: "character",
  });
  const source: CardRef = {
    instanceId: sourceCard.instanceId,
    cardId: sourceCard.cardId,
    playerId: p1,
    zone: sourceCard.zone,
  };
  const publicSource: CardRef = {
    instanceId: source.instanceId,
    cardId: source.cardId,
    playerId: source.playerId,
  };
  const resolvedEventId = toEngineEventId("event:spotlight-history:resolved");
  state.eventJournal.push({
    id: resolvedEventId,
    seq: 99,
    type: "effectResolved",
    source,
    payload: {
      status: "resolved",
      presentation: {
        source,
        textKind: "effect",
        activeSpanIds: ["span:body:draw"],
      },
    },
    visibility: { type: "public" },
    createdAtStateSeq: state.seq,
  });
  state.eventJournal.push({
    id: toEngineEventId("event:spotlight-history:created"),
    seq: 100,
    type: "spotlightEntryCreated",
    source,
    payload: {
      entry: {
        id: "unsafe-authored-id",
        key: "unsafe-authored-key",
        semanticKey: "unsafe-authored-semantic",
        mode: "resolved",
        status: "resolved",
        active: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:body:draw"],
        },
        resolvedEventId,
      },
    } satisfies SpotlightEntryCreatedPayload,
    visibility: { type: "public" },
    createdAtStateSeq: state.seq,
  });

  const view = filterStateForPlayer(state, p1);

  assert.deepEqual(view.effectSpotlightHistory, {
    entries: [
      {
        id: "spotlight:effectText:event:spotlight-history:resolved:0",
        key: "spotlight:effectText:event:spotlight-history:resolved:0",
        semanticKey:
          "effectText|event:spotlight-history:resolved|0|effect|span:body:draw|resolved|resolved",
        mode: "resolved",
        status: "resolved",
        active: {
          source: publicSource,
          textKind: "effect",
          activeSpanIds: ["span:body:draw"],
        },
        resolvedEventId,
      },
    ],
    presentKey: "spotlight:effectText:event:spotlight-history:resolved:0",
  });
});

test("player view drops malformed damage spotlight entries", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  const attacker: CardRef = {
    instanceId: p1State.leader.instanceId,
    cardId: p1State.leader.cardId,
    playerId: p1,
    zone: p1State.leader.zone,
  };
  const defender: CardRef = {
    instanceId: p2State.leader.instanceId,
    cardId: p2State.leader.cardId,
    playerId: p2,
    zone: p2State.leader.zone,
  };

  state.eventJournal.push({
    id: toEngineEventId("event:malformed-damage-spotlight"),
    seq: 100,
    type: "spotlightEntryCreated",
    payload: {
      entry: {
        kind: "combat",
        id: "unsafe-damage-id",
        key: "unsafe-damage-key",
        semanticKey: "unsafe-damage-semantic",
        mode: "resolved",
        status: "resolved",
        combat: {
          eventKind: "damageDealt",
          attacker,
          defender,
          attackerPower: 7000,
        },
        resolvedEventId: toEngineEventId("event:malformed-damage-anchor"),
      },
    },
    visibility: { type: "public" },
    createdAtStateSeq: state.seq,
  });

  const view = filterStateForPlayer(state, p1);

  assert.deepEqual(
    view.events.find((event) => event.type === "spotlightEntryCreated")
      ?.payload,
    {},
  );
  assert.equal(view.effectSpotlightHistory, undefined);
});

test("player view only projects private authored spotlight history for its recipient", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const sourceCard = must(p1State.hand.shift(), "private source card");
  sourceCard.instanceId = toInstanceId("private-history-source-instance");
  p1State.hand.push(sourceCard);
  const source: CardRef = {
    instanceId: sourceCard.instanceId,
    cardId: sourceCard.cardId,
    playerId: p1,
    zone: sourceCard.zone,
  };
  state.eventJournal.push({
    id: toEngineEventId("event:spotlight-history:private"),
    seq: 100,
    type: "spotlightEntryCreated",
    source,
    payload: {
      entry: {
        id: "unsafe-private-id",
        key: "unsafe-private-key",
        semanticKey: "unsafe-private-semantic",
        mode: "resolved",
        status: "resolved",
        active: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:body:private"],
        },
        resolvedEventId: toEngineEventId("event:private-anchor"),
      },
    } satisfies SpotlightEntryCreatedPayload,
    visibility: { type: "private", playerId: p1 },
    createdAtStateSeq: state.seq,
  });

  const ownerView = filterStateForPlayer(state, p1);
  const opponentView = filterStateForPlayer(state, p2);

  assert.equal(ownerView.effectSpotlightHistory?.entries.length, 1);
  assert.equal(opponentView.effectSpotlightHistory, undefined);
});
