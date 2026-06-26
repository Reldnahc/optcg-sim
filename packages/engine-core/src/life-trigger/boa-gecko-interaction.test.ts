import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  EffectDefinition,
  InstanceId,
  PlayerId,
  SelectionId,
} from "@optcg/types";

import { applyAction } from "../actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "../action-test-fixtures.js";
import {
  cardRef,
  passCounterStep,
  setupAttackState,
} from "../battle/test-fixtures.js";
import { processEffectRuntime } from "../effect-runtime.js";

const boaCardId = toCardId("OP14-041");
const geckoCardId = toCardId("OP16-105");

const boaEffectDefinition = (): EffectDefinition => ({
  cardId: boaCardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: "OP14-041:auto-card-played-draw" as EffectDefinition["effects"][number]["id"],
      category: "auto",
      trigger: {
        type: "cardPlayed",
        player: "self",
        filter: { categories: ["character"] },
      },
      condition: { type: "opponentTurn" },
      optional: false,
      oncePerTurn: false,
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: { type: "draw", count: 1, player: "self" },
    },
  ],
  metadata: {
    sourceTextHash: "op14-041-source",
    rulesVersion: "op14-041-rules",
    effectDefinitionsVersion: "boa-gecko-fixture",
    tested: true,
    reviewer: "qa-reviewer",
  },
});

const geckoTriggerDefinition = (): EffectDefinition => {
  const namedPlaySegments = (
    name: "Absalom" | "Dr. Hogback" | "Perona",
    selection: SelectionId,
  ): Extract<
    EffectDefinition["effects"][number]["effect"],
    { type: "sequence" }
  >["effects"] => [
    {
      id: `select:${name}`,
      connector: "always",
      saveResultAs: selection,
      effect: {
        type: "selectCards",
        zone: "trash",
        player: "self",
        chooser: "self",
        min: 0,
        max: 1,
        filter: {
          categories: ["character"],
          names: [name],
          cost: { max: 4 },
        },
        saveAs: selection,
        visibility: "bothPlayers",
      },
    },
    {
      id: `play:${name}`,
      connector: "ifPossible",
      effect: {
        type: "playSelected",
        selection,
        ignoreCost: true,
      },
    },
  ];

  return {
    cardId: geckoCardId,
    implementationStatus: "implemented-dsl",
    effects: [
      {
        id: "OP16-105:trigger-trash-trio" as EffectDefinition["effects"][number]["id"],
        category: "auto",
        trigger: { type: "trigger" },
        condition: { type: "lifeCount", player: "self", op: "lte", value: 1 },
        optional: false,
        oncePerTurn: false,
        sourcePresencePolicy: "noSourceRequired",
        effect: {
          type: "sequence",
          effects: [
            ...namedPlaySegments(
              "Absalom",
              "trashSelection:gecko-absalom" as SelectionId,
            ),
            ...namedPlaySegments(
              "Dr. Hogback",
              "trashSelection:gecko-hogback" as SelectionId,
            ),
            ...namedPlaySegments(
              "Perona",
              "trashSelection:gecko-perona" as SelectionId,
            ),
          ],
        },
      },
    ],
    metadata: {
      sourceTextHash: "op16-105-source",
      rulesVersion: "op16-105-rules",
      effectDefinitionsVersion: "boa-gecko-fixture",
      tested: true,
      reviewer: "qa-reviewer",
    },
  };
};

const installImplementedDefinition = (
  state: ReturnType<typeof setupAttackState>,
  effectDefinitionId: string,
  definition: EffectDefinition,
): void => {
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
};

const setResolvedCard = (
  state: ReturnType<typeof setupAttackState>,
  cardId: CardId,
  card: ReturnType<typeof resolvedCard>,
): void => {
  state.cardManifest.cards[cardId] = card;
};

const setBoaLeader = (state: ReturnType<typeof setupAttackState>): void => {
  const p2State = must(state.players[p2], "p2");
  p2State.leader = {
    ...p2State.leader,
    cardId: boaCardId,
  };
  const definition = boaEffectDefinition();
  installImplementedDefinition(state, "def-op14-041-boa", definition);
  setResolvedCard(state, boaCardId, {
    ...resolvedCard({
      cardId: boaCardId,
      category: "leader",
      power: 5000,
      effectText: "[Opponent's Turn] When you play a Character, draw 1 card.",
      support: {
        status: "implemented-dsl",
        effectDefinitionId: "def-op14-041-boa",
        rulesVersion: definition.metadata.rulesVersion,
        sourceTextHash: definition.metadata.sourceTextHash,
      },
    }),
    colors: ["blue", "yellow"],
    life: 4,
    name: "Boa Hancock",
    types: ["The Seven Warlords of the Sea", "Kuja Pirates"],
  });
};

const setGeckoAsTopLife = (
  state: ReturnType<typeof setupAttackState>,
): InstanceId => {
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top p2 life");
  p2State.life[0] = {
    ...topLife,
    card: {
      ...topLife.card,
      cardId: geckoCardId,
    },
  };
  const definition = geckoTriggerDefinition();
  installImplementedDefinition(state, "def-op16-105-gecko", definition);
  setResolvedCard(state, geckoCardId, {
    ...resolvedCard({
      cardId: geckoCardId,
      category: "character",
      cost: 6,
      power: 7000,
      counter: 1000,
      triggerText:
        "[Trigger] If you have 1 or less Life cards, play up to 1 [Absalom], up to 1 [Dr. Hogback], and up to 1 [Perona], with a cost of 4 or less from your trash.",
      support: {
        status: "implemented-dsl",
        effectDefinitionId: "def-op16-105-gecko",
        rulesVersion: definition.metadata.rulesVersion,
        sourceTextHash: definition.metadata.sourceTextHash,
      },
    }),
    name: "Gecko Moria",
    types: ["The Seven Warlords of the Sea", "Thriller Bark Pirates"],
  });
  return topLife.card.instanceId;
};

const moveNamedTrashCharacterFromHand = (
  state: ReturnType<typeof setupAttackState>,
  playerId: PlayerId,
  name: "Absalom" | "Dr. Hogback" | "Perona",
  handIndex: number,
): CardInstance => {
  const player = must(state.players[playerId], "player");
  const handCard = must(player.hand[handIndex], `${name} hand fixture`);
  const cardId = `${name.replaceAll(/[^A-Za-z0-9]/gu, "-")}-fixture` as CardId;
  const trashCard: CardInstance = {
    ...handCard,
    cardId,
    zone: {
      zone: "trash",
      playerId,
      slot: "trash",
      index: player.trash.length,
    },
  };
  player.trash = [...player.trash, trashCard];
  player.hand = player.hand
    .filter((card) => card.instanceId !== handCard.instanceId)
    .map((card, index) => ({
      ...card,
      zone: { zone: "hand", playerId, slot: "hand", index },
    }));
  setResolvedCard(state, cardId, {
    ...resolvedCard({
      cardId,
      category: "character",
      cost: 4,
      power: 3000,
    }),
    name,
  });
  return trashCard;
};

const ensureDeckCount = (
  state: ReturnType<typeof setupAttackState>,
  playerId: PlayerId,
  count: number,
): void => {
  const player = must(state.players[playerId], "deck refill player");
  while (player.deck.length < count) {
    const index = player.deck.length;
    const cardId = `${String(playerId)}-boa-draw-${String(index)}` as CardId;
    player.deck.push({
      instanceId: `${String(playerId)}:boa-draw:${String(index)}` as InstanceId,
      cardId,
      owner: playerId,
      controller: playerId,
      zone: {
        zone: "deck",
        playerId,
        slot: "deck",
        index,
      },
      state: "active",
      attachedDon: [],
    });
    setResolvedCard(
      state,
      cardId,
      resolvedCard({
        cardId,
        category: "character",
        cost: 1,
        power: 1000,
      }),
    );
  }
};

const chooseNamedTrashCard = (
  state: ReturnType<typeof setupAttackState>,
  name: string,
) => {
  const decision = must(state.pendingDecision, `${name} selection decision`);
  assert.equal(decision.type, "selectCards");
  const selected = must(
    decision.candidates.find((candidate) => {
      const resolved = state.cardManifest.cards[candidate.card.cardId];
      return resolved?.name === name;
    }),
    `${name} candidate`,
  );
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [selected.card] },
  });
};

const drainRuntime = (
  state: ReturnType<typeof setupAttackState>,
): ReturnType<typeof setupAttackState> => {
  let nextState = state;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (
      nextState.pendingDecision !== undefined ||
      (nextState.effectQueue.length === 0 &&
        nextState.deferredTriggers.length === 0)
    ) {
      return nextState;
    }
    const result = processEffectRuntime(nextState);
    assert.equal(result.errors, undefined);
    nextState = result.state;
  }
  assert.fail("runtime did not drain within 10 passes");
};

test("Boa Hancock draws once for each Character Gecko Moria's trigger plays from trash", () => {
  const state = setupAttackState();
  setBoaLeader(state);
  setGeckoAsTopLife(state);
  moveNamedTrashCharacterFromHand(state, p2, "Absalom", 0);
  moveNamedTrashCharacterFromHand(state, p2, "Dr. Hogback", 0);
  moveNamedTrashCharacterFromHand(state, p2, "Perona", 0);
  ensureDeckCount(state, p2, 3);

  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const p2HandBeforeTrigger = p2State.hand.length;

  const attacked = applyAction(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(attacked.errors, undefined);

  const damaged = passCounterStep(attacked.state, p2);
  assert.equal(damaged.errors, undefined);
  assert.equal(damaged.state.pendingDecision?.type, "confirmLifeTrigger");
  assert.equal(must(damaged.state.players[p2], "p2 damaged").life.length, 1);

  const triggerDecision = must(
    damaged.state.pendingDecision,
    "Gecko trigger decision",
  );
  const triggerActivated = applyAction(damaged.state, {
    type: "respondToDecision",
    decisionId: triggerDecision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });
  assert.equal(triggerActivated.errors, undefined);

  const absalomPlayed = chooseNamedTrashCard(triggerActivated.state, "Absalom");
  assert.equal(absalomPlayed.errors, undefined);
  const hogbackPlayed = chooseNamedTrashCard(
    absalomPlayed.state,
    "Dr. Hogback",
  );
  assert.equal(hogbackPlayed.errors, undefined);
  const peronaPlayed = chooseNamedTrashCard(hogbackPlayed.state, "Perona");
  assert.equal(peronaPlayed.errors, undefined);
  const resolvedState = drainRuntime(peronaPlayed.state);
  assert.equal(resolvedState.pendingDecision, undefined);

  const drawEvents = resolvedState.eventJournal.filter((event) => {
    const payload = event.payload as { playerId?: unknown };
    return event.type === "cardDrawn" && payload.playerId === p2;
  });
  const playedByGecko = resolvedState.eventJournal.filter((event) => {
    const payload = event.payload as {
      cardId?: unknown;
      playerId?: unknown;
      category?: unknown;
      sourceZone?: unknown;
    };
    const resolved =
      typeof payload.cardId === "string"
        ? resolvedState.cardManifest.cards[payload.cardId as CardId]
        : undefined;
    return (
      event.type === "cardPlayed" &&
      payload.playerId === p2 &&
      payload.category === "character" &&
      payload.sourceZone === "trash" &&
      (resolved?.name === "Absalom" ||
        resolved?.name === "Dr. Hogback" ||
        resolved?.name === "Perona")
    );
  });

  assert.equal(playedByGecko.length, 3);
  assert.equal(drawEvents.length, 3);
  assert.equal(
    must(resolvedState.players[p2], "p2 after Boa draws").hand.length,
    p2HandBeforeTrigger + 3,
  );
});
