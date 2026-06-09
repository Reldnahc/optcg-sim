import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  EngineResult,
  GameState,
  ReplacementTrigger,
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
} from "../effect-runtime-queue/test-support.js";
import { evaluateEffectBlockRuntimeSupport } from "../effect-runtime-admission.js";
import { getSupportedPlayMetadata } from "../play-card/support.js";

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): void => {
  const effectDefinitionId = "def-batch-replacement-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "batch-replacement-rules",
      sourceTextHash: "batch-replacement-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-batch-replacement-sequence"),
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
};

const selectTargetsThenFieldRemovalSequence = (
  removal: "deckBottom" | "ko",
): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "select-targets",
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
          max: 2,
          allowFewerIfUnavailable: false,
          visibility: "public",
        },
      },
    },
    {
      id: "remove-selected-targets",
      connector: "then",
      effect:
        removal === "ko"
          ? {
              type: "ko",
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: "savedTarget",
                },
                zone: "characterArea",
                player: "opponent",
                visibility: "publicOnly",
                onFailure: "failClosed",
              },
            }
          : {
              type: "bounce",
              destination: "deckBottom",
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: "savedTarget",
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

const setupQueuedSequence = (effect: Effect): GameState => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-batch-replacement-sequence"),
      timingWindowId: toTimingWindowId("window-batch-replacement-sequence"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: toEffectId("effect-batch-replacement-sequence"),
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "batch-replacement-test" },
    },
  ];
  return state;
};

const setupReviewedFieldRemovalRestSelfReplacementDefinition = (
  state: GameState,
  source: CardInstance,
): void => {
  const support = {
    cardId: source.cardId,
    status: "implemented-dsl" as const,
    tested: true,
    rulesVersion: "r1",
    cardDataVersion: state.cardManifest.cardDataVersion,
    sourceTextHash: "replacement-rest-self-source-hash",
    behaviorHash: "replacement-rest-self-behavior-hash",
    effectDefinitionId: `definition:${String(source.cardId)}`,
  };
  state.cardManifest.cards[source.cardId] = {
    ...resolvedCard({
      cardId: source.cardId,
      category: "character",
      power: 3000,
      support,
    }),
    colors: ["green"],
    name: "Tashigi",
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [support.effectDefinitionId]: {
      cardId: source.cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: toEffectId("replacement:would-move-zone-rest-self"),
          category: "replacement",
          trigger: {
            type: "replacement",
            replacement: {
              type: "wouldMoveZone",
              from: "characterArea",
              sourceKind: "cardEffect",
              target: {
                type: "all",
                zone: "characterArea",
                player: "self",
                filter: {
                  categories: ["character"],
                  colorsAny: ["green"],
                  nameNot: ["Tashigi"],
                },
              },
            },
          },
          optional: true,
          sourcePresencePolicy: "resolveFromLastKnownInformation",
          effect: {
            type: "replacement",
            when: {
              type: "wouldMoveZone",
              from: "characterArea",
              sourceKind: "cardEffect",
              target: {
                type: "all",
                zone: "characterArea",
                player: "self",
                filter: {
                  categories: ["character"],
                  colorsAny: ["green"],
                  nameNot: ["Tashigi"],
                },
              },
            },
            instead: {
              type: "rest",
              target: { type: "self" },
            },
          },
        },
      ],
      metadata: {
        sourceTextHash: support.sourceTextHash,
        rulesVersion: support.rulesVersion,
        effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
        tested: true,
        reviewedBy: "engine-reviewer",
        reviewedAt: "2026-05-11T00:00:00.000Z",
      },
    },
  };
};

const setupReviewedFieldRemovalKoSelfReplacementWithOnKODefinition = (
  state: GameState,
  source: CardInstance,
): EffectDefinition["effects"][number] => {
  const support = {
    cardId: source.cardId,
    status: "implemented-dsl" as const,
    tested: true,
    rulesVersion: "r1",
    cardDataVersion: state.cardManifest.cardDataVersion,
    sourceTextHash: "replacement-ko-self-on-ko-source-hash",
    behaviorHash: "replacement-ko-self-on-ko-behavior-hash",
    effectDefinitionId: `definition:${String(source.cardId)}:ko-self-on-ko`,
  };
  state.cardManifest.cards[source.cardId] = {
    ...resolvedCard({
      cardId: source.cardId,
      category: "character",
      cost: 5,
      power: 3000,
      effectText:
        "If one of your Characters would be removed from the field by your opponent's effect, you may K.O. this Character instead.\n[On K.O.] You may trash 1 Character card with 8000 power from your hand: Play this Character card from your trash.",
      support,
    }),
    colors: ["green"],
    name: "Replacement Source",
  };
  const replacementWhen: ReplacementTrigger = {
    type: "wouldMoveZone",
    from: "characterArea",
    sourceKind: "cardEffect",
    target: {
      type: "all",
      zone: "characterArea",
      player: "self",
      filter: {
        categories: ["character"],
        colorsAny: ["green"],
        nameNot: ["Replacement Source"],
      },
    },
  };
  const onKOEffect: EffectDefinition["effects"][number] = {
    id: toEffectId("replacement-source:on-ko-trash-8000-play-source"),
    category: "auto",
    trigger: { type: "onKO" },
    optional: false,
    sourcePresencePolicy: "resolveFromDestinationZone",
    effect: {
      type: "sequence",
      effects: [
        {
          id: "trash-8000-cost",
          connector: "always",
          saveResultAs: "paidCost",
          effect: {
            type: "payCost",
            cost: {
              type: "trashFromHand",
              count: 1,
              chooser: "self",
              optional: true,
              filter: {
                categories: ["character"],
                power: { op: "eq", value: 8000 },
              },
            },
          },
        },
        {
          id: "play-source-from-trash",
          connector: "ifYouDo",
          effect: {
            type: "playSource",
            source: { type: "triggerCard" },
            ignoreCost: true,
          },
        },
      ],
    },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [support.effectDefinitionId]: {
      cardId: source.cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: toEffectId("replacement:would-move-zone-ko-self"),
          category: "replacement",
          trigger: {
            type: "replacement",
            replacement: replacementWhen,
          },
          optional: true,
          sourcePresencePolicy: "resolveFromLastKnownInformation",
          effect: {
            type: "replacement",
            when: replacementWhen,
            instead: {
              type: "ko",
              target: { type: "self" },
            },
          },
        },
        onKOEffect,
      ],
      metadata: {
        sourceTextHash: support.sourceTextHash,
        rulesVersion: support.rulesVersion,
        effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
        tested: true,
        reviewedBy: "engine-reviewer",
        reviewedAt: "2026-06-09T00:00:00.000Z",
      },
    },
  };
  return onKOEffect;
};

const addGreenTarget = (
  state: GameState,
  card: CardInstance,
  index: number,
): CardInstance => {
  const target = withCardInZone({
    state,
    playerId: p2,
    card,
    zone: "characterArea",
    index,
  });
  state.cardManifest.cards[target.cardId] = {
    ...resolvedCard({
      cardId: target.cardId,
      category: "character",
      power: 6000,
    }),
    colors: ["green"],
    name: `Green Ally ${String(index)}`,
  };
  return target;
};

const setupReplacementBatchState = (
  removal: "deckBottom" | "ko",
): {
  replacementSource: CardInstance;
  state: GameState;
  targets: [CardInstance, CardInstance];
} => {
  const state = setupQueuedSequence(
    selectTargetsThenFieldRemovalSequence(removal),
  );
  const p2State = must(state.players[p2], "p2");
  const firstTarget = addGreenTarget(
    state,
    must(p2State.hand[0], "first target"),
    0,
  );
  const replacementSource = withCardInZone({
    state,
    playerId: p2,
    card: {
      ...must(p2State.hand[1], "replacement source"),
      cardId: "replacement-rest-self-source" as CardInstance["cardId"],
    },
    zone: "characterArea",
    index: 1,
  });
  const secondTarget = addGreenTarget(
    state,
    must(p2State.hand[2], "second target"),
    2,
  );
  p2State.hand = p2State.hand.filter(
    (card) =>
      card.instanceId !== firstTarget.instanceId &&
      card.instanceId !== replacementSource.instanceId &&
      card.instanceId !== secondTarget.instanceId,
  );
  setupReviewedFieldRemovalRestSelfReplacementDefinition(
    state,
    replacementSource,
  );
  return { replacementSource, state, targets: [firstTarget, secondTarget] };
};

const resolveSelectedTargets = (
  state: GameState,
  targets: readonly CardInstance[],
): EngineResult => {
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "target selection");
  assert.equal(decision.type, "selectTargets");
  return applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: targets.map((target) => ({
        instanceId: target.instanceId,
        cardId: target.cardId,
        playerId: p2,
        zone: target.zone,
      })),
    },
  });
};

const acceptFirstReplacement = (resolved: EngineResult): EngineResult => {
  const decision = must(resolved.state.pendingDecision, "replacement decision");
  assert.equal(decision.type, "chooseReplacement");
  return applyAction(resolved.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "replacement",
      replacementId: must(decision.replacementIds[0], "replacement id"),
    },
  });
};

test("sequence field-removal K.O.-self replacement queues its source On K.O. trigger after the sequence resolves", () => {
  const state = setupQueuedSequence(
    selectTargetsThenFieldRemovalSequence("ko"),
  );
  const p2State = must(state.players[p2], "p2");
  p2State.characters = [];
  const target = addGreenTarget(state, must(p2State.hand[0], "target"), 0);
  const costCard: CardInstance = {
    ...must(p2State.hand[2], "8000 power cost card"),
    zone: { zone: "hand", playerId: p2, slot: "hand", index: 0 },
  };
  state.cardManifest.cards[costCard.cardId] = resolvedCard({
    cardId: costCard.cardId,
    category: "character",
    power: 8000,
  });
  const replacementSource = withCardInZone({
    state,
    playerId: p2,
    card: {
      ...must(p2State.hand[1], "replacement source"),
      cardId: "replacement-ko-self-on-ko-source" as CardInstance["cardId"],
    },
    zone: "characterArea",
    index: 1,
  });
  p2State.hand = [costCard];
  const onKOEffect =
    setupReviewedFieldRemovalKoSelfReplacementWithOnKODefinition(
      state,
      replacementSource,
    );
  const definition = must(
    state.cardManifest.effectDefinitions?.[
      `definition:${String(replacementSource.cardId)}:ko-self-on-ko`
    ],
    "replacement source definition",
  );
  assert.deepEqual(
    definition.effects.map(
      (effect) => evaluateEffectBlockRuntimeSupport(effect).supported,
    ),
    [true, true],
  );

  const resolved = resolveSelectedTargets(state, [target]);
  assert.equal(resolved.errors, undefined);
  const decision = must(resolved.state.pendingDecision, "replacement decision");
  assert.equal(decision.type, "chooseReplacement");

  const accepted = applyAction(resolved.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "replacement",
      replacementId: must(decision.replacementIds[0], "replacement id"),
    },
  });

  const acceptedP2 = must(accepted.state.players[p2], "accepted p2");
  assert.equal(accepted.errors, undefined);
  assert.equal(
    acceptedP2.trash.some(
      (card) => card.instanceId === replacementSource.instanceId,
    ),
    true,
  );
  const trashSource = must(
    acceptedP2.trash.find(
      (card) => card.instanceId === replacementSource.instanceId,
    ),
    "replacement source in trash",
  );
  const resolvedTrashSource = must(
    accepted.state.cardManifest.cards[trashSource.cardId],
    "resolved trash source",
  );
  assert.equal(resolvedTrashSource.support.status, "implemented-dsl");
  assert.equal(resolvedTrashSource.cost, 5);
  assert.notEqual(getSupportedPlayMetadata(accepted.state, trashSource), null);
  assert.equal(acceptedP2.characters.length, 1);
  assert.equal(
    accepted.events.some(
      (event) =>
        event.type === "effectQueued" &&
        (event.payload as { effectBlockId?: unknown }).effectBlockId ===
          onKOEffect.id,
    ),
    true,
  );
  const costDecision = must(
    accepted.state.pendingDecision,
    "On K.O. trash-from-hand cost decision",
  );
  assert.equal(costDecision.type, "payCost");
  assert.equal(costDecision.cost.type, "trashFromHand");
  const paid = applyAction(accepted.state, {
    type: "respondToDecision",
    decisionId: costDecision.id,
    response: {
      type: "payment",
      optionId: "trashFromHand",
      selectedCardInstanceIds: [costCard.instanceId],
    },
  });
  const paidP2 = must(paid.state.players[p2], "paid p2");
  assert.equal(paid.errors, undefined);
  assert.equal(paid.state.pendingDecision, undefined);
  assert.equal(
    paid.events.some(
      (event) =>
        event.type === "effectResolved" &&
        (event.payload as { effectBlockId?: unknown }).effectBlockId ===
          onKOEffect.id,
    ),
    true,
  );
  assert.equal(
    paidP2.trash.some((card) => card.instanceId === costCard.instanceId),
    true,
  );
  assert.equal(
    paidP2.characters.some(
      (card) => card.instanceId === replacementSource.instanceId,
    ),
    true,
  );
  assert.equal(accepted.state.effectExecutionFrames.length, 1);
  assert.equal(paid.state.effectExecutionFrames.length, 0);
  assert.equal(paid.stateHash, hashCanonicalStateValue(paid.state));
});

test.each([
  { removal: "deckBottom" as const, destination: "deck" as const },
  { removal: "ko" as const, destination: "trash" as const },
])(
  "one replacement covers all eligible simultaneous $removal field-removal targets",
  ({ removal, destination }) => {
    const { replacementSource, state, targets } =
      setupReplacementBatchState(removal);

    const resolved = resolveSelectedTargets(state, targets);
    assert.equal(resolved.errors, undefined);
    assert.equal(
      resolved.events.some(
        (event) => event.type === "cardMoved" || event.type === "cardKOd",
      ),
      false,
    );

    const accepted = acceptFirstReplacement(resolved);
    const acceptedP2 = must(accepted.state.players[p2], "accepted p2");
    const restedReplacementSource = must(
      acceptedP2.characters.find(
        (card) => card.instanceId === replacementSource.instanceId,
      ),
      "rested replacement source",
    );
    const destinationCards =
      destination === "deck" ? acceptedP2.deck : acceptedP2.trash;

    assert.equal(accepted.errors, undefined);
    assert.equal(accepted.state.pendingDecision, undefined);
    assert.equal(restedReplacementSource.state, "rested");
    for (const target of targets) {
      assert.equal(
        acceptedP2.characters.some(
          (card) => card.instanceId === target.instanceId,
        ),
        true,
      );
      assert.equal(
        destinationCards.some((card) => card.instanceId === target.instanceId),
        false,
      );
    }
    assert.equal(
      accepted.events.filter((event) => event.type === "replacementApplied")
        .length,
      1,
    );
    assert.equal(accepted.state.effectExecutionFrames.length, 0);
    assert.equal(accepted.stateHash, hashCanonicalStateValue(accepted.state));
  },
);
