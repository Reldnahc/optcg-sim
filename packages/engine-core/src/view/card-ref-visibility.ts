import type {
  CardInstance,
  CardRef,
  EffectTextSpanId,
  EffectTextTargetLink,
  EventVisibility,
  GameState,
  PlayerId,
  SpotlightEntryCardRefDisclosure,
  SpotlightEntryDisclosure,
} from "@optcg/types";

import { zonesEqual } from "../actions/state.js";

export interface LocatedVisibleCard {
  readonly card: CardInstance;
  readonly playerId: PlayerId;
}

const zoneMatchesIfPresent = (
  expected: CardRef["zone"],
  actual: CardRef["zone"],
): boolean =>
  expected === undefined ||
  (actual !== undefined && zonesEqual(actual, expected));

const cardRefMatchesLocatedCard = (
  ref: CardRef,
  visible: LocatedVisibleCard,
): boolean =>
  ref.instanceId === visible.card.instanceId &&
  ref.cardId === visible.card.cardId &&
  ref.playerId === visible.playerId &&
  zoneMatchesIfPresent(ref.zone, visible.card.zone);

const cardRefMatchesCardRef = (ref: CardRef, visible: CardRef): boolean =>
  ref.instanceId === visible.instanceId &&
  ref.cardId === visible.cardId &&
  ref.playerId === visible.playerId &&
  zoneMatchesIfPresent(ref.zone, visible.zone);

const setupStartVisibleCardRefsForPlayer = (
  state: GameState,
  playerId: PlayerId,
): readonly CardRef[] => {
  const pending = state.pendingDecision;
  if (
    pending === undefined ||
    pending.type !== "selectCards" ||
    pending.playerId !== playerId ||
    pending.request.set === undefined ||
    !String(pending.request.set).startsWith("set:setup-start-of-game:")
  ) {
    return [];
  }
  return pending.candidates.flatMap((candidate) =>
    candidate.visibility.type === "private" &&
    candidate.visibility.playerId === playerId
      ? [candidate.card]
      : [],
  );
};

const isVisibilityVisibleToPlayer = (
  visibility: EventVisibility,
  playerId: PlayerId,
): boolean =>
  visibility.type === "public" ||
  (visibility.type === "private" && visibility.playerId === playerId);

export const visibleCardsForPlayer = (
  state: GameState,
  playerId: PlayerId,
): readonly LocatedVisibleCard[] => {
  const self = state.players[playerId];
  if (self === undefined) {
    return [];
  }
  const opponentId = (Object.keys(state.players) as PlayerId[]).find(
    (id) => id !== playerId,
  );
  const opponent =
    opponentId === undefined ? undefined : state.players[opponentId];

  const visible: LocatedVisibleCard[] = [
    ...self.hand.map((card) => ({ card, playerId: self.playerId })),
    ...self.trash.map((card) => ({ card, playerId: self.playerId })),
    { card: self.leader, playerId: self.playerId },
    ...self.characters.map((card) => ({ card, playerId: self.playerId })),
    ...self.costArea.map((card) => ({ card, playerId: self.playerId })),
    ...self.life
      .filter((lifeCard) => lifeCard.faceUp)
      .map((lifeCard) => ({ card: lifeCard.card, playerId: self.playerId })),
  ];

  if (self.stage !== undefined) {
    visible.push({ card: self.stage, playerId: self.playerId });
  }

  if (opponent !== undefined) {
    visible.push(
      ...opponent.trash.map((card) => ({
        card,
        playerId: opponent.playerId,
      })),
      { card: opponent.leader, playerId: opponent.playerId },
      ...opponent.characters.map((card) => ({
        card,
        playerId: opponent.playerId,
      })),
      ...opponent.costArea.map((card) => ({
        card,
        playerId: opponent.playerId,
      })),
      ...opponent.life
        .filter((lifeCard) => lifeCard.faceUp)
        .map((lifeCard) => ({
          card: lifeCard.card,
          playerId: opponent.playerId,
        })),
    );
    if (opponent.stage !== undefined) {
      visible.push({ card: opponent.stage, playerId: opponent.playerId });
    }
  }

  return visible;
};

export const isCardRefVisibleToPlayer = (
  state: GameState,
  playerId: PlayerId,
  ref: CardRef,
): boolean =>
  visibleCardsForPlayer(state, playerId).some((visible) =>
    cardRefMatchesLocatedCard(ref, visible),
  ) ||
  state.revealedCards.some(
    (record) =>
      isVisibilityVisibleToPlayer(record.visibility, playerId) &&
      record.cards.some((card) => cardRefMatchesCardRef(ref, card)),
  ) ||
  setupStartVisibleCardRefsForPlayer(state, playerId).some((card) =>
    cardRefMatchesCardRef(ref, card),
  );

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const disclosureVisibleToPlayer = (
  visibility: unknown,
  playerId: PlayerId,
): boolean => {
  if (!isObjectRecord(visibility)) {
    return false;
  }
  return (
    visibility["type"] === "public" ||
    (visibility["type"] === "private" && visibility["playerId"] === playerId)
  );
};

const isEntryRefVisibleThroughDisclosure = (
  playerId: PlayerId,
  ref: CardRef,
  role: SpotlightEntryCardRefDisclosure["role"],
  disclosure: SpotlightEntryDisclosure | undefined,
): boolean => {
  const entryRefs = disclosure?.entryRefs;
  return (
    Array.isArray(entryRefs) &&
    entryRefs.some(
      (entryRef) =>
        isObjectRecord(entryRef) &&
        entryRef["role"] === role &&
        entryRef["cardInstanceId"] === ref.instanceId &&
        disclosureVisibleToPlayer(entryRef["visibility"], playerId),
    )
  );
};

const isTargetLinkVisibleThroughDisclosure = (
  playerId: PlayerId,
  ref: CardRef,
  role: {
    readonly type: "targetLink";
    readonly spanId: EffectTextSpanId;
    readonly relation: EffectTextTargetLink["relation"];
  },
  disclosure: SpotlightEntryDisclosure | undefined,
): boolean => {
  const targetLinks = disclosure?.targetLinks;
  return (
    Array.isArray(targetLinks) &&
    targetLinks.some(
      (link) =>
        isObjectRecord(link) &&
        link["spanId"] === role.spanId &&
        link["relation"] === role.relation &&
        link["cardInstanceId"] === ref.instanceId &&
        disclosureVisibleToPlayer(link["visibility"], playerId),
    )
  );
};

export const isSpotlightCardRefVisibleToPlayer = (
  state: GameState,
  playerId: PlayerId,
  ref: CardRef,
  role:
    | SpotlightEntryCardRefDisclosure["role"]
    | {
        readonly type: "targetLink";
        readonly spanId: EffectTextSpanId;
        readonly relation: EffectTextTargetLink["relation"];
      },
  disclosure: SpotlightEntryDisclosure | undefined,
): boolean =>
  isCardRefVisibleToPlayer(state, playerId, ref) ||
  (typeof role === "string"
    ? isEntryRefVisibleThroughDisclosure(playerId, ref, role, disclosure)
    : isTargetLinkVisibleThroughDisclosure(playerId, ref, role, disclosure));
