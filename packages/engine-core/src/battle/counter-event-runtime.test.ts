import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, EffectDefinition, EffectId } from "@optcg/types";

import { applyAction, getLegalActions } from "../actions.js";
import { processEffectRuntime } from "../effect-runtime.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import { computeView } from "../view/compute-view.js";
import { applyDeclareAttack } from "./actions.js";
import {
  cardRef,
  ensureActiveDonInCostArea,
  installSupportedCounterReplacementEvent,
  setupAttackState,
} from "./test-fixtures.js";

const installSupportedCounterSequenceEvent = (
  state: ReturnType<typeof setupAttackState>,
  card: CardInstance,
) => {
  const definitionId = `${String(card.cardId)}:counter-sequence`;
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "event",
    cost: 1,
    effectText:
      "[Counter] Draw 1 card and your Leader gains +3000 power during this battle.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: definitionId,
    },
  });
  const effect: EffectDefinition["effects"][number] = {
    id: `${String(card.cardId)}:counter-sequence:1` as EffectId,
    category: "auto",
    trigger: { type: "counter" },
    sourcePresencePolicy: "resolveFromDestinationZone",
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: { type: "draw", player: "self", count: 1 },
        },
        {
          connector: "then",
          effect: {
            type: "modifyPower",
            target: { type: "myLeader" },
            value: 3000,
            duration: { type: "thisBattle" },
          },
        },
      ],
    },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [definitionId]: {
      cardId: card.cardId,
      implementationStatus: "implemented-dsl",
      effects: [effect],
      metadata: {
        sourceTextHash: "source-hash",
        rulesVersion: "r1",
        effectDefinitionsVersion: "fixture",
        tested: true,
        reviewer: "qa-reviewer",
      },
    },
  };
};

const installCannotAttackCounterEvent = (
  state: ReturnType<typeof setupAttackState>,
  card: CardInstance,
) => {
  const definitionId = `${String(card.cardId)}:counter-cannot-attack`;
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "event",
    cost: 1,
    effectText:
      "[Counter] If you have 2 or less Life cards, up to 1 of your opponent's active Characters cannot attack during this turn.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: definitionId,
    },
  });
  const effect: EffectDefinition["effects"][number] = {
    id: `${String(card.cardId)}:counter-cannot-attack:1` as EffectId,
    category: "auto",
    trigger: { type: "counter" },
    sourcePresencePolicy: "resolveFromDestinationZone",
    condition: { type: "lifeCount", player: "self", op: "lte", value: 2 },
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          saveResultAs: "selected:thatCharacter",
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "opponent",
              zone: "characterArea",
              min: 0,
              max: 1,
              allowFewerIfUnavailable: true,
              visibility: "public",
              filter: { categories: ["character"], state: "active" },
            },
          },
        },
        {
          connector: "then",
          effect: {
            type: "cannotAttack",
            target: {
              type: "savedFieldObject",
              binding: {
                family: "selectedTargets",
                saveResultAs: "selected:thatCharacter",
              },
              player: "opponent",
              zones: ["characterArea"],
              visibility: "publicOnly",
              onFailure: "failClosed",
            },
            duration: { type: "thisTurn" },
          },
        },
      ],
    },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [definitionId]: {
      cardId: card.cardId,
      implementationStatus: "implemented-dsl",
      effects: [effect],
      metadata: {
        sourceTextHash: "source-hash",
        rulesVersion: "r1",
        effectDefinitionsVersion: "fixture",
        tested: true,
        reviewer: "qa-reviewer",
      },
    },
  };
};

test("supported non-power Counter Event grants battle K.O. replacement after printed cost", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  ensureActiveDonInCostArea(state, p2, 2);
  const counterEvent = must(p2State.hand[0], "counter event");
  const battleTarget = must(p2State.characters[0], "battle target");
  installSupportedCounterReplacementEvent(state, counterEvent);

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(battleTarget, p2),
  });
  assert.equal(opened.errors, undefined);
  assert.equal(
    getLegalActions(opened.state, p2).some(
      (action) =>
        action.type === "useCounter" &&
        action.cardInstanceId === counterEvent.instanceId,
    ),
    true,
  );

  const use = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterEvent.instanceId,
    target: must(opened.state.battle, "battle").currentTarget,
  });
  assert.equal(use.errors, undefined);
  assert.equal(use.state.pendingDecision?.type, "payCost");

  const activeDon = must(use.state.players[p2], "p2")
    .costArea.filter((card) => card.state === "active")
    .slice(0, 2);
  assert.equal(activeDon.length, 2);
  const paid = applyAction(use.state, {
    type: "respondToDecision",
    decisionId: must(use.state.pendingDecision, "decision").id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: activeDon.map((card) => card.instanceId),
    },
  });

  assert.equal(paid.errors, undefined);
  assert.equal(paid.state.battle?.step, "counter");
  assert.equal(paid.state.pendingDecision?.type, "selectCards");
  assert.equal(
    must(paid.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === counterEvent.instanceId,
    ),
    true,
  );
  assert.deepEqual(
    paid.state.continuousEffects.map((effect) => effect.modifier.layer),
    ["replacement"],
  );
  assert.deepEqual(
    paid.events.map((event) => event.type),
    [
      "costPaid",
      "decisionResolved",
      "counterUsed",
      "spotlightEntryCreated",
      "cardMoved",
      "cardTrashed",
      "effectQueued",
      "effectResolved",
      "ruleProcessingChecked",
      "decisionCreated",
    ],
  );
  const replay = applyAction(structuredClone(use.state), {
    type: "respondToDecision",
    decisionId: must(use.state.pendingDecision, "decision").id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: activeDon.map((card) => card.instanceId),
    },
  });
  assert.equal(paid.stateHash, replay.stateHash);
  assert.deepEqual(paid.events, replay.events);

  const passed = applyAction(paid.state, {
    type: "respondToDecision",
    decisionId: must(paid.state.pendingDecision, "counter decision").id,
    response: { type: "cards", cards: [] },
  });

  assert.equal(passed.errors, undefined);
  assert.equal(passed.state.pendingDecision?.type, "chooseReplacement");
  assert.deepEqual(
    passed.state.replacementState.map((process) => process.type),
    ["ko"],
  );
});

test("supported Counter Event sequence resolves after printed cost", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  ensureActiveDonInCostArea(state, p2, 1);
  const counterEvent = must(p2State.hand[0], "counter event");
  installSupportedCounterSequenceEvent(state, counterEvent);
  const initialDeckSize = p2State.deck.length;

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  assert.equal(
    getLegalActions(opened.state, p2).some(
      (action) =>
        action.type === "useCounter" &&
        action.cardInstanceId === counterEvent.instanceId,
    ),
    true,
  );

  const use = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterEvent.instanceId,
    target: must(opened.state.battle, "battle").currentTarget,
  });
  assert.equal(use.errors, undefined);
  assert.equal(use.state.pendingDecision?.type, "payCost");

  const activeDon = must(use.state.players[p2], "p2").costArea.filter(
    (card) => card.state === "active",
  );
  const paid = applyAction(use.state, {
    type: "respondToDecision",
    decisionId: must(use.state.pendingDecision, "decision").id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [must(activeDon[0], "active DON").instanceId],
    },
  });

  assert.equal(paid.errors, undefined);
  assert.equal(
    must(paid.state.players[p2], "p2").deck.length,
    initialDeckSize - 1,
  );
  assert.equal(
    must(paid.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === counterEvent.instanceId,
    ),
    true,
  );
  assert.deepEqual(
    paid.state.continuousEffects.map((effect) => effect.modifier.layer),
    ["powerAdd"],
  );
  const eventTypes = paid.events.map((event) => event.type);
  assert.equal(eventTypes.includes("costPaid"), true);
  assert.equal(eventTypes.includes("counterUsed"), true);
  assert.equal(eventTypes.includes("cardTrashed"), true);
  assert.equal(eventTypes.includes("cardDrawn"), true);
  assert.equal(eventTypes.includes("effectResolved"), true);
});

test("Counter Event cannot-attack sequence fully resolves and blocks the selected Character", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  ensureActiveDonInCostArea(state, p2, 1);
  const counterEvent = must(p2State.hand[0], "counter event");
  const restrictedAttacker = must(p1State.characters[0], "p1 character");
  restrictedAttacker.state = "active";
  restrictedAttacker.turnPlayed = state.turn.globalTurn - 1;
  p2State.life = p2State.life.slice(0, 2);
  installCannotAttackCounterEvent(state, counterEvent);

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);

  const used = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterEvent.instanceId,
    target: must(opened.state.battle, "battle").currentTarget,
  });
  assert.equal(used.errors, undefined);
  assert.equal(used.state.pendingDecision?.type, "payCost");

  const activeDon = must(used.state.players[p2], "p2").costArea.filter(
    (card) => card.state === "active",
  );
  const paid = applyAction(used.state, {
    type: "respondToDecision",
    decisionId: must(used.state.pendingDecision, "decision").id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [must(activeDon[0], "active DON").instanceId],
    },
  });
  assert.equal(paid.errors, undefined);

  let current = paid;
  for (let step = 0; step < 5; step += 1) {
    if (current.state.pendingDecision?.type === "selectTargets") {
      break;
    }
    current = processEffectRuntime(current.state);
  }
  const targetDecision = must(
    current.state.pendingDecision,
    "cannot-attack target decision",
  );
  assert.equal(targetDecision.type, "selectTargets");

  const selected = applyAction(current.state, {
    type: "respondToDecision",
    decisionId: targetDecision.id,
    response: { type: "targets", targets: [cardRef(restrictedAttacker, p1)] },
  });
  assert.equal(selected.errors, undefined);

  let resolved = selected;
  for (let step = 0; step < 5; step += 1) {
    if (resolved.state.effectQueue.length === 0) {
      break;
    }
    resolved = processEffectRuntime(resolved.state);
  }
  assert.equal(resolved.state.effectQueue.length, 0);
  assert.equal(
    resolved.state.continuousEffects.some(
      (effect) =>
        effect.modifier.layer === "restriction" &&
        effect.modifier.operation.type === "restriction" &&
        effect.modifier.operation.restriction === "cannotAttack" &&
        effect.modifier.target.type === "exactCard" &&
        effect.modifier.target.card.instanceId ===
          restrictedAttacker.instanceId,
    ),
    true,
  );

  const { battle: _battle, pendingDecision: _pendingDecision, ...stateRest } =
    resolved.state;
  const afterBattle = {
    ...stateRest,
    turn: { ...resolved.state.turn, turnPlayerId: p1, phase: "main" as const },
  };
  const view = computeView(afterBattle);
  assert.deepEqual(view.legalAttackTargets[restrictedAttacker.instanceId], []);
});
