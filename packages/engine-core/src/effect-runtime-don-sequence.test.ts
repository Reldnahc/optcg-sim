import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardRef,
  Effect,
  EffectDefinition,
  GameState,
  SelectionId,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  must,
  p1,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "./effect-runtime-queue/test-support.js";

const attachDonSequence = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "add-active-don",
      connector: "always",
      effect: {
        type: "moveCards",
        min: 0,
        count: 1,
        from: { player: "self", zone: "donDeck", position: "top" },
        to: { player: "self", zone: "costArea" },
        order: "original",
        destinationState: "active",
      },
    },
    {
      id: "add-rested-don",
      connector: "then",
      effect: {
        type: "moveCards",
        min: 0,
        count: 4,
        from: { player: "self", zone: "donDeck", position: "top" },
        to: { player: "self", zone: "costArea" },
        order: "original",
        destinationState: "rested",
      },
    },
    {
      id: "select-rested-don",
      connector: "then",
      saveResultAs: "donSelection:attach",
      effect: {
        type: "selectCards",
        zone: "costArea",
        player: "self",
        chooser: "self",
        min: 0,
        max: 4,
        filter: { categories: ["don"], state: "rested" },
        saveAs: "donSelection:attach" as SelectionId,
        visibility: "bothPlayers",
      },
    },
    {
      id: "select-character",
      connector: "ifYouDo",
      saveResultAs: "targetSelection:attach-don",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          zone: "characterArea",
          player: "self",
          filter: { categories: ["character"] },
          min: 1,
          max: 1,
          allowFewerIfUnavailable: false,
          visibility: "public",
        },
      },
    },
    {
      id: "attach-selected-don",
      connector: "then",
      effect: {
        type: "attachSelectedDon",
        selection: "donSelection:attach" as SelectionId,
        target: {
          type: "savedFieldObject",
          binding: {
            family: "selectedTargets",
            saveResultAs: "targetSelection:attach-don",
          },
          zone: "characterArea",
          player: "self",
          filter: { categories: ["character"] },
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
      },
    },
  ],
});

const parserNestedAttachDonSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => {
  const flat = attachDonSequence();
  return {
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "sequence",
          effects: flat.effects.slice(0, 2),
        },
      },
      {
        connector: "then",
        effect: {
          type: "sequence",
          effects: flat.effects.slice(2),
        },
      },
    ],
  };
};

const leaderOrCharacterAttachDonSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => {
  const flat = attachDonSequence();
  return {
    ...flat,
    effects: flat.effects.map((segment) => {
      if (segment.id === "select-character") {
        return {
          ...segment,
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              zones: ["leaderArea", "characterArea"] as (
                | "leaderArea"
                | "characterArea"
              )[],
              filter: {
                categories: ["leader", "character"],
                typesAny: ["The Seven Warlords of the Sea"],
              },
              min: 1,
              max: 1,
              allowFewerIfUnavailable: false,
              visibility: "public",
            },
          },
        };
      }
      if (segment.id === "attach-selected-don") {
        return {
          ...segment,
          effect: {
            type: "attachSelectedDon",
            selection: "donSelection:attach" as SelectionId,
            target: {
              type: "savedFieldObject",
              binding: {
                family: "selectedTargets",
                saveResultAs: "targetSelection:attach-don",
              },
              zone: "characterArea",
              player: "self",
              filter: {
                categories: ["leader", "character"],
                typesAny: ["The Seven Warlords of the Sea"],
              },
              visibility: "publicOnly",
              onFailure: "failClosed",
            },
          },
        };
      }
      return segment;
    }),
  };
};

const setupDefinition = (
  state: GameState,
  effect: Effect,
): { readonly definition: EffectDefinition; readonly target: CardRef } => {
  const p1State = must(state.players[p1], "p1");
  state.turn.turnPlayerId = p1;
  state.turn.phase = "main";
  state.turn.playerTurnCounts[p1] = 2;
  p1State.turnCount = 2;
  const source = p1State.leader;
  const target = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "target character"),
    zone: "characterArea",
  });
  const effectDefinitionId = "def-don-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "don-sequence-rules",
      sourceTextHash: "don-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-don-sequence"),
        category: "activate",
        trigger: { type: "activateMain" },
        condition: { type: "turnCount", player: "self", op: "gte", value: 2 },
        oncePerTurn: true,
        sourcePresencePolicy: "mustRemainInSameZone",
        effect,
      },
    ],
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
  });
  for (const don of p1State.donDeck) {
    state.cardManifest.cards[don.cardId] = resolvedCard({
      cardId: don.cardId,
      category: "don",
    });
  }
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry:activate-main:don-sequence"),
      timingWindowId: toTimingWindowId("timing-window:activate-main:don"),
      generation: 0,
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "effectRuntime:activateMain" },
    },
  ];
  return {
    definition,
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p1,
      zone: target.zone,
    },
  };
};

const chooseQuantity = (state: GameState, quantity: number) => {
  const decision = must(state.pendingDecision, "quantity decision");
  assert.equal(decision.type, "chooseQuantity");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "chooseQuantity", quantity },
  });
};

test("activate-main DON sequence checks turn count, adds active/rested DON, and attaches selected rested DON", () => {
  const state = createActiveState();
  setupDefinition(state, attachDonSequence());

  const firstPause = processEffectRuntime(state);
  assert.equal(firstPause.errors, undefined);
  assert.equal(firstPause.state.pendingDecision?.type, "chooseQuantity");
  assert.equal(firstPause.state.pendingDecision.max, 1);

  const addedActive = chooseQuantity(firstPause.state, 1);
  assert.equal(addedActive.errors, undefined);
  assert.equal(addedActive.state.pendingDecision?.type, "chooseQuantity");
  assert.equal(addedActive.state.pendingDecision.max, 4);
  assert.equal(
    must(addedActive.state.players[p1], "p1").costArea.filter(
      (card) => card.state === "active",
    ).length,
    1,
  );

  const addedRested = chooseQuantity(addedActive.state, 2);
  const selectDon = must(addedRested.state.pendingDecision, "select DON");
  assert.equal(addedRested.errors, undefined);
  assert.equal(selectDon.type, "selectCards");
  assert.equal(selectDon.candidates.length, 2);
  const selectedDon = selectDon.candidates.map((candidate) => candidate.card);

  const selected = applyAction(addedRested.state, {
    type: "respondToDecision",
    decisionId: selectDon.id,
    response: { type: "cards", cards: selectedDon },
  });
  const selectTarget = must(selected.state.pendingDecision, "select target");
  assert.equal(selected.errors, undefined);
  assert.equal(selectTarget.type, "selectTargets");

  const attached = applyAction(selected.state, {
    type: "respondToDecision",
    decisionId: selectTarget.id,
    response: {
      type: "targets",
      targets: [must(selectTarget.candidates[0], "target").card],
    },
  });
  const afterTarget = must(attached.state.players[p1], "after p1")
    .characters[0];
  assert.equal(attached.errors, undefined);
  assert.deepEqual(
    afterTarget?.attachedDon,
    selectedDon.map((card) => card.instanceId),
  );
});

test("DON attachment sequence can target the controller's typed leader", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  setupDefinition(state, leaderOrCharacterAttachDonSequence());
  state.cardManifest.cards[p1State.leader.cardId] = resolvedCard({
    cardId: p1State.leader.cardId,
    category: "leader",
    support: must(
      state.cardManifest.cards[p1State.leader.cardId]?.support,
      "leader support",
    ),
  });
  must(
    state.cardManifest.cards[p1State.leader.cardId],
    "leader metadata",
  ).types = ["The Seven Warlords of the Sea"];

  const firstPause = processEffectRuntime(state);
  const addedActive = chooseQuantity(firstPause.state, 1);
  const addedRested = chooseQuantity(addedActive.state, 1);
  const selectDon = must(addedRested.state.pendingDecision, "select DON");
  assert.equal(selectDon.type, "selectCards");
  const selectedDon = [must(selectDon.candidates[0], "selected DON").card];
  const selected = applyAction(addedRested.state, {
    type: "respondToDecision",
    decisionId: selectDon.id,
    response: { type: "cards", cards: selectedDon },
  });
  assert.equal(selected.errors, undefined);
  const selectTarget = must(selected.state.pendingDecision, "select target");
  assert.equal(selectTarget.type, "selectTargets");
  const leaderTarget = must(
    selectTarget.candidates.find(
      (candidate) => candidate.card.zone?.zone === "leaderArea",
    ),
    "leader target",
  );

  const attached = applyAction(selected.state, {
    type: "respondToDecision",
    decisionId: selectTarget.id,
    response: {
      type: "targets",
      targets: [leaderTarget.card],
    },
  });

  assert.equal(attached.errors, undefined);
  assert.deepEqual(
    must(attached.state.players[p1], "after p1").leader.attachedDon,
    selectedDon.map((card) => card.instanceId),
  );
});

test("parser-emitted nested DON sequence resumes after the first quantity decision", () => {
  const state = createActiveState();
  setupDefinition(state, parserNestedAttachDonSequence());

  const firstPause = processEffectRuntime(state);
  assert.equal(firstPause.errors, undefined);
  assert.equal(firstPause.state.pendingDecision?.type, "chooseQuantity");

  const addedActive = chooseQuantity(firstPause.state, 1);

  assert.equal(addedActive.errors, undefined);
  assert.equal(addedActive.state.pendingDecision?.type, "chooseQuantity");
  assert.equal(addedActive.state.pendingDecision.max, 4);
  assert.equal(
    must(addedActive.state.players[p1], "p1").costArea.filter(
      (card) => card.state === "active",
    ).length,
    1,
  );
});

test("activate-main DON sequence fails its activation condition before second turn", () => {
  const state = createActiveState();
  setupDefinition(state, attachDonSequence());
  const p1State = must(state.players[p1], "p1");
  state.turn.playerTurnCounts[p1] = 1;
  p1State.turnCount = 1;

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(must(result.state.players[p1], "after p1").costArea.length, 0);
});
