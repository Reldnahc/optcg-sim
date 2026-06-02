import assert from "node:assert/strict";
import { test } from "vitest";

import { applyAction, getLegalActions } from "../../actions.js";
import {
  installActivateMainDrawDefinition,
  makeMainPhaseLegalActionState,
  queuedEffect,
  toCardId,
  toDecisionId,
  toEffectId,
  toQueueEntryId,
  toTimingWindowId,
} from "../../action-dispatcher-test-support.js";
import { addExtraDeckCard, must, p1, p2 } from "../../action-test-fixtures.js";
import { processEffectRuntime } from "../../effect-runtime.js";
import { filterStateForPlayer } from "../../filter-state-for-player.js";
import { hashCanonicalStateValue } from "../../effect-runtime-queue-processing-test-support.js";

test("getLegalActions exposes activateEffect only for controller during legal main-phase windows", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const character = must(p1State.characters[0], "character");
  const stageCard = must(p1State.hand[0], "stage hand card");
  p1State.stage = {
    ...stageCard,
    zone: { zone: "stageArea", playerId: p1, slot: "stage", index: 0 },
  };
  p1State.hand = p1State.hand.slice(1);

  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-leader",
    effectId: toEffectId("activate-main-leader-1"),
  });
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(character.cardId),
    category: "character",
    definitionId: "def-activate-main-character",
    effectId: toEffectId("activate-main-character-1"),
  });
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(stageCard.cardId),
    category: "stage",
    definitionId: "def-activate-main-stage",
    effectId: toEffectId("activate-main-stage-1"),
  });

  const p1Actions = getLegalActions(state, p1).filter(
    (action) => action.type === "activateEffect",
  );
  const p2Actions = getLegalActions(state, p2).filter(
    (action) => action.type === "activateEffect",
  );

  assert.equal(p1Actions.length, 3);
  assert.deepEqual(p2Actions, []);
});

test("applyAction accepts valid activate main action and resolves draw through runtime", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const beforeDeck = p1State.deck.length;
  const beforeHand = p1State.hand.length;
  const effectId = toEffectId("activate-main-leader-draw-1");
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-leader-draw",
    effectId,
  });

  const result = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });

  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p1], "p1 after").deck.length,
    beforeDeck - 1,
  );
  assert.equal(
    must(result.state.players[p1], "p1 after").hand.length,
    beforeHand + 1,
  );
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(
    result.events.some((event) => event.type === "effectQueued"),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "effectResolved"),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "cardDrawn"),
    true,
  );
});

test("effect invalidation suppresses activate main legal actions and activation", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.characters[0], "character");
  const effectId = toEffectId("activate-main-character-invalidated");
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(character.cardId),
    category: "character",
    definitionId: "def-activate-main-character-invalidated",
    effectId,
  });
  const resolved = must(
    state.cardManifest.cards[character.cardId],
    "resolved invalidated card",
  );
  state.continuousEffects.push({
    id: "continuous:invalidate-character-effects",
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
      colors: [],
      keywords: [],
    },
    controller: p1,
    modifier: {
      layer: "effectInvalidation",
      target: {
        type: "exactCard",
        card: {
          instanceId: character.instanceId,
          cardId: character.cardId,
          playerId: p1,
          zone: character.zone,
        },
        binding: {
          family: "selectedTargets",
          saveResultAs: "selected:invalidate-effects-target",
        },
        createdAtStateSeq: state.seq,
      },
      operation: { type: "invalidateEffects" },
    },
    duration: { type: "thisTurn" },
    createdBy: { type: "ruleProcess", name: "test-effect-invalidation" },
    createdAtStateSeq: state.seq,
  });

  const legal = getLegalActions(state, p1);
  const result = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: character.instanceId,
      cardId: character.cardId,
      playerId: p1,
      zone: character.zone,
    },
    effectId,
  });

  assert.equal(resolved.support.status, "implemented-dsl");
  assert.equal(
    legal.some(
      (action) =>
        action.type === "activateEffect" &&
        action.source.instanceId === character.instanceId,
    ),
    false,
  );
  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.deepEqual(result.state, state);
});

test("activate main supports sequence body with optional choose-one payCost and pauses on private payment decision", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-sequence-pay-cost-1");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-sequence-pay-cost",
    effectId,
  });
  const effectBlock = must(definition.effects[0], "activate main effect");
  effectBlock.effect = {
    type: "sequence",
    effects: [
      {
        id: "activate-main-pay-cost",
        connector: "always",
        saveResultAs: "paidCost",
        effect: {
          type: "payCost",
          cost: {
            type: "chooseOne",
            optional: true,
            options: [
              {
                type: "trashFromField",
                chooser: "self",
                optional: true,
                count: 1,
                filter: { categories: ["character"], typesAny: ["Navy"] },
              },
              {
                type: "trashFromHand",
                chooser: "self",
                optional: true,
                count: 1,
              },
            ],
          },
        },
      },
      {
        id: "activate-main-if-you-do-draw",
        connector: "ifYouDo",
        effect: { type: "draw", player: "self", count: 1 },
      },
    ],
  };

  const legal = getLegalActions(state, p1);
  assert.equal(
    legal.some(
      (action) =>
        action.type === "activateEffect" &&
        action.source.instanceId === leader.instanceId &&
        action.effectId === effectId,
    ),
    true,
  );

  const result = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision?.type, "payCost");
  assert.equal(
    result.events.some((event) => event.type === "decisionCreated"),
    true,
  );
});

test("activate main legal actions require activateMain trigger even for supported sequence bodies", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.characters[0], "character");
  const effectId = toEffectId("on-play-sequence-not-activate-main");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(character.cardId),
    category: "character",
    definitionId: "def-on-play-sequence-not-activate-main",
    effectId,
  });
  const effectBlock = must(definition.effects[0], "effect");
  effectBlock.category = "auto";
  effectBlock.trigger = { type: "onPlay" };
  effectBlock.effect = {
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: { type: "draw", player: "self", count: 1 },
      },
      {
        connector: "then",
        effect: {
          type: "trashFromHand",
          count: 1,
          player: "self",
          chooser: "self",
        },
      },
    ],
  };

  const legal = getLegalActions(state, p1);

  assert.equal(
    legal.some(
      (action) =>
        action.type === "activateEffect" &&
        action.source.instanceId === character.instanceId &&
        action.effectId === effectId,
    ),
    false,
  );
});

test("applyAction accepts activate main from character and stage sources", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.characters[0], "character");
  const stageCard = must(p1State.hand[0], "stage hand card");
  p1State.stage = {
    ...stageCard,
    zone: { zone: "stageArea", playerId: p1, slot: "stage", index: 0 },
  };
  p1State.hand = p1State.hand.slice(1);
  const characterEffectId = toEffectId("activate-main-character-apply-1");
  const stageEffectId = toEffectId("activate-main-stage-apply-1");
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(character.cardId),
    category: "character",
    definitionId: "def-activate-main-character-apply",
    effectId: characterEffectId,
  });
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(stageCard.cardId),
    category: "stage",
    definitionId: "def-activate-main-stage-apply",
    effectId: stageEffectId,
  });

  const characterBefore = must(state.players[p1], "before character").hand
    .length;
  const characterResult = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: character.instanceId,
      cardId: character.cardId,
      playerId: p1,
      zone: character.zone,
    },
    effectId: characterEffectId,
  });
  assert.equal(characterResult.errors, undefined);
  assert.equal(
    must(characterResult.state.players[p1], "after character").hand.length,
    characterBefore + 1,
  );

  const stageState = makeMainPhaseLegalActionState();
  const stageP1 = must(stageState.players[p1], "p1 stage");
  const stageSource = must(stageP1.hand[0], "stage source");
  stageP1.stage = {
    ...stageSource,
    zone: { zone: "stageArea", playerId: p1, slot: "stage", index: 0 },
  };
  stageP1.hand = stageP1.hand.slice(1);
  installActivateMainDrawDefinition({
    state: stageState,
    sourceCardId: toCardId(stageSource.cardId),
    category: "stage",
    definitionId: "def-activate-main-stage-apply-only",
    effectId: stageEffectId,
  });
  const stageBefore = must(stageState.players[p1], "before stage").hand.length;
  const stageResult = applyAction(stageState, {
    type: "activateEffect",
    source: {
      instanceId: stageSource.instanceId,
      cardId: stageSource.cardId,
      playerId: p1,
      zone: { zone: "stageArea", playerId: p1, slot: "stage", index: 0 },
    },
    effectId: stageEffectId,
  });
  assert.equal(stageResult.errors, undefined);
  assert.equal(
    must(stageResult.state.players[p1], "after stage").hand.length,
    stageBefore + 1,
  );
});

test("once-per-turn activate main consumes on legal use, rejects same-turn repeat, and resets next turn", () => {
  const state = makeMainPhaseLegalActionState();
  addExtraDeckCard(state, p1);
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-leader-once-1");
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-leader-once",
    effectId,
    oncePerTurn: true,
  });

  const first = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });
  assert.equal(first.errors, undefined);
  assert.equal(first.state.oncePerTurn.length, 1);

  const second = applyAction(first.state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });
  assert.equal(second.errors?.[0]?.type, "illegalAction");
  assert.deepEqual(second.state, first.state);

  const nextTurn = structuredClone(first.state);
  nextTurn.turn.globalTurn += 1;
  const third = applyAction(nextTurn, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });
  assert.equal(third.errors, undefined);
});

test("illegal and uncommitted activate main attempts do not consume once-per-turn use", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-once-illegal-uncommitted");
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-once-illegal-uncommitted",
    effectId,
    oncePerTurn: true,
    optional: true,
  });

  const wrongPhase = structuredClone(state);
  wrongPhase.turn.phase = "draw";
  const illegal = applyAction(wrongPhase, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });
  assert.equal(illegal.errors?.[0]?.type, "illegalAction");
  assert.deepEqual(illegal.state.oncePerTurn, []);

  const optionalPrompt = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });
  assert.equal(optionalPrompt.errors, undefined);
  assert.deepEqual(optionalPrompt.state.oncePerTurn, []);
  const decision = must(
    optionalPrompt.state.pendingDecision,
    "optional decision",
  );
  const declined = applyAction(optionalPrompt.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "optionalActivation", choice: "decline" },
  });
  assert.equal(declined.errors, undefined);
  assert.deepEqual(declined.state.oncePerTurn, []);
});

test("activate main optional acceptance consumes once-per-turn on legal commitment", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-optional-consume");
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-optional-consume",
    effectId,
    oncePerTurn: true,
    optional: true,
  });

  const optionalPrompt = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });
  assert.equal(optionalPrompt.errors, undefined);
  assert.deepEqual(optionalPrompt.state.oncePerTurn, []);
  const decision = must(
    optionalPrompt.state.pendingDecision,
    "optional decision",
  );
  const accepted = applyAction(optionalPrompt.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "optionalActivation", choice: "activate" },
  });
  assert.equal(accepted.errors, undefined);
  assert.equal(accepted.state.oncePerTurn.length, 1);
  assert.equal(accepted.state.oncePerTurn[0]?.effectId, effectId);
});

test("activate main queue entry snapshot uses live card and resolved metadata", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-live-snapshot");
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-live-snapshot",
    effectId,
    optional: true,
  });
  const resolved = must(
    state.cardManifest.cards[leader.cardId],
    "resolved card",
  );
  resolved.colors = ["blue"];
  resolved.printedKeywords = ["blocker"];

  const prompted = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });

  assert.equal(prompted.errors, undefined);
  const queuedEntry = must(prompted.state.effectQueue[0], "queued entry");
  assert.deepEqual(queuedEntry.sourceSnapshot.colors, ["blue"]);
  assert.deepEqual(queuedEntry.sourceSnapshot.keywords, ["blocker"]);
  assert.equal(queuedEntry.sourceSnapshot.ownerId, leader.owner);
  assert.equal(queuedEntry.sourceSnapshot.controllerId, leader.controller);
});

test("fabricated activate main queue shape fails closed unless scoped validation marker is present", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-fabricated-queue");
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-fabricated-queue",
    effectId,
  });

  const forgedEntry = {
    ...queuedEffect("activate-main-fabricated"),
    id: toQueueEntryId("queue-entry:activate-main:forged"),
    timingWindowId: toTimingWindowId("timing-window:activate-main:forged"),
    generation: 0,
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    sourceSnapshot: {
      ...queuedEffect("activate-main-fabricated").sourceSnapshot,
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      ownerId: leader.owner,
      controllerId: leader.controller,
      zone: leader.zone,
      category: "leader" as const,
    },
    effectBlockId: effectId,
    sourcePresencePolicy: "mustRemainInSameZone" as const,
    causedBy: { type: "ruleProcess", name: "not-activate-main" } as const,
  };
  state.effectQueue = [forgedEntry];

  const result = processEffectRuntime(state);
  assert.ok(result.errors !== undefined);
  assert.deepEqual(result.state, state);
});

test("activate main wrong-phase and forged effect attempts fail closed without mutation", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-leader-forge-1");
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-leader-forge",
    effectId,
  });

  const forgedBefore = JSON.stringify(state);
  const forged = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId: toEffectId("activate-main-missing"),
  });
  assert.equal(forged.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), forgedBefore);

  const wrongPhase = structuredClone(state);
  wrongPhase.turn.phase = "draw";
  const wrongPhaseBefore = JSON.stringify(wrongPhase);
  const blocked = applyAction(wrongPhase, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });
  assert.equal(blocked.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(wrongPhase), wrongPhaseBefore);
});

test("activate main rejects while match is completed without mutation or events", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-completed-1");
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-completed",
    effectId,
  });
  state.status = { type: "completed", winner: p1 };

  const before = JSON.stringify(state);
  const normal = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });
  assert.equal(normal.errors?.[0]?.type, "illegalAction");
  assert.deepEqual(normal.events, []);
  assert.equal(JSON.stringify(state), before);

  const forged = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId: toEffectId("activate-main-completed-forged"),
  });
  assert.equal(forged.errors?.[0]?.type, "illegalAction");
  assert.deepEqual(forged.events, []);
  assert.equal(JSON.stringify(state), before);
});

test("activate main is suppressed and rejected during battle, pending decision, and pending runtime work", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-suppression-1");
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-suppression",
    effectId,
  });

  const battle = structuredClone(state);
  battle.battle = {
    attacker: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
    },
    originalTarget: {
      instanceId: must(battle.players[p2], "p2").leader.instanceId,
      cardId: must(battle.players[p2], "p2").leader.cardId,
      playerId: p2,
    },
    currentTarget: {
      instanceId: must(battle.players[p2], "p2").leader.instanceId,
      cardId: must(battle.players[p2], "p2").leader.cardId,
      playerId: p2,
    },
    step: "block",
    damageCount: 1,
  };
  assert.equal(
    getLegalActions(battle, p1).some(
      (action) => action.type === "activateEffect",
    ),
    false,
  );
  const battleBefore = JSON.stringify(battle);
  const battleResult = applyAction(battle, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });
  assert.equal(battleResult.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(battle), battleBefore);

  const pending = structuredClone(state);
  pending.pendingDecision = {
    id: toDecisionId("decision:activate-main-pending"),
    type: "mulligan",
    playerId: p1,
    prompt: "pending",
    causedBy: { type: "ruleProcess", name: "test" },
    visibility: { type: "private", playerId: p1 },
    options: ["keep", "mulligan"],
  };
  assert.equal(
    getLegalActions(pending, p1).some(
      (action) => action.type === "activateEffect",
    ),
    false,
  );
  const pendingBefore = JSON.stringify(pending);
  const pendingResult = applyAction(pending, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });
  assert.equal(pendingResult.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(pending), pendingBefore);

  const runtime = structuredClone(state);
  runtime.effectQueue.push(queuedEffect("activate-main-pending-runtime"));
  assert.equal(
    getLegalActions(runtime, p1).some(
      (action) => action.type === "activateEffect",
    ),
    false,
  );
  const runtimeBefore = JSON.stringify(runtime);
  const runtimeResult = applyAction(runtime, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });
  assert.equal(runtimeResult.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(runtime), runtimeBefore);
});

test("activate main wrong-player and wrong-source attempts fail closed", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-wrong-actor-1");
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-wrong-actor",
    effectId,
  });

  const wrongPlayerBefore = JSON.stringify(state);
  const wrongPlayer = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p2,
      zone: leader.zone,
    },
    effectId,
  });
  assert.equal(wrongPlayer.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), wrongPlayerBefore);

  const wrongSourceState = structuredClone(state);
  const wrongSourceBefore = JSON.stringify(wrongSourceState);
  const wrongSource = applyAction(wrongSourceState, {
    type: "activateEffect",
    source: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p1,
      zone: p2State.leader.zone,
    },
    effectId,
  });
  assert.equal(wrongSource.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(wrongSourceState), wrongSourceBefore);
});

test("player view exposes activate main legal actions only to controller", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-view-1");
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-view",
    effectId,
  });

  const p1View = filterStateForPlayer(state, p1);
  const p2View = filterStateForPlayer(state, p2);
  assert.equal(
    p1View.legalActions.some(
      (action) =>
        action.type === "activateEffect" &&
        action.source.instanceId === leader.instanceId &&
        action.effectId === effectId,
    ),
    true,
  );
  assert.equal(
    p2View.legalActions.some((action) => action.type === "activateEffect"),
    false,
  );
});

test("activate main accepted and rejected paths are deterministic for events and state hash", () => {
  const setupAccepted = () => {
    const state = makeMainPhaseLegalActionState();
    const p1State = must(state.players[p1], "p1");
    const leader = p1State.leader;
    const effectId = toEffectId("activate-main-determinism-1");
    installActivateMainDrawDefinition({
      state,
      sourceCardId: toCardId(leader.cardId),
      category: "leader",
      definitionId: "def-activate-main-determinism",
      effectId,
    });
    return { state, leader, effectId };
  };

  const acceptedA = setupAccepted();
  const acceptedB = setupAccepted();
  const acceptedResultA = applyAction(acceptedA.state, {
    type: "activateEffect",
    source: {
      instanceId: acceptedA.leader.instanceId,
      cardId: acceptedA.leader.cardId,
      playerId: p1,
      zone: acceptedA.leader.zone,
    },
    effectId: acceptedA.effectId,
  });
  const acceptedResultB = applyAction(acceptedB.state, {
    type: "activateEffect",
    source: {
      instanceId: acceptedB.leader.instanceId,
      cardId: acceptedB.leader.cardId,
      playerId: p1,
      zone: acceptedB.leader.zone,
    },
    effectId: acceptedB.effectId,
  });
  assert.equal(acceptedResultA.errors, undefined);
  assert.equal(acceptedResultB.errors, undefined);
  assert.deepEqual(acceptedResultA.events, acceptedResultB.events);
  assert.equal(acceptedResultA.stateHash, acceptedResultB.stateHash);
  assert.equal(
    acceptedResultA.stateHash,
    hashCanonicalStateValue(acceptedResultA.state),
  );
  for (let index = 1; index < acceptedResultA.events.length; index += 1) {
    const previous = acceptedResultA.events[index - 1];
    const current = acceptedResultA.events[index];
    if (previous === undefined || current === undefined) {
      assert.fail("expected adjacent activate main events");
    }
    assert.ok(previous.seq < current.seq);
  }

  const setupRejected = () => {
    const state = makeMainPhaseLegalActionState();
    const p1State = must(state.players[p1], "p1");
    const leader = p1State.leader;
    const effectId = toEffectId("activate-main-determinism-reject-1");
    installActivateMainDrawDefinition({
      state,
      sourceCardId: toCardId(leader.cardId),
      category: "leader",
      definitionId: "def-activate-main-determinism-reject",
      effectId,
    });
    const beforeHash = hashCanonicalStateValue(state);
    return { state, leader, effectId, beforeHash };
  };
  const rejectedA = setupRejected();
  const rejectedB = setupRejected();
  const rejectedResultA = applyAction(rejectedA.state, {
    type: "activateEffect",
    source: {
      instanceId: rejectedA.leader.instanceId,
      cardId: rejectedA.leader.cardId,
      playerId: p2,
      zone: rejectedA.leader.zone,
    },
    effectId: rejectedA.effectId,
  });
  const rejectedResultB = applyAction(rejectedB.state, {
    type: "activateEffect",
    source: {
      instanceId: rejectedB.leader.instanceId,
      cardId: rejectedB.leader.cardId,
      playerId: p2,
      zone: rejectedB.leader.zone,
    },
    effectId: rejectedB.effectId,
  });
  assert.equal(rejectedResultA.errors?.[0]?.type, "illegalAction");
  assert.equal(rejectedResultB.errors?.[0]?.type, "illegalAction");
  assert.deepEqual(rejectedResultA.events, []);
  assert.deepEqual(rejectedResultB.events, []);
  assert.equal(rejectedResultA.stateHash, rejectedResultB.stateHash);
  assert.equal(rejectedResultA.stateHash, rejectedA.beforeHash);
  assert.equal(rejectedResultB.stateHash, rejectedB.beforeHash);
});
