import { describe, expect, test } from "vitest";

import type {
  CardId,
  CardRef,
  GameState,
  PlayerId,
  TargetRequest,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./canonical-state.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "./action-test-fixtures.js";
import { resolvePublicTargetCandidates } from "./target-selection.js";

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

const publicCharacterRequestWithoutVisibility = (): TargetRequest => {
  return {
    timing: "onResolution",
    chooser: "self",
    player: "self",
    zone: "characterArea",
    min: 1,
    max: 1,
    allowFewerIfUnavailable: false,
  };
};

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

describe("resolvePublicTargetCandidates", () => {
  test("returns deterministic public character candidates matching category and power range", () => {
    const state = createActiveState();
    const low = toCardId("char-low");
    const high = toCardId("char-high");
    const event = toCardId("event-card");
    addManifestCard(state, {
      cardId: low,
      category: "character",
      cost: 2,
      power: 3000,
    });
    addManifestCard(state, {
      cardId: high,
      category: "character",
      cost: 4,
      power: 5000,
    });
    addManifestCard(state, {
      cardId: event,
      category: "event",
      cost: 1,
      power: 5000,
    });
    const refs = placeCharacters(state, p1, [low, high, event]);
    const stateHashBefore = hashCanonicalStateValue(state);

    const request = publicCharacterRequest({
      filter: {
        categories: ["character"],
        power: { min: 4000, max: 6000 },
      },
    });

    const first = resolvePublicTargetCandidates(state, request, {
      sourceControllerId: p1,
    });
    const second = resolvePublicTargetCandidates(state, request, {
      sourceControllerId: p1,
    });

    expect(targetCards(first)).toEqual([refs[1]]);
    expect(second).toEqual(first);
    expect(stateHashBefore).toBe(hashCanonicalStateValue(state));
    expect(first).toEqual({
      ok: true,
      candidates: [{ card: refs[1], visibility: { type: "public" } }],
    });
  });

  test("supports leaderArea and opponent/nonTurnPlayer references with cost equality", () => {
    const state = createActiveState();
    state.turn.turnPlayerId = p1;
    const leader = must(state.players[p2], "p2").leader;
    addManifestCard(state, {
      cardId: leader.cardId,
      category: "leader",
      cost: 0,
      power: 5000,
    });

    const result = resolvePublicTargetCandidates(
      state,
      publicCharacterRequest({
        chooser: "turnPlayer",
        player: "nonTurnPlayer",
        zone: "leaderArea",
        filter: { categories: ["leader"], cost: { op: "eq", value: 0 } },
      }),
      { sourceControllerId: p1 },
    );

    expect(result).toEqual({
      ok: true,
      candidates: [
        {
          card: {
            instanceId: leader.instanceId,
            cardId: leader.cardId,
            playerId: p2,
            zone: leader.zone,
          },
          visibility: { type: "public" },
        },
      ],
    });
  });

  test.each([
    {
      name: "private visibility",
      request: publicCharacterRequest({ visibility: "privateToChooser" }),
      reason: "privateCandidateVisibilityUnsupported",
    },
    {
      name: "omitted visibility",
      request: publicCharacterRequestWithoutVisibility(),
      reason: "ambiguousCandidateVisibility",
    },
    {
      name: "hidden zone",
      request: publicCharacterRequest({ zone: "hand" }),
      reason: "unsupportedZone",
    },
    {
      name: "invalid min max",
      request: publicCharacterRequest({ min: 2, max: 1 }),
      reason: "invalidTargetCount",
    },
    {
      name: "unsupported filter",
      request: publicCharacterRequest({
        filter: { names: ["Monkey D. Luffy"] },
      }),
      reason: "unsupportedFilter",
    },
    {
      name: "unresolved player ref",
      request: publicCharacterRequest({ player: "owner" }),
      reason: "unresolvedPlayerRef",
    },
  ])("fails closed for $name without mutating state", ({ request, reason }) => {
    const state = createActiveState();
    const before = hashCanonicalStateValue(state);

    const result = resolvePublicTargetCandidates(state, request, {
      sourceControllerId: p1,
    });

    expect(result).toEqual({ ok: false, reason });
    expect(hashCanonicalStateValue(state)).toBe(before);
  });

  test("fails closed when manifest metadata is missing for a filtered candidate", () => {
    const state = createActiveState();
    const cardId = toCardId("missing-metadata-character");
    placeCharacters(state, p1, [cardId]);
    const before = hashCanonicalStateValue(state);

    const result = resolvePublicTargetCandidates(
      state,
      publicCharacterRequest({ filter: { categories: ["character"] } }),
      { sourceControllerId: p1 },
    );

    expect(result).toEqual({ ok: false, reason: "missingCardMetadata" });
    expect(hashCanonicalStateValue(state)).toBe(before);
  });
});
