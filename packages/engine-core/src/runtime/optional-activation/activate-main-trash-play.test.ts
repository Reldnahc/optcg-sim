import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, SelectionId } from "@optcg/types";

import { applyAction } from "../../actions.js";
import {
  installActivateMainDrawDefinition,
  makeMainPhaseLegalActionState,
  toCardId,
  toEffectId,
} from "../../action-dispatcher-test-support.js";
import { must, p1, resolvedCard } from "../../action-test-fixtures.js";
import { reviewedOnPlayDrawDefinition } from "../../effect-runtime-queue/test-support.js";

const setupActivateMainTrashAllPlayFromTrashState = (params: {
  sameTrashNames?: boolean;
  supportedOnPlayCount?: number;
}): {
  effectId: ReturnType<typeof toEffectId>;
  fieldCharacter: CardInstance;
  state: ReturnType<typeof makeMainPhaseLegalActionState>;
  trashCards: ReturnType<
    typeof makeMainPhaseLegalActionState
  >["players"][typeof p1]["trash"];
} => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-trash-all-play-from-trash");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-trash-all-play-from-trash",
    effectId,
  });
  const leaderCard = must(state.cardManifest.cards[leader.cardId], "leader");
  state.cardManifest.cards[leader.cardId] = { ...leaderCard, name: "Imu" };
  const fieldCharacter = must(p1State.characters[0], "field character");
  fieldCharacter.cardId = toCardId("field-character-not-eligible");
  state.cardManifest.cards[fieldCharacter.cardId] = resolvedCard({
    cardId: fieldCharacter.cardId,
    category: "character",
    power: 3000,
  });
  const fieldMetadata = must(
    state.cardManifest.cards[fieldCharacter.cardId],
    "field metadata",
  );
  fieldMetadata.name = "Field Character";
  fieldMetadata.types = ["Celestial Dragons"];
  const extraDrawCardsNeeded = params.supportedOnPlayCount ?? 0;
  if (extraDrawCardsNeeded > 0) {
    const topDeck = must(p1State.deck[0], "top deck");
    const deckStart = p1State.deck.length;
    p1State.deck = [
      ...p1State.deck,
      ...Array.from({ length: extraDrawCardsNeeded }, (_, offset) => ({
        ...topDeck,
        instanceId:
          `${String(topDeck.instanceId)}:extra-on-play-${String(offset)}` as typeof topDeck.instanceId,
        zone: {
          zone: "deck" as const,
          playerId: p1,
          slot: "deck" as const,
          index: deckStart + offset,
        },
      })),
    ];
  }
  const trashCards = p1State.deck.slice(0, 2).map((card, index) => ({
    ...card,
    cardId: toCardId(`trash-five-elder-${String(index + 1)}`),
    zone: {
      zone: "trash" as const,
      playerId: p1,
      slot: "trash" as const,
      index,
    },
  }));
  p1State.deck = p1State.deck.slice(2).map((card, index) => ({
    ...card,
    zone: { zone: "deck", playerId: p1, slot: "deck", index },
  }));
  p1State.trash = trashCards;
  for (const [index, card] of trashCards.entries()) {
    const support =
      index < (params.supportedOnPlayCount ?? 0)
        ? {
            status: "implemented-dsl" as const,
            effectDefinitionId: `def:${String(card.cardId)}:on-play-draw`,
            rulesVersion: "play-selected-on-play-rules",
            sourceTextHash: `play-selected-on-play-source-${String(index)}`,
          }
        : undefined;
    const supportCard = resolvedCard({
      cardId: card.cardId,
      category: "character",
      cost: 5,
      power: 5000,
      ...(support === undefined ? {} : { support }),
    });
    state.cardManifest.cards[card.cardId] = supportCard;
    const trashMetadata = must(
      state.cardManifest.cards[card.cardId],
      "trash metadata",
    );
    trashMetadata.name =
      params.sameTrashNames === true
        ? "Same Elder"
        : `Elder ${String(index + 1)}`;
    trashMetadata.types = ["Five Elders"];
    if (
      supportCard.support.status === "implemented-dsl" &&
      supportCard.support.effectDefinitionId !== undefined
    ) {
      state.cardManifest.effectDefinitions = {
        ...state.cardManifest.effectDefinitions,
        [supportCard.support.effectDefinitionId]: reviewedOnPlayDrawDefinition(
          card.cardId,
          supportCard.support,
        ),
      };
    }
  }
  const effectBlock = must(definition.effects[0], "effect");
  effectBlock.condition = {
    type: "hasCardInZone",
    zone: "leaderArea",
    player: "self",
    filter: { categories: ["leader"], names: ["Imu"] },
  };
  effectBlock.effect = {
    type: "sequence",
    effects: [
      {
        id: "pay-rest-don-and-trash-hand",
        connector: "always",
        saveResultAs: "paidCost",
        effect: {
          type: "payCost",
          cost: {
            type: "sequence",
            optional: true,
            costs: [
              { type: "restDon", count: 1, chooser: "self" },
              { type: "trashFromHand", count: 1, chooser: "self" },
            ],
          },
        },
      },
      {
        id: "trash-and-play-if-paid",
        connector: "ifYouDo",
        effect: {
          type: "sequence",
          effects: [
            {
              id: "trash-all-characters",
              connector: "always",
              effect: {
                type: "trash",
                target: {
                  type: "all",
                  zone: "characterArea",
                  player: "self",
                  filter: { categories: ["character"] },
                },
              },
            },
            {
              id: "select-from-trash",
              connector: "then",
              saveResultAs: "trashSelection:play",
              effect: {
                type: "selectCards",
                zone: "trash",
                player: "self",
                chooser: "self",
                min: 0,
                max: 5,
                filter: {
                  categories: ["character"],
                  typesAny: ["Five Elders"],
                  power: { op: "eq", value: 5000 },
                  custom: "differentNames",
                },
                saveAs: "trashSelection:play" as SelectionId,
                visibility: "bothPlayers",
              },
            },
            {
              id: "play-selected",
              connector: "ifPossible",
              effect: {
                type: "playSelected",
                selection: "trashSelection:play" as SelectionId,
                ignoreCost: true,
              },
            },
          ],
        },
      },
    ],
  };
  return { effectId, fieldCharacter, state, trashCards };
};

const payActivateMainTrashAllPlayCost = (
  state: ReturnType<typeof makeMainPhaseLegalActionState>,
  effectId: ReturnType<typeof toEffectId>,
) => {
  const p1State = must(state.players[p1], "p1");
  const activated = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
      zone: p1State.leader.zone,
    },
    effectId,
  });
  assert.equal(activated.errors, undefined);
  const restDonDecision = must(activated.state.pendingDecision, "rest DON");
  const activeDon = must(
    p1State.costArea.find((card) => card.state === "active"),
    "active DON",
  );
  const paidDon = applyAction(activated.state, {
    type: "respondToDecision",
    decisionId: restDonDecision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [activeDon.instanceId],
    },
  });
  const trashHandDecision = must(paidDon.state.pendingDecision, "hand trash");
  const handCard = must(
    must(paidDon.state.players[p1], "after DON").hand[0],
    "hand cost card",
  );
  const paidHand = applyAction(paidDon.state, {
    type: "respondToDecision",
    decisionId: trashHandDecision.id,
    response: {
      type: "payment",
      optionId: "trashFromHand",
      selectedCardInstanceIds: [handCard.instanceId],
    },
  });

  assert.equal(paidDon.errors, undefined);
  assert.equal(paidHand.errors, undefined);
  assert.equal(restDonDecision.type, "payCost");
  assert.equal(trashHandDecision.type, "payCost");
  return { paidDon, paidHand, restDonDecision, trashHandDecision };
};

test("activate main supports leader-gated rest and hand-trash cost before trash-all and trash playSelected", () => {
  const { effectId, fieldCharacter, state, trashCards } =
    setupActivateMainTrashAllPlayFromTrashState({});
  const { paidDon, paidHand, restDonDecision, trashHandDecision } =
    payActivateMainTrashAllPlayCost(state, effectId);
  const trashSelection = must(
    paidHand.state.pendingDecision,
    "trash selection",
  );

  assert.equal(paidDon.errors, undefined);
  assert.equal(paidHand.errors, undefined);
  assert.equal(restDonDecision.type, "payCost");
  assert.equal(trashHandDecision.type, "payCost");
  assert.equal(trashSelection.type, "selectCards");
  assert.deepEqual(
    trashSelection.candidates.map((candidate) => candidate.card.instanceId),
    trashCards.map((card) => card.instanceId),
  );

  const selected = applyAction(paidHand.state, {
    type: "respondToDecision",
    decisionId: trashSelection.id,
    response: {
      type: "cards",
      cards: trashSelection.candidates
        .slice(0, 2)
        .map((candidate) => candidate.card),
    },
  });
  const afterP1 = must(selected.state.players[p1], "resolved p1");

  assert.equal(selected.errors, undefined);
  assert.equal(
    afterP1.trash.some((card) => card.instanceId === fieldCharacter.instanceId),
    true,
  );
  assert.deepEqual(
    afterP1.characters.map((card) => card.instanceId),
    trashCards.slice(0, 2).map((card) => card.instanceId),
  );
});

test("activate main trash playSelected excludes same-name Five Elders from the selectable set", () => {
  const { effectId, state } = setupActivateMainTrashAllPlayFromTrashState({
    sameTrashNames: true,
  });
  const { paidHand } = payActivateMainTrashAllPlayCost(state, effectId);
  const trashSelection = must(
    paidHand.state.pendingDecision,
    "trash selection",
  );
  assert.equal(trashSelection.type, "selectCards");
  assert.equal(trashSelection.candidates.length, 1);

  const selected = applyAction(paidHand.state, {
    type: "respondToDecision",
    decisionId: trashSelection.id,
    response: {
      type: "cards",
      cards: trashSelection.candidates
        .slice(0, 2)
        .map((candidate) => candidate.card),
    },
  });
  const afterP1 = must(selected.state.players[p1], "resolved p1");

  assert.equal(selected.errors, undefined);
  assert.equal(afterP1.characters.length, 1);
  assert.equal(
    afterP1.characters[0]?.cardId,
    trashSelection.candidates[0]?.card.cardId,
  );
});

test("activate main trash playSelected queues simultaneous On Play triggers for order choice", () => {
  const { effectId, state } = setupActivateMainTrashAllPlayFromTrashState({
    supportedOnPlayCount: 2,
  });
  const { paidHand } = payActivateMainTrashAllPlayCost(state, effectId);
  const trashSelection = must(
    paidHand.state.pendingDecision,
    "trash selection",
  );
  assert.equal(trashSelection.type, "selectCards");

  const selected = applyAction(paidHand.state, {
    type: "respondToDecision",
    decisionId: trashSelection.id,
    response: {
      type: "cards",
      cards: trashSelection.candidates
        .slice(0, 2)
        .map((candidate) => candidate.card),
    },
  });

  assert.equal(selected.errors, undefined);
  const triggerOrder = must(
    selected.state.pendingDecision,
    "trigger order decision",
  );
  assert.equal(triggerOrder.type, "chooseTriggerOrder");
  assert.equal(triggerOrder.triggerIds.length, 2);
});

test("activate main self-trash can play a trash Character with unsupported future triggers", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const fieldCharacter = must(p1State.characters[0], "field character");
  fieldCharacter.cardId = toCardId("self-trash-source");
  const effectId = toEffectId("activate-main-self-trash-play-yamato");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: fieldCharacter.cardId,
    category: "character",
    definitionId: "def-activate-main-self-trash-play-yamato",
    effectId,
  });
  const trashSelectionId = "trashSelection:yamato" as SelectionId;
  const effectBlock = must(definition.effects[0], "activate effect");
  effectBlock.effect = {
    type: "sequence",
    effects: [
      {
        id: "pay-trash-self",
        connector: "always",
        saveResultAs: "paidCost",
        effect: {
          type: "payCost",
          cost: { type: "trashSelf", optional: true },
        },
      },
      {
        id: "select-yamato-from-trash",
        connector: "ifYouDo",
        saveResultAs: trashSelectionId,
        effect: {
          type: "selectCards",
          zone: "trash",
          player: "self",
          chooser: "self",
          min: 0,
          max: 1,
          filter: {
            categories: ["character"],
            names: ["Yamato"],
            colorsAny: ["black"],
            cost: { op: "eq", value: 8 },
          },
          saveAs: trashSelectionId,
          visibility: "bothPlayers",
        },
      },
      {
        id: "play-selected-yamato",
        connector: "ifPossible",
        effect: {
          type: "playSelected",
          selection: trashSelectionId,
          ignoreCost: true,
        },
      },
    ],
  };

  const yamato = {
    ...must(p1State.deck[0], "trash yamato"),
    cardId: toCardId("black-yamato-eight"),
    zone: {
      zone: "trash" as const,
      playerId: p1,
      slot: "trash" as const,
      index: 0,
    },
  };
  p1State.deck = p1State.deck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "deck", playerId: p1, slot: "deck", index },
  }));
  p1State.trash = [yamato];
  const yamatoSupport = {
    cardId: yamato.cardId,
    status: "implemented-dsl" as const,
    tested: true,
    effectDefinitionId: "def-yamato-unsupported-future-on-ko",
    rulesVersion: "yamato-future-trigger-rules",
    cardDataVersion: state.cardManifest.cardDataVersion,
    sourceTextHash: "yamato-future-trigger-source",
    behaviorHash: "yamato-future-trigger-behavior",
  };
  const yamatoCard = resolvedCard({
    cardId: yamato.cardId,
    category: "character",
    cost: 8,
    power: 8000,
    support: yamatoSupport,
  });
  state.cardManifest.cards[yamato.cardId] = {
    ...yamatoCard,
    colors: ["black"],
    name: "Yamato",
  };
  const yamatoDefinition = reviewedOnPlayDrawDefinition(
    yamato.cardId,
    yamatoSupport,
  );
  const yamatoBaseEffect = must(yamatoDefinition.effects[0], "yamato effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [yamatoSupport.effectDefinitionId]: {
      ...yamatoDefinition,
      effects: [
        {
          ...yamatoBaseEffect,
          id: toEffectId("yamato-unsupported-future-on-ko"),
          trigger: { type: "onKO" },
          sourcePresencePolicy: "resolveFromDestinationZone",
          cost: { type: "restDon", count: 1 },
        },
      ],
    },
  };

  const activated = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: fieldCharacter.instanceId,
      cardId: fieldCharacter.cardId,
      playerId: p1,
      zone: fieldCharacter.zone,
    },
    effectId,
  });
  assert.equal(activated.errors, undefined);
  const trashSelfDecision = must(
    activated.state.pendingDecision,
    "trash-self decision",
  );
  assert.equal(trashSelfDecision.type, "payCost");

  const paid = applyAction(activated.state, {
    type: "respondToDecision",
    decisionId: trashSelfDecision.id,
    response: { type: "payment", optionId: "trashSelf" },
  });
  assert.equal(paid.errors, undefined);
  const trashSelection = must(paid.state.pendingDecision, "trash selection");
  assert.equal(trashSelection.type, "selectCards");
  assert.deepEqual(
    trashSelection.candidates.map((candidate) => candidate.card.instanceId),
    [yamato.instanceId],
  );

  const selected = applyAction(paid.state, {
    type: "respondToDecision",
    decisionId: trashSelection.id,
    response: {
      type: "cards",
      cards: trashSelection.candidates.map((candidate) => candidate.card),
    },
  });
  const afterP1 = must(selected.state.players[p1], "after p1");

  assert.equal(selected.errors, undefined);
  assert.equal(
    afterP1.trash.some((card) => card.instanceId === fieldCharacter.instanceId),
    true,
  );
  assert.equal(
    afterP1.characters.some((card) => card.instanceId === yamato.instanceId),
    true,
  );
});
