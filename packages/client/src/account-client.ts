import { createAuthClient } from "optcg-auth-client";
import type { DeckCollection, DeckLibraryFolder } from "optcg-auth-client";

export interface AccountLoadout {
  readonly id: string;
  readonly name: string;
  readonly deckHash: string;
  readonly folderId: string | null;
  readonly folderName: string | null;
  readonly favorite: boolean;
  readonly leaderCardId: string | null;
  readonly leaderVariantIndex: number | null;
  readonly leaderImageUrl: string | null;
  readonly updatedAt: string;
  readonly validation?: AccountLoadoutValidation | undefined;
}

export type AccountLoadoutValidationStatus =
  | "unchecked"
  | "playable"
  | "unplayable"
  | "unverified";

export interface AccountLoadoutValidation {
  readonly status: AccountLoadoutValidationStatus;
  readonly errors: readonly string[];
}

export type AccountSimHandoffBatchResult =
  | {
      readonly loadoutId: string;
      readonly status: "created";
      readonly token: string;
    }
  | {
      readonly loadoutId: string;
      readonly status: "rejected";
      readonly error: string;
    };

export interface PoneglyphAccountClient {
  readonly listLoadouts: () => Promise<readonly AccountLoadout[]>;
  readonly createSimHandoff: (input: {
    loadoutId: string;
    lobbyId: string;
  }) => Promise<string>;
  readonly createSimHandoffs: (input: {
    loadoutIds: readonly string[];
    lobbyId: string;
  }) => Promise<readonly AccountSimHandoffBatchResult[]>;
}

export interface CreatePoneglyphAccountClientOptions {
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}

const folderById = (
  folders: readonly DeckLibraryFolder[],
): ReadonlyMap<string, DeckLibraryFolder> =>
  new Map(folders.map((folder) => [folder.id, folder]));

const normalizeLibraryDeck = (
  value: DeckCollection,
  foldersById: ReadonlyMap<string, DeckLibraryFolder>,
): AccountLoadout => {
  const folder =
    value.folder_id === null ? undefined : foldersById.get(value.folder_id);
  if (value.loadout_id === null) {
    throw new TypeError("Deck collection is missing a sim loadout id.");
  }
  if (value.deck_hash === null) {
    throw new TypeError("Deck collection is missing a deck hash.");
  }
  return {
    id: value.loadout_id,
    name: value.name,
    deckHash: value.deck_hash,
    folderId: value.folder_id,
    folderName: folder?.name ?? null,
    favorite: value.favorite,
    leaderCardId: value.leader_card_number,
    leaderVariantIndex: value.leader_variant_index,
    leaderImageUrl:
      value.leader_card_number === null
        ? null
        : poneglyphCardStockImageUrl(
            value.leader_card_number,
            value.leader_variant_index,
          ),
    updatedAt: value.updated_at,
  };
};

const poneglyphCardStockImageUrl = (
  cardId: string,
  variantIndex: number | null,
): string =>
  `https://cdn.poneglyph.one/images/${encodeURIComponent(cardId)}/en/stock/${String(variantIndex ?? 0)}/full.png`;

const playableDeckCollections = (
  decks: readonly DeckCollection[],
): DeckCollection[] =>
  decks.filter(
    (deck) =>
      deck.kind === "deck" &&
      deck.loadout_id !== null &&
      deck.deck_hash !== null,
  );

interface BatchHandoffResponse {
  readonly data: {
    readonly handoffs: readonly BatchHandoffItem[];
  };
}

type BatchHandoffItem =
  | {
      readonly loadout_id: string;
      readonly status: "created";
      readonly token: string;
      readonly expires_at: string;
    }
  | {
      readonly loadout_id: string;
      readonly status: "rejected";
      readonly error: {
        readonly status: number;
        readonly message: string;
      };
    };

const normalizeBatchHandoff = (
  handoff: BatchHandoffItem,
): AccountSimHandoffBatchResult =>
  handoff.status === "created"
    ? {
        loadoutId: handoff.loadout_id,
        status: "created",
        token: handoff.token,
      }
    : {
        loadoutId: handoff.loadout_id,
        status: "rejected",
        error: handoff.error.message,
      };

export const createPoneglyphAccountClient = ({
  fetch: fetchImpl = fetch,
  baseUrl,
}: CreatePoneglyphAccountClientOptions = {}): PoneglyphAccountClient => {
  const authClient = createAuthClient({
    fetch: fetchImpl,
    ...(baseUrl === undefined ? {} : { baseUrl }),
  });
  return {
    async listLoadouts() {
      const response = await authClient.getDeckLibrary();
      const foldersById = folderById(response.data.folders);
      return playableDeckCollections(response.data.decks).map((deck) =>
        normalizeLibraryDeck(deck, foldersById),
      );
    },
    async createSimHandoff(input) {
      const response = await authClient.createSimHandoff({
        loadout_id: input.loadoutId,
        lobby_id: input.lobbyId,
        seat_id: null,
      });
      return response.data.token;
    },
    async createSimHandoffs(input) {
      const response = await authClient.post<BatchHandoffResponse>(
        "/sim/handoffs",
        {
          loadout_ids: input.loadoutIds,
          lobby_id: input.lobbyId,
          seat_id: null,
        },
      );
      return response.data.handoffs.map(normalizeBatchHandoff);
    },
  };
};
