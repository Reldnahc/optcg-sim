import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardRef,
  DecisionId,
  EffectExecutionFrame,
  EffectId,
  EffectQueueEntry,
  EffectTextSpanId,
  EngineEventId,
  InstanceId,
  QueueEntryId,
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

test("player decision projection includes active effect text for visible queued sources", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const sourceCard = must(p1State.hand.shift(), "source card");
  sourceCard.instanceId = toInstanceId("visible-source-instance");
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
  const entry = queuedEffect(source);
  state.effectQueue = [entry];
  state.pendingDecision = {
    id: toDecisionId("decision:effect-presentation"),
    type: "chooseQuantity",
    playerId: p1,
    prompt: "Choose how many cards to draw.",
    causedBy: {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    },
    visibility: { type: "private", playerId: p1 },
    mode: "upTo",
    min: 0,
    max: 1,
  };

  const view = filterStateForPlayer(state, p1);

  assert.deepEqual(view.activeEffectText, entry.presentation);
  assert.deepEqual(
    view.pendingDecision?.presentation.activeEffectText,
    entry.presentation,
  );
  assert.deepEqual(view.activeEffectSources, [source]);
  const opponentView = filterStateForPlayer(state, p2);
  assert.equal(opponentView.pendingDecision, undefined);
  assert.deepEqual(opponentView.activeEffectText, entry.presentation);
});

test("player view projects resolved spotlight history from visible effect presentations", () => {
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
  state.eventJournal.push({
    id: toEngineEventId("event:spotlight-history:resolved"),
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

  const view = filterStateForPlayer(state, p1);

  assert.deepEqual(view.effectSpotlightHistory, {
    entries: [
      {
        id: "resolved:event:spotlight-history:resolved:span:body:draw",
        key: "event:spotlight-history:resolved",
        semanticKey: "p1|history-source-instance|p1-a|effect|span:body:draw",
        mode: "resolved",
        status: "resolved",
        active: {
          source: publicSource,
          textKind: "effect",
          activeSpanIds: ["span:body:draw"],
        },
        resolvedEventId: "event:spotlight-history:resolved",
      },
    ],
    presentKey: "event:spotlight-history:resolved",
  });
});

test("player decision projection narrows active effect text to the paused sequence segment", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const sourceCard = must(p1State.hand.shift(), "source card");
  sourceCard.instanceId = toInstanceId("sequence-source-instance");
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
  const entry: EffectQueueEntry = {
    ...queuedEffect(source),
    presentation: {
      source,
      textKind: "effect",
      activeSpanIds: [
        "span:sequence:0:body",
        "span:sequence:1:body",
      ] as EffectTextSpanId[],
    },
  };
  const decisionId = toDecisionId("decision:selectTargets:sequence:test:0");
  const decisionCausedBy = {
    type: "effect" as const,
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  };
  state.effectQueue = [entry];
  state.pendingDecision = {
    id: decisionId,
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
      filter: { categories: ["character"] },
    },
    candidates: [],
  };
  state.effectExecutionFrames = [
    {
      queueEntryId: entry.id,
      effectBlockId: entry.effectBlockId,
      effectPath: ["effect", "sequence", "1", "nested", "sequence"],
      nextSegmentIndex: 1,
      segmentResults: {},
      savedReferences: {},
      transientSets: {},
      pendingDecision: {
        decisionId,
        causedBy: decisionCausedBy,
        createdAtStateSeq: state.seq,
        resumeAtSegmentIndex: 0,
      },
    } satisfies EffectExecutionFrame,
  ];

  const view = filterStateForPlayer(state, p1);

  assert.deepEqual(view.activeEffectText, {
    source,
    textKind: "effect",
    activeSpanIds: ["span:sequence:1:body"],
  });
  assert.deepEqual(view.pendingDecision?.presentation.activeEffectText, {
    source,
    textKind: "effect",
    activeSpanIds: ["span:sequence:1:body"],
  });
});

test("player decision projection narrows set selection to the active sequence span", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const sourceCard = must(p1State.hand.shift(), "source card");
  sourceCard.instanceId = toInstanceId("set-selection-source-instance");
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
  const entry: EffectQueueEntry = {
    ...queuedEffect(source),
    presentation: {
      source,
      textKind: "effect",
      activeSpanIds: ["span:sequence:0:body"] as EffectTextSpanId[],
    },
  };
  const decisionId = toDecisionId("decision:selectCards:sequence-set:test");
  const decisionCausedBy = {
    type: "effect" as const,
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  };
  state.effectQueue = [entry];
  state.pendingDecision = {
    id: decisionId,
    type: "selectCards",
    playerId: p1,
    prompt: "Choose a card.",
    causedBy: decisionCausedBy,
    visibility: { type: "private", playerId: p1 },
    request: {
      timing: "onResolution",
      set: "set:looked-cards:test" as never,
      chooser: "self",
      min: 0,
      max: 1,
      allowFewerIfUnavailable: true,
      visibility: "privateToChooser",
    },
    candidates: [],
  };
  state.effectExecutionFrames = [
    {
      queueEntryId: entry.id,
      effectBlockId: entry.effectBlockId,
      effectPath: ["effect", "sequence"],
      nextSegmentIndex: 1,
      segmentResults: {},
      savedReferences: {},
      transientSets: {},
      pendingDecision: {
        decisionId,
        causedBy: decisionCausedBy,
        createdAtStateSeq: state.seq,
        resumeAtSegmentIndex: 0,
      },
    } satisfies EffectExecutionFrame,
  ];

  const view = filterStateForPlayer(state, p1);

  assert.deepEqual(view.pendingDecision?.presentation.activeEffectText, {
    source,
    textKind: "effect",
    activeSpanIds: ["span:sequence:0:body"],
  });
});

test("player decision projection narrows search card selection to the search selection span", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const sourceCard = must(p1State.hand.shift(), "source card");
  sourceCard.instanceId = toInstanceId("search-selection-source-instance");
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
  const entry: EffectQueueEntry = {
    ...queuedEffect(source),
    presentation: {
      source,
      textKind: "effect",
      activeSpanIds: [
        "span:search:selection",
        "span:search:remaining",
      ] as EffectTextSpanId[],
    },
  };
  const decisionId = toDecisionId("decision:selectCards:search:test");
  const decisionCausedBy = {
    type: "effect" as const,
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  };
  state.effectQueue = [entry];
  state.pendingDecision = {
    id: decisionId,
    type: "selectCards",
    playerId: p1,
    prompt: "Choose a card.",
    causedBy: decisionCausedBy,
    visibility: { type: "private", playerId: p1 },
    request: {
      timing: "onResolution",
      set: "set:looked-cards:test" as never,
      chooser: "self",
      min: 0,
      max: 1,
      allowFewerIfUnavailable: true,
      visibility: "privateToChooser",
    },
    candidates: [],
  };

  const view = filterStateForPlayer(state, p1);

  assert.deepEqual(view.pendingDecision?.presentation.activeEffectText, {
    source,
    textKind: "effect",
    activeSpanIds: ["span:search:selection"],
  });
});

test("player decision projection narrows search remainder ordering to the search remaining span", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const sourceCard = must(p1State.hand.shift(), "source card");
  const orderedCard = must(p1State.deck.shift(), "ordered card");
  sourceCard.instanceId = toInstanceId("search-remaining-source-instance");
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
  const entry: EffectQueueEntry = {
    ...queuedEffect(source),
    presentation: {
      source,
      textKind: "effect",
      activeSpanIds: [
        "span:search:selection",
        "span:search:remaining",
      ] as EffectTextSpanId[],
    },
  };
  const decisionId = toDecisionId("decision:orderCards:search:test");
  const decisionCausedBy = {
    type: "effect" as const,
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  };
  state.effectQueue = [entry];
  state.pendingDecision = {
    id: decisionId,
    type: "orderCards",
    playerId: p1,
    prompt: "Order the remaining looked cards.",
    causedBy: decisionCausedBy,
    visibility: { type: "private", playerId: p1 },
    cards: [
      {
        instanceId: orderedCard.instanceId,
        cardId: orderedCard.cardId,
        playerId: p1,
        zone: orderedCard.zone,
      },
    ],
    destination: "deck",
    placement: { type: "topOrBottom" },
  };

  const view = filterStateForPlayer(state, p1);

  assert.deepEqual(view.pendingDecision?.presentation.activeEffectText, {
    source,
    textKind: "effect",
    activeSpanIds: ["span:search:remaining"],
  });
});

test("player decision projection narrows choose-one prompts to the choice spans", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const sourceCard = must(p1State.hand.shift(), "source card");
  sourceCard.instanceId = toInstanceId("choice-source-instance");
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
  const entry: EffectQueueEntry = {
    ...queuedEffect(source),
    presentation: {
      source,
      textKind: "effect",
      activeSpanIds: [
        "span:body:condition",
        "span:choice",
        "span:choice:0:option",
        "span:choice:1:option",
        "span:body:after-choice",
      ] as EffectTextSpanId[],
    },
  };
  const decisionId = toDecisionId("decision:chooseEffectOption:test");
  const decisionCausedBy = {
    type: "effect" as const,
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  };
  state.effectQueue = [entry];
  state.pendingDecision = {
    id: decisionId,
    type: "chooseEffectOption",
    playerId: p1,
    prompt: "Choose one effect.",
    causedBy: decisionCausedBy,
    visibility: { type: "private", playerId: p1 },
    min: 1,
    max: 1,
    options: [
      {
        id: "choice:1",
        label: "Draw 1 card.",
        effect: { type: "draw", player: "self", count: 1 },
      },
      {
        id: "choice:2",
        label: "Return 1 DON!! card.",
        effect: { type: "returnDon", player: "self", count: 1 },
      },
    ],
  };

  const view = filterStateForPlayer(state, p1);

  assert.deepEqual(view.pendingDecision?.presentation.activeEffectText, {
    source,
    textKind: "effect",
    activeSpanIds: ["span:choice"],
  });
});

test("player decision projection narrows decisions inside choose-one options to the selected option span", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const sourceCard = must(p1State.hand.shift(), "source card");
  sourceCard.instanceId = toInstanceId("choice-option-source-instance");
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
  const entry: EffectQueueEntry = {
    ...queuedEffect(source),
    presentation: {
      source,
      textKind: "effect",
      activeSpanIds: [
        "span:choice",
        "span:choice:0:option",
        "span:choice:1:option",
        "span:choice:1:body",
        "span:body:after-choice",
      ] as EffectTextSpanId[],
    },
  };
  const decisionId = toDecisionId("decision:selectTargets:choice-option:test");
  const decisionCausedBy = {
    type: "effect" as const,
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  };
  state.effectQueue = [entry];
  state.pendingDecision = {
    id: decisionId,
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
      filter: { categories: ["character"] },
    },
    candidates: [],
  };
  state.effectExecutionFrames = [
    {
      queueEntryId: entry.id,
      effectBlockId: entry.effectBlockId,
      effectPath: ["effect", "sequence", "0", "choice", "1", "sequence"],
      nextSegmentIndex: 1,
      segmentResults: {},
      savedReferences: {},
      transientSets: {},
      pendingDecision: {
        decisionId,
        causedBy: decisionCausedBy,
        createdAtStateSeq: state.seq,
        resumeAtSegmentIndex: 0,
      },
    } satisfies EffectExecutionFrame,
  ];

  const view = filterStateForPlayer(state, p1);

  assert.deepEqual(view.pendingDecision?.presentation.activeEffectText, {
    source,
    textKind: "effect",
    activeSpanIds: ["span:choice:1:body"],
  });
});

test("player decision projection hides active effect text when the queued source is hidden", () => {
  const state = createActiveState();
  const p2State = must(state.players[p2], "p2 state");
  const sourceCard = must(p2State.hand[0], "hidden source card");
  sourceCard.instanceId = toInstanceId("hidden-source-instance");
  state.cardManifest.cards[sourceCard.cardId] = resolvedCard({
    cardId: sourceCard.cardId,
    category: "character",
  });
  const source: CardRef = {
    instanceId: sourceCard.instanceId,
    cardId: sourceCard.cardId,
    playerId: p2,
    zone: sourceCard.zone,
  };
  const entry = queuedEffect(source);
  state.effectQueue = [entry];
  state.pendingDecision = {
    id: toDecisionId("decision:hidden-effect-presentation"),
    type: "chooseQuantity",
    playerId: p1,
    prompt: "Choose how many cards to draw.",
    causedBy: {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    },
    visibility: { type: "private", playerId: p1 },
    mode: "upTo",
    min: 0,
    max: 1,
  };

  const view = filterStateForPlayer(state, p1);

  assert.equal(view.activeEffectText, undefined);
  assert.equal(view.pendingDecision?.presentation.activeEffectText, undefined);
  assert.equal(view.activeEffectSources, undefined);
});

test("player decision projection does not expose privately revealed source text to other players", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const sourceCard = must(p1State.hand[0], "private source card");
  sourceCard.instanceId = toInstanceId("privately-revealed-source-instance");
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
  const entry = queuedEffect(source);
  state.effectQueue = [entry];
  state.revealedCards = [
    {
      id: "reveal:private-source:test",
      cards: [source],
      visibility: { type: "private", playerId: p1 },
      origin: "custom",
      createdAtStateSeq: state.seq,
      cleanupPolicy: "none",
    },
  ];
  state.pendingDecision = {
    id: toDecisionId("decision:private-source-effect-presentation"),
    type: "chooseQuantity",
    playerId: p1,
    prompt: "Choose how many cards to draw.",
    causedBy: {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    },
    visibility: { type: "private", playerId: p1 },
    mode: "upTo",
    min: 0,
    max: 1,
  };

  const ownerView = filterStateForPlayer(state, p1);
  const opponentView = filterStateForPlayer(state, p2);

  assert.deepEqual(ownerView.activeEffectText, entry.presentation);
  assert.equal(opponentView.pendingDecision, undefined);
  assert.equal(opponentView.activeEffectText, undefined);
  assert.equal(opponentView.activeEffectSources, undefined);
});

test("player view does not project private opponent spotlight history", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const sourceCard = must(p1State.hand.shift(), "private source card");
  sourceCard.instanceId = toInstanceId("private-history-source-instance");
  const source: CardRef = {
    instanceId: sourceCard.instanceId,
    cardId: sourceCard.cardId,
    playerId: p1,
    zone: sourceCard.zone,
  };
  state.eventJournal.push({
    id: toEngineEventId("event:spotlight-history:private"),
    seq: 100,
    type: "effectResolved",
    source,
    payload: {
      status: "resolved",
      presentation: {
        source,
        textKind: "effect",
        activeSpanIds: ["span:body:private"],
      },
    },
    visibility: { type: "private", playerId: p1 },
    createdAtStateSeq: state.seq,
  });

  const ownerView = filterStateForPlayer(state, p1);
  const opponentView = filterStateForPlayer(state, p2);

  assert.equal(ownerView.effectSpotlightHistory?.entries.length, 1);
  assert.equal(opponentView.effectSpotlightHistory, undefined);
});
