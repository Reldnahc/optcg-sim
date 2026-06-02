import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  ContinuousEffectRecord,
  DecisionId,
  EffectId,
  EngineEvent,
  GameState,
  InstanceId,
  QueueEntryId,
  PublicLegalAction,
  TimingWindowId,
} from "@optcg/types";

import {
  createActiveState,
  createInput,
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
  toEngineEventId,
  toStateSeq,
} from "../action-test-fixtures.js";
import { applyAction, getLegalActions } from "../actions.js";
import { cardRef, setupAttackState } from "../battle/test-fixtures.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";
import { createInitialState } from "../initial-state.js";
import { startMulliganFlow } from "../mulligan.js";
import { setupMainPlayState } from "../play-card/test-fixtures.js";

const withEvent = (
  state: GameState,
  seq: number,
  visibility: EngineEvent["visibility"],
): EngineEvent => ({
  id: toEngineEventId(`event:test:${String(seq)}`),
  seq,
  type: "decisionCreated",
  payload: { seq },
  visibility,
  createdAtStateSeq: toStateSeq(state.seq),
});

const toDecisionId = (value: string): DecisionId => value as DecisionId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;
const toTimingWindowId = (value: string): TimingWindowId =>
  value as TimingWindowId;

const unsupportedContinuousEffectRecord = (
  source: CardInstance,
): ContinuousEffectRecord => ({
  id: "unsupported-player-view-continuous-power",
  source: cardRef(source, source.controller),
  sourceSnapshot: {
    instanceId: source.instanceId,
    cardId: source.cardId,
    ownerId: source.owner,
    controllerId: source.controller,
    zone: source.zone,
    category: source.zone.zone === "leaderArea" ? "leader" : "character",
    colors: ["red"],
    power: 5000,
    keywords: [],
  },
  controller: source.controller,
  modifier: {
    layer: "powerAdd",
    target: { type: "self" },
    operation: { type: "addPower", value: 2000 },
  },
  duration: { type: "permanent" },
  createdBy: { type: "ruleProcess", name: "player-view-test" },
  createdAtStateSeq: 1 as GameState["seq"],
});

test("filters hidden information and keeps public zones", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");

  const p1FaceUp = must(p1State.life[0], "p1 life 0");
  const p2FaceUp = must(p2State.life[0], "p2 life 0");
  p1FaceUp.faceUp = true;
  p2FaceUp.faceUp = true;

  const p1TrashCard = must(p1State.hand.shift(), "p1 hand -> trash");
  p1TrashCard.zone = { zone: "trash", playerId: p1, slot: "trash", index: 0 };
  p1State.trash.push(p1TrashCard);

  const p1Character = must(p1State.hand.shift(), "p1 hand -> character");
  p1Character.zone = {
    zone: "characterArea",
    playerId: p1,
    slot: "character",
    index: 0,
  };
  p1State.characters.push(p1Character);

  const p1Stage = must(p1State.hand.shift(), "p1 hand -> stage");
  p1Stage.zone = { zone: "stageArea", playerId: p1, slot: "stage", index: 0 };
  p1State.stage = p1Stage;

  const p1Don = must(p1State.donDeck.shift(), "p1 don deck -> cost");
  p1Don.zone = { zone: "costArea", playerId: p1, slot: "cost", index: 0 };
  p1State.costArea.push(p1Don);

  const p2TrashCard = must(p2State.hand.shift(), "p2 hand -> trash");
  p2TrashCard.zone = { zone: "trash", playerId: p2, slot: "trash", index: 0 };
  p2State.trash.push(p2TrashCard);

  const p2Character = must(p2State.hand.shift(), "p2 hand -> character");
  p2Character.zone = {
    zone: "characterArea",
    playerId: p2,
    slot: "character",
    index: 0,
  };
  p2State.characters.push(p2Character);

  const p2Stage = must(p2State.hand.shift(), "p2 hand -> stage");
  p2Stage.zone = { zone: "stageArea", playerId: p2, slot: "stage", index: 0 };
  p2State.stage = p2Stage;

  const p2Don = must(p2State.donDeck.shift(), "p2 don deck -> cost");
  p2Don.zone = { zone: "costArea", playerId: p2, slot: "cost", index: 0 };
  p2State.costArea.push(p2Don);

  const view = filterStateForPlayer(state, p1);

  assert.equal(view.self.hand.length, p1State.hand.length);
  assert.equal(view.opponent.handCount, p2State.hand.length);
  assert.equal(view.self.deckCount, p1State.deck.length);
  assert.equal(view.opponent.deckCount, p2State.deck.length);
  assert.equal(view.self.donDeckCount, p1State.donDeck.length);
  assert.equal(view.opponent.donDeckCount, p2State.donDeck.length);

  const ownHandIds = new Set(view.self.hand.map((card) => card.cardId));
  for (const card of p1State.hand) {
    assert.equal(ownHandIds.has(card.cardId), true);
  }
  const allVisibleCardIds = new Set([
    ...view.self.hand.map((card) => card.cardId),
    ...view.self.trash.map((card) => card.cardId),
    view.self.leader.cardId,
    ...view.self.characters.map((card) => card.cardId),
    ...(view.self.stage === undefined ? [] : [view.self.stage.cardId]),
    ...view.self.costArea.map((card) => card.cardId),
    ...view.self.life.faceUpCards.map((card) => card.cardId),
    ...view.opponent.trash.map((card) => card.cardId),
    view.opponent.leader.cardId,
    ...view.opponent.characters.map((card) => card.cardId),
    ...(view.opponent.stage === undefined ? [] : [view.opponent.stage.cardId]),
    ...view.opponent.costArea.map((card) => card.cardId),
    ...view.opponent.life.faceUpCards.map((card) => card.cardId),
  ]);
  for (const card of p2State.hand) {
    assert.equal(allVisibleCardIds.has(card.cardId), false);
  }

  assert.equal(view.self.life.count, p1State.life.length);
  assert.equal(view.opponent.life.count, p2State.life.length);
  assert.equal(view.self.life.faceUpCards.length, 1);
  assert.equal(view.opponent.life.faceUpCards.length, 1);
  assert.equal(view.self.life.faceUpCards[0]?.cardId, p1FaceUp.card.cardId);
  assert.equal(view.opponent.life.faceUpCards[0]?.cardId, p2FaceUp.card.cardId);
  assert.equal(view.self.trash[0]?.cardId, p1TrashCard.cardId);
  assert.equal(view.opponent.trash[0]?.cardId, p2TrashCard.cardId);
  assert.equal(view.self.characters[0]?.cardId, p1Character.cardId);
  assert.equal(view.opponent.characters[0]?.cardId, p2Character.cardId);
  assert.equal(view.self.stage?.cardId, p1Stage.cardId);
  assert.equal(view.opponent.stage?.cardId, p2Stage.cardId);
  assert.equal(view.self.costArea[0]?.cardId, p1Don.cardId);
  assert.equal(view.opponent.costArea[0]?.cardId, p2Don.cardId);

  const raw = view as unknown as Record<string, unknown>;
  assert.equal("rng" in raw, false);
  assert.equal("effectQueue" in raw, false);
  assert.equal("deferredTriggers" in raw, false);
  assert.equal("replacementState" in raw, false);
  assert.equal("continuousEffects" in raw, false);
  assert.equal("audit" in raw, false);
});

test("fails closed instead of projecting unsupported continuous modifier shapes", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1 state");
  state.continuousEffects = [unsupportedContinuousEffectRecord(p1State.leader)];
  assert.throws(() => filterStateForPlayer(state, p1), {
    name: "TypeError",
    message:
      "Unsupported continuous effect unsupported-player-view-continuous-power: only unconditional self +1000 powerAdd modifiers with permanent or whileSourceOnField duration are supported by computeView.",
  });
});

test("shows pending decision only to the recipient with public shape", () => {
  const setup = createInitialState(createInput());
  const withDecision = startMulliganFlow(setup).state;
  const decision = must(withDecision.pendingDecision, "pending decision");

  const forDecisionPlayer = filterStateForPlayer(
    withDecision,
    decision.playerId,
  );
  const forOpponent = filterStateForPlayer(
    withDecision,
    decision.playerId === p1 ? p2 : p1,
  );

  assert.deepEqual(forDecisionPlayer.pendingDecision, {
    id: decision.id,
    type: decision.type,
    playerId: decision.playerId,
    prompt: decision.prompt,
    causedBy: decision.causedBy,
    ...(decision.timeoutMs === undefined
      ? {}
      : { timeoutMs: decision.timeoutMs }),
  });
  assert.equal(forOpponent.pendingDecision, undefined);
});

test("search selectCards projection includes visible nonselectable choices without exposing them as legal candidates", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const legalCard = must(p1State.hand[0], "legal searched card");
  const illegalCard = must(p1State.hand[1], "nonmatching searched card");
  const legalRef = cardRef(legalCard, p1);
  const illegalRef = cardRef(illegalCard, p1);

  state.revealedCards = [
    {
      id: "reveal:search-reveal:queue-public-choices",
      cards: [legalRef, illegalRef],
      visibility: { type: "private", playerId: p1 },
      origin: "topOfDeck",
      createdAtStateSeq: toStateSeq(state.seq),
      cleanupPolicy: "none",
    },
  ];
  state.pendingDecision = {
    id: toDecisionId("decision:selectCards:search-reveal:queue-public-choices"),
    type: "selectCards",
    playerId: p1,
    prompt: "Choose a revealed card or decline.",
    causedBy: { type: "ruleProcess", name: "test:searchReveal" },
    visibility: { type: "private", playerId: p1 },
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "self",
      zone: "deck",
      min: 0,
      max: 1,
      allowFewerIfUnavailable: true,
      visibility: "privateToChooser",
      set: "set:search-reveal:queue-public-choices" as never,
    },
    candidates: [
      { card: legalRef, visibility: { type: "private", playerId: p1 } },
    ],
  };

  const forDecisionPlayer = filterStateForPlayer(state, p1);
  const forOpponent = filterStateForPlayer(state, p2);

  assert.deepEqual(
    forDecisionPlayer.pendingDecision?.type === "selectCards"
      ? forDecisionPlayer.pendingDecision.choices
      : undefined,
    [
      { card: legalRef, selectable: true },
      { card: illegalRef, selectable: false },
    ],
  );
  assert.deepEqual(
    forDecisionPlayer.pendingDecision?.type === "selectCards"
      ? forDecisionPlayer.pendingDecision.candidates
      : undefined,
    [{ card: legalRef }],
  );
  assert.equal(forOpponent.pendingDecision, undefined);
  assert.equal(
    JSON.stringify(forOpponent).includes(String(illegalRef.cardId)),
    false,
  );
});

test("chooseTriggerOrder projection exposes trigger choices and hides private source cards", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  const hiddenOpponentHandCard = must(p2State.hand[0], "hidden opponent hand");
  const hiddenSelfDeckCard = must(p1State.deck[0], "hidden self deck");
  const hiddenOpponentLifeCard = must(
    p2State.life.find((card) => !card.faceUp),
    "hidden opponent face-down life",
  ).card;

  state.effectQueue.push({
    id: toQueueEntryId("queue-hidden-a"),
    state: "pending",
    timingWindowId: "timing-hidden" as never,
    generation: 1,
    controllerId: p1,
    source: {
      instanceId: hiddenOpponentLifeCard.instanceId,
      cardId: hiddenOpponentLifeCard.cardId,
      playerId: p2,
      zone: hiddenOpponentLifeCard.zone,
    },
    sourceSnapshot: {
      instanceId: hiddenOpponentLifeCard.instanceId,
      cardId: hiddenOpponentLifeCard.cardId,
      ownerId: p2,
      controllerId: p2,
      zone: hiddenOpponentLifeCard.zone,
      category: "event",
      colors: ["red"],
      keywords: [],
    },
    effectBlockId: "effect-hidden" as never,
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 1,
    queuedAtStateSeq: toStateSeq(state.seq),
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    causedBy: { type: "ruleProcess", name: "hidden" },
  });
  state.pendingDecision = {
    id: toDecisionId("decision:choose-trigger-order"),
    type: "chooseTriggerOrder",
    playerId: p1,
    prompt: "Choose next trigger to resolve.",
    causedBy: { type: "ruleProcess", name: "effectRuntime:chooseTriggerOrder" },
    visibility: { type: "public" },
    triggerIds: [toQueueEntryId("queue-hidden-a")],
    constraints: { mustUseAll: true },
  };

  const forDecisionPlayer = filterStateForPlayer(state, p1);
  const forOpponent = filterStateForPlayer(state, p2);

  assert.deepEqual(forDecisionPlayer.pendingDecision, {
    id: toDecisionId("decision:choose-trigger-order"),
    type: "chooseTriggerOrder",
    playerId: p1,
    prompt: "Choose next trigger to resolve.",
    causedBy: { type: "ruleProcess", name: "effectRuntime:chooseTriggerOrder" },
    choices: [{ triggerId: toQueueEntryId("queue-hidden-a") }],
  });
  assert.deepEqual(
    forDecisionPlayer.legalActions.filter(
      (action) => action.type === "respondToDecision",
    ),
    [
      {
        type: "respondToDecision",
        decisionId: toDecisionId("decision:choose-trigger-order"),
      },
    ],
  );
  assert.equal(JSON.stringify(forDecisionPlayer).includes("triggerIds"), false);
  assert.equal(JSON.stringify(forDecisionPlayer).includes("orderedIds"), false);
  assert.equal(
    JSON.stringify(forDecisionPlayer).includes("effectQueue"),
    false,
  );
  assert.equal(
    JSON.stringify(forDecisionPlayer).includes("sourceSnapshot"),
    false,
  );
  assert.equal(
    JSON.stringify(forDecisionPlayer).includes(
      String(hiddenOpponentHandCard.cardId),
    ),
    false,
  );
  assert.equal(
    JSON.stringify(forDecisionPlayer).includes(
      String(hiddenSelfDeckCard.cardId),
    ),
    false,
  );
  assert.equal(
    JSON.stringify(forDecisionPlayer).includes(
      String(hiddenOpponentLifeCard.cardId),
    ),
    false,
  );

  assert.equal(forOpponent.pendingDecision, undefined);
  assert.deepEqual(
    forOpponent.legalActions.filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );
});

test("selectTargets projection exposes public target candidates without private request metadata", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  const target = must(p2State.hand.shift(), "opponent target");
  target.zone = {
    zone: "characterArea",
    playerId: p2,
    slot: "character",
    index: 0,
  };
  p2State.characters.push(target);
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
  });
  state.effectQueue = [
    {
      id: toQueueEntryId("queue-entry-select-targets"),
      state: "pending",
      timingWindowId: toTimingWindowId("timing-window-select-targets"),
      generation: 1,
      controllerId: p1,
      source: {
        instanceId: p1State.leader.instanceId,
        cardId: p1State.leader.cardId,
        playerId: p1,
        zone: p1State.leader.zone,
      },
      sourceSnapshot: {
        instanceId: p1State.leader.instanceId,
        cardId: p1State.leader.cardId,
        ownerId: p1,
        controllerId: p1,
        zone: p1State.leader.zone,
        category: "leader",
        colors: ["red"],
        keywords: [],
      },
      effectBlockId: "effect-select-targets" as EffectId,
      orderingGroup: "turnPlayer",
      createdAtEventSeq: 1,
      queuedAtStateSeq: toStateSeq(state.seq),
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "selectTargets:view-test" },
    },
  ];
  const hiddenOpponentHandCard = must(p2State.hand[0], "hidden opponent hand");
  const hiddenSelfDeckCard = must(p1State.deck[0], "hidden self deck");
  state.pendingDecision = {
    id: toDecisionId("decision:select-targets"),
    type: "selectTargets",
    playerId: p1,
    prompt: "Select targets.",
    causedBy: {
      type: "effect",
      queueEntryId: toQueueEntryId("queue-entry-select-targets"),
      effectId: "effect-select-targets" as EffectId,
    },
    visibility: { type: "public" },
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "opponent",
      zone: "characterArea",
      min: 1,
      max: 1,
      allowFewerIfUnavailable: false,
      visibility: "public",
    },
    candidates: [
      {
        card: {
          instanceId: target.instanceId,
          cardId: target.cardId,
          playerId: p2,
          zone: target.zone,
        },
        visibility: { type: "public" },
      },
    ],
  };

  const forDecisionPlayer = filterStateForPlayer(state, p1);
  const forOpponent = filterStateForPlayer(state, p2);
  const expectedSource = {
    instanceId: p1State.leader.instanceId,
    cardId: p1State.leader.cardId,
    playerId: p1,
    zone: p1State.leader.zone,
  };

  assert.deepEqual(forDecisionPlayer.pendingDecision, {
    id: toDecisionId("decision:select-targets"),
    type: "selectTargets",
    playerId: p1,
    prompt: "Select targets.",
    causedBy: { type: "ruleProcess", name: "privateCausality" },
    source: expectedSource,
    min: 1,
    max: 1,
    candidates: [
      {
        card: {
          instanceId: target.instanceId,
          cardId: target.cardId,
          playerId: p2,
          zone: target.zone,
        },
      },
    ],
  });
  assert.deepEqual(forDecisionPlayer.activeEffectSources, [expectedSource]);
  assert.deepEqual(
    forDecisionPlayer.legalActions.filter(
      (action) => action.type === "respondToDecision",
    ),
    [
      {
        type: "respondToDecision",
        decisionId: toDecisionId("decision:select-targets"),
      },
    ],
  );
  assert.equal(JSON.stringify(forDecisionPlayer).includes("response"), false);
  assert.equal(JSON.stringify(forDecisionPlayer).includes("request"), false);
  assert.equal(
    JSON.stringify(forDecisionPlayer).includes("queueEntryId"),
    false,
  );
  assert.equal(
    JSON.stringify(forDecisionPlayer).includes("effect-select-targets"),
    false,
  );
  assert.equal(
    JSON.stringify(forDecisionPlayer).includes(
      String(hiddenOpponentHandCard.cardId),
    ),
    false,
  );
  assert.equal(
    JSON.stringify(forDecisionPlayer).includes(
      String(hiddenSelfDeckCard.cardId),
    ),
    false,
  );

  assert.equal(forOpponent.pendingDecision, undefined);
  assert.deepEqual(forOpponent.activeEffectSources, [expectedSource]);
  assert.deepEqual(
    forOpponent.legalActions.filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );
  assert.equal(JSON.stringify(forOpponent).includes("candidates"), false);
  assert.equal(JSON.stringify(forOpponent).includes("request"), false);
});

test("chooseReplacement projection is private and metadata-only without routing fields", () => {
  const state = createActiveState();
  const p2State = must(state.players[p2], "p2 state");
  const hiddenDecisionPlayerDeckCard = must(
    p2State.deck[0],
    "hidden decision player deck",
  );
  state.replacementState = [
    {
      processId: "process:ko:replacement",
      type: "ko",
      usedReplacementIds: [],
      payload: {
        target: {
          instanceId: hiddenDecisionPlayerDeckCard.instanceId,
          cardId: hiddenDecisionPlayerDeckCard.cardId,
          playerId: p2,
          zone: hiddenDecisionPlayerDeckCard.zone,
        },
        internal: "raw replacement process payload",
      },
    },
  ];
  state.pendingDecision = {
    id: toDecisionId("decision:choose-replacement"),
    type: "chooseReplacement",
    playerId: p2,
    prompt: "Choose replacement effect.",
    causedBy: {
      type: "effect",
      queueEntryId: toQueueEntryId("queue-entry-choose-replacement"),
      effectId: "effect-choose-replacement" as EffectId,
    },
    visibility: { type: "private", playerId: p2 },
    processId: "process:ko:replacement",
    replacementIds: ["replacement:would-be-ko-draw-1"],
    replacementOptions: [
      {
        replacementId: "replacement:would-be-ko-draw-1",
        label: "Add 1 card from Life to hand instead",
      },
    ],
    mandatory: false,
  };

  const forDecisionPlayer = filterStateForPlayer(state, p2);
  const forOpponent = filterStateForPlayer(state, p1);

  assert.deepEqual(forDecisionPlayer.pendingDecision, {
    id: toDecisionId("decision:choose-replacement"),
    type: "chooseReplacement",
    playerId: p2,
    prompt: "Choose replacement effect.",
    causedBy: { type: "ruleProcess", name: "privateCausality" },
  });
  assert.deepEqual(
    forDecisionPlayer.legalActions.filter(
      (action) => action.type === "respondToDecision",
    ),
    [{ type: "respondToDecision", decisionId: state.pendingDecision.id }],
  );
  assert.equal(forOpponent.pendingDecision, undefined);
  assert.deepEqual(
    forOpponent.legalActions.filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );
  assert.equal(JSON.stringify(forDecisionPlayer).includes("payload"), false);
  assert.equal(JSON.stringify(forDecisionPlayer).includes("target"), false);
  assert.equal(
    JSON.stringify(forDecisionPlayer).includes("queueEntryId"),
    false,
  );
  assert.equal(
    JSON.stringify(forDecisionPlayer).includes("effect-choose-replacement"),
    false,
  );
  assert.equal(JSON.stringify(forDecisionPlayer).includes("processId"), false);
  assert.equal(
    JSON.stringify(forDecisionPlayer).includes("replacementIds"),
    false,
  );
  assert.equal(
    JSON.stringify(forDecisionPlayer).includes("replacementOptions"),
    false,
  );
  assert.equal(
    JSON.stringify(forDecisionPlayer).includes("Add 1 card from Life"),
    false,
  );
  assert.equal(JSON.stringify(forDecisionPlayer).includes("mandatory"), false);
  assert.equal(
    JSON.stringify(forDecisionPlayer).includes(
      String(hiddenDecisionPlayerDeckCard.cardId),
    ),
    false,
  );
  assert.equal(JSON.stringify(forDecisionPlayer).includes("internal"), false);
});

test("projects legal actions without leaking hidden card identities", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1 state");
  const playable = must(p1State.hand[0], "playable hand card");
  state.cardManifest.cards[playable.cardId] = resolvedCard({
    cardId: playable.cardId,
    category: "character",
    cost: 0,
    power: 1000,
  });

  const view = filterStateForPlayer(state, p1);

  assert.notDeepEqual(view.legalActions, getLegalActions(state, p1));
  const playAction = view.legalActions.find(
    (action): action is Extract<PublicLegalAction, { type: "playCard" }> =>
      action.type === "playCard" &&
      action.card.instanceId === playable.instanceId,
  );
  assert.ok(playAction);
  assert.equal(playAction.card.cardId, playable.cardId);
  assert.deepEqual(playAction.card.zone, playable.zone);
  assert.equal(
    "cardInstanceId" in (playAction as unknown as Record<string, unknown>),
    false,
  );

  const serialized = JSON.stringify(view.legalActions);
  const p2State = must(state.players[p2], "p2 state");
  for (const opponentCard of p2State.hand) {
    assert.equal(serialized.includes(String(opponentCard.cardId)), false);
  }
  for (const opponentCard of p2State.deck) {
    assert.equal(serialized.includes(String(opponentCard.cardId)), false);
  }
  for (const opponentLifeCard of p2State.life) {
    assert.equal(
      serialized.includes(String(opponentLifeCard.card.cardId)),
      false,
    );
  }
  for (const selfDeckCard of p1State.deck) {
    assert.equal(serialized.includes(String(selfDeckCard.cardId)), false);
  }
  for (const selfLifeCard of p1State.life.filter(
    (lifeCard) => !lifeCard.faceUp,
  )) {
    assert.equal(serialized.includes(String(selfLifeCard.card.cardId)), false);
  }
});

test("deduplicates public decision response markers without exposing response payloads", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  const defenderBlocker = must(p2State.characters[0], "defender blocker");
  defenderBlocker.state = "active";
  state.cardManifest.cards[defenderBlocker.cardId] = {
    ...resolvedCard({
      cardId: defenderBlocker.cardId,
      category: "character",
      power: 3000,
    }),
    printedKeywords: ["blocker"],
  };

  const opened = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });
  assert.equal(opened.errors, undefined);
  const pending = must(opened.state.pendingDecision, "block decision");

  const engineResponses = getLegalActions(opened.state, p2).filter(
    (action) => action.type === "respondToDecision",
  );
  assert.equal(engineResponses.length, 2);

  const view = filterStateForPlayer(opened.state, p2);
  assert.deepEqual(
    view.legalActions.filter((action) => action.type === "respondToDecision"),
    [{ type: "respondToDecision", decisionId: pending.id }],
  );
  assert.equal(JSON.stringify(view.legalActions).includes("response"), false);
  assert.equal(
    JSON.stringify(view.legalActions).includes(String(defenderBlocker.cardId)),
    false,
  );
});

test("filters event journal and revealed records by recipient visibility", () => {
  const state = createActiveState();
  state.eventJournal = [
    withEvent(state, 1, { type: "public" }),
    withEvent(state, 2, { type: "private", playerId: p1 }),
    withEvent(state, 3, { type: "private", playerId: p2 }),
    withEvent(state, 4, { type: "hidden" }),
    withEvent(state, 5, { type: "replayOnly" }),
    withEvent(state, 6, { type: "serverOnly" }),
  ];

  state.revealedCards = [
    {
      id: "public",
      cards: [
        {
          instanceId: "i1" as InstanceId,
          cardId: toCardId("p1-a"),
          playerId: p1,
        },
      ],
      visibility: { type: "public" },
      origin: "topOfDeck",
      createdAtStateSeq: toStateSeq(state.seq),
      cleanupPolicy: "none",
    },
    {
      id: "private-p1",
      cards: [
        {
          instanceId: "i2" as InstanceId,
          cardId: toCardId("p1-b"),
          playerId: p1,
        },
      ],
      visibility: { type: "private", playerId: p1 },
      origin: "topOfDeck",
      createdAtStateSeq: toStateSeq(state.seq),
      cleanupPolicy: "none",
    },
    {
      id: "private-p2",
      cards: [
        {
          instanceId: "i3" as InstanceId,
          cardId: toCardId("p2-a"),
          playerId: p2,
        },
      ],
      visibility: { type: "private", playerId: p2 },
      origin: "topOfDeck",
      createdAtStateSeq: toStateSeq(state.seq),
      cleanupPolicy: "none",
    },
  ];

  const forP1 = filterStateForPlayer(state, p1);
  const forP2 = filterStateForPlayer(state, p2);

  assert.deepEqual(
    forP1.events.map((event) => event.seq),
    [1, 2],
  );
  assert.deepEqual(
    forP2.events.map((event) => event.seq),
    [1, 3],
  );

  assert.deepEqual(
    forP1.revealedCards.map((record) => [record.id, record.visibility]),
    [
      ["public", "public"],
      ["private-p1", "privateToRecipient"],
    ],
  );
  assert.deepEqual(
    forP2.revealedCards.map((record) => [record.id, record.visibility]),
    [
      ["public", "public"],
      ["private-p2", "privateToRecipient"],
    ],
  );
});

test("sanitizes player-visible effect lifecycle events without mutating the journal", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const source = {
    instanceId: p1State.leader.instanceId,
    cardId: p1State.leader.cardId,
    playerId: p1,
    zone: p1State.leader.zone,
  };
  const affected = [source];
  const queuedId = toQueueEntryId("queue-entry:visible:queued");
  const resolvedId = toQueueEntryId("queue-entry:visible:resolved");
  const effectId = "effect:test" as EffectId;
  const safeCausedBy = { type: "playerAction" as const, actionId: "action:1" };

  const effectQueued: EngineEvent = {
    id: toEngineEventId("event:effect-queued"),
    seq: 1,
    type: "effectQueued",
    actor: p1,
    source,
    affected,
    payload: {
      queueEntryId: queuedId,
      effectBlockId: effectId,
      triggerIds: [queuedId],
      sourceSnapshot: { cardId: source.cardId, instanceId: source.instanceId },
      orderedIds: [queuedId],
    },
    causedBy: { type: "effect", queueEntryId: queuedId, effectId },
    visibility: { type: "public" },
    createdAtStateSeq: toStateSeq(state.seq),
  };
  const effectResolved: EngineEvent = {
    id: toEngineEventId("event:effect-resolved"),
    seq: 2,
    type: "effectResolved",
    actor: p1,
    source,
    affected,
    payload: {
      queueEntryId: resolvedId,
      effectBlockId: effectId,
      result: "done",
    },
    causedBy: { type: "effect", queueEntryId: resolvedId, effectId },
    visibility: { type: "private", playerId: p1 },
    createdAtStateSeq: toStateSeq(state.seq),
  };
  const safeNonEffect: EngineEvent = {
    id: toEngineEventId("event:safe-non-effect"),
    seq: 3,
    type: "decisionResolved",
    actor: p1,
    payload: { status: "accepted" },
    causedBy: safeCausedBy,
    visibility: { type: "public" },
    createdAtStateSeq: toStateSeq(state.seq),
  };
  const contaminatedNonEffectCausedBy = {
    type: "ruleProcess",
    name: "runtime-contaminated-causality",
    queueEntryId: queuedId,
  } as unknown as NonNullable<EngineEvent["causedBy"]>;
  const unsafeNonEffectCausedBy: EngineEvent = {
    id: toEngineEventId("event:unsafe-non-effect-caused-by"),
    seq: 4,
    type: "decisionCreated",
    actor: p1,
    payload: { prompt: "Choose an option." },
    causedBy: contaminatedNonEffectCausedBy,
    visibility: { type: "public" },
    createdAtStateSeq: toStateSeq(state.seq),
  };
  const damageEvent: EngineEvent = {
    id: toEngineEventId("event:damage-continuation"),
    seq: 5,
    type: "damageDealt",
    actor: p1,
    payload: {
      amount: 1,
      damageProcess: {
        type: "multipleDamage",
        sourceKeyword: "doubleAttack",
        remainingDamagePoints: 1,
      },
      remainingDamagePoints: 1,
      sourceKeyword: "doubleAttack",
    },
    visibility: { type: "public" },
    createdAtStateSeq: toStateSeq(state.seq),
  };
  state.eventJournal = [
    effectQueued,
    effectResolved,
    safeNonEffect,
    unsafeNonEffectCausedBy,
    damageEvent,
    withEvent(state, 6, { type: "private", playerId: p2 }),
    withEvent(state, 7, { type: "hidden" }),
    withEvent(state, 8, { type: "replayOnly" }),
    withEvent(state, 9, { type: "serverOnly" }),
  ];
  const originalJournal = JSON.stringify(state.eventJournal);

  const view = filterStateForPlayer(state, p1);

  assert.deepEqual(view.events, [
    {
      id: effectQueued.id,
      seq: effectQueued.seq,
      type: "effectQueued",
      actor: effectQueued.actor,
      source: effectQueued.source,
      affected: effectQueued.affected,
      payload: { status: "queued" },
      visibility: effectQueued.visibility,
      createdAtStateSeq: effectQueued.createdAtStateSeq,
    },
    {
      id: effectResolved.id,
      seq: effectResolved.seq,
      type: "effectResolved",
      actor: effectResolved.actor,
      source: effectResolved.source,
      affected: effectResolved.affected,
      payload: { status: "resolved" },
      visibility: effectResolved.visibility,
      createdAtStateSeq: effectResolved.createdAtStateSeq,
    },
    safeNonEffect,
    {
      id: unsafeNonEffectCausedBy.id,
      seq: unsafeNonEffectCausedBy.seq,
      type: unsafeNonEffectCausedBy.type,
      actor: unsafeNonEffectCausedBy.actor,
      payload: unsafeNonEffectCausedBy.payload,
      visibility: unsafeNonEffectCausedBy.visibility,
      createdAtStateSeq: unsafeNonEffectCausedBy.createdAtStateSeq,
    },
    {
      id: damageEvent.id,
      seq: damageEvent.seq,
      type: damageEvent.type,
      actor: damageEvent.actor,
      payload: { amount: 1 },
      visibility: damageEvent.visibility,
      createdAtStateSeq: damageEvent.createdAtStateSeq,
    },
  ]);
  assert.equal(JSON.stringify(view.events).includes("queueEntryId"), false);
  assert.equal(JSON.stringify(view.events).includes("triggerIds"), false);
  assert.equal(JSON.stringify(view.events).includes("sourceSnapshot"), false);
  assert.equal(JSON.stringify(view.events).includes("orderedIds"), false);
  assert.equal(JSON.stringify(view.events).includes("damageProcess"), false);
  assert.equal(
    JSON.stringify(view.events).includes("remainingDamagePoints"),
    false,
  );
  assert.equal(JSON.stringify(view.events).includes("sourceKeyword"), false);
  assert.equal(JSON.stringify(state.eventJournal), originalJournal);
});
