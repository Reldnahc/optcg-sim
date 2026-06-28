import { expect, test } from "vitest";

import type {
  CardInstance,
  CardId,
  CardRef,
  EffectDefinition,
  GameState,
  PlayerId,
  TargetRequest,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "../action-test-fixtures.js";
import { resolvePublicTargetCandidates } from "./candidates.js";

const publicCharacterRequest = (
  overrides: Partial<TargetRequest> = {},
): TargetRequest => ({
  timing: "onResolution",
  chooser: "self",
  player: "self",
  zone: "characterArea",
  min: 1,
  max: 1,
  allowFewerIfUnavailable: false,
  visibility: "public",
  ...overrides,
});

const addManifestCard = (
  state: GameState,
  params: Parameters<typeof resolvedCard>[0],
): void => {
  state.cardManifest.cards[params.cardId] = resolvedCard(params);
};

const placeCharacters = (
  state: GameState,
  playerId: PlayerId,
  cardIds: readonly CardId[],
): CardRef[] => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  player.characters = cardIds.map((cardId, index) => {
    const source = must(player.hand[index], `hand card ${String(index)}`);
    return {
      ...source,
      cardId,
      owner: playerId,
      controller: playerId,
      zone: { zone: "characterArea", playerId, slot: "character", index },
      attachedDon: [],
    };
  });
  return player.characters.map((card) => ({
    instanceId: card.instanceId,
    cardId: card.cardId,
    playerId,
    zone: card.zone,
  }));
};

const targetCards = (
  result: ReturnType<typeof resolvePublicTargetCandidates>,
): CardRef[] => {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return [];
  }
  return result.candidates.map((candidate) => candidate.card);
};

const trashCards = (
  playerId: PlayerId,
  cardId: CardId,
  count: number,
): CardInstance[] =>
  Array.from({ length: count }, (_, index) => ({
    instanceId:
      `${String(playerId)}:trash:${String(index)}:${String(cardId)}` as CardInstance["instanceId"],
    cardId,
    owner: playerId,
    controller: playerId,
    zone: { zone: "trash", playerId, index },
    state: "active",
    attachedDon: [],
  }));

const reviewedSelfTrashPowerKoProtectionDefinition = (
  cardId: CardId,
): EffectDefinition => ({
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: "perm:self-trash-power-ko-protection" as EffectDefinition["effects"][number]["id"],
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "protectFromKO",
              target: { type: "self" },
              sourceKind: "cardEffect",
              sourceControllerRelation: "opponentControlled",
              duration: { type: "whileSourceOnField" },
            },
          },
          {
            connector: "always",
            effect: {
              type: "modifyPower",
              target: { type: "self" },
              value: {
                type: "countMatchingZoneCards",
                player: "self",
                zone: "trash",
                per: 4,
                multiplier: 1000,
              },
              duration: { type: "whileSourceOnField" },
            },
          },
        ],
      },
    },
  ],
  metadata: {
    sourceTextHash: "source-hash",
    rulesVersion: "r1",
    effectDefinitionsVersion: "fixture",
    tested: true,
    reviewer: "reviewer",
  },
});

test("target candidates use derived permanent DSL power for current-power filters", () => {
  const state = createActiveState();
  const protectedPower = toCardId("protected-trash-power-character");
  const printedSix = toCardId("printed-six-character");
  const trashCard = toCardId("trash-event");
  state.cardManifest.cards[protectedPower] = {
    ...resolvedCard({
      cardId: protectedPower,
      category: "character",
      cost: 5,
      power: 5000,
    }),
    support: {
      cardId: protectedPower,
      status: "implemented-dsl",
      effectDefinitionId: "def:protected-trash-power",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };
  addManifestCard(state, {
    cardId: printedSix,
    category: "character",
    cost: 5,
    power: 6000,
  });
  addManifestCard(state, {
    cardId: trashCard,
    category: "event",
  });
  state.cardManifest.effectDefinitions = {
    "def:protected-trash-power":
      reviewedSelfTrashPowerKoProtectionDefinition(protectedPower),
  };
  const p2State = must(state.players[p2], "p2");
  p2State.trash = trashCards(p2, trashCard, 8);
  const refs = placeCharacters(state, p2, [protectedPower, printedSix]);

  const result = resolvePublicTargetCandidates(
    state,
    publicCharacterRequest({
      player: "opponent",
      filter: { categories: ["character"], currentPower: { max: 6000 } },
    }),
    { sourceControllerId: p1 },
  );

  expect(targetCards(result)).toEqual([refs[1]]);

  p2State.trash = trashCards(p2, trashCard, 4);
  const thresholdResult = resolvePublicTargetCandidates(
    state,
    publicCharacterRequest({
      player: "opponent",
      filter: { categories: ["character"], currentPower: { max: 6000 } },
    }),
    { sourceControllerId: p1 },
  );

  expect(targetCards(thresholdResult)).toEqual([refs[0], refs[1]]);
});
