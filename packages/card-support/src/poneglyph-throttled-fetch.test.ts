import { describe, expect, it } from "vitest";

import type { PoneglyphFetch } from "./poneglyph-card-source.js";
import { createThrottledPoneglyphFetch } from "./poneglyph-throttled-fetch.js";

const jsonResponse = (status: number) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve({}),
});

describe("throttled Poneglyph fetch", () => {
  it("waits before every request after the first", async () => {
    const waits: number[] = [];
    const urls: string[] = [];
    const fetchPoneglyph: PoneglyphFetch = (url) => {
      urls.push(String(url));
      return Promise.resolve(jsonResponse(200));
    };
    const throttled = createThrottledPoneglyphFetch(fetchPoneglyph, {
      delayMs: 500,
      retryDelaysMs: [],
      wait: (milliseconds) => {
        waits.push(milliseconds);
        return Promise.resolve();
      },
    });

    await throttled("https://example.test/one");
    await throttled("https://example.test/two");
    await throttled("https://example.test/three");

    expect(urls).toEqual([
      "https://example.test/one",
      "https://example.test/two",
      "https://example.test/three",
    ]);
    expect(waits).toEqual([500, 500]);
  });

  it("retries HTTP 429 responses with backoff before returning the successful response", async () => {
    const waits: number[] = [];
    const statuses = [429, 429, 200];
    const fetchPoneglyph: PoneglyphFetch = () => {
      const status = statuses.shift() ?? 500;
      return Promise.resolve(jsonResponse(status));
    };
    const throttled = createThrottledPoneglyphFetch(fetchPoneglyph, {
      delayMs: 500,
      retryDelaysMs: [2000, 4000, 8000],
      wait: (milliseconds) => {
        waits.push(milliseconds);
        return Promise.resolve();
      },
    });

    const response = await throttled("https://example.test/cards");

    expect(response.status).toBe(200);
    expect(waits).toEqual([2000, 4000]);
  });

  it("returns the final 429 response after retry delays are exhausted", async () => {
    const waits: number[] = [];
    const fetchPoneglyph: PoneglyphFetch = () =>
      Promise.resolve(jsonResponse(429));
    const throttled = createThrottledPoneglyphFetch(fetchPoneglyph, {
      delayMs: 500,
      retryDelaysMs: [2000, 4000],
      wait: (milliseconds) => {
        waits.push(milliseconds);
        return Promise.resolve();
      },
    });

    const response = await throttled("https://example.test/cards");

    expect(response.status).toBe(429);
    expect(waits).toEqual([2000, 4000]);
  });
});
