import assert from "node:assert/strict";
import { test } from "vitest";
import type { Condition } from "@optcg/types";
import { evaluateQueuedEffectCondition } from "./evaluator.js";

import type { EffectQueueEntry } from "../../effect-runtime-queue/test-support.js";
import { filterStateForPlayer } from "../../filter-state-for-player.js";
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
  setupOnPlayDefinition,
  toCardId,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
} from "../../effect-runtime-queue/test-support.js";

test("queued conditioned supported search-reveal pauses for private choice and then resolves", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  while (p1State.deck.length < 5) {
    const base = must(p1State.deck.at(-1), "deck card");
    p1State.deck.push({
      ...base,
      instanceId:
        `${String(base.instanceId)}:${String(p1State.deck.length)}` as typeof base.instanceId,
      zone: { ...base.zone, index: p1State.deck.length },
    });
  }
  for (const [index, id] of [
    "queue-search-good-type",
    "queue-search-blue-type",
    "queue-search-event-type",
    "queue-search-excluded-type",
    "queue-search-other",
  ].entries()) {
    const card = must(p1State.deck[index], "looked card");
    card.cardId = toCardId(id);
    state.cardManifest.cards[card.cardId] = {
      ...resolvedCard({
        cardId: card.cardId,
        category: id.includes("event") ? "event" : "character",
      }),
      colors: [id.includes("blue") ? "blue" : "green"],
      types: [id.includes("type") ? "Navy" : "Pirate"],
      name: id.includes("excluded") ? "Excluded" : id,
    };
  }
  const selectedDeck = must(p1State.deck[0], "selected");
  const originalTail = p1State.deck.slice(5);
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
              lookCount: 5,
              filter: {
                categories: ["character"],
                colorsAny: ["green"],
                typesAny: ["Navy"],
                nameNot: ["Excluded"],
              },
              min: 0,
              max: 1,
              destination: "hand",
              revealTo: "bothPlayers",
              remainingCards: {
                destination: "deck",
                position: "bottom",
                order: "ownerChoice",
              },
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
  const decision = must(created.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectCards");
  const candidate = must(decision.candidates[0], "candidate").card;
  assert.deepEqual(
    decision.candidates.map(({ card }) => card.instanceId),
    [selectedDeck.instanceId],
  );

  const applied = applyAction(created.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [candidate] },
  });
  assert.equal(applied.errors, undefined);
  assert.deepEqual(
    applied.events.map((event) => event.type),
    ["decisionResolved", "cardMoved", "cardRevealed", "decisionCreated"],
  );
  assert.equal(
    JSON.stringify(filterStateForPlayer(applied.state, p2)).includes(
      String(candidate.cardId),
    ),
    true,
  );
  const order = must(applied.state.pendingDecision, "order");
  assert.equal(order.type, "orderCards");
  const remainder = [3, 1, 0, 2].map((index) =>
    must(order.cards[index], "remainder"),
  );
  const ordered = applyAction(applied.state, {
    type: "respondToDecision",
    decisionId: order.id,
    response: {
      type: "orderedIds",
      ids: remainder.map((card) => String(card.instanceId)),
    },
  });
  assert.equal(ordered.errors, undefined);
  assert.deepEqual(
    ordered.events.map((event) => event.type),
    ["decisionResolved", "effectResolved"],
  );
  assert.deepEqual(ordered.state.effectQueue, []);
  assert.equal(ordered.state.pendingDecision, undefined);
  assert.equal(
    must(ordered.state.players[p1], "p1").hand.at(-1)?.instanceId,
    selectedDeck.instanceId,
  );
  assert.deepEqual(
    must(ordered.state.players[p1], "p1").deck.map((card) => card.instanceId),
    [...originalTail, ...remainder].map((card) => card.instanceId),
  );
  assert.equal(
    JSON.stringify(filterStateForPlayer(ordered.state, p2)).includes(
      String(must(p1State.deck[1], "hidden").cardId),
    ),
    false,
  );
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
            conditions: [
              { type: "yourTurn" },
              { type: "custom", check: "unsupported-condition" },
            ],
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

test("and fails closed when earlier child is false and later child is unsupported", () => {
  const state = createActiveState();
  const entry = queueDrawForP1();
  const result = evaluateQueuedEffectCondition(state, entry, {
    type: "and",
    conditions: [
      { type: "handCount", player: "self", op: "gt", value: 50 },
      { type: "custom", check: "unsupported-condition" },
    ],
  });
  assert.deepEqual(result, { supported: false });
});

test("or fails closed when earlier child is true and later child is unsupported", () => {
  const state = createActiveState();
  const entry = queueDrawForP1();
  const result = evaluateQueuedEffectCondition(state, entry, {
    type: "or",
    conditions: [
      { type: "yourTurn" },
      { type: "custom", check: "unsupported-condition" },
    ],
  });
  assert.deepEqual(result, { supported: false });
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

test("malformed comparator for count conditions fails closed", () => {
  const state = createActiveState();
  const entry = queueDrawForP1();
  const malformedConditions = [
    {
      type: "leaderColorCount",
      player: "self",
      op: "bogus",
      value: 2,
    },
    {
      type: "handCount",
      player: "self",
      op: "bogus",
      value: 2,
    },
    {
      type: "lifeCount",
      player: "self",
      op: "bogus",
      value: 2,
    },
  ] as unknown as Condition[];
  for (const condition of malformedConditions) {
    const result = evaluateQueuedEffectCondition(state, entry, condition);
    assert.deepEqual(result, { supported: false });
  }
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

test("leaderColorCount fails closed when leader colors metadata is missing or malformed", () => {
  const sourceResult = (() => {
    const state = createActiveState();
    const source = must(state.players[p1], "p1").leader;
    state.cardManifest.cards[source.cardId] = {
      ...resolvedCard({ cardId: source.cardId, category: "leader" }),
      colors: "red",
    } as unknown as ReturnType<typeof resolvedCard>;
    return evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "leaderColorCount",
      player: "self",
      op: "gte",
      value: 1,
    });
  })();

  const missingResult = (() => {
    const state = createActiveState();
    const source = must(state.players[p1], "p1").leader;
    const malformed = Object.fromEntries(
      Object.entries(
        resolvedCard({ cardId: source.cardId, category: "leader" }),
      ).filter(([key]) => key !== "colors"),
    );
    state.cardManifest.cards[source.cardId] =
      malformed as unknown as ReturnType<typeof resolvedCard>;
    return evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "leaderColorCount",
      player: "self",
      op: "gte",
      value: 1,
    });
  })();

  assert.deepEqual(sourceResult, { supported: false });
  assert.deepEqual(missingResult, { supported: false });
});

test("hasCardInZone fails closed when leader types metadata is missing or malformed", () => {
  const sourceResult = (() => {
    const state = createActiveState();
    const source = must(state.players[p1], "p1").leader;
    state.cardManifest.cards[source.cardId] = {
      ...resolvedCard({ cardId: source.cardId, category: "leader" }),
      types: "Straw Hat Crew",
    } as unknown as ReturnType<typeof resolvedCard>;
    return evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "hasCardInZone",
      zone: "leaderArea",
      player: "self",
      filter: { categories: ["leader"], typesAny: ["Straw Hat Crew"] },
    });
  })();

  const missingResult = (() => {
    const state = createActiveState();
    const source = must(state.players[p1], "p1").leader;
    const malformed = Object.fromEntries(
      Object.entries(
        resolvedCard({ cardId: source.cardId, category: "leader" }),
      ).filter(([key]) => key !== "types"),
    );
    state.cardManifest.cards[source.cardId] =
      malformed as unknown as ReturnType<typeof resolvedCard>;
    return evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "hasCardInZone",
      zone: "leaderArea",
      player: "self",
      filter: { categories: ["leader"], typesAny: ["Straw Hat Crew"] },
    });
  })();

  assert.deepEqual(sourceResult, { supported: false });
  assert.deepEqual(missingResult, { supported: false });
});

test("hasCardInZone fails closed when leader attributes metadata is missing or malformed", () => {
  const sourceResult = (() => {
    const state = createActiveState();
    const source = must(state.players[p1], "p1").leader;
    state.cardManifest.cards[source.cardId] = {
      ...resolvedCard({ cardId: source.cardId, category: "leader" }),
      attributes: "slash",
    } as unknown as ReturnType<typeof resolvedCard>;
    return evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "hasCardInZone",
      zone: "leaderArea",
      player: "self",
      filter: { categories: ["leader"], attributesAny: ["slash"] },
    });
  })();

  const missingResult = (() => {
    const state = createActiveState();
    const source = must(state.players[p1], "p1").leader;
    const malformed = Object.fromEntries(
      Object.entries(
        resolvedCard({ cardId: source.cardId, category: "leader" }),
      ).filter(([key]) => key !== "attributes"),
    );
    state.cardManifest.cards[source.cardId] =
      malformed as unknown as ReturnType<typeof resolvedCard>;
    return evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "hasCardInZone",
      zone: "leaderArea",
      player: "self",
      filter: { categories: ["leader"], attributesAny: ["slash"] },
    });
  })();

  assert.deepEqual(sourceResult, { supported: false });
  assert.deepEqual(missingResult, { supported: false });
});
