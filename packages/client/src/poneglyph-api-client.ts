export interface PoneglyphFormat {
  readonly name: string;
  readonly description: string | null;
  readonly hasRotation: boolean;
  readonly legalBlocks: number;
  readonly banCount: number;
}

export interface PoneglyphApiClient {
  readonly listFormats: () => Promise<readonly PoneglyphFormat[]>;
}

export interface CreatePoneglyphApiClientOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
}

interface FormatsResponse {
  readonly data: readonly {
    readonly name: string;
    readonly description: string | null;
    readonly has_rotation: boolean;
    readonly legal_blocks: number;
    readonly ban_count: number;
  }[];
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/u, "");

const readJson = async <T>(response: Response): Promise<T> => {
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(
      `Poneglyph API request failed with HTTP ${String(response.status)}.`,
    );
  }
  return body as T;
};

const normalizeFormat = (
  format: FormatsResponse["data"][number],
): PoneglyphFormat => ({
  name: format.name,
  description: format.description,
  hasRotation: format.has_rotation,
  legalBlocks: format.legal_blocks,
  banCount: format.ban_count,
});

export const createPoneglyphApiClient = ({
  baseUrl,
  fetch: fetchImpl = fetch,
}: CreatePoneglyphApiClientOptions): PoneglyphApiClient => {
  const root = trimTrailingSlash(baseUrl);
  return {
    async listFormats() {
      const response = await fetchImpl(`${root}/v1/formats`);
      const body = await readJson<FormatsResponse>(response);
      return body.data.map(normalizeFormat);
    },
  };
};
