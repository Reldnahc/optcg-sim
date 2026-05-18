import assert from "node:assert/strict";
import { test } from "vitest";
import type { Condition } from "@optcg/types";

import type { EffectQueueEntry } from "./effect-runtime-queue-processing-test-support.js";
import {
  applyAction,
  createActiveState,
  must,
  p1,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  setupOnPlayDefinition,
  toCardId,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
} from "./effect-runtime-queue-processing-test-support.js";

test("queued conditioned supported search-reveal pauses for private choice and then resolves", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const originalTopDeck = must(p1State.deck[0], "top deck");
  const topDeckCardId = toCardId("queue-conditioned-search-top");
  p1State.deck = [
    { ...originalTopDeck, cardId: topDeckCardId },
    ...p1State.deck.slice(1),
  ];
  const topDeck = must(p1State.deck[0], "top deck after override");
  state.cardManifest.cards[topDeck.cardId] = resolvedCard({
    cardId: topDeck.cardId,
    category: "character",
  });
  const source = p1State.leader;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-queue-conditioned-search",
      rulesVersion: "queue-conditioned-search-rules",
      sourceTextHash: "queue-conditioned-search-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const searchEffectId = toEffectId("queue-conditioned-search-effect");
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.effectDefinitionsVersion =
    baseDefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-queue-conditioned-search": {
      ...baseDefinition,
      effects: [
        {
          ...must(baseDefinition.effects[0], "base effect"),
          id: searchEffectId,
          condition: { type: "yourTurn" },
          effect: {
            type: "search",
            request: {
              zone: "deck",
              player: "self",
              lookCount: 1,
              filter: { categories: ["character"] },
              min: 0,
              max: 1,
              destination: "hand",
              revealTo: "chooserOnly",
              shuffleAfter: false,
            },
          },
          sourcePresencePolicy: "mustRemainInSameZone",
        },
      ],
    },
  };
  state.turn.turnPlayerId = p1;
  const queueEntry: EffectQueueEntry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry-conditioned-search"),
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: toSourceSnapshot(source, p1, p1),
    effectBlockId: searchEffectId,
    sourcePresencePolicy: "mustRemainInSameZone",
  };
  state.effectQueue = [queueEntry];

  const created = processEffectRuntime(state);
  assert.equal(created.errors, undefined);
  assert.deepEqual(
    created.events.map((event) => event.type),
    ["cardRevealed", "decisionCreated"],
  );
  assert.deepEqual(created.state.effectQueue, [queueEntry]);
  const decision = must(created.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectCards");
  const candidate = must(decision.candidates[0], "candidate").card;

  const applied = applyAction(created.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [candidate] },
  });
  assert.equal(applied.errors, undefined);
  assert.deepEqual(
    applied.events.map((event) => event.type),
    ["decisionResolved", "cardMoved", "effectResolved"],
  );
  assert.deepEqual(applied.state.effectQueue, []);
  assert.equal(applied.state.pendingDecision, undefined);
  assert.equal(
    must(applied.state.players[p1], "p1").hand.at(-1)?.instanceId,
    topDeck.instanceId,
  );
  const continued = processEffectRuntime(applied.state);
  assert.equal(continued.errors, undefined);
  assert.deepEqual(continued.events, []);
});

test("leaderColorCount condition true resolves queued draw", () => {
  const state = createActiveState();
  const source = must(state.players[p1], "p1").leader;
  const leaderCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, leaderCard.support);
  const effect = must(base.effects[0], "effect");
  setupOnPlayDefinition(
    state,
    source,
    {
      ...base,
      effects: [
        {
          ...effect,
          id: toEffectId("leader-color-count-true"),
          condition: {
            type: "leaderColorCount",
            player: "self",
            op: "gte",
            value: 2,
          },
        },
      ],
    },
    "def-leader-color-count-unsupported",
  );
  state.cardManifest.cards[source.cardId] = {
    ...must(
      state.cardManifest.cards[source.cardId],
      "installed leader support",
    ),
    category: "leader",
    colors: ["red", "blue"],
  };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      effectBlockId: toEffectId("leader-color-count-true"),
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      sourcePresencePolicy: "mustRemainInSameZone",
    },
  ];
  const beforeP1 = structuredClone(must(state.players[p1], "p1"));

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(
    must(result.state.players[p1], "p1").deck.length,
    beforeP1.deck.length - 1,
  );
  assert.equal(
    must(result.state.players[p1], "p1").hand.length,
    beforeP1.hand.length + 1,
  );
  assert.deepEqual(result.events.map((event) => event.type).slice(0, 5), [
    "cardDrawn",
    "cardMoved",
    "cardMoved",
    "effectResolved",
    "ruleProcessingChecked",
  ]);
});

test("handCount/lifeCount with boolean composition resolve queued draw", () => {
  const state = createActiveState();
  const source = must(state.players[p1], "p1").leader;
  const leaderCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, leaderCard.support);
  const effect = must(base.effects[0], "effect");
  setupOnPlayDefinition(
    state,
    source,
    {
      ...base,
      effects: [
        {
          ...effect,
          id: toEffectId("composed-public-conditions-true"),
          condition: {
            type: "and",
            conditions: [
              { type: "handCount", player: "self", op: "gte", value: 1 },
              { type: "lifeCount", player: "opponent", op: "gte", value: 1 },
              {
                type: "or",
                conditions: [
                  {
                    type: "leaderColorCount",
                    player: "self",
                    op: "gte",
                    value: 2,
                  },
                  {
                    type: "not",
                    condition: { type: "yourTurn" },
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    "def-composed-public-conditions-true",
  );
  state.cardManifest.cards[source.cardId] = {
    ...must(
      state.cardManifest.cards[source.cardId],
      "installed leader support",
    ),
    category: "leader",
    types: ["Straw Hat Crew"],
    attributes: ["slash"],
    colors: ["red", "green"],
  };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      effectBlockId: toEffectId("composed-public-conditions-true"),
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      sourcePresencePolicy: "mustRemainInSameZone",
    },
  ];
  const beforeP1 = structuredClone(must(state.players[p1], "p1"));

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(
    must(result.state.players[p1], "p1").deck.length,
    beforeP1.deck.length - 1,
  );
  assert.equal(
    must(result.state.players[p1], "p1").hand.length,
    beforeP1.hand.length + 1,
  );
});

test("leader-zone hasCardInZone type and attribute filters resolve queued draw", () => {
  const state = createActiveState();
  const source = must(state.players[p1], "p1").leader;
  const leaderCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, leaderCard.support);
  const effect = must(base.effects[0], "effect");
  setupOnPlayDefinition(
    state,
    source,
    {
      ...base,
      effects: [
        {
          ...effect,
          id: toEffectId("leader-zone-metadata-true"),
          condition: {
            type: "and",
            conditions: [
              {
                type: "hasCardInZone",
                zone: "leaderArea",
                player: "self",
                filter: {
                  categories: ["leader"],
                  typesAny: ["Straw Hat Crew"],
                },
              },
              {
                type: "hasCardInZone",
                zone: "leaderArea",
                player: "self",
                filter: { categories: ["leader"], attributesAny: ["slash"] },
              },
            ],
          },
        },
      ],
    },
    "def-leader-zone-metadata-true",
  );
  state.cardManifest.cards[source.cardId] = {
    ...must(
      state.cardManifest.cards[source.cardId],
      "installed leader support",
    ),
    category: "leader",
    types: ["Straw Hat Crew"],
    attributes: ["slash"],
  };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      effectBlockId: toEffectId("leader-zone-metadata-true"),
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      sourcePresencePolicy: "mustRemainInSameZone",
    },
  ];
  const beforeP1 = structuredClone(must(state.players[p1], "p1"));

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(
    must(result.state.players[p1], "p1").deck.length,
    beforeP1.deck.length - 1,
  );
  assert.equal(
    must(result.state.players[p1], "p1").hand.length,
    beforeP1.hand.length + 1,
  );
});

test("leaderColorCount false skips queued draw", () => {
  const state = createActiveState();
  const source = must(state.players[p1], "p1").leader;
  const leaderCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, leaderCard.support);
  const effect = must(base.effects[0], "effect");
  setupOnPlayDefinition(
    state,
    source,
    {
      ...base,
      effects: [
        {
          ...effect,
          id: toEffectId("leader-color-count-false"),
          condition: {
            type: "leaderColorCount",
            player: "self",
            op: "gte",
            value: 3,
          },
        },
      ],
    },
    "def-leader-color-count-false",
  );
  state.cardManifest.cards[source.cardId] = {
    ...must(state.cardManifest.cards[source.cardId], "leader"),
    category: "leader",
    colors: ["red", "blue"],
  };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      effectBlockId: toEffectId("leader-color-count-false"),
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      sourcePresencePolicy: "mustRemainInSameZone",
    },
  ];
  const before = structuredClone(must(state.players[p1], "p1"));
  const result = processEffectRuntime(state);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.events, []);
  assert.equal(
    must(result.state.players[p1], "p1").deck.length,
    before.deck.length,
  );
  assert.equal(
    must(result.state.players[p1], "p1").hand.length,
    before.hand.length,
  );
});

test("leader-zone hasCardInZone with combined type+attribute requires both filter families", () => {
  const state = createActiveState();
  const source = must(state.players[p1], "p1").leader;
  const leaderCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, leaderCard.support);
  const effect = must(base.effects[0], "effect");
  setupOnPlayDefinition(
    state,
    source,
    {
      ...base,
      effects: [
        {
          ...effect,
          id: toEffectId("leader-zone-combined-filter"),
          condition: {
            type: "hasCardInZone",
            zone: "leaderArea",
            player: "self",
            filter: {
              categories: ["leader"],
              typesAny: ["Straw Hat Crew"],
              attributesAny: ["slash"],
            },
          },
        },
      ],
    },
    "def-leader-zone-combined-filter",
  );
  state.cardManifest.cards[source.cardId] = {
    ...must(state.cardManifest.cards[source.cardId], "leader"),
    category: "leader",
    types: ["Straw Hat Crew"],
    attributes: ["special"],
  };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      effectBlockId: toEffectId("leader-zone-combined-filter"),
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      sourcePresencePolicy: "mustRemainInSameZone",
    },
  ];
  const before = structuredClone(must(state.players[p1], "p1"));
  const result = processEffectRuntime(state);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.events, []);
  assert.equal(
    must(result.state.players[p1], "p1").deck.length,
    before.deck.length,
  );
  assert.equal(
    must(result.state.players[p1], "p1").hand.length,
    before.hand.length,
  );
});

test("handCount/lifeCount false comparator skips queued draw", () => {
  const state = createActiveState();
  const source = must(state.players[p1], "p1").leader;
  const leaderCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, leaderCard.support);
  const effect = must(base.effects[0], "effect");
  setupOnPlayDefinition(
    state,
    source,
    {
      ...base,
      effects: [
        {
          ...effect,
          id: toEffectId("hand-life-false"),
          condition: {
            type: "and",
            conditions: [
              { type: "handCount", player: "self", op: "gt", value: 50 },
              { type: "lifeCount", player: "opponent", op: "gte", value: 1 },
            ],
          },
        },
      ],
    },
    "def-hand-life-false",
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      effectBlockId: toEffectId("hand-life-false"),
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      sourcePresencePolicy: "mustRemainInSameZone",
    },
  ];
  const before = structuredClone(must(state.players[p1], "p1"));
  const result = processEffectRuntime(state);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.events, []);
  assert.equal(
    must(result.state.players[p1], "p1").deck.length,
    before.deck.length,
  );
  assert.equal(
    must(result.state.players[p1], "p1").hand.length,
    before.hand.length,
  );
});

test("unsupported boolean child fails closed", () => {
  const state = createActiveState();
  const source = must(state.players[p1], "p1").leader;
  const leaderCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, leaderCard.support);
  const effect = must(base.effects[0], "effect");
  setupOnPlayDefinition(
    state,
    source,
    {
      ...base,
      effects: [
        {
          ...effect,
          id: toEffectId("unsupported-boolean-child"),
          condition: {
            type: "and",
            conditions: [{ type: "yourTurn" }, { type: "opponentTurn" }],
          },
        },
      ],
    },
    "def-unsupported-boolean-child",
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      effectBlockId: toEffectId("unsupported-boolean-child"),
    },
  ];
  const before = structuredClone(state);
  const result = processEffectRuntime(state);
  assert.deepEqual(result.events, []);
  assert.equal(must(result.errors, "errors")[0]?.type, "effectRuntimeError");
  assert.deepEqual(result.state, before);
});

test("unsupported hasCardInZone shapes fail closed", () => {
  const runWith = (
    condition: Extract<Condition, { type: "hasCardInZone" }>,
  ) => {
    const state = createActiveState();
    const source = must(state.players[p1], "p1").leader;
    const leaderCard = resolvedCard({
      cardId: source.cardId,
      category: "leader",
    });
    const base = reviewedOnPlayDrawDefinition(
      source.cardId,
      leaderCard.support,
    );
    const effect = must(base.effects[0], "effect");
    setupOnPlayDefinition(
      state,
      source,
      {
        ...base,
        effects: [
          { ...effect, id: toEffectId("unsupported-has-zone"), condition },
        ],
      },
      "def-unsupported-has-zone",
    );
    state.effectQueue = [
      {
        ...queueDrawForP1(),
        effectBlockId: toEffectId("unsupported-has-zone"),
      },
    ];
    return processEffectRuntime(state);
  };

  const wrongZone = runWith({
    type: "hasCardInZone",
    zone: "characterArea",
    player: "self",
    filter: { categories: ["leader"], typesAny: ["x"] },
  });
  const wrongPlayer = runWith({
    type: "hasCardInZone",
    zone: "leaderArea",
    player: "turnPlayer",
    filter: { categories: ["leader"], typesAny: ["x"] },
  });
  const unsupportedFilter = runWith({
    type: "hasCardInZone",
    zone: "leaderArea",
    player: "self",
    filter: { categories: ["leader"], typesAny: ["x"], colorsAny: ["red"] },
  });
  assert.equal(
    must(wrongZone.errors, "wrongZone errors")[0]?.type,
    "effectRuntimeError",
  );
  assert.equal(
    must(wrongPlayer.errors, "wrongPlayer errors")[0]?.type,
    "effectRuntimeError",
  );
  assert.equal(
    must(unsupportedFilter.errors, "unsupportedFilter errors")[0]?.type,
    "effectRuntimeError",
  );
});

test("malformed count values and missing leader metadata fail closed", () => {
  const malformedCount = (() => {
    const state = createActiveState();
    const source = must(state.players[p1], "p1").leader;
    const leaderCard = resolvedCard({
      cardId: source.cardId,
      category: "leader",
    });
    const base = reviewedOnPlayDrawDefinition(
      source.cardId,
      leaderCard.support,
    );
    const effect = must(base.effects[0], "effect");
    setupOnPlayDefinition(
      state,
      source,
      {
        ...base,
        effects: [
          {
            ...effect,
            id: toEffectId("malformed-hand-count"),
            condition: {
              type: "handCount",
              player: "self",
              op: "gte",
              value: Number.MAX_SAFE_INTEGER + 1,
            },
          },
        ],
      },
      "def-malformed-hand-count",
    );
    state.effectQueue = [
      {
        ...queueDrawForP1(),
        effectBlockId: toEffectId("malformed-hand-count"),
      },
    ];
    return processEffectRuntime(state);
  })();

  const missingLeaderManifest = (() => {
    const state = createActiveState();
    const source = must(state.players[p1], "p1").leader;
    const leaderCard = resolvedCard({
      cardId: source.cardId,
      category: "leader",
    });
    const base = reviewedOnPlayDrawDefinition(
      source.cardId,
      leaderCard.support,
    );
    const effect = must(base.effects[0], "effect");
    setupOnPlayDefinition(
      state,
      source,
      {
        ...base,
        effects: [
          {
            ...effect,
            id: toEffectId("missing-leader-manifest"),
            condition: {
              type: "leaderColorCount",
              player: "self",
              op: "gte",
              value: 2,
            },
          },
        ],
      },
      "def-missing-leader-manifest",
    );
    state.cardManifest.cards = Object.fromEntries(
      Object.entries(state.cardManifest.cards).filter(
        ([cardId]) => cardId !== source.cardId,
      ),
    );
    state.effectQueue = [
      {
        ...queueDrawForP1(),
        effectBlockId: toEffectId("missing-leader-manifest"),
      },
    ];
    return processEffectRuntime(state);
  })();

  assert.equal(
    must(malformedCount.errors, "malformedCount errors")[0]?.type,
    "effectRuntimeError",
  );
  assert.equal(
    must(missingLeaderManifest.errors, "missingLeaderManifest errors")[0]?.type,
    "effectRuntimeError",
  );
});
