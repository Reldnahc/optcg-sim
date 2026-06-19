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

const selfAttachDonSequence = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "add-rested-don",
      connector: "always",
      effect: {
        type: "moveCards",
        min: 0,
        count: 2,
        from: { player: "self", zone: "donDeck", position: "top" },
        to: { player: "self", zone: "costArea" },
        order: "original",
        destinationState: "rested",
      },
    },
    {
      id: "select-rested-don",
      connector: "then",
      saveResultAs: "donSelection:self-attach",
      effect: {
        type: "selectCards",
        zone: "costArea",
        player: "self",
        chooser: "self",
        min: 0,
        max: 2,
        filter: { categories: ["don"], state: "rested" },
        saveAs: "donSelection:self-attach" as SelectionId,
        visibility: "bothPlayers",
      },
    },
    {
      id: "attach-selected-don-to-source",
      connector: "then",
      effect: {
        type: "attachSelectedDon",
        selection: "donSelection:self-attach" as SelectionId,
        target: { type: "self" },
      },
    },
  ],
});

const restedDonToLeaderThenOpponentLifeToHandSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      connector: "always",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "donSelection:attach",
            effect: {
              type: "selectCards",
              zone: "costArea",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              filter: { categories: ["don"], state: "rested" },
              saveAs: "donSelection:attach" as SelectionId,
              visibility: "bothPlayers",
            },
          },
          {
            connector: "ifYouDo",
            saveResultAs: "targetSelection:attach-don",
            effect: {
              type: "selectTargets",
              request: {
                timing: "onResolution",
                chooser: "self",
                player: "self",
                zones: ["leaderArea", "characterArea"],
                filter: { categories: ["leader"] },
                min: 1,
                max: 1,
                allowFewerIfUnavailable: false,
                visibility: "public",
              },
            },
          },
          {
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
                zones: ["leaderArea", "characterArea"],
                player: "self",
                filter: { categories: ["leader"] },
                visibility: "publicOnly",
                onFailure: "failClosed",
              },
            },
          },
        ],
      },
    },
    {
      connector: "then",
      effect: {
        type: "conditional",
        if: { type: "lifeCount", player: "opponent", op: "gte", value: 3 },
        then: {
          type: "moveCards",
          min: 0,
          count: 1,
          from: { player: "opponent", zone: "life", position: "top" },
          to: { player: "owner", zone: "hand" },
          order: "original",
        },
      },
    },
  ],
});

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

const distributedAttachDonSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "add-rested-don",
      connector: "always",
      effect: {
        type: "moveCards",
        count: 4,
        from: { player: "self", zone: "donDeck", position: "top" },
        to: { player: "self", zone: "costArea" },
        order: "original",
        destinationState: "rested",
      },
    },
    {
      id: "select-distribution-targets",
      connector: "then",
      saveResultAs: "targetSelection:distributed-attach-don",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          zone: "characterArea",
          player: "self",
          filter: { categories: ["character"] },
          min: 0,
          max: 2,
          allowFewerIfUnavailable: true,
          visibility: "public",
        },
      },
    },
    {
      id: "for-each-distribution-target",
      connector: "then",
      effect: {
        type: "forEachSavedTarget",
        selection: "targetSelection:distributed-attach-don",
        saveCurrentAs: "targetSelection:distributed-attach-don-current",
        effect: {
          type: "sequence",
          effects: [
            {
              id: "select-rested-don",
              connector: "always",
              saveResultAs: "donSelection:attach",
              effect: {
                type: "selectCards",
                zone: "costArea",
                player: "self",
                chooser: "self",
                min: 0,
                max: 2,
                filter: { categories: ["don"], state: "rested" },
                saveAs: "donSelection:attach" as SelectionId,
                visibility: "bothPlayers",
              },
            },
            {
              id: "attach-to-current-target",
              connector: "then",
              effect: {
                type: "attachSelectedDon",
                selection: "donSelection:attach" as SelectionId,
                target: {
                  type: "savedFieldObject",
                  binding: {
                    family: "forEachSavedTarget",
                    saveResultAs:
                      "targetSelection:distributed-attach-don-current",
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
        },
      },
    },
  ],
});

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
      queueOrigin: { type: "activateMain" },
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

const setupOnPlaySequenceDefinition = (
  state: GameState,
  effect: Effect,
): EffectDefinition => {
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  state.turn.turnPlayerId = p1;
  state.turn.phase = "main";
  const source = p1State.leader;
  const effectDefinitionId = "def-on-play-don-life";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "don-life-rules",
      sourceTextHash: "don-life-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-on-play-don-life"),
        category: "auto",
        trigger: { type: "onPlay" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect,
      },
    ],
  };
  const restedDon = must(p1State.donDeck[0], "rested DON source");
  p1State.donDeck = p1State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  p1State.costArea = [
    {
      ...restedDon,
      state: "rested",
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
    },
  ];
  while (p2State.life.length < 3) {
    const nextLifeCard = must(p2State.deck[0], "opponent deck for Life");
    p2State.deck = p2State.deck.slice(1).map((card, index) => ({
      ...card,
      zone: { zone: "deck", playerId: p2, slot: "deck", index },
    }));
    p2State.life = [
      ...p2State.life,
      {
        faceUp: false,
        card: {
          ...nextLifeCard,
          zone: {
            zone: "life",
            playerId: p2,
            slot: "life",
            index: p2State.life.length,
          },
        },
      },
    ];
  }
  state.cardManifest.cards[source.cardId] = supportCard;
  for (const don of [...p1State.costArea, ...p1State.donDeck]) {
    state.cardManifest.cards[don.cardId] = resolvedCard({
      cardId: don.cardId,
      category: "don",
    });
  }
  for (const lifeCard of p2State.life) {
    state.cardManifest.cards[lifeCard.card.cardId] = resolvedCard({
      cardId: lifeCard.card.cardId,
      category: "character",
    });
  }
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry:on-play:don-life"),
      timingWindowId: toTimingWindowId("timing-window:on-play:don-life"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        ownerId: p1,
        controllerId: p1,
        zone: source.zone,
        category: "leader",
        colors: ["red"],
        keywords: [],
      },
      effectBlockId: must(definition.effects[0], "effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "effectRuntime:onPlay" },
    },
  ];
  return definition;
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

test("DON attachment sequence can target its source card", () => {
  const state = createActiveState();
  setupDefinition(state, selfAttachDonSequence());
  const source = must(state.players[p1], "p1").leader;

  const firstPause = processEffectRuntime(state);
  assert.equal(firstPause.errors, undefined);
  assert.equal(firstPause.state.pendingDecision?.type, "chooseQuantity");
  assert.equal(firstPause.state.pendingDecision.max, 2);

  const addedRested = chooseQuantity(firstPause.state, 2);
  const selectDon = must(addedRested.state.pendingDecision, "select DON");
  assert.equal(addedRested.errors, undefined);
  assert.equal(selectDon.type, "selectCards");
  assert.equal(selectDon.candidates.length, 2);
  const selectedDon = selectDon.candidates.map((candidate) => candidate.card);

  const attached = applyAction(addedRested.state, {
    type: "respondToDecision",
    decisionId: selectDon.id,
    response: { type: "cards", cards: selectedDon },
  });
  assert.equal(attached.errors, undefined);
  assert.equal(attached.state.pendingDecision, undefined);
  assert.deepEqual(
    must(attached.state.players[p1], "after p1").leader.attachedDon,
    selectedDon.map((card) => card.instanceId),
  );
  assert.equal(
    must(attached.state.players[p1], "after p1").leader.instanceId,
    source.instanceId,
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

test("forEachSavedTarget attaches separately selected rested DON to each saved target", () => {
  const state = createActiveState();
  setupDefinition(state, distributedAttachDonSequence());
  const p1State = must(state.players[p1], "p1");
  const secondTarget = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[1], "second target character"),
    zone: "characterArea",
    index: 1,
  });
  state.cardManifest.cards[secondTarget.cardId] = resolvedCard({
    cardId: secondTarget.cardId,
    category: "character",
  });

  const targetPause = processEffectRuntime(state);
  assert.equal(targetPause.errors, undefined);
  const targetDecision = must(
    targetPause.state.pendingDecision,
    "target selection",
  );
  assert.equal(targetDecision.type, "selectTargets");
  assert.equal(targetDecision.candidates.length, 2);
  const selectedTargets = targetDecision.candidates.map(
    (candidate) => candidate.card,
  );

  const firstDonPause = applyAction(targetPause.state, {
    type: "respondToDecision",
    decisionId: targetDecision.id,
    response: { type: "targets", targets: selectedTargets },
  });
  assert.equal(firstDonPause.errors, undefined);
  const firstDonDecision = must(
    firstDonPause.state.pendingDecision,
    "first DON selection",
  );
  assert.equal(firstDonDecision.type, "selectCards");
  assert.equal(firstDonDecision.candidates.length, 3);
  const firstDon = firstDonDecision.candidates
    .slice(0, 2)
    .map((candidate) => candidate.card);

  const secondDonPause = applyAction(firstDonPause.state, {
    type: "respondToDecision",
    decisionId: firstDonDecision.id,
    response: { type: "cards", cards: firstDon },
  });
  assert.equal(secondDonPause.errors, undefined);
  const secondDonDecision = must(
    secondDonPause.state.pendingDecision,
    "second DON selection",
  );
  assert.equal(secondDonDecision.type, "selectCards");
  assert.equal(secondDonDecision.candidates.length, 1);
  const secondDon = secondDonDecision.candidates.map(
    (candidate) => candidate.card,
  );

  const completed = applyAction(secondDonPause.state, {
    type: "respondToDecision",
    decisionId: secondDonDecision.id,
    response: { type: "cards", cards: secondDon },
  });

  assert.equal(completed.errors, undefined);
  assert.equal(completed.state.pendingDecision, undefined);
  const afterCharacters = must(
    completed.state.players[p1],
    "after p1",
  ).characters;
  const firstTargetAfter = must(
    afterCharacters.find(
      (card) => card.instanceId === selectedTargets[0]?.instanceId,
    ),
    "first target after",
  );
  const secondTargetAfter = must(
    afterCharacters.find(
      (card) => card.instanceId === selectedTargets[1]?.instanceId,
    ),
    "second target after",
  );
  assert.deepEqual(
    firstTargetAfter.attachedDon,
    firstDon.map((card) => card.instanceId),
  );
  assert.deepEqual(
    secondTargetAfter.attachedDon,
    secondDon.map((card) => card.instanceId),
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

test("on play nested DON attachment resumes into conditional opponent Life move", () => {
  const state = createActiveState();
  setupOnPlaySequenceDefinition(
    state,
    restedDonToLeaderThenOpponentLifeToHandSequence(),
  );
  const beforeP2 = must(state.players[p2], "before p2");
  const opponentLifeTop = must(beforeP2.life[0], "opponent life top").card;
  const opponentHandBefore = beforeP2.hand.length;

  const selectDonResult = processEffectRuntime(state);
  const selectDon = must(selectDonResult.state.pendingDecision, "select DON");
  assert.equal(selectDonResult.errors, undefined);
  assert.equal(selectDon.type, "selectCards");
  assert.equal(selectDon.candidates.length, 1);

  const selectedDon = applyAction(selectDonResult.state, {
    type: "respondToDecision",
    decisionId: selectDon.id,
    response: {
      type: "cards",
      cards: [must(selectDon.candidates[0], "DON candidate").card],
    },
  });
  const selectLeader = must(selectedDon.state.pendingDecision, "select leader");
  assert.equal(selectedDon.errors, undefined);
  assert.equal(selectLeader.type, "selectTargets");

  const selectedLeader = applyAction(selectedDon.state, {
    type: "respondToDecision",
    decisionId: selectLeader.id,
    response: {
      type: "targets",
      targets: [must(selectLeader.candidates[0], "leader candidate").card],
    },
  });
  assert.equal(selectedLeader.errors, undefined);
  const chooseLifeQuantity = must(
    selectedLeader.state.pendingDecision,
    "choose opponent Life quantity",
  );
  assert.equal(chooseLifeQuantity.type, "chooseQuantity");
  assert.equal(chooseLifeQuantity.min, 0);
  assert.equal(chooseLifeQuantity.max, 1);

  const movedLife = applyAction(selectedLeader.state, {
    type: "respondToDecision",
    decisionId: chooseLifeQuantity.id,
    response: { type: "chooseQuantity", quantity: 1 },
  });
  const afterP2 = must(movedLife.state.players[p2], "after p2");

  assert.equal(movedLife.errors, undefined);
  assert.equal(movedLife.state.pendingDecision, undefined);
  assert.equal(afterP2.life.length, beforeP2.life.length - 1);
  assert.equal(afterP2.hand.length, opponentHandBefore + 1);
  assert.equal(
    must(afterP2.hand.at(-1), "moved Life card").instanceId,
    opponentLifeTop.instanceId,
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
