import type {
  CardCategory,
  CardInstance,
  GameState,
  PlayerState,
} from "@optcg/types";

import type { EventStatContext } from "./event-stat-extractor.js";
import type { CompletedMatchRecord } from "./postgres-completed-match.js";
import { colorBucketKey } from "./user-stat-keys.js";

const authUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const isAuthUuid = (value: string | null): value is string =>
  value !== null && authUuidPattern.test(value);

const safeColorBucket = (colors: readonly string[]): string | undefined => {
  try {
    return colorBucketKey(colors);
  } catch {
    return undefined;
  }
};

const playerCards = (player: PlayerState): readonly CardInstance[] => [
  player.leader,
  ...player.characters,
  ...(player.stage === undefined ? [] : [player.stage]),
  ...player.deck,
  ...player.donDeck,
  ...player.hand,
  ...player.trash,
  ...player.costArea,
  ...player.life.map((lifeCard) => lifeCard.card),
];

const fallbackCategory = (
  card: CardInstance,
  player: PlayerState,
): CardCategory | undefined => {
  if (card.instanceId === player.leader.instanceId) {
    return "leader";
  }
  if (
    player.characters.some(
      (character) => character.instanceId === card.instanceId,
    )
  ) {
    return "character";
  }
  if (player.stage?.instanceId === card.instanceId) {
    return "stage";
  }
  return undefined;
};

export const buildEventStatContext = (
  record: CompletedMatchRecord,
  state: GameState,
): EventStatContext => {
  const userIdByPlayerId = new Map<string, string>();
  const cardNumberByInstanceId = new Map<string, string>();
  const categoryByInstanceId = new Map<string, string>();
  const colorBucketByCardNumber = new Map<string, string>();

  for (const player of record.players) {
    if (isAuthUuid(player.userId) && player.isBot !== true) {
      userIdByPlayerId.set(player.seatId, player.userId);
    }
  }

  for (const card of Object.values(state.cardManifest.cards)) {
    const bucket = safeColorBucket(card.colors);
    if (bucket !== undefined) {
      colorBucketByCardNumber.set(card.cardId, bucket);
    }
  }

  for (const player of Object.values(state.players)) {
    for (const card of playerCards(player)) {
      cardNumberByInstanceId.set(card.instanceId, card.cardId);
      const category =
        state.cardManifest.cards[card.cardId]?.category ??
        fallbackCategory(card, player);
      if (category !== undefined) {
        categoryByInstanceId.set(card.instanceId, category);
      }
    }
  }

  return {
    userIdByPlayerId,
    cardNumberByInstanceId,
    categoryByInstanceId,
    colorBucketByCardNumber,
  };
};
