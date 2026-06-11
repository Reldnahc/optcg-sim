import { describe, expect, test } from "vitest";

import type {
  CardId,
  CardRef,
  EffectDefinition,
  GameState,
  PlayerId,
  TargetRequest,
} from "@optcg/types";

import { hashCanonicalStateValue } from "../state/canonical-state.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "../action-test-fixtures.js";
import { cardRef } from "../battle/test-fixtures.js";
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

const setLifeCount = (
  state: GameState,
  playerId: PlayerId,
  count: number,
): void => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  const source = player.deck[0] ?? player.leader;
  player.life = Array.from({ length: count }, (_, index) => ({
    card: {
      ...source,
      instanceId:
        `${String(source.instanceId)}:life:${String(index)}` as typeof source.instanceId,
      zone: { zone: "life", playerId, slot: "life", index },
    },
    faceUp: false,
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
  test("matches attached-DON field filters against host cards", () => {
    const state = createActiveState();
    const attachedHost = toCardId("attached-host");
    const unattached = toCardId("unattached");
    addManifestCard(state, {
      cardId: attachedHost,
      category: "character",
      cost: 4,
      power: 5000,
    });
    addManifestCard(state, {
      cardId: unattached,
      category: "character",
      cost: 4,
      power: 5000,
    });
    const refs = placeCharacters(state, p1, [attachedHost, unattached]);
    const player = must(state.players[p1], "p1");
    const don = must(player.donDeck.shift(), "don");
    player.costArea.push({
      ...don,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "rested",
    });
    const host = must(player.characters[0], "attached host");
    host.attachedDon = [don.instanceId];

    const result = resolvePublicTargetCandidates(
      state,
      publicCharacterRequest({
        filter: { categories: ["character"], attachedDon: { min: 1 } },
      }),
      { sourceControllerId: p1 },
    );

    expect(targetCards(result)).toEqual([refs[0]]);
  });

  test("matches public target candidates with and without reusable effect-entry-point filters", () => {
    const state = createActiveState();
    const attacker = toCardId("has-when-attacking");
    const vanilla = toCardId("without-when-attacking");
    addManifestCard(state, {
      cardId: attacker,
      category: "character",
      cost: 4,
      power: 5000,
      support: {
        status: "implemented-dsl",
        effectDefinitionId: "has-when-attacking-definition",
      },
    });
    addManifestCard(state, {
      cardId: vanilla,
      category: "character",
      cost: 4,
      power: 5000,
    });
    state.cardManifest.effectDefinitions = {
      ...state.cardManifest.effectDefinitions,
      ["has-when-attacking-definition"]: {
        cardId: attacker,
        implementationStatus: "implemented-dsl",
        effects: [
          {
            id: "has-when-attacking:auto-1" as EffectDefinition["effects"][number]["id"],
            category: "auto",
            trigger: { type: "whenAttacking" },
            optional: false,
            oncePerTurn: false,
            sourcePresencePolicy: "mustRemainInSameZone",
            effect: { type: "draw", player: "self", count: 1 },
          },
        ],
        metadata: {
          sourceTextHash: "source-hash",
          rulesVersion: "r1",
          effectDefinitionsVersion: "fixture",
          tested: true,
          reviewer: "qa-reviewer",
        },
      },
    };
    const refs = placeCharacters(state, p1, [attacker, vanilla]);

    const withResult = resolvePublicTargetCandidates(
      state,
      publicCharacterRequest({
        filter: {
          categories: ["character"],
          effectEntryPoint: {
            mode: "with",
            trigger: { type: "whenAttacking" },
          },
        },
      }),
      { sourceControllerId: p1 },
    );
    const withoutResult = resolvePublicTargetCandidates(
      state,
      publicCharacterRequest({
        filter: {
          categories: ["character"],
          effectEntryPoint: {
            mode: "without",
            trigger: { type: "whenAttacking" },
          },
        },
      }),
      { sourceControllerId: p1 },
    );

    expect(targetCards(withResult)).toEqual([refs[0]]);
    expect(targetCards(withoutResult)).toEqual([refs[1]]);
  });

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

  test("distinguishes current power from printed/base power filters", () => {
    const state = createActiveState();
    const printedLow = toCardId("printed-low");
    const reducedHigh = toCardId("reduced-high");
    addManifestCard(state, {
      cardId: printedLow,
      category: "character",
      cost: 2,
      power: 3000,
    });
    addManifestCard(state, {
      cardId: reducedHigh,
      category: "character",
      cost: 4,
      power: 5000,
    });
    const player = must(state.players[p1], "p1");
    addManifestCard(state, {
      cardId: player.leader.cardId,
      category: "leader",
      cost: 0,
      power: 5000,
    });
    const opponent = must(state.players[p2], "p2");
    addManifestCard(state, {
      cardId: opponent.leader.cardId,
      category: "leader",
      cost: 0,
      power: 5000,
    });
    const refs = placeCharacters(state, p1, [printedLow, reducedHigh]);
    const highCharacter = must(player.characters[1], "reduced high character");
    state.continuousEffects.push({
      id: "current-power-targeting-reduction",
      source: cardRef(player.leader, p1),
      sourceSnapshot: {
        instanceId: player.leader.instanceId,
        cardId: player.leader.cardId,
        ownerId: p1,
        controllerId: p1,
        zone: player.leader.zone,
        category: "leader",
        colors: ["yellow"],
        power: 5000,
        keywords: [],
      },
      controller: p1,
      modifier: {
        layer: "powerAdd",
        target: {
          type: "exactCard",
          card: cardRef(highCharacter, p1),
          binding: {
            family: "selectedTargets",
            saveResultAs: "test:current-power-targeting",
          },
          createdAtStateSeq: state.seq,
        },
        operation: { type: "addPower", value: -3000 },
      },
      duration: { type: "thisTurn" },
      createdBy: { type: "ruleProcess", name: "test" },
      createdAtStateSeq: state.seq,
    });

    const currentPowerResult = resolvePublicTargetCandidates(
      state,
      publicCharacterRequest({
        filter: { categories: ["character"], currentPower: { max: 3000 } },
      }),
      { sourceControllerId: p1 },
    );
    const basePowerResult = resolvePublicTargetCandidates(
      state,
      publicCharacterRequest({
        filter: { categories: ["character"], power: { max: 3000 } },
      }),
      { sourceControllerId: p1 },
    );

    expect(targetCards(currentPowerResult)).toEqual([refs[0], refs[1]]);
    expect(targetCards(basePowerResult)).toEqual([refs[0]]);
  });

  test("distinguishes current cost from printed/base cost filters", () => {
    const state = createActiveState();
    const reduced = toCardId("current-cost-reduced");
    const printedLow = toCardId("printed-low-cost");
    addManifestCard(state, {
      cardId: reduced,
      category: "character",
      cost: 1,
      power: 5000,
    });
    addManifestCard(state, {
      cardId: printedLow,
      category: "character",
      cost: 0,
      power: 5000,
    });
    const player = must(state.players[p1], "p1");
    addManifestCard(state, {
      cardId: player.leader.cardId,
      category: "leader",
      cost: 0,
      power: 5000,
    });
    addManifestCard(state, {
      cardId: must(state.players[p2], "p2").leader.cardId,
      category: "leader",
      cost: 0,
      power: 5000,
    });
    const refs = placeCharacters(state, p1, [reduced, printedLow]);
    const reducedCharacter = must(player.characters[0], "reduced character");
    state.continuousEffects.push({
      id: "current-cost-targeting-reduction",
      source: cardRef(player.leader, p1),
      sourceSnapshot: {
        instanceId: player.leader.instanceId,
        cardId: player.leader.cardId,
        ownerId: p1,
        controllerId: p1,
        zone: player.leader.zone,
        category: "leader",
        colors: ["black"],
        power: 5000,
        keywords: [],
      },
      controller: p1,
      modifier: {
        layer: "costAdd",
        target: {
          type: "exactCard",
          card: cardRef(reducedCharacter, p1),
          binding: {
            family: "selectedTargets",
            saveResultAs: "test:current-cost-targeting",
          },
          createdAtStateSeq: state.seq,
        },
        operation: { type: "addCost", value: -1 },
      },
      duration: { type: "thisTurn" },
      createdBy: { type: "ruleProcess", name: "test" },
      createdAtStateSeq: state.seq,
    });

    const currentCostResult = resolvePublicTargetCandidates(
      state,
      publicCharacterRequest({
        filter: { categories: ["character"], cost: { op: "eq", value: 0 } },
      }),
      { sourceControllerId: p1 },
    );
    const baseCostResult = resolvePublicTargetCandidates(
      state,
      publicCharacterRequest({
        filter: {
          categories: ["character"],
          baseCost: { op: "eq", value: 0 },
        },
      }),
      { sourceControllerId: p1 },
    );

    expect(targetCards(currentCostResult)).toEqual([refs[0], refs[1]]);
    expect(targetCards(baseCostResult)).toEqual([refs[1]]);
  });

  test("matches public target candidates with dynamic Life-count stat comparisons", () => {
    const state = createActiveState();
    const lowCost = toCardId("life-count-cost-low");
    const highCost = toCardId("life-count-cost-high");
    addManifestCard(state, {
      cardId: lowCost,
      category: "character",
      cost: 3,
      power: 5000,
    });
    addManifestCard(state, {
      cardId: highCost,
      category: "character",
      cost: 4,
      power: 5000,
    });
    const refs = placeCharacters(state, p2, [lowCost, highCost]);
    setLifeCount(state, p2, 3);

    const result = resolvePublicTargetCandidates(
      state,
      publicCharacterRequest({
        player: "opponent",
        filter: {
          categories: ["character"],
          statComparisons: [
            {
              stat: "cost",
              op: "lte",
              value: {
                type: "countMatchingZoneCards",
                player: "opponent",
                zone: "life",
                per: 1,
                multiplier: 1,
              },
            },
          ],
        },
      }),
      { sourceControllerId: p1 },
    );

    expect(targetCards(result)).toEqual([refs[0]]);
  });

  test("uses broad permanent power modifiers when resolving current-power target filters", () => {
    const state = createActiveState();
    const reduced = toCardId("permanent-reduced-character");
    const unaffected = toCardId("unaffected-character");
    addManifestCard(state, {
      cardId: reduced,
      category: "character",
      cost: 4,
      power: 5000,
    });
    addManifestCard(state, {
      cardId: unaffected,
      category: "character",
      cost: 4,
      power: 5000,
    });
    state.cardManifest.cards[reduced] = {
      ...must(state.cardManifest.cards[reduced], "reduced metadata"),
      name: "Permanent Reduced",
    };
    const player = must(state.players[p1], "p1");
    addManifestCard(state, {
      cardId: player.leader.cardId,
      category: "leader",
      cost: 0,
      power: 5000,
    });
    const opponent = must(state.players[p2], "p2");
    addManifestCard(state, {
      cardId: opponent.leader.cardId,
      category: "leader",
      cost: 0,
      power: 5000,
    });
    const refs = placeCharacters(state, p1, [reduced, unaffected]);
    state.continuousEffects.push({
      id: "permanent-current-power-reduction",
      source: cardRef(player.leader, p1),
      sourceSnapshot: {
        instanceId: player.leader.instanceId,
        cardId: player.leader.cardId,
        ownerId: p1,
        controllerId: p1,
        zone: player.leader.zone,
        category: "leader",
        colors: ["yellow"],
        power: 5000,
        keywords: [],
      },
      controller: p1,
      modifier: {
        layer: "powerAdd",
        target: {
          type: "all",
          zone: "characterArea",
          player: "self",
          filter: {
            categories: ["character"],
            names: ["Permanent Reduced"],
          },
        },
        operation: { type: "addPower", value: -4000 },
      },
      duration: { type: "permanent" },
      createdBy: { type: "ruleProcess", name: "test" },
      createdAtStateSeq: state.seq,
    });

    const currentPowerResult = resolvePublicTargetCandidates(
      state,
      publicCharacterRequest({
        filter: { categories: ["character"], currentPower: { max: 3000 } },
      }),
      { sourceControllerId: p1 },
    );

    expect(targetCards(currentPowerResult)).toEqual([refs[0]]);
  });

  test("matches public target candidates through reusable metadata and state filters", () => {
    const state = createActiveState();
    const redElder = toCardId("red-elder");
    const blueElder = toCardId("blue-elder");
    const redStrawHat = toCardId("red-straw-hat");
    addManifestCard(state, {
      cardId: redElder,
      category: "character",
      cost: 5,
      power: 5000,
    });
    addManifestCard(state, {
      cardId: blueElder,
      category: "character",
      cost: 5,
      power: 5000,
    });
    addManifestCard(state, {
      cardId: redStrawHat,
      category: "character",
      cost: 5,
      power: 5000,
    });
    state.cardManifest.cards[redElder] = {
      ...must(state.cardManifest.cards[redElder], "red elder metadata"),
      colors: ["red"],
      types: ["Five Elders"],
    };
    state.cardManifest.cards[blueElder] = {
      ...must(state.cardManifest.cards[blueElder], "blue elder metadata"),
      colors: ["blue"],
      types: ["Five Elders"],
    };
    state.cardManifest.cards[redStrawHat] = {
      ...must(state.cardManifest.cards[redStrawHat], "red straw hat metadata"),
      colors: ["red"],
      types: ["Straw Hat Crew"],
    };
    const refs = placeCharacters(state, p1, [redElder, blueElder, redStrawHat]);
    const player = must(state.players[p1], "p1");
    const first = must(player.characters[0], "first");
    const second = must(player.characters[1], "second");
    const third = must(player.characters[2], "third");
    first.state = "rested";
    second.state = "rested";
    third.state = "active";

    const result = resolvePublicTargetCandidates(
      state,
      publicCharacterRequest({
        filter: {
          categories: ["character"],
          colorsAny: ["red"],
          typesAny: ["Five Elders"],
          state: "rested",
        },
      }),
      { sourceControllerId: p1 },
    );

    expect(targetCards(result)).toEqual([refs[0]]);
  });

  test("matches public target candidates by printed card name", () => {
    const state = createActiveState();
    const named = toCardId("named-character");
    const other = toCardId("other-character");
    addManifestCard(state, {
      cardId: named,
      category: "character",
      cost: 5,
      power: 5000,
    });
    addManifestCard(state, {
      cardId: other,
      category: "character",
      cost: 5,
      power: 5000,
    });
    state.cardManifest.cards[named] = {
      ...must(state.cardManifest.cards[named], "named metadata"),
      name: "Enel",
    };
    state.cardManifest.cards[other] = {
      ...must(state.cardManifest.cards[other], "other metadata"),
      name: "Not Enel",
    };
    const refs = placeCharacters(state, p1, [named, other]);

    const result = resolvePublicTargetCandidates(
      state,
      publicCharacterRequest({ filter: { names: ["Enel"] } }),
      { sourceControllerId: p1 },
    );

    expect(targetCards(result)).toEqual([refs[0]]);
  });

  test("applies branch-local filters in reusable anyOf character targets", () => {
    const state = createActiveState();
    const lowPowerLuffy = toCardId("low-power-luffy");
    const lowPowerWhitebeard = toCardId("low-power-whitebeard");
    const highPowerWhitebeard = toCardId("high-power-whitebeard");
    const unrelatedHighPower = toCardId("unrelated-high-power");
    addManifestCard(state, {
      cardId: lowPowerLuffy,
      category: "character",
      cost: 3,
      power: 5000,
    });
    addManifestCard(state, {
      cardId: lowPowerWhitebeard,
      category: "character",
      cost: 4,
      power: 7000,
    });
    addManifestCard(state, {
      cardId: highPowerWhitebeard,
      category: "character",
      cost: 7,
      power: 8000,
    });
    addManifestCard(state, {
      cardId: unrelatedHighPower,
      category: "character",
      cost: 8,
      power: 9000,
    });
    state.cardManifest.cards[lowPowerLuffy] = {
      ...must(state.cardManifest.cards[lowPowerLuffy], "luffy metadata"),
      name: "Monkey.D.Luffy",
      types: ["Straw Hat Crew"],
    };
    state.cardManifest.cards[lowPowerWhitebeard] = {
      ...must(
        state.cardManifest.cards[lowPowerWhitebeard],
        "low whitebeard metadata",
      ),
      name: "Marco",
      types: ["Whitebeard Pirates"],
    };
    state.cardManifest.cards[highPowerWhitebeard] = {
      ...must(
        state.cardManifest.cards[highPowerWhitebeard],
        "high whitebeard metadata",
      ),
      name: "Edward.Newgate",
      types: ["Whitebeard Pirates"],
    };
    state.cardManifest.cards[unrelatedHighPower] = {
      ...must(
        state.cardManifest.cards[unrelatedHighPower],
        "unrelated metadata",
      ),
      name: "Kaido",
      types: ["Animal Kingdom Pirates"],
    };
    const player = must(state.players[p1], "p1");
    const opponent = must(state.players[p2], "p2");
    addManifestCard(state, {
      cardId: player.leader.cardId,
      category: "leader",
      cost: 0,
      power: 5000,
    });
    addManifestCard(state, {
      cardId: opponent.leader.cardId,
      category: "leader",
      cost: 0,
      power: 5000,
    });
    const refs = placeCharacters(state, p1, [
      lowPowerLuffy,
      lowPowerWhitebeard,
      highPowerWhitebeard,
      unrelatedHighPower,
    ]);

    const result = resolvePublicTargetCandidates(
      state,
      publicCharacterRequest({
        filter: {
          categories: ["character"],
          anyOf: [
            { names: ["Monkey.D.Luffy"] },
            {
              typesAny: ["Whitebeard Pirates"],
              currentPower: { min: 8000 },
            },
          ],
        },
      }),
      { sourceControllerId: p1 },
    );

    expect(targetCards(result)).toEqual([refs[0], refs[2]]);
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
      request: publicCharacterRequest({ filter: { anyOf: [] } }),
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

  test("any-player character requests include both players' public character candidates", () => {
    const state = createActiveState();
    const selfCharacter = toCardId("self-character");
    const opponentCharacter = toCardId("opponent-character");
    addManifestCard(state, {
      cardId: selfCharacter,
      category: "character",
      cost: 2,
    });
    addManifestCard(state, {
      cardId: opponentCharacter,
      category: "character",
      cost: 2,
    });
    const selfRefs = placeCharacters(state, p1, [selfCharacter]);
    const opponentRefs = placeCharacters(state, p2, [opponentCharacter]);

    const result = resolvePublicTargetCandidates(
      state,
      publicCharacterRequest({
        player: "anyPlayer" as TargetRequest["player"],
        filter: { categories: ["character"], cost: { max: 2 } },
      }),
      { sourceControllerId: p1 },
    );

    expect(targetCards(result)).toEqual([selfRefs[0], opponentRefs[0]]);
  });
});
