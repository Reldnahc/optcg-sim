import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  EffectDefinition,
  EffectId,
  GameState,
  PlayerId,
} from "@optcg/types";

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

const installMultiBlockCounterEvent = (
  state: ReturnType<typeof setupAttackState>,
  card: CardInstance,
): { drawEffectId: EffectId; powerEffectId: EffectId } => {
  const definitionId = `${String(card.cardId)}:counter-multi`;
  const drawEffectId = `${String(card.cardId)}:counter-multi:draw` as EffectId;
  const powerEffectId =
    `${String(card.cardId)}:counter-multi:power` as EffectId;
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "event",
    cost: 0,
    effectText:
      "[Counter] Draw 1 card. [Counter] Your Leader gets +2000 power during this battle.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: definitionId,
    },
  });
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [definitionId]: {
      cardId: card.cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: drawEffectId,
          category: "auto",
          trigger: { type: "counter" },
          sourcePresencePolicy: "resolveFromDestinationZone",
          effect: { type: "draw", player: "self", count: 1 },
        },
        {
          id: powerEffectId,
          category: "auto",
          trigger: { type: "counter" },
          sourcePresencePolicy: "resolveFromDestinationZone",
          effect: {
            type: "modifyPower",
            target: { type: "myLeader" },
            value: 2000,
            duration: { type: "thisBattle" },
          },
        },
      ],
      metadata: {
        sourceTextHash: "source-hash",
        rulesVersion: "r1",
        effectDefinitionsVersion: "fixture",
        tested: true,
        reviewer: "qa-reviewer",
      },
    },
  };
  return { drawEffectId, powerEffectId };
};

const legalCounterAction = (
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
) =>
  must(
    getLegalActions(state, playerId).find(
      (action) =>
        action.type === "useCounter" &&
        action.cardInstanceId === card.instanceId,
    ),
    "legal Counter Event action",
  );

test("Counter Event legal actions expose each real Counter effect block separately", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterEvent = must(p2State.hand[0], "counter event");
  const { drawEffectId, powerEffectId } = installMultiBlockCounterEvent(
    state,
    counterEvent,
  );

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);

  const counterActions = getLegalActions(opened.state, p2).flatMap((action) =>
    action.type === "useCounter" &&
    action.cardInstanceId === counterEvent.instanceId
      ? [action]
      : [],
  );
  assert.deepEqual(
    counterActions.map((action) => action.effectId).sort(),
    [drawEffectId, powerEffectId].sort(),
  );
});

test("Counter Event activation queues only the selected real effect block", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterEvent = must(p2State.hand[0], "counter event");
  const { powerEffectId } = installMultiBlockCounterEvent(state, counterEvent);

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  const action = must(
    getLegalActions(opened.state, p2).find(
      (candidate) =>
        candidate.type === "useCounter" &&
        candidate.cardInstanceId === counterEvent.instanceId &&
        candidate.effectId === powerEffectId,
    ),
    "power counter action",
  );

  const used = applyAction(opened.state, action);

  assert.equal(used.errors, undefined);
  const queued = must(
    used.events.find((event) => event.type === "effectQueued"),
    "effectQueued event",
  );
  const payload = queued.payload as { readonly effectBlockId?: unknown };
  assert.equal(payload.effectBlockId, powerEffectId);
  assert.equal(
    used.events.some((event) => event.type === "cardDrawn"),
    false,
  );
});

test("supported non-power Counter Event grants battle K.O. replacement after autopaying printed cost", () => {
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

  const use = applyAction(
    opened.state,
    legalCounterAction(opened.state, p2, counterEvent),
  );
  assert.equal(use.errors, undefined);
  assert.equal(use.state.pendingDecision?.type, "selectCards");

  assert.equal(use.state.battle?.step, "counter");
  assert.equal(
    must(use.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === counterEvent.instanceId,
    ),
    true,
  );
  assert.deepEqual(
    use.state.continuousEffects.map((effect) => effect.modifier.layer),
    ["replacement"],
  );
  assert.deepEqual(
    use.events.map((event) => event.type),
    [
      "costPaid",
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
  const paidDon = must(
    use.events.find((event) => event.type === "costPaid")?.payload,
    "cost paid payload",
  ) as { selectedDonInstanceIds?: readonly string[] };
  const paidDonIds = must(paidDon.selectedDonInstanceIds, "paid DON ids");
  assert.equal(paidDonIds.length, 2);
  assert.equal(
    paidDonIds.every((donId) =>
      must(use.state.players[p2], "p2").costArea.some(
        (card) => card.instanceId === donId && card.state === "rested",
      ),
    ),
    true,
  );
  const replay = applyAction(
    structuredClone(opened.state),
    legalCounterAction(opened.state, p2, counterEvent),
  );
  assert.equal(use.stateHash, replay.stateHash);
  assert.deepEqual(use.events, replay.events);

  const passed = applyAction(use.state, {
    type: "respondToDecision",
    decisionId: must(use.state.pendingDecision, "counter decision").id,
    response: { type: "cards", cards: [] },
  });

  assert.equal(passed.errors, undefined);
  assert.equal(passed.state.pendingDecision?.type, "chooseReplacement");
  assert.deepEqual(
    passed.state.replacementState.map((process) => process.type),
    ["ko"],
  );
});

test("supported Counter Event sequence resolves after autopaying printed cost", () => {
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

  const use = applyAction(
    opened.state,
    legalCounterAction(opened.state, p2, counterEvent),
  );
  assert.equal(use.errors, undefined);
  assert.equal(
    must(use.state.players[p2], "p2").deck.length,
    initialDeckSize - 1,
  );
  assert.equal(
    must(use.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === counterEvent.instanceId,
    ),
    true,
  );
  assert.deepEqual(
    use.state.continuousEffects.map((effect) => effect.modifier.layer),
    ["powerAdd"],
  );
  const paidDon = must(
    use.events.find((event) => event.type === "costPaid")?.payload,
    "cost paid payload",
  ) as { selectedDonInstanceIds?: readonly string[] };
  const paidDonIds = must(paidDon.selectedDonInstanceIds, "paid DON ids");
  assert.equal(paidDonIds.length, 1);
  assert.equal(
    must(use.state.players[p2], "p2").costArea.some(
      (card) => card.instanceId === paidDonIds[0] && card.state === "rested",
    ),
    true,
  );
  const eventTypes = use.events.map((event) => event.type);
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

  const used = applyAction(
    opened.state,
    legalCounterAction(opened.state, p2, counterEvent),
  );
  assert.equal(used.errors, undefined);
  const paidDon = must(
    used.events.find((event) => event.type === "costPaid")?.payload,
    "cost paid payload",
  ) as { selectedDonInstanceIds?: readonly string[] };
  const paidDonIds = must(paidDon.selectedDonInstanceIds, "paid DON ids");
  assert.equal(paidDonIds.length, 1);
  assert.equal(
    must(used.state.players[p2], "p2").costArea.some(
      (card) => card.instanceId === paidDonIds[0] && card.state === "rested",
    ),
    true,
  );

  let current = used;
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

  const afterBattle = {
    ...resolved.state,
    turn: { ...resolved.state.turn, turnPlayerId: p1, phase: "main" as const },
  };
  delete afterBattle.battle;
  delete afterBattle.pendingDecision;
  const view = computeView(afterBattle);
  assert.deepEqual(view.legalAttackTargets[restrictedAttacker.instanceId], []);
});
