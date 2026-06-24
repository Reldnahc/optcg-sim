import type {
  PoneglyphFetch,
  PoneglyphFetchRequest,
  PoneglyphFetchResponse,
} from "./poneglyph-card-source.js";

export interface ThrottledPoneglyphFetchOptions {
  readonly delayMs: number;
  readonly retryDelaysMs: readonly number[];
  readonly wait?: ((milliseconds: number) => Promise<void>) | undefined;
}

export const createThrottledPoneglyphFetch = (
  fetchPoneglyph: PoneglyphFetch,
  options: ThrottledPoneglyphFetchOptions,
): PoneglyphFetch => {
  const wait = options.wait ?? defaultWait;
  let hasFetched = false;

  return async (
    url: string | URL,
    init?: PoneglyphFetchRequest,
  ): Promise<PoneglyphFetchResponse> => {
    if (hasFetched) {
      await wait(options.delayMs);
    }
    hasFetched = true;

    let response = await fetchPoneglyph(url, init);
    for (const retryDelayMs of options.retryDelaysMs) {
      if (response.status !== 429) {
        return response;
      }
      await wait(retryDelayMs);
      response = await fetchPoneglyph(url, init);
    }
    return response;
  };
};

const defaultWait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
