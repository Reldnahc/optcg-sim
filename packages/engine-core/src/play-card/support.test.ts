import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  EffectDefinition,
  MatchCardManifest,
} from "@optcg/types";

import {
  must,
  p1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "../action-test-fixtures.js";
import { hasUnsupportedSupportGateText } from "../battle/support.js";
import {
  canResolveDestinationConflict,
  getActiveDonCount,
  getPlayableHandCards,
  getSupportedPlayMetadata,
} from "./support.js";
import { setupMainPlayState } from "./test-fixtures.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const plainDataClone = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;
const toCardId = (value: string): CardId => value as CardId;

const loadRealCardManifest = async (): Promise<MatchCardManifest> => {
  const manifestFixturePath = path.join(
    repoRoot,
    "fixtures/cards/real-card-dsl-match-card-manifest.json",
  );
  return plainDataClone(
    JSON.parse(
      await readFile(manifestFixturePath, "utf8"),
    ) as MatchCardManifest,
  );
};

test("getSupportedPlayMetadata accepts supported vanilla Character, Stage, and exact Main Event", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.hand[0], "character");
  const stage = must(p1State.hand[1], "stage");
  const event = must(p1State.hand[2], "event");

  state.cardManifest.cards[character.cardId] = resolvedCard({
    cardId: character.cardId,
    category: "character",
    cost: 3,
    power: 5000,
  });
  state.cardManifest.cards[stage.cardId] = resolvedCard({
    cardId: stage.cardId,
    category: "stage",
    cost: 2,
  });
  state.cardManifest.cards[event.cardId] = resolvedCard({
    cardId: event.cardId,
    category: "event",
    cost: 1,
    effectText: "[Main]",
  });

  assert.deepEqual(getSupportedPlayMetadata(state, character), {
    category: "character",
    printedCost: 3,
  });
  assert.deepEqual(getSupportedPlayMetadata(state, stage), {
    category: "stage",
    printedCost: 2,
  });
  assert.deepEqual(getSupportedPlayMetadata(state, event), {
    category: "event",
    printedCost: 1,
  });
});

test("getSupportedPlayMetadata accepts implemented-DSL Character with multiple supported relevant effect blocks", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.hand[0], "implemented character");
  const implemented = resolvedCard({
    cardId: character.cardId,
    category: "character",
    cost: 3,
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-character-multi-effect",
    },
  });
  const definition = reviewedOnPlayDrawDefinition(
    character.cardId,
    implemented.support,
  );
  const onPlayEffect = must(definition.effects[0], "onPlay effect");
  state.cardManifest.cards[character.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-character-multi-effect": {
      ...definition,
      effects: [
        onPlayEffect,
        {
          ...onPlayEffect,
          id: `${String(onPlayEffect.id)}:when-attacking` as EffectDefinition["effects"][number]["id"],
          trigger: { type: "whenAttacking" },
        },
      ],
    },
  };

  assert.deepEqual(getSupportedPlayMetadata(state, character), {
    category: "character",
    printedCost: 3,
  });
});

test("getSupportedPlayMetadata accepts implemented-DSL Character with multiple supported On Play blocks", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.hand[0], "implemented character");
  const implemented = resolvedCard({
    cardId: character.cardId,
    category: "character",
    cost: 3,
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-character-two-on-play-effects",
    },
  });
  const definition = reviewedOnPlayDrawDefinition(
    character.cardId,
    implemented.support,
  );
  const onPlayEffect = must(definition.effects[0], "onPlay effect");
  state.cardManifest.cards[character.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-character-two-on-play-effects": {
      ...definition,
      effects: [
        onPlayEffect,
        {
          ...onPlayEffect,
          id: `${String(onPlayEffect.id)}:draw-up-to` as EffectDefinition["effects"][number]["id"],
          effect: { type: "drawUpTo", count: 1, player: "self" },
        },
      ],
    },
  };

  assert.deepEqual(getSupportedPlayMetadata(state, character), {
    category: "character",
    printedCost: 3,
  });
});

test("getSupportedPlayMetadata rejects implemented-DSL Character with an unsupported On Play block", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.hand[0], "implemented character");
  const implemented = resolvedCard({
    cardId: character.cardId,
    category: "character",
    cost: 3,
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-character-unsupported-on-play",
    },
  });
  const definition = reviewedOnPlayDrawDefinition(
    character.cardId,
    implemented.support,
  );
  const onPlayEffect = must(definition.effects[0], "onPlay effect");
  state.cardManifest.cards[character.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-character-unsupported-on-play": {
      ...definition,
      effects: [
        onPlayEffect,
        {
          ...onPlayEffect,
          id: `${String(onPlayEffect.id)}:unsupported` as EffectDefinition["effects"][number]["id"],
          cost: { type: "restDon", count: 1 },
        },
        {
          ...onPlayEffect,
          id: `${String(onPlayEffect.id)}:when-attacking` as EffectDefinition["effects"][number]["id"],
          trigger: { type: "whenAttacking" },
        },
      ],
    },
  };

  assert.equal(getSupportedPlayMetadata(state, character), null);
});

test("getSupportedPlayMetadata accepts implemented-DSL Character On Play reusable sequence bodies", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.hand[0], "implemented character");
  const implemented = resolvedCard({
    cardId: character.cardId,
    category: "character",
    cost: 3,
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-character-on-play-sequence",
    },
  });
  const definition = reviewedOnPlayDrawDefinition(
    character.cardId,
    implemented.support,
  );
  const onPlayEffect = must(definition.effects[0], "onPlay effect");
  state.cardManifest.cards[character.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-character-on-play-sequence": {
      ...definition,
      effects: [
        {
          ...onPlayEffect,
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: { type: "draw", count: 1, player: "self" },
              },
              {
                connector: "then",
                effect: { type: "drawUpTo", count: 1, player: "self" },
              },
            ],
          },
        },
      ],
    },
  };

  assert.deepEqual(getSupportedPlayMetadata(state, character), {
    category: "character",
    printedCost: 3,
  });
  assert.deepEqual(
    getPlayableHandCards(state, p1).map((card) => card.instanceId),
    [character.instanceId],
  );
});

test("getSupportedPlayMetadata accepts implemented-DSL Event Main reusable sequence bodies", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const event = must(p1State.hand[0], "implemented event");
  const implemented = resolvedCard({
    cardId: event.cardId,
    category: "event",
    cost: 2,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-event-main-sequence",
    },
  });
  const definition = {
    ...reviewedOnPlayDrawDefinition(event.cardId, implemented.support),
    effects: [
      {
        ...must(
          reviewedOnPlayDrawDefinition(event.cardId, implemented.support)
            .effects[0],
          "base effect",
        ),
        id: "synthetic:event-main-sequence-1" as EffectDefinition["effects"][number]["id"],
        trigger: { type: "main" as const },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "sequence" as const,
          effects: [
            {
              connector: "always" as const,
              effect: {
                type: "draw" as const,
                count: 1,
                player: "self" as const,
              },
            },
            {
              connector: "then" as const,
              effect: {
                type: "drawUpTo" as const,
                count: 1,
                player: "self" as const,
              },
            },
          ],
        },
      },
    ],
  } satisfies EffectDefinition;
  state.cardManifest.cards[event.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-event-main-sequence": definition,
  };

  assert.deepEqual(getSupportedPlayMetadata(state, event), {
    category: "event",
    printedCost: 2,
  });
  assert.deepEqual(
    getPlayableHandCards(state, p1).map((card) => card.instanceId),
    [event.instanceId],
  );
});

test("getSupportedPlayMetadata accepts implemented-DSL Event play when trigger text is represented by supported DSL", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const event = must(p1State.hand[0], "implemented event with trigger text");
  const implemented = resolvedCard({
    cardId: event.cardId,
    category: "event",
    cost: 1,
    triggerText: "[Trigger] Activate this card's [Main] effect.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-event-main-with-trigger",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    event.cardId,
    implemented.support,
  );
  const baseEffect = must(baseDefinition.effects[0], "base effect");
  const definition = {
    ...baseDefinition,
    effects: [
      {
        ...baseEffect,
        id: "synthetic:event-main-search" as EffectDefinition["effects"][number]["id"],
        trigger: { type: "main" as const },
        sourcePresencePolicy: "resolveFromDestinationZone" as const,
        effect: {
          type: "search" as const,
          request: {
            zone: "deck" as const,
            player: "self" as const,
            lookCount: 3,
            filter: { typesAny: ["Celestial Dragons"] },
            min: 0,
            max: 1,
            destination: "hand" as const,
            revealTo: "bothPlayers" as const,
            remainingCards: { destination: "trash" as const },
            shuffleAfter: false,
          },
        },
      },
      {
        ...baseEffect,
        id: "synthetic:event-trigger-main" as EffectDefinition["effects"][number]["id"],
        trigger: { type: "trigger" as const },
        sourcePresencePolicy: "noSourceRequired" as const,
        effect: {
          type: "activateReferencedEffect" as const,
          source: { type: "triggerCard" as const },
          trigger: { type: "main" as const },
        },
      },
    ],
  } satisfies EffectDefinition;
  state.cardManifest.cards[event.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-event-main-with-trigger": definition,
  };

  assert.deepEqual(getSupportedPlayMetadata(state, event), {
    category: "event",
    printedCost: 1,
  });
  assert.deepEqual(
    getPlayableHandCards(state, p1).map((card) => card.instanceId),
    [event.instanceId],
  );
});

test("getSupportedPlayMetadata rejects unsupported reusable sequence legal-action shapes", () => {
  const makeOnPlayCharacterState = () => {
    const state = setupMainPlayState();
    const card = must(must(state.players[p1], "p1").hand[0], "character");
    const implemented = resolvedCard({
      cardId: card.cardId,
      category: "character",
      cost: 2,
      power: 5000,
      support: {
        status: "implemented-dsl",
        effectDefinitionId: "def-character-on-play-sequence-negative",
      },
    });
    const baseDefinition = reviewedOnPlayDrawDefinition(
      card.cardId,
      implemented.support,
    );
    const baseEffect = must(baseDefinition.effects[0], "base onPlay effect");
    state.cardManifest.cards[card.cardId] = implemented;
    state.cardManifest.effectDefinitionsVersion =
      baseDefinition.metadata.effectDefinitionsVersion;
    return { state, card, baseDefinition, baseEffect };
  };

  {
    const { state, card, baseDefinition, baseEffect } =
      makeOnPlayCharacterState();
    state.cardManifest.effectDefinitions = {
      "def-character-on-play-sequence-negative": {
        ...baseDefinition,
        effects: [
          {
            ...baseEffect,
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: { type: "draw", count: 1, player: "self" },
                },
                {
                  connector: "ifPossible",
                  effect: { type: "draw", count: 1, player: "opponent" },
                },
              ],
            },
          },
        ],
      },
    };
    assert.equal(getSupportedPlayMetadata(state, card), null);
  }

  {
    const { state, card, baseDefinition, baseEffect } =
      makeOnPlayCharacterState();
    state.cardManifest.effectDefinitions = {
      "def-character-on-play-sequence-negative": {
        ...baseDefinition,
        effects: [
          {
            ...baseEffect,
            sourcePresencePolicy: "noSourceRequired",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: { type: "draw", count: 1, player: "self" },
                },
                {
                  connector: "then",
                  effect: { type: "draw", count: 1, player: "opponent" },
                },
              ],
            },
          },
        ],
      },
    };
    assert.equal(getSupportedPlayMetadata(state, card), null);
  }

  {
    const { state, card, baseDefinition, baseEffect } =
      makeOnPlayCharacterState();
    state.cardManifest.effectDefinitions = {
      "def-character-on-play-sequence-negative": {
        ...baseDefinition,
        effects: [
          {
            ...baseEffect,
            cost: { type: "restDon", count: 1 },
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: { type: "draw", count: 1, player: "self" },
                },
                {
                  connector: "then",
                  effect: { type: "drawUpTo", count: 1, player: "self" },
                },
              ],
            },
          },
        ],
      },
    };
    assert.equal(getSupportedPlayMetadata(state, card), null);
  }

  {
    const { state, card, baseDefinition, baseEffect } =
      makeOnPlayCharacterState();
    state.cardManifest.effectDefinitions = {
      "def-character-on-play-sequence-negative": {
        ...baseDefinition,
        effects: [
          {
            ...baseEffect,
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: { type: "draw", count: 1, player: "self" },
                },
                {
                  connector: "then",
                  effect: { type: "drawUpTo", count: 1, player: "self" },
                },
              ],
            },
          },
          {
            ...baseEffect,
            id: "synthetic:auto-on-play-duplicate" as EffectDefinition["effects"][number]["id"],
            effect: { type: "draw", count: 1, player: "self" },
          },
        ],
      },
    };
    assert.deepEqual(getSupportedPlayMetadata(state, card), {
      category: "character",
      printedCost: 2,
    });
  }
});

test("getSupportedPlayMetadata rejects unsupported play metadata", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const missingManifest = must(p1State.hand[0], "missing manifest");
  const unsupported = must(p1State.hand[1], "unsupported status");
  const missingCost = must(p1State.hand[2], "missing cost");
  const effectText = must(p1State.hand[3], "effect text");
  const triggerText = must(p1State.hand[4], "trigger text");

  state.cardManifest.cards[unsupported.cardId] = {
    ...resolvedCard({
      cardId: unsupported.cardId,
      category: "character",
      cost: 1,
      power: 1000,
    }),
    support: {
      ...resolvedCard({
        cardId: unsupported.cardId,
        category: "character",
      }).support,
      status: "unsupported",
    },
  };
  state.cardManifest.cards[missingCost.cardId] = resolvedCard({
    cardId: missingCost.cardId,
    category: "stage",
  });
  state.cardManifest.cards[effectText.cardId] = resolvedCard({
    cardId: effectText.cardId,
    category: "character",
    cost: 1,
    power: 1000,
    effectText: "[On Play] draw a card.",
  });
  state.cardManifest.cards[triggerText.cardId] = resolvedCard({
    cardId: triggerText.cardId,
    category: "character",
    cost: 1,
    power: 1000,
    triggerText: "Draw a card.",
  });
  assert.equal(getSupportedPlayMetadata(state, missingManifest), null);
  assert.equal(getSupportedPlayMetadata(state, unsupported), null);
  assert.equal(getSupportedPlayMetadata(state, missingCost), null);
  assert.equal(getSupportedPlayMetadata(state, effectText), null);
  assert.equal(getSupportedPlayMetadata(state, triggerText), null);

  state.cardManifest.cards[missingManifest.cardId] = resolvedCard({
    cardId: missingManifest.cardId,
    category: "leader",
    cost: 0,
  });
  state.cardManifest.cards[unsupported.cardId] = resolvedCard({
    cardId: unsupported.cardId,
    category: "event",
    cost: 1,
    effectText: "[Main] Draw a card.",
  });
  assert.equal(getSupportedPlayMetadata(state, missingManifest), null);
  assert.equal(getSupportedPlayMetadata(state, unsupported), null);
});

test("support gates ignore parenthetical explanatory notes only with matching supported keyword metadata", () => {
  const supportedBanish = resolvedCard({
    cardId: "supported-banish" as CardInstance["cardId"],
    category: "character",
    cost: 3,
    power: 5000,
    effectText:
      "[Banish] (When this card deals damage, the target card is trashed without activating its Trigger.)",
    printedKeywords: ["banish"],
  });
  const missingKeyword = {
    ...supportedBanish,
    printedKeywords: [],
  };
  const extraText = {
    ...supportedBanish,
    effectText:
      "[Banish] (When this card deals damage, the target card is trashed without activating its Trigger.) Draw 1 card.",
  };

  assert.equal(
    hasUnsupportedSupportGateText(undefined, supportedBanish),
    false,
  );
  assert.equal(hasUnsupportedSupportGateText("   ", supportedBanish), false);
  assert.equal(
    hasUnsupportedSupportGateText("(explanatory note only)", supportedBanish),
    false,
  );
  assert.equal(
    hasUnsupportedSupportGateText(supportedBanish.effectText, supportedBanish),
    false,
  );
  assert.equal(
    hasUnsupportedSupportGateText(supportedBanish.effectText, missingKeyword),
    true,
  );
  assert.equal(
    hasUnsupportedSupportGateText(extraText.effectText, supportedBanish),
    true,
  );
  assert.equal(
    hasUnsupportedSupportGateText("[Banish] (unterminated", supportedBanish),
    true,
  );
});

test("getSupportedPlayMetadata accepts OP04-014 parenthetical explanatory notes from the checked-in manifest", async () => {
  const plainManifest = await loadRealCardManifest();
  const op04014 = toCardId("OP04-014");
  const opCard = must(plainManifest.cards[op04014], "OP04-014 manifest card");
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const supported = must(p1State.hand[0], "supported Banish");
  const missingKeyword = must(p1State.hand[1], "missing keyword");

  supported.cardId = op04014;
  state.cardManifest.cards[op04014] = opCard;
  state.cardManifest.cards[missingKeyword.cardId] = {
    ...opCard,
    cardId: missingKeyword.cardId,
    printedKeywords: [],
    support: {
      ...opCard.support,
      cardId: missingKeyword.cardId,
    },
  };

  assert.deepEqual(getSupportedPlayMetadata(state, supported), {
    category: "character",
    printedCost: opCard.cost,
  });
  assert.equal(getSupportedPlayMetadata(state, missingKeyword), null);
});

test("getPlayableHandCards respects active DON and destination conflicts", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const affordable = must(p1State.hand[0], "affordable");
  const tooExpensive = must(p1State.hand[1], "too expensive");
  const stage = must(p1State.hand[2], "stage");

  state.cardManifest.cards[affordable.cardId] = resolvedCard({
    cardId: affordable.cardId,
    category: "character",
    cost: 3,
    power: 5000,
  });
  state.cardManifest.cards[tooExpensive.cardId] = resolvedCard({
    cardId: tooExpensive.cardId,
    category: "character",
    cost: 4,
    power: 5000,
  });
  state.cardManifest.cards[stage.cardId] = resolvedCard({
    cardId: stage.cardId,
    category: "stage",
    cost: 1,
  });

  assert.equal(getActiveDonCount(p1State.costArea), 3);
  assert.deepEqual(
    getPlayableHandCards(state, p1).map((card) => card.instanceId),
    [affordable.instanceId, stage.instanceId],
  );

  p1State.stage = {
    ...stage,
    instanceId:
      `${String(stage.instanceId)}:existing` as CardInstance["instanceId"],
    zone: { zone: "stageArea", playerId: p1, slot: "stage", index: 0 },
    state: "active",
    attachedDon: [must(p1State.costArea[0], "attached DON").instanceId],
  };

  assert.equal(canResolveDestinationConflict(p1State, "stage"), false);
  assert.deepEqual(
    getPlayableHandCards(state, p1).map((card) => card.instanceId),
    [affordable.instanceId],
  );
});
