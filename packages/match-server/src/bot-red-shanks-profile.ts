import type { CardRef, PublicCardView } from "@optcg/types";

import { chooseCharacterOverflowFromProfile } from "./bot-character-overflow.js";
import type {
  BotCardRole,
  BotDeckProfileData,
  BotEffectPolicy,
} from "./bot-profile-types.js";
import {
  choosePowerReductionTarget,
  powerReductionBehaviorsFromProfile,
  scorePowerReductionAction,
} from "./bot-power-reduction-behavior.js";
import type {
  BotActionContext,
  BotBehaviorProfile,
  BotDecisionChoice,
  BotDecisionContext,
} from "./bot-types.js";

const redShanksSearchPriority = [
  "OP16-012",
  "OP09-004",
  "OP06-007",
  "ST23-002",
  "OP12-008",
  "OP09-011",
  "OP09-020",
  "OP09-002",
  "OP09-009",
  "OP09-014",
  "OP16-018",
] as const;

export const redShanksProfileData: BotDeckProfileData = {
  id: "red-shanks",
  cardRoles: {
    "OP16-012": ["cheat-enabler", "preserve"],
    "OP06-007": ["cheat-target", "preserve"],
    "OP09-004": ["cheat-target", "preserve"],
    "ST23-002": ["cheat-target", "preserve"],
    "OP12-008": ["cheat-target", "preserve"],
    "OP09-002": ["searcher"],
    "OP09-020": ["searcher"],
    "PRB02-002": ["searcher"],
    "OP09-011": ["power-reduction"],
  },
  searchPriorities: {
    "OP09-002": redShanksSearchPriority,
    "OP09-020": redShanksSearchPriority,
    "PRB02-002": redShanksSearchPriority,
  },
  preserveCards: ["OP16-012", "OP06-007", "OP09-004", "ST23-002", "OP12-008"],
  cheatTargets: [
    {
      sourceCardId: "OP16-012",
      cardId: "OP06-007",
      baseScore: 250,
      bonusWhenOpponentHasRemovableCharacter: 150,
    },
    { sourceCardId: "OP16-012", cardId: "OP09-004", baseScore: 350 },
    { sourceCardId: "OP16-012", cardId: "ST23-002", baseScore: 300 },
    { sourceCardId: "OP16-012", cardId: "OP12-008", baseScore: 100 },
  ],
  effectPolicies: [
    {
      sourceCardId: "OP09-011",
      kind: "powerReduction",
      amount: 2_000,
      target: "opponentCharacter",
      restsSource: true,
    },
    {
      sourceCardId: "OP09-001",
      kind: "powerReduction",
      amount: 1_000,
      target: "currentAttacker",
      restsSource: false,
    },
  ],
  playScores: {
    "OP09-002": 8,
    "OP09-020": 9,
    "PRB02-002": 10,
    "OP09-011": 18,
  },
  cheatEnablerHardCastScores: {
    "OP16-012": 85,
  },
};

const actionCard = ({
  action,
  relatedCards,
}: BotActionContext): PublicCardView | undefined => {
  const placementId = action.placement?.instanceId;
  return placementId === undefined
    ? undefined
    : relatedCards.find((card) => card.instanceId === placementId);
};

const attachedDonCount = (card: PublicCardView | undefined): number =>
  card?.attachedDonCount ?? 0;

const botDonOnField = ({ snapshot, botPlayerId }: BotActionContext): number => {
  const self = snapshot.players[botPlayerId]?.view.self;
  if (self === undefined) {
    return 0;
  }
  return (
    self.costArea.length +
    attachedDonCount(self.leader) +
    self.characters.reduce(
      (total, character) => total + attachedDonCount(character),
      0,
    ) +
    attachedDonCount(self.stage)
  );
};

const profileCardIdsWithRole = (
  profile: BotDeckProfileData,
  role: BotCardRole,
): ReadonlySet<string> =>
  new Set(
    Object.entries(profile.cardRoles)
      .filter(([, roles]) => roles?.includes(role) === true)
      .map(([cardId]) => cardId),
  );

const hasCardInHand = (
  { snapshot, botPlayerId }: BotActionContext,
  cardIds: ReadonlySet<string>,
): boolean =>
  snapshot.players[botPlayerId]?.view.self.hand.some((card) =>
    cardIds.has(String(card.cardId)),
  ) ?? false;

const isCheatLineLive = (
  context: BotActionContext,
  profile: BotDeckProfileData,
): boolean =>
  botDonOnField(context) >= 10 &&
  hasCardInHand(context, profileCardIdsWithRole(profile, "cheat-target"));

const cardPower = (card: PublicCardView | undefined): number | undefined =>
  card?.currentPower ?? card?.printedPower;

const findVisibleBattleCard = (
  context: BotDecisionContext,
  instanceId: string,
): PublicCardView | undefined => {
  const view = context.snapshot.players[context.botPlayerId]?.view;
  if (view === undefined) {
    return undefined;
  }
  return [
    view.self.leader,
    ...view.self.characters,
    view.opponent.leader,
    ...view.opponent.characters,
  ].find((card) => card.instanceId === instanceId);
};

const counterPowerNeededToStop = (
  attackerPower: number,
  targetPower: number,
): number => Math.max(0, attackerPower - targetPower + 1_000);

const visibleHandCounterPower = ({
  snapshot,
  botPlayerId,
}: BotDecisionContext): number =>
  snapshot.players[botPlayerId]?.view.self.hand.reduce(
    (total, card) => total + (card.printedCounter ?? 0),
    0,
  ) ?? 0;

const attackTargetScore = ({
  action,
  snapshot,
  botPlayerId,
}: BotActionContext): number | undefined => {
  const targetId = action.attack?.targetInstanceId;
  if (targetId === undefined) {
    return undefined;
  }
  const opponent = snapshot.players[botPlayerId]?.view.opponent;
  if (opponent === undefined) {
    return undefined;
  }
  if (
    opponent.characters.some((character) => character.instanceId === targetId)
  ) {
    return 35;
  }
  return opponent.leader.instanceId === targetId ? 45 : undefined;
};

const hasOpponentRemovableCharacter = ({
  snapshot,
  botPlayerId,
}: BotDecisionContext): boolean =>
  snapshot.players[botPlayerId]?.view.opponent.characters.some(
    (character) =>
      (character.currentPower ?? character.printedPower ?? 0) <= 10_000,
  ) ?? false;

const sourceCardId = (context: BotDecisionContext): string | undefined => {
  const decision =
    context.snapshot.players[context.botPlayerId]?.view.pendingDecision;
  return decision?.source?.cardId === undefined
    ? undefined
    : String(decision.source.cardId);
};

const activePowerReductionPolicy = (
  context: BotDecisionContext,
  profile: BotDeckProfileData,
): BotEffectPolicy | undefined => {
  const source = sourceCardId(context);
  return profile.effectPolicies.find(
    (policy) => policy.sourceCardId === source,
  );
};

const chooseLeaderDefenseFromProfile = (
  context: BotDecisionContext,
  profile: BotDeckProfileData,
): BotDecisionChoice | undefined => {
  const decision =
    context.snapshot.players[context.botPlayerId]?.view.pendingDecision;
  const policy = activePowerReductionPolicy(context, profile);
  if (
    decision === undefined ||
    decision.playerId !== context.botPlayerId ||
    decision.type !== "chooseOptionalActivation" ||
    policy?.target !== "currentAttacker"
  ) {
    return undefined;
  }
  const battle = context.snapshot.players[context.botPlayerId]?.view.battle;
  if (battle === undefined) {
    return undefined;
  }
  const attackerPower = cardPower(
    findVisibleBattleCard(context, String(battle.attacker.instanceId)),
  );
  const targetPower = cardPower(
    findVisibleBattleCard(context, String(battle.currentTarget.instanceId)),
  );
  if (attackerPower === undefined || targetPower === undefined) {
    return undefined;
  }
  const currentCounterNeeded = counterPowerNeededToStop(
    attackerPower,
    targetPower,
  );
  if (currentCounterNeeded === 0) {
    return undefined;
  }
  const reducedCounterNeeded = counterPowerNeededToStop(
    attackerPower - policy.amount,
    targetPower,
  );
  const view = context.snapshot.players[context.botPlayerId]?.view;
  const isLeaderTarget =
    view?.self.leader.instanceId === battle.currentTarget.instanceId;
  if (
    reducedCounterNeeded > 0 &&
    (!isLeaderTarget ||
      view.self.life.count > 2 ||
      reducedCounterNeeded >= currentCounterNeeded ||
      visibleHandCounterPower(context) < reducedCounterNeeded)
  ) {
    return undefined;
  }
  return {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "optionalActivation", choice: "activate" },
  };
};

const cheatTargetScore = (
  card: CardRef,
  context: BotDecisionContext,
  profile: BotDeckProfileData,
): number => {
  const source = sourceCardId(context);
  const policy = profile.cheatTargets.find(
    (target) =>
      target.sourceCardId === source && target.cardId === String(card.cardId),
  );
  if (policy === undefined) {
    return 0;
  }
  const removableBonus =
    policy.bonusWhenOpponentHasRemovableCharacter !== undefined &&
    hasOpponentRemovableCharacter(context)
      ? policy.bonusWhenOpponentHasRemovableCharacter
      : 0;
  return policy.baseScore + removableBonus;
};

export const chooseCheatTargetFromProfile = (
  context: BotDecisionContext,
  profile: BotDeckProfileData,
): BotDecisionChoice | undefined => {
  const decision =
    context.snapshot.players[context.botPlayerId]?.view.pendingDecision;
  const source = sourceCardId(context);
  if (
    decision === undefined ||
    decision.playerId !== context.botPlayerId ||
    decision.type !== "selectCards" ||
    source === undefined
  ) {
    return undefined;
  }
  const allowed = new Set(
    profile.cheatTargets
      .filter((target) => target.sourceCardId === source)
      .map((target) => target.cardId),
  );
  if (allowed.size === 0) {
    return undefined;
  }
  const chosen = decision.choices
    .filter(
      (choice) => choice.selectable && allowed.has(String(choice.card.cardId)),
    )
    .sort(
      (left, right) =>
        cheatTargetScore(right.card, context, profile) -
        cheatTargetScore(left.card, context, profile),
    )[0]?.card;
  return chosen === undefined
    ? undefined
    : {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "cards", cards: [chosen] },
      };
};

export const chooseSearchResultFromProfile = (
  context: BotDecisionContext,
  profile: BotDeckProfileData,
): BotDecisionChoice | undefined => {
  const decision =
    context.snapshot.players[context.botPlayerId]?.view.pendingDecision;
  const source = sourceCardId(context);
  if (
    decision === undefined ||
    decision.playerId !== context.botPlayerId ||
    decision.type !== "selectCards" ||
    source === undefined
  ) {
    return undefined;
  }
  const priorities = profile.searchPriorities[source];
  if (priorities === undefined) {
    return undefined;
  }
  const priorityScore = new Map(
    priorities.map((cardId, index) => [cardId, priorities.length - index]),
  );
  const chosen = decision.choices
    .filter((choice) => choice.selectable)
    .sort(
      (left, right) =>
        (priorityScore.get(String(right.card.cardId)) ?? 0) -
        (priorityScore.get(String(left.card.cardId)) ?? 0),
    )[0]?.card;
  return chosen === undefined
    ? undefined
    : {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "cards", cards: [chosen] },
      };
};

export const createBotBehaviorProfile = (
  profile: BotDeckProfileData,
): BotBehaviorProfile => {
  const powerReductionBehaviors = powerReductionBehaviorsFromProfile(profile);
  return {
    id: profile.id,
    scoreAction(context) {
      if (context.action.type === "declareAttack") {
        return attackTargetScore(context);
      }
      const powerReductionScore = scorePowerReductionAction(
        context,
        powerReductionBehaviors,
      );
      if (powerReductionScore !== undefined) {
        return powerReductionScore;
      }
      if (context.action.type !== "playCard") {
        return undefined;
      }
      const card = actionCard(context);
      if (card === undefined) {
        return undefined;
      }
      const cardId = String(card.cardId);
      if (
        profile.cardRoles[cardId]?.includes("cheat-enabler") === true &&
        isCheatLineLive(context, profile)
      ) {
        return -80;
      }
      return (
        profile.cheatEnablerHardCastScores?.[cardId] ??
        profile.playScores?.[cardId]
      );
    },
    chooseDecision(context) {
      return (
        chooseLeaderDefenseFromProfile(context, profile) ??
        choosePowerReductionTarget(context, powerReductionBehaviors) ??
        chooseCharacterOverflowFromProfile(context, profile) ??
        chooseCheatTargetFromProfile(context, profile) ??
        chooseSearchResultFromProfile(context, profile)
      );
    },
  };
};

export const redShanksBotProfile =
  createBotBehaviorProfile(redShanksProfileData);
