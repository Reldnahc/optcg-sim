import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  hashCanonicalStateValue,
  must,
  p1,
  p2,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "../effect-runtime-queue-processing-test-support.js";

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-sequence-select-targets";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "sequence-select-targets-rules",
      sourceTextHash: "sequence-select-targets-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-sequence-select-targets"),
        effect,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const sequenceQueueState = (
  effect: Effect,
): { state: GameState; definition: EffectDefinition } => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-sequence-select-targets"),
      timingWindowId: toTimingWindowId("window-sequence-select-targets"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "sequence effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "sequence-select-targets-test" },
    },
  ];
  return { state, definition };
};

const selectTargetsThenKoSavedSelectedTargetSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "prelude-draw",
      connector: "always",
      effect: { type: "draw", player: "self", count: 0 },
    },
    {
      id: "select-target",
      connector: "always",
      saveResultAs: "savedTarget",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          zone: "characterArea",
          player: "opponent",
          min: 1,
          max: 1,
          allowFewerIfUnavailable: false,
          visibility: "public",
        },
      },
    },
    {
      id: "ko-selected-target",
      connector: "ifPreviousSucceeded",
      effect: {
        type: "ko",
        target: {
          type: "savedFieldObject",
          binding: { family: "selectedTargets", saveResultAs: "savedTarget" },
          zone: "characterArea",
          player: "opponent",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
      },
    },
  ],
});

const twoSelectTargetsThenKoSavedSelectedTargetSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "prelude-draw",
      connector: "always",
      effect: { type: "draw", player: "self", count: 0 },
    },
    {
      id: "select-target-1",
      connector: "always",
      saveResultAs: "savedTargetFirst",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          zone: "characterArea",
          player: "opponent",
          min: 1,
          max: 1,
          allowFewerIfUnavailable: false,
          visibility: "public",
        },
      },
    },
    {
      id: "select-target-2",
      connector: "always",
      saveResultAs: "savedTargetSecond",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          zone: "characterArea",
          player: "opponent",
          min: 1,
          max: 1,
          allowFewerIfUnavailable: false,
          visibility: "public",
        },
      },
    },
    {
      id: "ko-selected-target",
      connector: "ifPreviousSucceeded",
      effect: {
        type: "ko",
        target: {
          type: "savedFieldObject",
          binding: {
            family: "selectedTargets",
            saveResultAs: "savedTargetSecond",
          },
          zone: "characterArea",
          player: "opponent",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
      },
    },
  ],
});

const directPowerReductionTargetSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "prelude-draw",
      connector: "always",
      effect: { type: "draw", player: "self", count: 0 },
    },
    {
      id: "power-reduction",
      connector: "then",
      effect: {
        type: "modifyPower",
        target: {
          type: "choose",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "opponent",
            zone: "characterArea",
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            visibility: "public",
            filter: { categories: ["character"] },
          },
        },
        value: -1000,
        duration: { type: "thisTurn" },
      },
    },
  ],
});

const directRestLeaderOrCharacterTargetSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "rest-leader-or-character",
      connector: "always",
      effect: {
        type: "rest",
        target: {
          type: "chooseFromZones",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "opponent",
            zones: ["leaderArea", "characterArea"],
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            visibility: "public",
            filter: { categories: ["leader", "character"] },
          },
        },
      },
    },
  ],
});

const directRestOpponentCharacterOrDonTargetSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "rest-character-or-don",
      connector: "always",
      effect: {
        type: "rest",
        target: {
          type: "chooseFromZones",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "opponent",
            zones: ["characterArea", "costArea"],
            min: 0,
            max: 2,
            allowFewerIfUnavailable: true,
            visibility: "public",
            filter: { categories: ["character", "don"] },
          },
        },
      },
    },
  ],
});

test("sequence selectTargets fail-closes when no legal candidates satisfy min without leaving a pending decision", () => {
  const { state } = sequenceQueueState(
    selectTargetsThenKoSavedSelectedTargetSequence(),
  );

  const first = processEffectRuntime(state);
  const second = processEffectRuntime(state);

  assert.equal(first.errors, undefined);
  assert.equal(first.state.pendingDecision, undefined);
  assert.equal(first.state.effectExecutionFrames.length, 0);
  assert.equal(
    first.events.some((event) => event.type === "decisionCreated"),
    false,
  );
  assert.equal(
    first.events.some((event) => event.type === "decisionResolved"),
    false,
  );
  assert.equal(
    first.events.some((event) => event.type === "cardKOd"),
    false,
  );
  assert.equal(first.events.at(-1)?.type, "effectResolved");
  assert.equal(
    must(first.state.players[p2], "p2").characters.length,
    must(state.players[p2], "original p2").characters.length,
  );
  assert.equal(first.stateHash, second.stateHash);
  assert.equal(first.stateHash, hashCanonicalStateValue(first.state));
});

test("sequence direct continuous choose segment creates target decision and exact-card power modifier", () => {
  const { state } = sequenceQueueState(directPowerReductionTargetSequence());
  const p2State = must(state.players[p2], "p2");
  const target = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "target"),
    zone: "characterArea",
    index: 0,
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 5000,
  });

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "target selection");
  assert.equal(decision.type, "selectTargets");

  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: [must(decision.candidates[0], "target candidate").card],
    },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  const modifier = must(result.state.continuousEffects[0], "power modifier");
  assert.equal(modifier.modifier.layer, "powerAdd");
  assert.equal(modifier.modifier.target.type, "exactCard");
  assert.equal(modifier.modifier.target.card.instanceId, target.instanceId);
  assert.deepEqual(modifier.modifier.operation, {
    type: "addPower",
    value: -1000,
  });
});

test("sequence direct rest chooseFromZones segment creates target decision and rests selected leader", () => {
  const { state } = sequenceQueueState(
    directRestLeaderOrCharacterTargetSequence(),
  );
  const p2State = must(state.players[p2], "p2");
  p2State.leader.state = "active";
  state.cardManifest.cards[p2State.leader.cardId] = resolvedCard({
    cardId: p2State.leader.cardId,
    category: "leader",
  });

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "target selection");
  assert.equal(decision.type, "selectTargets");
  const leaderCandidate = must(
    decision.candidates.find(
      (candidate) => candidate.card.zone?.zone === "leaderArea",
    ),
    "leader candidate",
  );

  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: [leaderCandidate.card],
    },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(
    must(result.state.players[p2], "resolved p2").leader.state,
    "rested",
  );
});

test("sequence direct rest chooseFromZones segment shares max across opponent Characters and DON", () => {
  const { state } = sequenceQueueState(
    directRestOpponentCharacterOrDonTargetSequence(),
  );
  const p2State = must(state.players[p2], "p2");
  const character = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "character target"),
    zone: "characterArea",
  });
  const don = must(p2State.donDeck[0], "don target");
  p2State.donDeck = p2State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p2, slot: "donDeck", index },
  }));
  p2State.costArea = [
    {
      ...don,
      zone: { zone: "costArea", playerId: p2, slot: "cost", index: 0 },
      state: "active",
    },
  ];
  state.cardManifest.cards[character.cardId] = resolvedCard({
    cardId: character.cardId,
    category: "character",
  });
  state.cardManifest.cards[don.cardId] = resolvedCard({
    cardId: don.cardId,
    category: "don",
  });

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "target selection");
  assert.equal(decision.type, "selectTargets");
  assert.equal(decision.request.max, 2);
  assert.ok("zones" in decision.request);
  assert.deepEqual(decision.request.zones, ["characterArea", "costArea"]);
  const characterCandidate = must(
    decision.candidates.find(
      (candidate) => candidate.card.zone?.zone === "characterArea",
    ),
    "character candidate",
  );
  const donCandidate = must(
    decision.candidates.find(
      (candidate) => candidate.card.zone?.zone === "costArea",
    ),
    "DON candidate",
  );

  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: [characterCandidate.card, donCandidate.card],
    },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  const resolvedP2 = must(result.state.players[p2], "resolved p2");
  assert.equal(
    must(resolvedP2.characters[0], "rested character").state,
    "rested",
  );
  assert.equal(must(resolvedP2.costArea[0], "rested DON").state, "rested");
});

test("multiple sequence selectTargets segments use distinct decision ids", () => {
  const { state } = sequenceQueueState(
    twoSelectTargetsThenKoSavedSelectedTargetSequence(),
  );
  const p2State = must(state.players[p2], "p2");
  const firstTarget = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "first target"),
    zone: "characterArea",
    index: 0,
  });
  const secondTarget = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[1], "second target"),
    zone: "characterArea",
    index: 1,
  });
  state.cardManifest.cards[firstTarget.cardId] = resolvedCard({
    cardId: firstTarget.cardId,
    category: "character",
    power: 2000,
  });
  state.cardManifest.cards[secondTarget.cardId] = resolvedCard({
    cardId: secondTarget.cardId,
    category: "character",
    power: 3000,
  });

  const pausedFirst = processEffectRuntime(state);
  const firstDecision = must(
    pausedFirst.state.pendingDecision,
    "first target selection",
  );
  assert.equal(firstDecision.type, "selectTargets");

  const pausedSecond = applyAction(pausedFirst.state, {
    type: "respondToDecision",
    decisionId: firstDecision.id,
    response: {
      type: "targets",
      targets: [must(firstDecision.candidates[0], "first candidate").card],
    },
  });
  assert.equal(pausedSecond.errors, undefined);
  const secondDecision = must(
    pausedSecond.state.pendingDecision,
    "second target selection",
  );
  assert.equal(secondDecision.type, "selectTargets");
  assert.notEqual(secondDecision.id, firstDecision.id);

  const resolved = applyAction(pausedSecond.state, {
    type: "respondToDecision",
    decisionId: secondDecision.id,
    response: {
      type: "targets",
      targets: [must(secondDecision.candidates[1], "second candidate").card],
    },
  });
  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(
    must(resolved.state.players[p2], "resolved p2").characters.some(
      (card) => card.instanceId === secondTarget.instanceId,
    ),
    false,
  );
  assert.equal(
    must(resolved.state.players[p2], "resolved p2").characters.some(
      (card) => card.instanceId === firstTarget.instanceId,
    ),
    true,
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});
