import type {
  CardId,
  CardRef,
  GameState,
  InstanceId,
  MatchCardManifest,
  PlayerId,
  PlayerView,
  PublicCardView,
  VariantKey,
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
  variantOverrides: Record<InstanceId, VariantKey> = {},
): DevVisibleCardCatalog => {
  const players: Record<PlayerId, DevPlayerCardCatalog> = {};
  for (const playerSnapshot of Object.values(snapshot.players)) {
    addVisibleCatalogEntries(
      players,
      state.cardManifest,
      playerSnapshot.view,
      variantOverrides,
    );
  }
  return { players };
};

export const buildLocalDevCardCatalogForPlayer = (
  state: GameState,
  snapshot: DevMatchSnapshot,
  playerId: PlayerId,
  variantOverrides: Record<InstanceId, VariantKey> = {},
): DevVisibleCardCatalog => {
  const playerSnapshot = snapshot.players[playerId];
  if (playerSnapshot === undefined) {
    return { players: {} };
  }
  const players: Record<PlayerId, DevPlayerCardCatalog> = {};
  addVisibleCatalogEntries(
    players,
    state.cardManifest,
    playerSnapshot.view,
    variantOverrides,
  );
  return { players };
};

const addVisibleCatalogEntryForCard = (
  players: Record<PlayerId, DevPlayerCardCatalog>,
  manifest: MatchCardManifest,
  owner: PlayerId,
  cardId: CardId,
  instanceId: InstanceId | undefined,
  variantOverrides: Record<InstanceId, VariantKey>,
): void => {
  const manifestCard = manifest.cards[cardId];
  if (manifestCard === undefined) {
    return;
  }
  const ownerCatalog = players[owner] ?? { cards: {} };
  ownerCatalog.cards[cardId] = devCardCatalogEntry(manifestCard);
  if (instanceId !== undefined) {
    const instances = ownerCatalog.instances ?? {};
    instances[instanceId] = devCardCatalogEntry(
      manifestCard,
      variantOverrides[instanceId],
    );
    ownerCatalog.instances = instances;
  }
  players[owner] = ownerCatalog;
};

const addVisibleCatalogEntryForCardRef = (
  players: Record<PlayerId, DevPlayerCardCatalog>,
  manifest: MatchCardManifest,
  card: CardRef,
  variantOverrides: Record<InstanceId, VariantKey>,
): void => {
  addVisibleCatalogEntryForCard(
    players,
    manifest,
    card.playerId,
    card.cardId,
    card.instanceId,
    variantOverrides,
  );
};

const addVisibleCatalogEntry = (
  players: Record<PlayerId, DevPlayerCardCatalog>,
  manifest: MatchCardManifest,
  card: PublicCardView | undefined,
  variantOverrides: Record<InstanceId, VariantKey>,
): void => {
  if (card === undefined) {
    return;
  }
  addVisibleCatalogEntryForCard(
    players,
    manifest,
    card.owner,
    card.cardId,
    card.instanceId,
    variantOverrides,
  );
};

const addVisibleCatalogEntriesForCards = (
  players: Record<PlayerId, DevPlayerCardCatalog>,
  manifest: MatchCardManifest,
  cards: readonly PublicCardView[],
  variantOverrides: Record<InstanceId, VariantKey>,
): void => {
  for (const card of cards) {
    addVisibleCatalogEntry(players, manifest, card, variantOverrides);
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
  variantOverrides: Record<InstanceId, VariantKey>,
): void => {
  for (const event of view.events) {
    if (event.type !== "cardRevealed") {
      continue;
    }
    for (const card of revealPayloadCards(event.payload)) {
      addVisibleCatalogEntryForCardRef(
        players,
        manifest,
        card,
        variantOverrides,
      );
    }
  }
};

const cardIdentityEventTypes = new Set([
  "cardMoved",
  "cardPlayed",
  "cardTrashed",
  "cardDiscarded",
  "cardKOd",
  "cardReturned",
  "counterUsed",
  "triggerActivated",
]);

const addVisibleCatalogEntriesForCardIdentityEvents = (
  players: Record<PlayerId, DevPlayerCardCatalog>,
  manifest: MatchCardManifest,
  view: PlayerView,
  variantOverrides: Record<InstanceId, VariantKey>,
): void => {
  for (const event of view.events) {
    if (!cardIdentityEventTypes.has(event.type)) {
      continue;
    }
    const card = revealPayloadCardRef(event.payload);
    if (card === undefined) {
      continue;
    }
    addVisibleCatalogEntryForCardRef(players, manifest, card, variantOverrides);
  }
};

const activeEffectTextSourceFromPayload = (
  payload: unknown,
): CardRef | undefined => {
  if (!isRecord(payload)) {
    return undefined;
  }
  const presentation = payload["presentation"];
  if (!isRecord(presentation)) {
    return undefined;
  }
  return revealPayloadCardRef(presentation["source"]);
};

const addVisibleCatalogEntriesForActiveEffectText = (
  players: Record<PlayerId, DevPlayerCardCatalog>,
  manifest: MatchCardManifest,
  view: PlayerView,
  variantOverrides: Record<InstanceId, VariantKey>,
): void => {
  const activeSources = [
    view.activeEffectText?.source,
    view.pendingDecision?.presentation.activeEffectText?.source,
    ...view.events.flatMap((event) => {
      if (event.type !== "effectResolved") {
        return [];
      }
      const source = activeEffectTextSourceFromPayload(event.payload);
      return source === undefined ? [] : [source];
    }),
  ];
  for (const source of activeSources) {
    if (source === undefined) {
      continue;
    }
    addVisibleCatalogEntryForCardRef(
      players,
      manifest,
      source,
      variantOverrides,
    );
  }
};

const addVisibleCatalogEntriesForPendingDecision = (
  players: Record<PlayerId, DevPlayerCardCatalog>,
  manifest: MatchCardManifest,
  view: PlayerView,
  variantOverrides: Record<InstanceId, VariantKey>,
): void => {
  const pending = view.pendingDecision;
  if (pending?.type === "confirmLifeTrigger") {
    addVisibleCatalogEntryForCardRef(
      players,
      manifest,
      pending.card,
      variantOverrides,
    );
  }
  for (const choice of pending?.presentation.choices ?? []) {
    for (const card of choice.cards ?? []) {
      addVisibleCatalogEntryForCardRef(
        players,
        manifest,
        card,
        variantOverrides,
      );
    }
  }
  if (pending?.type === "selectCards") {
    for (const candidate of pending.candidates) {
      addVisibleCatalogEntryForCardRef(
        players,
        manifest,
        candidate.card,
        variantOverrides,
      );
    }
    for (const choice of pending.choices) {
      addVisibleCatalogEntryForCardRef(
        players,
        manifest,
        choice.card,
        variantOverrides,
      );
    }
  }
  if (pending?.type !== "orderCards") {
    return;
  }
  for (const card of pending.cards) {
    addVisibleCatalogEntryForCardRef(players, manifest, card, variantOverrides);
  }
};

const addVisibleCatalogEntries = (
  players: Record<PlayerId, DevPlayerCardCatalog>,
  manifest: MatchCardManifest,
  view: PlayerView,
  variantOverrides: Record<InstanceId, VariantKey>,
): void => {
  addVisibleCatalogEntry(players, manifest, view.self.leader, variantOverrides);
  addVisibleCatalogEntry(players, manifest, view.self.stage, variantOverrides);
  addVisibleCatalogEntriesForCards(
    players,
    manifest,
    view.self.characters,
    variantOverrides,
  );
  addVisibleCatalogEntriesForCards(
    players,
    manifest,
    view.self.costArea,
    variantOverrides,
  );
  addVisibleCatalogEntriesForCards(
    players,
    manifest,
    view.self.hand,
    variantOverrides,
  );
  addVisibleCatalogEntriesForCards(
    players,
    manifest,
    view.self.deck ?? [],
    variantOverrides,
  );
  addVisibleCatalogEntriesForCards(
    players,
    manifest,
    view.self.donDeck ?? [],
    variantOverrides,
  );
  addVisibleCatalogEntriesForCards(
    players,
    manifest,
    view.self.trash,
    variantOverrides,
  );
  addVisibleCatalogEntriesForCards(
    players,
    manifest,
    view.self.life.faceUpCards,
    variantOverrides,
  );
  addVisibleCatalogEntry(
    players,
    manifest,
    view.opponent.leader,
    variantOverrides,
  );
  addVisibleCatalogEntry(
    players,
    manifest,
    view.opponent.stage,
    variantOverrides,
  );
  addVisibleCatalogEntriesForCards(
    players,
    manifest,
    view.opponent.characters,
    variantOverrides,
  );
  addVisibleCatalogEntriesForCards(
    players,
    manifest,
    view.opponent.costArea,
    variantOverrides,
  );
  addVisibleCatalogEntriesForCards(
    players,
    manifest,
    view.opponent.hand ?? [],
    variantOverrides,
  );
  addVisibleCatalogEntriesForCards(
    players,
    manifest,
    view.opponent.deck ?? [],
    variantOverrides,
  );
  addVisibleCatalogEntriesForCards(
    players,
    manifest,
    view.opponent.donDeck ?? [],
    variantOverrides,
  );
  addVisibleCatalogEntriesForCards(
    players,
    manifest,
    view.opponent.trash,
    variantOverrides,
  );
  addVisibleCatalogEntriesForCards(
    players,
    manifest,
    view.opponent.life.faceUpCards,
    variantOverrides,
  );
  for (const reveal of view.revealedCards) {
    for (const card of reveal.cards) {
      addVisibleCatalogEntryForCardRef(
        players,
        manifest,
        card,
        variantOverrides,
      );
    }
  }
  addVisibleCatalogEntriesForPendingDecision(
    players,
    manifest,
    view,
    variantOverrides,
  );
  addVisibleCatalogEntriesForRevealEvents(
    players,
    manifest,
    view,
    variantOverrides,
  );
  addVisibleCatalogEntriesForCardIdentityEvents(
    players,
    manifest,
    view,
    variantOverrides,
  );
  addVisibleCatalogEntriesForActiveEffectText(
    players,
    manifest,
    view,
    variantOverrides,
  );
};

const devCardCatalogEntry = (
  card: MatchCardManifest["cards"][CardId],
  variantKey?: VariantKey,
): DevCardCatalogEntry => {
  const selectedVariant =
    variantKey === undefined
      ? card.variants[0]
      : card.variants.find((variant) => variant.variantKey === variantKey);
  const imageUrl =
    selectedVariant?.stockImageFull ?? selectedVariant?.scanImageDisplay;
  return {
    cardId: card.cardId,
    name: card.name,
    category: card.category,
    ...(card.cost === undefined ? {} : { cost: card.cost }),
    ...(card.power === undefined ? {} : { power: card.power }),
    ...(card.counter === undefined ? {} : { counter: card.counter }),
    ...(card.life === undefined ? {} : { life: card.life }),
    ...(card.attributes.length === 0
      ? {}
      : { attributes: [...card.attributes] }),
    ...(card.types.length === 0 ? {} : { types: [...card.types] }),
    ...(card.effectText === undefined ? {} : { effectText: card.effectText }),
    ...(card.triggerText === undefined
      ? {}
      : { triggerText: card.triggerText }),
    ...(card.effectTextSourceMap === undefined
      ? {}
      : { effectTextSourceMap: card.effectTextSourceMap }),
    ...(card.triggerTextSourceMap === undefined
      ? {}
      : { triggerTextSourceMap: card.triggerTextSourceMap }),
    ...(imageUrl === undefined ? {} : { imageUrl }),
  };
};
