import type {
  CardId,
  EffectDefinition,
  DecisionId,
  EffectId,
  EffectQueueEntry,
  InstanceId,
  QueueEntryId,
  StateSeq,
  TimingWindowId,
} from "@optcg/types";

import { createActiveState, must, p1 } from "./action-test-fixtures.js";
import { resolvedCard } from "./action-test-fixtures.js";

export const toCardId = (value: string): CardId => value as CardId;
export const toDecisionId = (value: string): DecisionId => value as DecisionId;
export const toEffectId = (value: string): EffectId => value as EffectId;
export const toInstanceId = (value: string): InstanceId => value as InstanceId;
export const toQueueEntryId = (value: string): QueueEntryId =>
  value as QueueEntryId;
export const toStateSeq = (value: number): StateSeq => value as StateSeq;
export const toTimingWindowId = (value: string): TimingWindowId =>
  value as TimingWindowId;

export const queuedEffect = (tag: string): EffectQueueEntry => ({
  id: toQueueEntryId(`queue-${tag}`),
  state: "pending",
  timingWindowId: toTimingWindowId("timing-window-1"),
  generation: 1,
  controllerId: p1,
  source: {
    instanceId: toInstanceId(`hidden-instance-${tag}`),
    cardId: toCardId(`hidden-card-${tag}`),
    playerId: p1,
    zone: { zone: "life", playerId: p1, slot: "life", index: 0 },
  },
  sourceSnapshot: {
    instanceId: toInstanceId(`hidden-instance-${tag}`),
    cardId: toCardId(`hidden-card-${tag}`),
    ownerId: p1,
    controllerId: p1,
    zone: { zone: "life", playerId: p1, slot: "life", index: 0 },
    category: "event",
    colors: ["red"],
    keywords: [],
  },
  effectBlockId: toEffectId(`hidden-effect-${tag}`),
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 1,
  queuedAtStateSeq: toStateSeq(1),
  sourcePresencePolicy: "resolveFromLastKnownInformation",
  causedBy: { type: "ruleProcess", name: `hidden-${tag}` },
});

export const makeMainPhaseLegalActionState = () => {
  const state = createActiveState();
  state.turn.phase = "main";
  const turnPlayer = must(state.players[p1], "p1");
  const attachedDon = must(turnPlayer.donDeck[0], "p1 don");
  turnPlayer.donDeck = turnPlayer.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  turnPlayer.costArea = [
    {
      ...attachedDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "active",
    },
  ];
  turnPlayer.characters = [
    {
      ...must(turnPlayer.hand[0], "p1 hand card"),
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 0,
      },
      state: "active",
      attachedDon: [],
    },
  ];
  turnPlayer.hand = turnPlayer.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  return state;
};

export const installActivateMainDrawDefinition = (params: {
  state: ReturnType<typeof createActiveState>;
  sourceCardId: CardId;
  category: "leader" | "character" | "stage";
  definitionId: string;
  effectId: EffectId;
  oncePerTurn?: boolean;
}): EffectDefinition => {
  const definition: EffectDefinition = {
    cardId: params.sourceCardId,
    implementationStatus: "implemented-dsl",
    effects: [
      {
        id: params.effectId,
        category: "activate",
        trigger: { type: "activateMain" },
        sourcePresencePolicy: "mustRemainInSameZone",
        ...(params.oncePerTurn === true ? { oncePerTurn: true } : {}),
        effect: { type: "draw", player: "self", count: 1 },
      },
    ],
    metadata: {
      sourceTextHash: `${params.definitionId}:source`,
      rulesVersion: `${params.definitionId}:rules`,
      effectDefinitionsVersion: "0.1.0",
      tested: true,
      reviewer: "qa-reviewer",
    },
  };
  params.state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  params.state.cardManifest.effectDefinitions = {
    ...params.state.cardManifest.effectDefinitions,
    [params.definitionId]: definition,
  };
  params.state.cardManifest.cards[params.sourceCardId] = resolvedCard({
    cardId: params.sourceCardId,
    category: params.category,
    ...(params.category === "leader" ? { power: 5000 } : {}),
    ...(params.category === "character" ? { cost: 2, power: 3000 } : {}),
    ...(params.category === "stage" ? { cost: 1 } : {}),
    support: {
      status: "implemented-dsl",
      effectDefinitionId: params.definitionId,
      sourceTextHash: definition.metadata.sourceTextHash,
      rulesVersion: definition.metadata.rulesVersion,
      cardDataVersion: params.state.cardManifest.cardDataVersion,
    },
  });
  return definition;
};
