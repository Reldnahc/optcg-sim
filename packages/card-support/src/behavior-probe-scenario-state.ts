import {
  createInitialState,
  reindexZoneCards,
  respondToMulliganDecision,
  startMulliganFlow,
} from "@optcg/engine-core";
import type {
  CardFilter,
  CardId,
  CardInstance,
  Condition,
  Cost,
  Effect,
  EffectBlock,
  EffectDefinition,
  EngineEventId,
  EffectId,
  GameState,
  InstanceId,
  MatchCardManifest,
  MatchId,
  OptionalCost,
  PlayerId,
  PlayerRef,
  ResolvedCard,
} from "@optcg/types";

import { supportForFilterEntryPoint } from "./behavior-probe-filter-entrypoint-support.js";
import { enforceLowFieldCountConditions } from "./behavior-probe-low-field-count.js";
import {
  profileForCardFilter,
  profileForLeaderFilters,
} from "./behavior-probe-scenario-profiles.js";
import {
  effectSelectsRestedDon,
  effectUsesAttachedDonCards,
  effectUsesAttachedDonCount,
  hasCondition,
} from "./behavior-probe-scenario-effect-analysis.js";
import { collectLeaderConditionFilters } from "./behavior-probe-scenario-leader-filters.js";
import { resolvedProbeCard } from "./behavior-probe-resolved-card.js";
import {
  installProbeSourceConditionMetadata,
  profileForSourceFilters,
} from "./behavior-probe-source-metadata.js";
import {
  addProbeDeckCards,
  reindexHand,
} from "./behavior-probe-zone-helpers.js";

export { resolvedProbeCard } from "./behavior-probe-resolved-card.js";
export {
  ensureProbePlayerDeckCount,
  ensureProbePlayerHandCount,
} from "./behavior-probe-zone-helpers.js";

const p1 = "p1" as PlayerId,
  p2 = "p2" as PlayerId;
const probeCardId = "probe-card" as CardId,
  probeDefinitionId = "probe-card.behavior-probe";
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
  installScenarioLeaderMetadata(active, p1, [
    ...collectLeaderConditionFilters(input.definition.effects, "self"),
    ...input.setupFilters,
  ]);
  installScenarioLeaderMetadata(active, p2, [
    ...collectLeaderConditionFilters(input.definition.effects, "opponent"),
    ...input.setupFilters,
  ]);
  addProbeDeckCards(active, p1, Math.max(4, input.setupFilters.length));
  installScenarioDeckMetadata(active, p1, input.setupFilters);
  installScenarioDeckMetadata(active, p2, []);
  installScenarioLifeMetadata(active, p1);
  installScenarioLifeMetadata(active, p2);
  installScenarioFieldMetadata(active, p1, input.setupFilters);
  installScenarioFieldMetadata(active, p2, input.setupFilters);
  installScenarioConditionFacts(active, input.definition.effects);
  installScenarioEffectZoneFacts(active, input.definition.effects);
  return active;
};

export const fieldProbeSource = (
  player: NonNullable<GameState["players"][PlayerId]>,
  params: {
    readonly attachedDon?: readonly InstanceId[];
    readonly turnPlayed?: number;
  } = {},
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
      playerId: player.playerId,
      slot: "character",
      index: player.characters.length,
    },
    state: "active",
    attachedDon: [...(params.attachedDon ?? handCard.attachedDon)],
    turnPlayed: params.turnPlayed ?? 0,
  };
  player.hand = reindexHand(
    player.hand.filter((_, index) => index !== handIndex),
    player.playerId,
  );
  player.characters = [...player.characters, source];
  return source;
};

export const leaderProbeSource = (state: GameState): CardInstance => {
  const player = must(state.players[p1], `player ${String(p1)}`);
  const source: CardInstance = {
    ...player.leader,
    cardId: probeCardId,
  };
  player.leader = source;
  return source;
};

export const configureProbeFieldSourceForScenario = (
  state: GameState,
  source: CardInstance,
  effects: readonly EffectBlock[],
): void => {
  installProbeSourceConditionMetadata(state, source, effects);
  enforceLowFieldCountConditions(state, source, effects);
  if (
    effects.some((block) =>
      hasCondition(block.condition, "sourcePlayedThisTurn"),
    )
  ) {
    source.turnPlayed = state.turn.globalTurn;
  }
  if (
    effects.some(
      (block) =>
        hasCondition(block.condition, "attachedDonCount") ||
        effectUsesAttachedDonCount(block.effect) ||
        effectUsesAttachedDonCards(block.effect),
    )
  ) {
    attachProbeDonToSource(state, source, 5);
  }
  if (effects.some((block) => effectSelectsRestedDon(block.effect))) {
    const player = state.players[p1];
    if (player !== undefined) {
      const restedDonCount = Math.min(
        player.costArea.length,
        Math.max(1, player.characters.length + 1),
      );
      player.costArea = player.costArea.map((card, index) => ({
        ...card,
        state: index < restedDonCount ? "rested" : (card.state ?? "active"),
      }));
    }
  }
};

const attachProbeDonToSource = (
  state: GameState,
  source: CardInstance,
  count: number,
): void => {
  const player = state.players[source.controller];
  if (player === undefined) {
    return;
  }
  const attachedIds = player.costArea
    .slice(0, count)
    .map((card) => card.instanceId);
  source.attachedDon = attachedIds;
  const attachedIdSet = new Set(attachedIds);
  player.costArea = player.costArea.map((card) => {
    if (!attachedIdSet.has(card.instanceId)) {
      return card;
    }
    const attached = { ...card };
    delete attached.state;
    return attached;
  });
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

const installScenarioLifeMetadata = (
  state: GameState,
  playerId: PlayerId,
): void => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  for (const life of player.life) {
    state.cardManifest.cards[life.card.cardId] =
      state.cardManifest.cards[life.card.cardId] ??
      resolvedProbeCard({
        cardId: life.card.cardId,
        category: "character",
        effectText: "",
      });
  }
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
        state: filter.state === "rested" ? "rested" : "active",
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
          state: filter.state === "rested" ? "rested" : "active",
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
  readonly state?: CardInstance["state"];
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
  state: params.state ?? "active",
  attachedDon: [],
  turnPlayed: 0,
});

const installScenarioConditionFacts = (
  state: GameState,
  effects: readonly EffectBlock[],
): void => {
  for (const effect of effects) {
    installConditionFact(state, effect.condition);
    installEffectConditionFacts(state, effect.effect);
  }
};

const installEffectConditionFacts = (
  state: GameState,
  effect: Effect,
): void => {
  if (effect.type === "conditional") {
    installConditionFact(state, effect.if);
    installEffectConditionFacts(state, effect.then);
    if (effect.else !== undefined) {
      installEffectConditionFacts(state, effect.else);
    }
    return;
  }
  if (effect.type === "sequence") {
    for (const segment of effect.effects) {
      if (segment.effect.type === "payCost") {
        installCostFacts(state, segment.effect.cost);
      } else {
        installEffectConditionFacts(state, segment.effect);
      }
    }
    return;
  }
  if (effect.type === "choice") {
    for (const option of effect.options) {
      installEffectConditionFacts(state, option.effect);
    }
    return;
  }
  if (effect.type === "delayed" || effect.type === "forEachSavedTarget") {
    installEffectConditionFacts(state, effect.effect);
    return;
  }
  if (effect.type === "replacement") {
    installEffectConditionFacts(state, effect.instead);
  }
};

const installConditionFact = (
  state: GameState,
  condition: Condition | undefined,
): void => {
  if (condition === undefined) {
    return;
  }
  if (condition.type === "and" || condition.type === "or") {
    for (const child of condition.conditions) {
      installConditionFact(state, child);
    }
    return;
  }
  if (condition.type === "not") {
    return;
  }
  if (condition.type === "turnCount") {
    for (const playerId of resolvePlayerRefsForSetup(condition.player)) {
      setPlayerTurnCount(
        state,
        playerId,
        passingCount(condition.op, condition.value),
      );
    }
    return;
  }
  if (condition.type === "lifeCount") {
    for (const playerId of resolvePlayerRefsForSetup(condition.player)) {
      setPlayerLifeCount(
        state,
        playerId,
        passingCount(condition.op, condition.value),
      );
    }
    return;
  }
  if (condition.type === "trashCount") {
    for (const playerId of resolvePlayerRefsForSetup(condition.player)) {
      addProbeTrashCards(
        state,
        playerId,
        passingCount(condition.op, condition.value),
        condition.filter,
      );
    }
    return;
  }
  if (condition.type === "eventHistory") {
    const count = passingCount(condition.op, condition.value);
    for (const playerId of resolvePlayerRefsForSetup(condition.player)) {
      for (let index = 0; index < count; index += 1) {
        const cardId =
          `probe-history-${String(playerId)}-${String(index)}` as CardId;
        const profile =
          condition.filter === undefined
            ? { category: "event" as const }
            : profileForCardFilter(condition.filter, index);
        state.cardManifest.cards[cardId] = resolvedProbeCard({
          cardId,
          category: profile.category ?? "event",
          effectText: "",
          profile,
        });
        state.eventJournal.push({
          id: `event:behavior-probe-history:${String(playerId)}:${String(index)}` as EngineEventId,
          seq: state.eventJournal.length + 1,
          type: condition.event,
          payload: {
            playerId,
            instanceId: `${String(cardId)}:instance`,
            cardId,
            category: profile.category ?? "event",
            turnNumber: state.turn.globalTurn,
          },
          visibility: { type: "public" },
          createdAtStateSeq: state.seq,
        });
      }
    }
  }
};

const setPlayerLifeCount = (
  state: GameState,
  playerId: PlayerId,
  count: number,
): void => {
  const player = state.players[playerId];
  if (player === undefined) {
    return;
  }
  while (player.life.length < count) {
    const deckCard = player.deck.shift();
    if (deckCard === undefined) {
      break;
    }
    player.life.push({
      card: {
        ...deckCard,
        zone: {
          zone: "life",
          playerId,
          slot: "life",
          index: player.life.length,
        },
      },
      faceUp: false,
    });
  }
  player.deck = reindexZoneCards(player.deck, "deck", playerId, "deck");
  player.life = player.life.slice(0, count).map((life, index) => ({
    ...life,
    card: {
      ...life.card,
      zone: {
        zone: "life",
        playerId,
        slot: "life",
        index,
      },
    },
  }));
};

export const ensureProbePlayerLifeCount = (
  state: GameState,
  playerId: PlayerId,
  count: number,
): void => {
  const player = state.players[playerId];
  if (player === undefined || player.life.length >= count) {
    return;
  }
  setPlayerLifeCount(state, playerId, count);
};

const installCostFacts = (
  state: GameState,
  cost: OptionalCost | Cost,
): void => {
  if (cost.type === "sequence") {
    for (const child of cost.costs) {
      installCostFacts(state, child);
    }
    return;
  }
  if (cost.type === "trashFromHand" || cost.type === "revealFromHand") {
    const playerId = resolvePlayerRef(cost.chooser);
    if (playerId !== undefined) {
      installHandCostCards(state, playerId, cost.count, cost.filter);
    }
    return;
  }
  if (
    cost.type === "trashFromField" ||
    cost.type === "koFromField" ||
    cost.type === "restFromField"
  ) {
    const playerId = resolvePlayerRef(cost.chooser);
    if (playerId !== undefined) {
      addCardsForZone(
        state,
        playerId,
        "characterArea",
        cost.count,
        cost.filter,
      );
    }
    return;
  }
  if (cost.type === "moveCards") {
    const playerId = resolvePlayerRef(cost.from.player);
    if (playerId !== undefined) {
      addCardsForZone(state, playerId, cost.from.zone, cost.count, cost.filter);
    }
    return;
  }
  if (cost.type === "setLifeFaceUp" || cost.type === "turnLifeFaceUp") {
    const playerId = resolvePlayerRef(cost.player);
    const player = playerId === undefined ? undefined : state.players[playerId];
    if (player === undefined) {
      return;
    }
    const life = player.life[0];
    if (life !== undefined) {
      player.life[0] = {
        ...life,
        faceUp: cost.type === "setLifeFaceUp" ? !cost.faceUp : false,
      };
    }
  }
};

const installHandCostCards = (
  state: GameState,
  playerId: PlayerId,
  count: number,
  filter: CardFilter | undefined,
): void => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  const mutableHand = [...player.hand];
  const usableIndexes = mutableHand
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card.cardId !== probeCardId)
    .map(({ index }) => index);
  while (usableIndexes.length < count) {
    const index = mutableHand.length;
    const cardId = `probe-hand-${String(playerId)}-${String(index)}` as CardId;
    mutableHand.push({
      instanceId:
        `probe-hand-${String(playerId)}-${String(index)}:instance` as InstanceId,
      cardId,
      owner: playerId,
      controller: playerId,
      zone: {
        zone: "hand",
        playerId,
        slot: "hand",
        index,
      },
      state: "active",
      attachedDon: [],
      turnPlayed: 0,
    });
    usableIndexes.push(index);
  }
  for (let offset = 0; offset < count; offset += 1) {
    const index = usableIndexes[offset];
    if (index === undefined) {
      continue;
    }
    const card = mutableHand[index];
    if (card === undefined) {
      continue;
    }
    const profile =
      filter === undefined ? {} : profileForCardFilter(filter, offset);
    const cardId = profile.cardId ?? card.cardId;
    mutableHand[index] = {
      ...card,
      cardId,
    };
    const support = supportForFilterEntryPoint(
      state,
      cardId,
      filter?.effectEntryPoint,
    );
    state.cardManifest.cards[cardId] = resolvedProbeCard({
      cardId,
      category: profile.category ?? "character",
      effectText: "",
      profile,
      ...(support === undefined ? {} : { support }),
    });
  }
  player.hand = reindexHand(mutableHand, playerId);
};

const installScenarioEffectZoneFacts = (
  state: GameState,
  effects: readonly EffectBlock[],
): void => {
  for (const block of effects) {
    installEffectZoneFacts(state, block.effect);
  }
};

const installEffectZoneFacts = (state: GameState, effect: Effect): void => {
  if (effect.type === "moveSelected") {
    addCardsForZone(state, p2, effect.from, 2, undefined);
    return;
  }
  if (effect.type === "selectCards") {
    const count = effect.max === "available" ? 2 : Math.max(1, effect.max);
    if (effect.zone !== undefined) {
      const playerId = resolvePlayerRef(effect.player) ?? p1;
      addCardsForZone(state, playerId, effect.zone, count, effect.filter);
    }
    for (const zone of effect.zones ?? []) {
      const playerId = resolvePlayerRef(effect.player) ?? p1;
      addCardsForZone(state, playerId, zone, count, effect.filter);
    }
    return;
  }
  if (effect.type === "conditional") {
    installEffectZoneFacts(state, effect.then);
    if (effect.else !== undefined) {
      installEffectZoneFacts(state, effect.else);
    }
    return;
  }
  if (effect.type === "sequence") {
    for (const segment of effect.effects) {
      if (segment.effect.type !== "payCost") {
        installEffectZoneFacts(state, segment.effect);
      }
    }
    return;
  }
  if (effect.type === "choice") {
    for (const option of effect.options) {
      installEffectZoneFacts(state, option.effect);
    }
    return;
  }
  if (effect.type === "delayed" || effect.type === "forEachSavedTarget") {
    installEffectZoneFacts(state, effect.effect);
    return;
  }
  if (effect.type === "replacement") {
    installEffectZoneFacts(state, effect.instead);
  }
};

const addCardsForZone = (
  state: GameState,
  playerId: PlayerId,
  zone: string,
  count: number,
  filter: CardFilter | undefined,
): void => {
  if (zone === "trash") {
    addProbeTrashCards(state, playerId, count, filter);
    return;
  }
  if (zone === "hand") {
    installHandCostCards(state, playerId, count, filter);
    return;
  }
  if (zone === "characterArea" || zone === "stageArea") {
    installScenarioFieldMetadata(
      state,
      playerId,
      Array.from({ length: count }, () => filter).filter(
        (candidate): candidate is CardFilter => candidate !== undefined,
      ),
    );
  }
};

const addProbeTrashCards = (
  state: GameState,
  playerId: PlayerId,
  count: number,
  filter: CardFilter | undefined,
): void => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  const startIndex = player.trash.length;
  const cards = Array.from({ length: count }, (_, offset): CardInstance => {
    const index = startIndex + offset;
    const profile =
      filter === undefined ? {} : profileForCardFilter(filter, index);
    const cardId =
      profile.cardId ??
      (`probe-trash-${String(playerId)}-${String(index)}` as CardId);
    state.cardManifest.cards[cardId] = resolvedProbeCard({
      cardId,
      category: profile.category ?? "character",
      effectText: "",
      profile,
    });
    return {
      instanceId:
        `probe-trash-${String(playerId)}-${String(index)}:instance` as CardInstance["instanceId"],
      cardId,
      owner: playerId,
      controller: playerId,
      zone: {
        zone: "trash",
        playerId,
        slot: "trash",
        index,
      },
      state: "active",
      attachedDon: [],
      turnPlayed: 0,
    };
  });
  player.trash = [...player.trash, ...cards];
};

const passingCount = (
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte",
  value: number,
): number => {
  switch (op) {
    case "gt":
      return value + 1;
    case "gte":
    case "eq":
      return value;
    case "lt":
      return Math.max(0, value - 1);
    case "lte":
      return value;
    case "neq":
      return value + 1;
  }
};

const resolvePlayerRef = (
  player: PlayerRef | "anyPlayer",
): PlayerId | undefined => {
  switch (player) {
    case "opponent":
    case "nonTurnPlayer":
      return p2;
    case "anyPlayer":
      return undefined;
    case "self":
    case "owner":
    case "turnPlayer":
    case "controller":
    default:
      return p1;
  }
};

const resolvePlayerRefsForSetup = (
  player: PlayerRef | "anyPlayer",
): readonly PlayerId[] =>
  player === "anyPlayer" ? [p1, p2] : player === "owner" ? [p1] : [p1, p2];

const setPlayerTurnCount = (
  state: GameState,
  playerId: PlayerId,
  count: number,
): void => {
  state.turn.playerTurnCounts[playerId] = count;
  const player = state.players[playerId];
  if (player !== undefined) {
    player.turnCount = count;
  }
};

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

const probeDonCardIds = (player: "p1" | "p2"): CardId[] =>
  Array.from(
    { length: 10 },
    (_, index) => `probe-${player}-don-${String(index + 1)}` as CardId,
  );

const must = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`Behavior probe missing ${label}.`);
  }
  return value;
};
