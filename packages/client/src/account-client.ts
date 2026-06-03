import { createAuthClient } from "optcg-auth-client";
import type { Loadout } from "optcg-auth-client";

export interface AccountLoadout {
  readonly id: string;
  readonly name: string;
  readonly mainDeckId: string;
  readonly donDeckId: string | null;
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

const normalizeLoadout = (value: Loadout): AccountLoadout => {
  return {
    id: value.id,
    name: value.name,
    mainDeckId: value.main_deck_id,
    donDeckId: value.don_deck_id,
    updatedAt: value.updated_at,
  };
};

interface LoadoutResponse {
  readonly data: Loadout;
}

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
      const response = await authClient.listLoadouts();
      return response.data.map(normalizeLoadout);
    },
    async createLoadoutFromDeckHash(input) {
      const response = await authClient.post<LoadoutResponse>(
        "/loadouts/import-deck-hash",
        {
          name: input.name,
          deck_hash: input.deckHash,
        },
      );
      return normalizeLoadout(response.data);
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
