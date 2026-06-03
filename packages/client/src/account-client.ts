export interface AccountLoadout {
  readonly id: string;
  readonly name: string;
  readonly mainDeckId: string;
  readonly donDeckId: string | null;
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

const defaultAuthBaseUrl = "https://auth.poneglyph.one";

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/u, "");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readString = (
  record: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const readNullableString = (
  record: Record<string, unknown>,
  key: string,
): string | null => {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
};

const authUrl = (baseUrl: string, path: string): string =>
  `${trimTrailingSlash(baseUrl)}/v1${path.startsWith("/") ? path : `/${path}`}`;

const extractErrorMessage = (body: unknown): string | undefined => {
  if (!isRecord(body)) {
    return undefined;
  }
  const error = body["error"];
  if (isRecord(error)) {
    return readString(error, "message");
  }
  return readString(body, "message");
};

const requestJson = async <T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  const response = await fetchImpl(authUrl(baseUrl, path), {
    ...init,
    credentials: "include",
  });
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(
      extractErrorMessage(body) ?? `Auth API error ${String(response.status)}`,
    );
  }
  return body as T;
};

const normalizeLoadout = (value: unknown): AccountLoadout => {
  if (!isRecord(value)) {
    throw new TypeError("loadout must be an object.");
  }
  const id = readString(value, "id");
  const name = readString(value, "name");
  const mainDeckId = readString(value, "main_deck_id");
  const updatedAt = readString(value, "updated_at");
  if (
    id === undefined ||
    name === undefined ||
    mainDeckId === undefined ||
    updatedAt === undefined
  ) {
    throw new TypeError("loadout response is incomplete.");
  }
  return {
    id,
    name,
    mainDeckId,
    donDeckId: readNullableString(value, "don_deck_id"),
    updatedAt,
  };
};

const normalizeLoadoutList = (body: unknown): readonly AccountLoadout[] => {
  if (!isRecord(body) || !Array.isArray(body["data"])) {
    throw new TypeError("loadout list response is malformed.");
  }
  return body["data"].map(normalizeLoadout);
};

const normalizeHandoffToken = (body: unknown): string => {
  if (!isRecord(body) || !isRecord(body["data"])) {
    throw new TypeError("sim handoff response is malformed.");
  }
  const token = readString(body["data"], "token");
  if (token === undefined) {
    throw new TypeError("sim handoff token is missing.");
  }
  return token;
};

export const createPoneglyphAccountClient = ({
  baseUrl = defaultAuthBaseUrl,
  fetch: fetchImpl = fetch,
}: CreatePoneglyphAccountClientOptions = {}): PoneglyphAccountClient => ({
  async listLoadouts() {
    return normalizeLoadoutList(
      await requestJson(fetchImpl, baseUrl, "/loadouts"),
    );
  },
  async createSimHandoff(input) {
    return normalizeHandoffToken(
      await requestJson(fetchImpl, baseUrl, "/sim/handoff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          loadout_id: input.loadoutId,
          lobby_id: input.lobbyId,
          seat_id: null,
        }),
      }),
    );
  },
});
