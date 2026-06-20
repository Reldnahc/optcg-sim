import {
  createInitialState,
  respondToMulliganDecision,
  startMulliganFlow,
} from "@optcg/engine-core";
import type {
  CardFilter,
  CardId,
  CardInstance,
  Condition,
  EffectBlock,
  EffectDefinition,
  EffectId,
  GameState,
  MatchCardManifest,
  MatchId,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import {
  profileForCardFilter,
  profileForLeaderFilters,
  type ProbeCardProfile,
} from "./behavior-probe-scenario-profiles.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;
const probeCardId = "probe-card" as CardId;
const probeDefinitionId = "probe-card.behavior-probe";

export const setupProbeMainState = (input: {
  readonly category: "leader" | "character" | "event";
  readonly definition: EffectDefinition;
  readonly setupFilters: readonly CardFilter[];
  readonly text: string;
}): GameState => {
  const setup = createInitialState({
    matchId: "behavior-probe-match" as MatchId,
    firstPlayerId: p1,
    rngSeed: "behavior-probe-seed",
    playerOrder: [p1, p2],
    leaderCardIds: {
      [p1]: "probe-leader-p1" as CardId,
      [p2]: "probe-leader-p2" as CardId,
    },
    leaderLifeCounts: {
      [p1]: 2,
      [p2]: 2,
    },
    deckCardIds: {
      [p1]: [
        probeCardId,
        "probe-p1-a" as CardId,
        "probe-p1-b" as CardId,
        "probe-p1-c" as CardId,
        "probe-p1-d" as CardId,
        "probe-p1-e" as CardId,
        "probe-p1-f" as CardId,
        "probe-p1-g" as CardId,
        "probe-p1-h" as CardId,
        "probe-p1-i" as CardId,
      ],
      [p2]: [
        "probe-p2-a" as CardId,
        "probe-p2-b" as CardId,
        "probe-p2-c" as CardId,
        "probe-p2-d" as CardId,
        "probe-p2-e" as CardId,
        "probe-p2-f" as CardId,
        "probe-p2-g" as CardId,
        "probe-p2-h" as CardId,
      ],
    },
    donDeckCardIds: {
      [p1]: probeDonCardIds("p1"),
      [p2]: probeDonCardIds("p2"),
    },
    cardManifest: createProbeManifest(),
    shuffleDecks: false,
  });
  const started = startMulliganFlow(setup);
  const first = respondToMulliganDecision(started.state, {
    type: "respondToDecision",
    decisionId: must(started.state.pendingDecision, "first mulligan").id,
    response: { type: "mulligan", keep: true },
  });
  const active = respondToMulliganDecision(first.state, {
    type: "respondToDecision",
    decisionId: must(first.state.pendingDecision, "second mulligan").id,
    response: { type: "mulligan", keep: true },
  }).state;
  active.turn.phase = "main";
  active.turn.turnPlayerId = p1;
  installActiveDon(active, p1);
  installActiveDon(active, p2);
  installProbeManifest(active, input);
  installScenarioLeaderMetadata(
    active,
    p1,
    collectLeaderConditionFilters(input.definition.effects, "self"),
  );
  installScenarioLeaderMetadata(
    active,
    p2,
    collectLeaderConditionFilters(input.definition.effects, "opponent"),
  );
  addProbeDeckCards(active, p1, Math.max(4, input.setupFilters.length));
  installScenarioDeckMetadata(active, p1, input.setupFilters);
  installScenarioDeckMetadata(active, p2, []);
  installScenarioFieldMetadata(active, p1, input.setupFilters);
  installScenarioFieldMetadata(active, p2, input.setupFilters);
  return active;
};

export const fieldProbeSource = (
  player: NonNullable<GameState["players"][PlayerId]>,
): CardInstance | undefined => {
  const handIndex = player.hand.findIndex(
    (candidate) => candidate.cardId === probeCardId,
  );
  if (handIndex < 0) {
    return undefined;
  }
  const handCard = player.hand[handIndex];
  if (handCard === undefined) {
    return undefined;
  }
  const source: CardInstance = {
    ...handCard,
    zone: {
      zone: "characterArea",
      playerId: p1,
      slot: "character",
      index: player.characters.length,
    },
    state: "active",
    turnPlayed: 0,
  };
  player.hand = reindexHand(
    player.hand.filter((_, index) => index !== handIndex),
    p1,
  );
  player.characters = [...player.characters, source];
  return source;
};

export const installProbeSourceMetadata = (
  state: GameState,
  category: "character" | "leader" | "event",
  filters: readonly CardFilter[],
): void => {
  const resolved = state.cardManifest.cards[probeCardId];
  if (resolved === undefined) {
    return;
  }
  state.cardManifest.cards[probeCardId] = resolvedProbeCard({
    cardId: probeCardId,
    category,
    effectText: resolved.effectText ?? "",
    profile: profileForSourceFilters(filters),
    support: resolved.support,
  });
};

export const installProbeTriggerCostCard = (
  state: GameState,
  player: NonNullable<GameState["players"][PlayerId]>,
): void => {
  const card = player.hand[0];
  if (card === undefined) {
    return;
  }
  const definitionId = `${String(card.cardId)}.behavior-probe-trigger`;
  const definition: EffectDefinition = {
    cardId: card.cardId,
    implementationStatus: "implemented-dsl",
    effects: [
      {
        id: `${String(card.cardId)}:trigger:1` as EffectId,
        category: "auto",
        trigger: { type: "trigger" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "draw",
          player: "self",
          count: 1,
        },
      },
    ],
    metadata: {
      sourceTextHash: "behavior-probe-trigger-source",
      rulesVersion: "behavior-probe",
      effectDefinitionsVersion: "behavior-probe",
      tested: true,
      reviewer: "behavior-probe",
    },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [definitionId]: definition,
  };
  state.cardManifest.cards[card.cardId] = {
    ...(state.cardManifest.cards[card.cardId] ??
      resolvedProbeCard({
        cardId: card.cardId,
        category: "event",
        effectText: "[Trigger] Draw 1 card.",
      })),
    triggerText: "[Trigger] Draw 1 card.",
    support: {
      cardId: card.cardId,
      status: "implemented-dsl",
      tested: true,
      rulesVersion: "behavior-probe",
      cardDataVersion: "behavior-probe",
      sourceTextHash: "behavior-probe-trigger-source",
      behaviorHash: "behavior-probe-trigger-behavior",
      effectDefinitionId: definitionId,
    },
  };
};

const reindexHand = (
  cards: readonly CardInstance[],
  playerId: PlayerId,
): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: {
      zone: "hand",
      playerId,
      slot: "hand",
      index,
    },
  }));

const profileForSourceFilters = (
  filters: readonly CardFilter[],
): ProbeCardProfile => {
  const profiles = filters.map((filter, index) =>
    profileForCardFilter(filter, index),
  );
  const costs = profiles.flatMap((profile) =>
    profile.cost === undefined ? [] : [profile.cost],
  );
  const powers = profiles.flatMap((profile) =>
    profile.power === undefined ? [] : [profile.power],
  );
  const counters = profiles.flatMap((profile) =>
    profile.counter === undefined ? [] : [profile.counter],
  );
  const name = profiles.find((profile) => profile.name !== undefined)?.name;
  return {
    category: "character",
    ...(name === undefined ? {} : { name }),
    colors: uniqueProfileValues(profiles.flatMap((profile) => profile.colors)),
    attributes: uniqueProfileValues(
      profiles.flatMap((profile) => profile.attributes),
    ),
    types: uniqueProfileValues(profiles.flatMap((profile) => profile.types)),
    keywords: uniqueProfileValues(
      profiles.flatMap((profile) => profile.keywords),
    ),
    ...(costs.length === 0 ? {} : { cost: Math.max(...costs) }),
    ...(powers.length === 0 ? {} : { power: Math.max(...powers) }),
    ...(counters.length === 0 ? {} : { counter: Math.max(...counters) }),
  };
};

const uniqueProfileValues = <T>(
  values: readonly (T | undefined)[],
): readonly T[] => [
  ...new Set(values.filter((value): value is T => value !== undefined)),
];

const createProbeManifest = (): MatchCardManifest => ({
  manifestHash: "behavior-probe-manifest",
  source: "manual-test",
  cardDataVersion: "behavior-probe",
  effectDefinitionsVersion: "behavior-probe",
  customHandlerVersion: "behavior-probe",
  banlistVersion: "behavior-probe",
  createdAt: "2026-06-19T00:00:00.000Z",
  cards: {},
});

const installProbeManifest = (
  state: GameState,
  input: {
    readonly category: "leader" | "character" | "event";
    readonly definition: EffectDefinition;
    readonly text: string;
  },
): void => {
  const definition = {
    ...input.definition,
    cardId: probeCardId,
  };
  const support: ResolvedCard["support"] = {
    cardId: probeCardId,
    status: "implemented-dsl",
    tested: true,
    rulesVersion: "behavior-probe",
    cardDataVersion: "behavior-probe",
    sourceTextHash: "behavior-probe-source",
    behaviorHash: "behavior-probe-behavior",
    effectDefinitionId: probeDefinitionId,
  };
  state.cardManifest.effectDefinitionsVersion = "behavior-probe";
  state.cardManifest.effectDefinitions = {
    [probeDefinitionId]: definition,
  };
  state.cardManifest.cards[probeCardId] = resolvedProbeCard({
    cardId: probeCardId,
    category: input.category,
    effectText: input.text,
    support,
  });
};

const installActiveDon = (state: GameState, playerId: PlayerId): void => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  for (const card of player.donDeck) {
    state.cardManifest.cards[card.cardId] = resolvedProbeCard({
      cardId: card.cardId,
      category: "don",
      effectText: "",
    });
  }
  player.costArea = player.donDeck.map((card, index) => ({
    ...card,
    zone: { zone: "costArea", playerId, slot: "cost", index },
    state: index === 0 ? "rested" : "active",
  }));
  player.donDeck = [];
};

const addProbeDeckCards = (
  state: GameState,
  playerId: PlayerId,
  count: number,
): void => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  const cards = Array.from({ length: count }, (_, index): CardInstance => {
    const cardId = `probe-extra-${String(playerId)}-${String(index)}` as CardId;
    state.cardManifest.cards[cardId] = resolvedProbeCard({
      cardId,
      category: "character",
      effectText: "",
    });
    return {
      instanceId:
        `probe-extra-${String(playerId)}-${String(index)}:instance` as CardInstance["instanceId"],
      cardId,
      owner: playerId,
      controller: playerId,
      zone: {
        zone: "deck",
        playerId,
        slot: "deck",
        index: player.deck.length + index,
      },
      state: "active",
      attachedDon: [],
      turnPlayed: 0,
    };
  });
  player.deck = [...player.deck, ...cards];
};

const installScenarioDeckMetadata = (
  state: GameState,
  playerId: PlayerId,
  filters: readonly CardFilter[],
): void => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  const deck = [...player.deck];
  for (const [index, card] of deck.entries()) {
    const filter = filters[index];
    const profile =
      filter === undefined ? {} : profileForCardFilter(filter, index);
    const cardId = profile.cardId ?? card.cardId;
    deck[index] = {
      ...card,
      cardId,
    };
    state.cardManifest.cards[cardId] = resolvedProbeCard({
      cardId,
      category: profile.category ?? "character",
      effectText: "",
      profile,
    });
  }
  player.deck = deck;
};

const installScenarioFieldMetadata = (
  state: GameState,
  playerId: PlayerId,
  filters: readonly CardFilter[],
): void => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  for (const [index, filter] of filters.entries()) {
    const profile = profileForCardFilter(filter, index);
    const category = profile.category ?? "character";
    const cardId =
      profile.cardId ??
      (`probe-field-${String(playerId)}-${String(index)}` as CardId);
    state.cardManifest.cards[cardId] = resolvedProbeCard({
      cardId,
      category,
      effectText: "",
      profile,
    });
    if (category === "stage" && player.stage === undefined) {
      player.stage = probeFieldCard({
        cardId,
        index: 0,
        playerId,
        zone: "stageArea",
      });
      continue;
    }
    if (category !== "character") {
      continue;
    }
    const copies = Math.min(2, 5 - player.characters.length);
    for (let copy = 0; copy < copies; copy += 1) {
      player.characters = [
        ...player.characters,
        probeFieldCard({
          cardId,
          index: player.characters.length,
          playerId,
          zone: "characterArea",
        }),
      ];
    }
  }
};

const probeFieldCard = (params: {
  readonly cardId: CardId;
  readonly index: number;
  readonly playerId: PlayerId;
  readonly zone: "characterArea" | "stageArea";
}): CardInstance => ({
  instanceId:
    `probe-field-${String(params.playerId)}-${params.zone}-${String(params.index)}:instance` as CardInstance["instanceId"],
  cardId: params.cardId,
  owner: params.playerId,
  controller: params.playerId,
  zone: {
    zone: params.zone,
    playerId: params.playerId,
    slot: params.zone === "stageArea" ? "stage" : "character",
    index: params.index,
  },
  state: "active",
  attachedDon: [],
  turnPlayed: 0,
});

const installScenarioLeaderMetadata = (
  state: GameState,
  playerId: PlayerId,
  filters: readonly CardFilter[],
): void => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  const profile = profileForLeaderFilters(filters);
  state.cardManifest.cards[player.leader.cardId] = resolvedProbeCard({
    cardId: player.leader.cardId,
    category: "leader",
    effectText: "",
    profile,
  });
};

const collectLeaderConditionFilters = (
  effects: readonly EffectBlock[],
  player: "self" | "opponent",
): readonly CardFilter[] =>
  uniqueFilters(
    effects.flatMap((block) =>
      collectLeaderConditionFiltersFromCondition(block.condition, player),
    ),
  );

const collectLeaderConditionFiltersFromCondition = (
  condition: Condition | undefined,
  player: "self" | "opponent",
): readonly CardFilter[] => {
  if (condition === undefined) {
    return [];
  }
  if (
    condition.type === "hasCardInZone" &&
    condition.zone === "leaderArea" &&
    condition.player === player
  ) {
    return [condition.filter];
  }
  if (condition.type === "and" || condition.type === "or") {
    return condition.conditions.flatMap((child) =>
      collectLeaderConditionFiltersFromCondition(child, player),
    );
  }
  if (condition.type === "not") {
    return collectLeaderConditionFiltersFromCondition(
      condition.condition,
      player,
    );
  }
  return [];
};

const uniqueFilters = (
  filters: readonly CardFilter[],
): readonly CardFilter[] => {
  const seen = new Set<string>();
  const unique: CardFilter[] = [];
  for (const filter of filters) {
    const key = JSON.stringify(filter);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(filter);
  }
  return unique;
};

const probeDonCardIds = (player: "p1" | "p2"): CardId[] =>
  Array.from(
    { length: 10 },
    (_, index) => `probe-${player}-don-${String(index + 1)}` as CardId,
  );

export const resolvedProbeCard = (params: {
  readonly cardId: CardId;
  readonly category: "leader" | "character" | "event" | "don" | "stage";
  readonly effectText: string;
  readonly profile?: ProbeCardProfile;
  readonly support?: ResolvedCard["support"];
}): ResolvedCard => ({
  cardId: params.cardId,
  language: "en",
  name: params.profile?.name ?? String(params.cardId),
  category: params.category,
  set: "PROBE",
  setName: "Behavior Probe",
  released: true,
  colors:
    params.category === "don" ? [] : [...(params.profile?.colors ?? ["red"])],
  attributes: [...(params.profile?.attributes ?? [])],
  types: [...(params.profile?.types ?? [])],
  printedKeywords: [...(params.profile?.keywords ?? [])],
  variants: [],
  legality: {},
  officialFaq: [],
  errata: [],
  sourceTextHash: "behavior-probe-source",
  behaviorHash: "behavior-probe-behavior",
  support: params.support ?? {
    cardId: params.cardId,
    status: "vanilla-confirmed",
    tested: true,
    rulesVersion: "behavior-probe",
    cardDataVersion: "behavior-probe",
    sourceTextHash: "behavior-probe-source",
    behaviorHash: "behavior-probe-behavior",
  },
  ...(params.category === "character"
    ? {
        cost: params.profile?.cost ?? 0,
        power: params.profile?.power ?? 2000,
      }
    : {}),
  ...(params.category === "leader"
    ? { power: params.profile?.power ?? 5000 }
    : {}),
  ...(params.category === "event" ? { cost: params.profile?.cost ?? 0 } : {}),
  ...(params.profile?.counter === undefined
    ? {}
    : { counter: params.profile.counter }),
  ...(params.effectText.length === 0 ? {} : { effectText: params.effectText }),
});

const must = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`Behavior probe missing ${label}.`);
  }
  return value;
};
