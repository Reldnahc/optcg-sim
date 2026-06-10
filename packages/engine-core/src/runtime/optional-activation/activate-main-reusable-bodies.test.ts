import assert from "node:assert/strict";
import { test } from "vitest";

import { applyAction, getLegalActions } from "../../actions.js";
import {
  installActivateMainDrawDefinition,
  makeMainPhaseLegalActionState,
  toCardId,
  toEffectId,
} from "../../action-dispatcher-test-support.js";
import { addExtraDeckCard, must, p1 } from "../../action-test-fixtures.js";

test("activate main supports reusable moveCards body without draw-specific admission", () => {
  const state = makeMainPhaseLegalActionState();
  addExtraDeckCard(state, p1);
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const moved = must(p1State.deck[0], "top deck card");
  const effectId = toEffectId("activate-main-leader-move-cards-1");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-leader-move-cards",
    effectId,
  });
  must(definition.effects[0], "activate main effect").effect = {
    type: "moveCards",
    count: 1,
    from: { player: "self", zone: "deck", position: "top" },
    to: { player: "self", zone: "trash" },
    order: "original",
  };

  assert.equal(
    getLegalActions(state, p1).some(
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
  const afterP1 = must(result.state.players[p1], "p1 after");

  assert.equal(result.errors, undefined);
  assert.equal(
    afterP1.trash.some((card) => card.instanceId === moved.instanceId),
    true,
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
});

test("optional activate main prompts before resolving reusable moveCards body", () => {
  const state = makeMainPhaseLegalActionState();
  addExtraDeckCard(state, p1);
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const moved = must(p1State.deck[0], "top deck card");
  const effectId = toEffectId("activate-main-optional-move-cards-1");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-optional-move-cards",
    effectId,
    optional: true,
  });
  must(definition.effects[0], "activate main effect").effect = {
    type: "moveCards",
    count: 1,
    from: { player: "self", zone: "deck", position: "top" },
    to: { player: "self", zone: "trash" },
    order: "original",
  };

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
  const decision = must(prompted.state.pendingDecision, "optional decision");

  assert.equal(prompted.errors, undefined);
  assert.equal(decision.type, "chooseOptionalActivation");

  const accepted = applyAction(prompted.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "optionalActivation", choice: "activate" },
  });

  assert.equal(accepted.errors, undefined);
  assert.equal(accepted.state.pendingDecision, undefined);
  assert.equal(
    must(accepted.state.players[p1], "p1 after").trash.some(
      (card) => card.instanceId === moved.instanceId,
    ),
    true,
  );
});

test("activate main supports reusable drawUpTo body through quantity choice", () => {
  const state = makeMainPhaseLegalActionState();
  addExtraDeckCard(state, p1);
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-leader-draw-upto-1");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-leader-draw-upto",
    effectId,
  });
  must(definition.effects[0], "activate main effect").effect = {
    type: "drawUpTo",
    count: 2,
    player: "self",
  };

  assert.equal(
    getLegalActions(state, p1).some(
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
  const decision = must(result.state.pendingDecision, "quantity decision");

  assert.equal(result.errors, undefined);
  assert.equal(decision.type, "chooseQuantity");
  assert.deepEqual(decision.causedBy, {
    type: "effect",
    queueEntryId: must(result.state.effectQueue[0], "queue entry").id,
    effectId,
  });
});

test("optional activate main prompts before resolving reusable drawUpTo body", () => {
  const state = makeMainPhaseLegalActionState();
  addExtraDeckCard(state, p1);
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-optional-draw-upto-1");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-optional-draw-upto",
    effectId,
    optional: true,
  });
  must(definition.effects[0], "activate main effect").effect = {
    type: "drawUpTo",
    count: 2,
    player: "self",
  };

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
  const optionalDecision = must(
    prompted.state.pendingDecision,
    "optional decision",
  );

  assert.equal(prompted.errors, undefined);
  assert.equal(optionalDecision.type, "chooseOptionalActivation");

  const accepted = applyAction(prompted.state, {
    type: "respondToDecision",
    decisionId: optionalDecision.id,
    response: { type: "optionalActivation", choice: "activate" },
  });

  assert.equal(accepted.errors, undefined);
  assert.equal(
    must(accepted.state.pendingDecision, "quantity decision").type,
    "chooseQuantity",
  );
});

test("activate main supports reusable top-deck placement body", () => {
  const state = makeMainPhaseLegalActionState();
  addExtraDeckCard(state, p1);
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-leader-top-deck-placement-1");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-leader-top-deck-placement",
    effectId,
  });
  must(definition.effects[0], "activate main effect").effect = {
    type: "placeTopDeckCards",
    player: "self",
    count: 1,
    destination: "topOrBottom",
    order: "ownerChoice",
  };

  assert.equal(
    getLegalActions(state, p1).some(
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
  const decision = must(result.state.pendingDecision, "order decision");

  assert.equal(result.errors, undefined);
  assert.equal(decision.type, "orderCards");
  assert.deepEqual(decision.causedBy, {
    type: "effect",
    queueEntryId: must(result.state.effectQueue[0], "queue entry").id,
    effectId,
  });
});

test("optional activate main prompts before resolving reusable top-deck placement body", () => {
  const state = makeMainPhaseLegalActionState();
  addExtraDeckCard(state, p1);
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-optional-top-deck-placement-1");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-optional-top-deck-placement",
    effectId,
    optional: true,
  });
  must(definition.effects[0], "activate main effect").effect = {
    type: "placeTopDeckCards",
    player: "self",
    count: 1,
    destination: "topOrBottom",
    order: "ownerChoice",
  };

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
  const optionalDecision = must(
    prompted.state.pendingDecision,
    "optional decision",
  );

  assert.equal(prompted.errors, undefined);
  assert.equal(optionalDecision.type, "chooseOptionalActivation");

  const accepted = applyAction(prompted.state, {
    type: "respondToDecision",
    decisionId: optionalDecision.id,
    response: { type: "optionalActivation", choice: "activate" },
  });

  assert.equal(accepted.errors, undefined);
  assert.equal(
    must(accepted.state.pendingDecision, "order decision").type,
    "orderCards",
  );
});

test("activate main supports reusable trashFromHand body through selection", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-leader-trash-from-hand-1");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-leader-trash-from-hand",
    effectId,
  });
  must(definition.effects[0], "activate main effect").effect = {
    type: "trashFromHand",
    player: "self",
    chooser: "self",
    count: 1,
  };

  assert.equal(
    getLegalActions(state, p1).some(
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
  const decision = must(result.state.pendingDecision, "selection decision");

  assert.equal(result.errors, undefined);
  assert.equal(decision.type, "selectCards");
  assert.deepEqual(decision.causedBy, {
    type: "effect",
    queueEntryId: must(result.state.effectQueue[0], "queue entry").id,
    effectId,
  });
});

test("optional activate main prompts before resolving reusable trashFromHand body", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-optional-trash-from-hand-1");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-optional-trash-from-hand",
    effectId,
    optional: true,
  });
  must(definition.effects[0], "activate main effect").effect = {
    type: "trashFromHand",
    player: "self",
    chooser: "self",
    count: 1,
  };

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
  const optionalDecision = must(
    prompted.state.pendingDecision,
    "optional decision",
  );

  assert.equal(prompted.errors, undefined);
  assert.equal(optionalDecision.type, "chooseOptionalActivation");

  const accepted = applyAction(prompted.state, {
    type: "respondToDecision",
    decisionId: optionalDecision.id,
    response: { type: "optionalActivation", choice: "activate" },
  });

  assert.equal(accepted.errors, undefined);
  assert.equal(
    must(accepted.state.pendingDecision, "selection decision").type,
    "selectCards",
  );
});

test("activate main supports reusable trashFromHandUntilCount body through selection", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId(
    "activate-main-leader-trash-from-hand-until-count-1",
  );
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-leader-trash-from-hand-until-count",
    effectId,
  });
  const handCount = 3;
  assert.ok(p1State.hand.length > handCount);
  must(definition.effects[0], "activate main effect").effect = {
    type: "trashFromHandUntilCount",
    player: "self",
    chooser: "self",
    handCount,
  };

  assert.equal(
    getLegalActions(state, p1).some(
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
  const decision = must(result.state.pendingDecision, "selection decision");

  assert.equal(result.errors, undefined);
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.request.zone, "hand");
  assert.equal(decision.request.min, p1State.hand.length - handCount);
  assert.equal(decision.request.max, p1State.hand.length - handCount);
});

test("optional activate main prompts before resolving reusable trashFromHandUntilCount body", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId(
    "activate-main-optional-trash-from-hand-until-count-1",
  );
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-optional-trash-from-hand-until-count",
    effectId,
    optional: true,
  });
  must(definition.effects[0], "activate main effect").effect = {
    type: "trashFromHandUntilCount",
    player: "self",
    chooser: "self",
    handCount: 99,
  };

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
  const optionalDecision = must(
    prompted.state.pendingDecision,
    "optional decision",
  );

  assert.equal(prompted.errors, undefined);
  assert.equal(optionalDecision.type, "chooseOptionalActivation");

  const accepted = applyAction(prompted.state, {
    type: "respondToDecision",
    decisionId: optionalDecision.id,
    response: { type: "optionalActivation", choice: "activate" },
  });

  assert.equal(accepted.errors, undefined);
  assert.equal(accepted.state.pendingDecision, undefined);
  assert.equal(accepted.state.effectQueue.length, 0);
});

test("activate main supports reusable winGame body", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-leader-win-game-1");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-leader-win-game",
    effectId,
  });
  must(definition.effects[0], "activate main effect").effect = {
    type: "winGame",
    player: "self",
  };

  assert.equal(
    getLegalActions(state, p1).some(
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
  assert.deepEqual(result.state.status, { type: "completed", winner: p1 });
  assert.equal(
    result.events.some((event) => event.type === "gameEnded"),
    true,
  );
});

test("optional activate main prompts before resolving reusable winGame body", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-optional-win-game-1");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-optional-win-game",
    effectId,
    optional: true,
  });
  must(definition.effects[0], "activate main effect").effect = {
    type: "winGame",
    player: "self",
  };

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
  const optionalDecision = must(
    prompted.state.pendingDecision,
    "optional decision",
  );

  assert.equal(prompted.errors, undefined);
  assert.equal(optionalDecision.type, "chooseOptionalActivation");

  const accepted = applyAction(prompted.state, {
    type: "respondToDecision",
    decisionId: optionalDecision.id,
    response: { type: "optionalActivation", choice: "activate" },
  });

  assert.equal(accepted.errors, undefined);
  assert.deepEqual(accepted.state.status, { type: "completed", winner: p1 });
});
