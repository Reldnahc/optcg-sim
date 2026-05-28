import type {
  CardId,
  CardRef,
  GameState,
  MatchCardManifest,
  PlayerId,
  PlayerView,
  PublicCardView,
} from "@optcg/types";

import type {
  DevCardCatalogEntry,
  DevMatchSnapshot,
  DevPlayerCardCatalog,
  DevVisibleCardCatalog,
} from "./dev-snapshot-types.js";

export const buildLocalDevCardCatalog = (
  state: GameState,
  snapshot: DevMatchSnapshot,
): DevVisibleCardCatalog => {
  const players: Record<PlayerId, DevPlayerCardCatalog> = {};
  for (const playerSnapshot of Object.values(snapshot.players)) {
    addVisibleCatalogEntries(players, state.cardManifest, playerSnapshot.view);
  }
  return { players };
};

export const buildLocalDevCardCatalogForPlayer = (
  state: GameState,
  snapshot: DevMatchSnapshot,
  playerId: PlayerId,
): DevVisibleCardCatalog => {
  const playerSnapshot = snapshot.players[playerId];
  if (playerSnapshot === undefined) {
    return { players: {} };
  }
  const players: Record<PlayerId, DevPlayerCardCatalog> = {};
  addVisibleCatalogEntries(players, state.cardManifest, playerSnapshot.view);
  return { players };
};

const addVisibleCatalogEntryForCardId = (
  players: Record<PlayerId, DevPlayerCardCatalog>,
  manifest: MatchCardManifest,
  owner: PlayerId,
  cardId: CardId,
): void => {
  const manifestCard = manifest.cards[cardId];
  if (manifestCard === undefined) {
    return;
  }
  const ownerCatalog = players[owner] ?? { cards: {} };
  ownerCatalog.cards[cardId] = devCardCatalogEntry(manifestCard);
  players[owner] = ownerCatalog;
};

const addVisibleCatalogEntry = (
  players: Record<PlayerId, DevPlayerCardCatalog>,
  manifest: MatchCardManifest,
  card: PublicCardView | undefined,
): void => {
  if (card === undefined) {
    return;
  }
  addVisibleCatalogEntryForCardId(players, manifest, card.owner, card.cardId);
};

const addVisibleCatalogEntriesForCards = (
  players: Record<PlayerId, DevPlayerCardCatalog>,
  manifest: MatchCardManifest,
  cards: readonly PublicCardView[],
): void => {
  for (const card of cards) {
    addVisibleCatalogEntry(players, manifest, card);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const revealPayloadCardRef = (value: unknown): CardRef | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const instanceId = value["instanceId"];
  const cardId = value["cardId"];
  const playerId = value["playerId"];
  if (
    typeof instanceId !== "string" ||
    typeof cardId !== "string" ||
    typeof playerId !== "string"
  ) {
    return undefined;
  }
  return { instanceId, cardId, playerId } as CardRef;
};

const revealPayloadCards = (payload: unknown): readonly CardRef[] => {
  if (!isRecord(payload)) {
    return [];
  }
  const cards = payload["cards"];
  if (Array.isArray(cards)) {
    return cards.flatMap((card) => {
      const ref = revealPayloadCardRef(card);
      return ref === undefined ? [] : [ref];
    });
  }
  const ref = revealPayloadCardRef(payload);
  return ref === undefined ? [] : [ref];
};

const addVisibleCatalogEntriesForRevealEvents = (
  players: Record<PlayerId, DevPlayerCardCatalog>,
  manifest: MatchCardManifest,
  view: PlayerView,
): void => {
  for (const event of view.events) {
    if (event.type !== "cardRevealed") {
      continue;
    }
    for (const card of revealPayloadCards(event.payload)) {
      addVisibleCatalogEntryForCardId(
        players,
        manifest,
        card.playerId,
        card.cardId,
      );
    }
  }
};

const addVisibleCatalogEntries = (
  players: Record<PlayerId, DevPlayerCardCatalog>,
  manifest: MatchCardManifest,
  view: PlayerView,
): void => {
  addVisibleCatalogEntry(players, manifest, view.self.leader);
  addVisibleCatalogEntry(players, manifest, view.self.stage);
  addVisibleCatalogEntriesForCards(players, manifest, view.self.characters);
  addVisibleCatalogEntriesForCards(players, manifest, view.self.costArea);
  addVisibleCatalogEntriesForCards(players, manifest, view.self.hand);
  addVisibleCatalogEntriesForCards(players, manifest, view.self.trash);
  addVisibleCatalogEntriesForCards(
    players,
    manifest,
    view.self.life.faceUpCards,
  );
  addVisibleCatalogEntry(players, manifest, view.opponent.leader);
  addVisibleCatalogEntry(players, manifest, view.opponent.stage);
  addVisibleCatalogEntriesForCards(players, manifest, view.opponent.characters);
  addVisibleCatalogEntriesForCards(players, manifest, view.opponent.costArea);
  addVisibleCatalogEntriesForCards(players, manifest, view.opponent.trash);
  addVisibleCatalogEntriesForCards(
    players,
    manifest,
    view.opponent.life.faceUpCards,
  );
  for (const reveal of view.revealedCards) {
    for (const card of reveal.cards) {
      addVisibleCatalogEntryForCardId(
        players,
        manifest,
        card.playerId,
        card.cardId,
      );
    }
  }
  addVisibleCatalogEntriesForRevealEvents(players, manifest, view);
};

const devCardCatalogEntry = (
  card: MatchCardManifest["cards"][CardId],
): DevCardCatalogEntry => {
  const firstVariant = card.variants[0];
  const imageUrl =
    firstVariant?.stockImageFull ?? firstVariant?.scanImageDisplay;
  return {
    cardId: card.cardId,
    name: card.name,
    category: card.category,
    ...(card.cost === undefined ? {} : { cost: card.cost }),
    ...(card.power === undefined ? {} : { power: card.power }),
    ...(card.life === undefined ? {} : { life: card.life }),
    ...(card.effectText === undefined ? {} : { effectText: card.effectText }),
    ...(card.triggerText === undefined
      ? {}
      : { triggerText: card.triggerText }),
    ...(imageUrl === undefined ? {} : { imageUrl }),
  };
};
