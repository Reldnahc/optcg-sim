import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardRef,
  CardInstance,
  Effect,
  EffectDefinition,
  EffectTextSpanId,
  GameState,
  HandSelectionId,
  EngineResult,
} from "@optcg/types";

import { applyAction } from "../actions.js";
import { processEffectRuntime } from "../effect-runtime.js";
import {
  createActiveState,
  must,
  p1,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toCardId,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";
import { filterStateForPlayer } from "../view/filter-state-for-player.js";

const optionalTrashCostThenDraw = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "trash-hand-cost",
      connector: "always",
      effect: {
        type: "payCost",
        cost: {
          type: "trashFromHand",
          chooser: "self",
          count: 1,
          optional: true,
        },
      },
      saveResultAs: "paidCost",
    },
    {
      id: "draw-after-cost",
      connector: "ifYouDo",
      effect: { type: "draw", player: "self", count: 1 },
    },
  ],
});

const optionalTrashCostThenDrawUpTo = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "trash-hand-cost",
      connector: "always",
      effect: {
        type: "payCost",
        cost: {
          type: "trashFromHand",
          chooser: "self",
          count: 1,
          optional: true,
        },
      },
      saveResultAs: "paidCost",
    },
    {
      id: "draw-up-to-after-cost",
      connector: "ifYouDo",
      effect: { type: "drawUpTo", player: "self", count: 1 },
    },
  ],
});

const returnCostThenPlayFromHand = (): Extract<
  Effect,
  { type: "sequence" }
> => {
  const costPresentation = {
    textKind: "effect" as const,
    spanIds: ["span:cost:optional:line:1"] as EffectTextSpanId[],
  };
  const bodyPresentation = {
    textKind: "effect" as const,
    spanIds: ["span:body:line:1"] as EffectTextSpanId[],
  };
  const playSelection = "handSelection:play-from-hand" as HandSelectionId;
  return {
    type: "sequence",
    effects: [
      {
        id: "cost:rest-self",
        connector: "always",
        presentation: costPresentation,
        saveResultAs: "paidCost",
        effect: {
          type: "payCost",
          cost: { type: "restSelf", optional: true },
        },
      },
      {
        id: "select:return-cost-to-owner-hand",
        connector: "ifYouDo",
        presentation: costPresentation,
        saveResultAs: "selected:return-cost-to-owner-hand",
        effect: {
          type: "selectTargets",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "self",
            zone: "characterArea",
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            visibility: "public",
            filter: {
              categories: ["character"],
              typesAny: ["Dressrosa"],
            },
          },
        },
      },
      {
        id: "return-cost-to-owner-hand",
        connector: "ifPreviousSucceeded",
        presentation: costPresentation,
        effect: {
          type: "bounce",
          destination: "hand",
          target: {
            type: "savedFieldObject",
            binding: {
              family: "selectedTargets",
              saveResultAs: "selected:return-cost-to-owner-hand",
            },
            zone: "characterArea",
            player: "self",
            visibility: "publicOnly",
            onFailure: "failClosed",
          },
        },
      },
      {
        id: "body:after-return-cost",
        connector: "ifPreviousSucceeded",
        presentation: bodyPresentation,
        effect: {
          type: "sequence",
          effects: [
            {
              id: "select-play-from-hand",
              connector: "always",
              presentation: bodyPresentation,
              saveResultAs: playSelection,
              effect: {
                type: "selectCards",
                zone: "hand",
                player: "self",
                chooser: "self",
                min: 0,
                max: 1,
                filter: {
                  categories: ["character"],
                  typesAny: ["Dressrosa"],
                  cost: { op: "eq", value: 3 },
                },
                saveAs: playSelection,
                visibility: "chooserOnly",
              },
            },
            {
              id: "play-selected",
              connector: "ifPossible",
              presentation: bodyPresentation,
              effect: {
                type: "playSelected",
                selection: playSelection,
                ignoreCost: true,
              },
            },
          ],
        },
      },
    ],
  };
};

const reindexHand = (cards: readonly CardInstance[]): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));

const setupDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-cost-presentation";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "cost-presentation-rules",
      sourceTextHash: "cost-presentation-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-cost-presentation"),
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

const createQueuedCostPresentationState = (): GameState => {
  return createQueuedCostPresentationStateForEffect(
    optionalTrashCostThenDraw(),
  );
};

const createQueuedCostPresentationStateForEffect = (
  effect: Effect,
): GameState => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const player = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "source"),
    zone: "characterArea",
  });
  player.hand = reindexHand(player.hand.slice(1));
  const definition = setupDefinition(state, source, effect);
  const definitionEffect = must(definition.effects[0], "definition effect");
  const entry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry-cost-presentation"),
    timingWindowId: toTimingWindowId("window-cost-presentation"),
    controllerId: p1,
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: toSourceSnapshot(source, p1, p1),
    effectBlockId: definitionEffect.id,
    sourcePresencePolicy: "mustRemainInSameZone" as const,
    causedBy: { type: "ruleProcess" as const, name: "cost-presentation-test" },
  };
  state.effectQueue = [
    {
      ...entry,
      presentation: {
        source: entry.source,
        textKind: "effect",
        activeSpanIds: [
          "span:cost:optional:line:1",
          "span:body:line:1",
        ] as EffectTextSpanId[],
      },
    },
  ];
  return state;
};

const payTrashFromHandWithFirstHandCard = (state: GameState) => {
  const decision = must(state.pendingDecision, "payment decision");
  assert.equal(decision.type, "payCost");
  const player = must(state.players[decision.playerId], "decision player");
  const card = must(player.hand[0], "hand card");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "trashFromHand",
      selectedCardInstanceIds: [card.instanceId],
    },
  });
};

const declinePayment = (state: GameState): EngineResult => {
  const decision = must(state.pendingDecision, "payment decision");
  assert.equal(decision.type, "payCost");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "paymentDeclined" },
  });
};

const payRestSelf = (state: GameState): EngineResult => {
  const decision = must(state.pendingDecision, "payment decision");
  assert.equal(decision.type, "payCost");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restSelf",
    },
  });
};

const dressrosaCard = (
  state: GameState,
  card: CardInstance,
  cardId: string,
  cost: number,
): CardInstance => {
  const updated = { ...card, cardId: toCardId(cardId) };
  state.cardManifest.cards[updated.cardId] = {
    ...resolvedCard({
      cardId: updated.cardId,
      category: "character",
      cost,
      power: 1000,
    }),
    types: ["Dressrosa"],
  };
  return updated;
};

const createReturnCostPlayState = (): {
  readonly state: GameState;
  readonly returnedTarget: CardRef;
  readonly eligibleHandCard: CardRef;
} => {
  const state = createQueuedCostPresentationStateForEffect(
    returnCostThenPlayFromHand(),
  );
  const player = must(state.players[p1], "p1");
  const returnedCard = dressrosaCard(
    state,
    must(player.hand[0], "return target seed"),
    "return-cost-target",
    2,
  );
  player.hand = reindexHand(player.hand.slice(1));
  const returnedTargetCard = withCardInZone({
    state,
    playerId: p1,
    card: returnedCard,
    zone: "characterArea",
    index: player.characters.length,
  });
  const eligibleCard = dressrosaCard(
    state,
    must(player.hand[0], "eligible hand card"),
    "eligible-dressrosa-cost-3",
    3,
  );
  player.hand = reindexHand([eligibleCard, ...player.hand.slice(1)]);
  return {
    state,
    returnedTarget: {
      instanceId: returnedTargetCard.instanceId,
      cardId: returnedTargetCard.cardId,
      playerId: p1,
      zone: returnedTargetCard.zone,
    },
    eligibleHandCard: {
      instanceId: eligibleCard.instanceId,
      cardId: eligibleCard.cardId,
      playerId: p1,
      zone: eligibleCard.zone,
    },
  };
};

const selectReturnCostTarget = (state: GameState, target: CardRef) => {
  const decision = must(state.pendingDecision, "return target decision");
  assert.equal(decision.type, "selectTargets");
  const candidate = must(
    decision.candidates.find(
      (entry) => entry.card.instanceId === target.instanceId,
    ),
    "return target candidate",
  );
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "targets", targets: [candidate.card] },
  });
};

const resolvedPresentation = (
  result: EngineResult,
): { readonly presentation?: unknown } => {
  const effectResolved = must(
    result.events.find((event) => event.type === "effectResolved"),
    "effectResolved event",
  );
  return effectResolved.payload as { readonly presentation?: unknown };
};

const playedCharacter = (
  result: EngineResult,
  instanceId: CardRef["instanceId"],
): CardRef => {
  const character = must(
    must(result.state.players[p1], "p1").characters.find(
      (card) => card.instanceId === instanceId,
    ),
    "played character",
  );
  return {
    instanceId: character.instanceId,
    cardId: character.cardId,
    playerId: p1,
    zone: character.zone,
  };
};

test("optional cost presentation highlights the cost while paying and the body after payment", () => {
  const state = createQueuedCostPresentationState();
  const entry = must(state.effectQueue[0], "queued effect");

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "payment decision");
  assert.equal(decision.type, "payCost");
  assert.deepEqual(filterStateForPlayer(paused.state, p1).activeEffectText, {
    source: entry.source,
    textKind: "effect",
    activeSpanIds: ["span:cost:optional:line:1"],
  });
  assert.deepEqual(
    filterStateForPlayer(paused.state, p1).pendingDecision?.presentation
      .activeEffectText,
    {
      source: entry.source,
      textKind: "effect",
      activeSpanIds: ["span:cost:optional:line:1"],
    },
  );

  const paid = payTrashFromHandWithFirstHandCard(paused.state);
  const effectResolved = must(
    paid.events.find((event) => event.type === "effectResolved"),
    "effectResolved event",
  );

  assert.equal(paid.errors, undefined);
  assert.equal(paid.state.pendingDecision, undefined);
  assert.deepEqual(
    (effectResolved.payload as { presentation?: unknown }).presentation,
    {
      source: entry.source,
      textKind: "effect",
      activeSpanIds: ["span:body:line:1"],
    },
  );
});

test("declined optional costs do not leave a pending cost spotlight as present history", () => {
  const state = createQueuedCostPresentationState();

  const paused = processEffectRuntime(state);
  const declined = declinePayment(paused.state);
  const view = filterStateForPlayer(declined.state, p1);

  assert.equal(declined.errors, undefined);
  assert.equal(declined.state.pendingDecision, undefined);
  assert.equal(view.effectSpotlightHistory, undefined);
});

test("return-to-hand cost spotlight stays on cost before hand play body", () => {
  const { state, returnedTarget } = createReturnCostPlayState();
  const entry = must(state.effectQueue[0], "queued effect");

  const paused = processEffectRuntime(state);
  const rested = payRestSelf(paused.state);

  assert.equal(paused.errors, undefined);
  assert.equal(rested.errors, undefined);
  assert.equal(rested.state.pendingDecision?.type, "selectTargets");
  assert.deepEqual(filterStateForPlayer(rested.state, p1).activeEffectText, {
    source: entry.source,
    textKind: "effect",
    activeSpanIds: ["span:cost:optional:line:1"],
  });

  const selectedReturn = selectReturnCostTarget(rested.state, returnedTarget);

  assert.equal(selectedReturn.errors, undefined);
  assert.equal(selectedReturn.state.pendingDecision?.type, "selectCards");
  assert.deepEqual(
    filterStateForPlayer(selectedReturn.state, p1).activeEffectText,
    {
      source: entry.source,
      textKind: "effect",
      activeSpanIds: ["span:body:line:1"],
    },
  );
});

test("return-to-hand cost presentation links returned and played cards to their own spans", () => {
  const { state, eligibleHandCard, returnedTarget } =
    createReturnCostPlayState();
  const entry = must(state.effectQueue[0], "queued effect");

  const paused = processEffectRuntime(state);
  const rested = payRestSelf(paused.state);
  const selectedReturn = selectReturnCostTarget(rested.state, returnedTarget);
  const handDecision = must(
    selectedReturn.state.pendingDecision,
    "hand selection decision",
  );
  assert.equal(handDecision.type, "selectCards");
  const candidate = must(
    handDecision.candidates.find(
      (entry) => entry.card.instanceId === eligibleHandCard.instanceId,
    ),
    "eligible hand candidate",
  );

  const selectedPlay = applyAction(selectedReturn.state, {
    type: "respondToDecision",
    decisionId: handDecision.id,
    response: { type: "cards", cards: [candidate.card] },
  });
  const played = playedCharacter(selectedPlay, eligibleHandCard.instanceId);

  assert.equal(selectedPlay.errors, undefined);
  assert.deepEqual(resolvedPresentation(selectedPlay).presentation, {
    source: entry.source,
    textKind: "effect",
    activeSpanIds: ["span:cost:optional:line:1", "span:body:line:1"],
    targetLinks: [
      {
        spanId: "span:cost:optional:line:1",
        relation: "selectedTarget",
        cards: [returnedTarget],
      },
      {
        spanId: "span:body:line:1",
        relation: "affectedCard",
        cards: [played],
      },
    ],
  });
});

test("return-to-hand cost presentation does not project returned cards over declined play body", () => {
  const { state, returnedTarget } = createReturnCostPlayState();
  const entry = must(state.effectQueue[0], "queued effect");

  const paused = processEffectRuntime(state);
  const rested = payRestSelf(paused.state);
  const selectedReturn = selectReturnCostTarget(rested.state, returnedTarget);
  const handDecision = must(
    selectedReturn.state.pendingDecision,
    "hand selection decision",
  );
  assert.equal(handDecision.type, "selectCards");

  const declinedPlay = applyAction(selectedReturn.state, {
    type: "respondToDecision",
    decisionId: handDecision.id,
    response: { type: "cards", cards: [] },
  });

  assert.equal(declinedPlay.errors, undefined);
  assert.deepEqual(resolvedPresentation(declinedPlay).presentation, {
    source: entry.source,
    textKind: "effect",
    activeSpanIds: ["span:cost:optional:line:1"],
    targetLinks: [
      {
        spanId: "span:cost:optional:line:1",
        relation: "selectedTarget",
        cards: [returnedTarget],
      },
    ],
  });
});

test("optional cost presentation drops the cost while a body decision is pending", () => {
  const state = createQueuedCostPresentationStateForEffect(
    optionalTrashCostThenDrawUpTo(),
  );
  const entry = must(state.effectQueue[0], "queued effect");

  const paused = processEffectRuntime(state);
  const paid = payTrashFromHandWithFirstHandCard(paused.state);

  assert.equal(paid.errors, undefined);
  const decision = must(paid.state.pendingDecision, "body quantity decision");
  assert.equal(decision.type, "chooseQuantity");
  assert.deepEqual(filterStateForPlayer(paid.state, p1).activeEffectText, {
    source: entry.source,
    textKind: "effect",
    activeSpanIds: ["span:body:line:1"],
  });
  assert.deepEqual(
    filterStateForPlayer(paid.state, p1).pendingDecision?.presentation
      .activeEffectText,
    {
      source: entry.source,
      textKind: "effect",
      activeSpanIds: ["span:body:line:1"],
    },
  );
});
