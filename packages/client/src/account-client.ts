import { createAuthClient } from "optcg-auth-client";
import type {
  DeckCollection,
  DeckLibraryFolder,
  Loadout,
} from "optcg-auth-client";

export interface AccountLoadout {
  readonly id: string;
  readonly name: string;
  readonly folderId: string | null;
  readonly folderName: string | null;
  readonly updatedAt: string;
}

export interface PoneglyphAccountClient {
  readonly listLoadouts: () => Promise<readonly AccountLoadout[]>;
  readonly createLoadoutFromDeckHash: (input: {
    name: string;
    deckHash: string;
  }) => Promise<AccountLoadout>;
  readonly createSimHandoff: (input: {
    loadoutId: string;
    lobbyId: string;
  }) => Promise<string>;
}

export interface CreatePoneglyphAccountClientOptions {
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}

const normalizeImportedLoadout = (value: Loadout): AccountLoadout => {
  return {
    id: value.id,
    name: value.name,
    folderId: null,
    folderName: null,
    updatedAt: value.updated_at,
  };
};

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
    updatedAt: value.updated_at,
  };
};

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
    async createLoadoutFromDeckHash(input) {
      const response = await authClient.createLoadoutFromDeckHash({
        name: input.name,
        deck_hash: input.deckHash,
      });
      return normalizeImportedLoadout(response.data);
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
