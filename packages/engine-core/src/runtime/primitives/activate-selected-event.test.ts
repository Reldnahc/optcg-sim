import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  EffectDefinition,
  HandSelectionId,
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
} from "../../effect-runtime-queue/test-support.js";

const reindexHand = (cards: readonly CardInstance[]): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));

const mainEventDrawDefinition = (
  source: CardInstance,
  effectDefinitionId: string,
): EffectDefinition => {
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "event",
    cost: 0,
    effectText: "[Main] Draw 1 card.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "activate-selected-event-main-rules",
      sourceTextHash: "activate-selected-event-main-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  return {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base draw"),
        id: toEffectId("effect:selected-event-main-draw"),
        trigger: { type: "main" },
        sourcePresencePolicy: "resolveFromDestinationZone",
      },
    ],
  };
};

const activateEventSelectionId =
  "handSelection:activate-event" as HandSelectionId;
const activateTrashEventSelectionId =
  "trashSelection:activate-event" as SelectionId;

const sourceOnPlayDefinition = (
  source: CardInstance,
  effectDefinitionId: string,
  options: {
    readonly activationSourceZone?: "hand" | "trash";
  } = {},
): EffectDefinition => {
  const activationSourceZone = options.activationSourceZone ?? "hand";
  const selection =
    activationSourceZone === "hand"
      ? activateEventSelectionId
      : activateTrashEventSelectionId;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "activate-selected-event-source-rules",
      sourceTextHash: "activate-selected-event-source-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  return {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect:on-play-activate-selected-event"),
        category: "auto",
        trigger: { type: "onPlay" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              id: "select:event",
              connector: "always",
              saveResultAs: selection,
              effect: {
                type: "selectCards",
                zone: activationSourceZone,
                player: "self",
                chooser: "self",
                min: 0,
                max: 1,
                filter: { categories: ["event"], typesAny: ["Dressrosa"] },
                saveAs: selection,
                visibility:
                  activationSourceZone === "hand"
                    ? "chooserOnly"
                    : "bothPlayers",
              },
            },
            {
              id: "activate:event",
              connector: "ifPossible",
              effect: {
                type: "activateSelectedEvent",
                selection,
                ...(activationSourceZone === "trash"
                  ? { sourceZone: "trash" as const }
                  : {}),
                trigger: { type: "main" },
                ignoreCost: true,
              },
            },
          ],
        },
      },
    ],
  };
};

test("sequence activateSelectedEvent activates a selected hand Event through Main Event runtime", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const player = must(state.players[p1], "p1");
  const source = {
    ...must(player.hand[0], "source"),
    zone: {
      zone: "characterArea" as const,
      playerId: p1,
      slot: "character" as const,
      index: 0,
    },
    state: "active" as const,
    attachedDon: [],
    turnPlayed: state.turn.globalTurn,
  };
  const event = {
    ...must(player.hand[1], "event"),
    cardId: "event-dressrosa" as CardInstance["cardId"],
  };
  const filler = player.hand.slice(2);
  player.characters = [source];
  player.hand = reindexHand([event, ...filler]);

  const sourceDefinitionId = "def-source-activate-selected-event";
  const eventDefinitionId = "def-selected-event-main";
  const sourceDefinition = sourceOnPlayDefinition(source, sourceDefinitionId);
  const eventDefinition = mainEventDrawDefinition(event, eventDefinitionId);
  state.cardManifest.effectDefinitionsVersion =
    sourceDefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [sourceDefinitionId]: sourceDefinition,
    [eventDefinitionId]: eventDefinition,
  };
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: sourceDefinitionId,
      rulesVersion: sourceDefinition.metadata.rulesVersion,
      sourceTextHash: sourceDefinition.metadata.sourceTextHash,
    },
  });
  state.cardManifest.cards[event.cardId] = {
    ...resolvedCard({
      cardId: event.cardId,
      category: "event",
      cost: 0,
      effectText: "[Main] Draw 1 card.",
      support: {
        status: "implemented-dsl",
        effectDefinitionId: eventDefinitionId,
        rulesVersion: eventDefinition.metadata.rulesVersion,
        sourceTextHash: eventDefinition.metadata.sourceTextHash,
      },
    }),
    types: ["Dressrosa"],
  };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-activate-selected-event"),
      timingWindowId: toTimingWindowId("timing-window-activate-selected-event"),
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(sourceDefinition.effects[0], "source effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
    },
  ];

  const prompted = processEffectRuntime(state);
  const decision = must(prompted.state.pendingDecision, "event selection");
  const selectedEvent = must(
    must(prompted.state.players[p1], "prompted p1").hand.find(
      (card) => card.instanceId === event.instanceId,
    ),
    "selected event",
  );

  assert.equal(prompted.errors, undefined);
  assert.equal(decision.type, "selectCards");
  const activated = applyAction(prompted.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "cards",
      cards: [
        {
          instanceId: event.instanceId,
          cardId: event.cardId,
          playerId: p1,
          zone: selectedEvent.zone,
        },
      ],
    },
  });
  const nextPlayer = must(activated.state.players[p1], "result p1");

  assert.equal(activated.errors, undefined);
  assert.equal(
    nextPlayer.hand.some((card) => card.instanceId === event.instanceId),
    false,
  );
  assert.equal(nextPlayer.trash[0]?.instanceId, event.instanceId);
  assert.equal(
    activated.events.some(
      (runtimeEvent) => runtimeEvent.type === "effectQueued",
    ),
    true,
  );
  assert.equal(
    activated.events.some((runtimeEvent) => runtimeEvent.type === "cardDrawn"),
    true,
  );
});

test("sequence activateSelectedEvent activates a selected trash Event through Main Event runtime without moving it", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const player = must(state.players[p1], "p1");
  const source = {
    ...must(player.hand[0], "source"),
    zone: {
      zone: "characterArea" as const,
      playerId: p1,
      slot: "character" as const,
      index: 0,
    },
    state: "active" as const,
    attachedDon: [],
    turnPlayed: state.turn.globalTurn,
  };
  const event = {
    ...must(player.hand[1], "event"),
    cardId: "event-dressrosa-trash" as CardInstance["cardId"],
    zone: {
      zone: "trash" as const,
      playerId: p1,
      slot: "trash" as const,
      index: 0,
    },
  };
  player.characters = [source];
  player.hand = reindexHand(player.hand.slice(2));
  player.trash = [event];

  const sourceDefinitionId = "def-source-activate-selected-trash-event";
  const eventDefinitionId = "def-selected-trash-event-main";
  const sourceDefinition = sourceOnPlayDefinition(source, sourceDefinitionId, {
    activationSourceZone: "trash",
  });
  const eventDefinition = mainEventDrawDefinition(event, eventDefinitionId);
  state.cardManifest.effectDefinitionsVersion =
    sourceDefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [sourceDefinitionId]: sourceDefinition,
    [eventDefinitionId]: eventDefinition,
  };
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: sourceDefinitionId,
      rulesVersion: sourceDefinition.metadata.rulesVersion,
      sourceTextHash: sourceDefinition.metadata.sourceTextHash,
    },
  });
  state.cardManifest.cards[event.cardId] = {
    ...resolvedCard({
      cardId: event.cardId,
      category: "event",
      cost: 0,
      effectText: "[Main] Draw 1 card.",
      support: {
        status: "implemented-dsl",
        effectDefinitionId: eventDefinitionId,
        rulesVersion: eventDefinition.metadata.rulesVersion,
        sourceTextHash: eventDefinition.metadata.sourceTextHash,
      },
    }),
    types: ["Dressrosa"],
  };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-activate-selected-trash-event"),
      timingWindowId: toTimingWindowId(
        "timing-window-activate-selected-trash-event",
      ),
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(sourceDefinition.effects[0], "source effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
    },
  ];

  const prompted = processEffectRuntime(state);
  const decision = must(prompted.state.pendingDecision, "event selection");

  assert.equal(prompted.errors, undefined);
  assert.equal(decision.type, "selectCards");
  const activated = applyAction(prompted.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "cards",
      cards: [
        {
          instanceId: event.instanceId,
          cardId: event.cardId,
          playerId: p1,
          zone: event.zone,
        },
      ],
    },
  });
  const nextPlayer = must(activated.state.players[p1], "result p1");

  assert.equal(activated.errors, undefined);
  assert.equal(nextPlayer.trash[0]?.instanceId, event.instanceId);
  assert.equal(
    activated.events.some(
      (runtimeEvent) => runtimeEvent.type === "effectQueued",
    ),
    true,
  );
  assert.equal(
    activated.events.some((runtimeEvent) => runtimeEvent.type === "cardDrawn"),
    true,
  );
});
