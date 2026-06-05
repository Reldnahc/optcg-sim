import { createAuthClient } from "optcg-auth-client";
import type { DeckCollection, DeckLibraryFolder } from "optcg-auth-client";

export interface AccountLoadout {
  readonly id: string;
  readonly name: string;
  readonly folderId: string | null;
  readonly folderName: string | null;
  readonly favorite: boolean;
  readonly leaderCardId: string | null;
  readonly leaderVariantIndex: number | null;
  readonly leaderImageUrl: string | null;
  readonly updatedAt: string;
}

export interface PoneglyphAccountClient {
  readonly listLoadouts: () => Promise<readonly AccountLoadout[]>;
  readonly createSimHandoff: (input: {
    loadoutId: string;
    lobbyId: string;
  }) => Promise<string>;
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
  return {
    id: value.loadout_id,
    name: value.name,
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
  decks.filter((deck) => deck.kind === "deck" && deck.loadout_id !== null);

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
  };
};
