import type { PoneglyphCardDetail } from "@optcg/types";
import { z } from "zod";

import { validatePoneglyphCardDetail } from "./poneglyph-schema.js";

type FetchInit = {
  body?: string;
  headers?: Record<string, string>;
  method?: string;
};

type FetchResponse = {
  json: () => Promise<unknown>;
  ok: boolean;
  status: number;
};

export type PoneglyphFetch = (
  url: string,
  init?: FetchInit,
) => Promise<FetchResponse>;

export type PoneglyphClient = {
  getCard: (
    cardNumber: string,
    options?: { lang?: string },
  ) => Promise<PoneglyphCardDetail>;
  getCardsBatch: (
    cardNumbers: string[],
    options?: { lang?: string },
  ) => Promise<{
    data: Record<string, PoneglyphCardDetail>;
    missing: string[];
  }>;
};

export type PoneglyphClientOptions = {
  baseUrl: string;
  fetch: PoneglyphFetch;
};

const BatchResponseSchema = z.looseObject({
  data: z.record(z.string(), z.unknown()),
  missing: z.array(z.string()),
});

export function createPoneglyphClient(
  options: PoneglyphClientOptions,
): PoneglyphClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");

  return {
    async getCard(cardNumber, requestOptions) {
      const response = await requestJson(
        options.fetch,
        buildUrl(baseUrl, `/v1/cards/${encodeURIComponent(cardNumber)}`, {
          lang: requestOptions?.lang,
        }),
      );
      return validatePoneglyphCardDetail(response);
    },

    async getCardsBatch(cardNumbers, requestOptions) {
      const uniqueCardNumbers = uniqueInOrder(cardNumbers);
      const orderedData: Record<string, PoneglyphCardDetail> = {};

      for (const chunk of chunks(uniqueCardNumbers, 60)) {
        const response = await requestJson(
          options.fetch,
          buildUrl(baseUrl, "/v1/cards/batch", { lang: requestOptions?.lang }),
          {
            body: JSON.stringify({ card_numbers: chunk }),
            headers: { "content-type": "application/json" },
            method: "POST",
          },
        );
        const parsed = BatchResponseSchema.safeParse(response);

        if (!parsed.success) {
          throw new Error(
            `Invalid Poneglyph batch response: ${parsed.error.issues
              .map((issue) => issue.path.join(".") || "<root>")
              .join(", ")}`,
          );
        }

        if (parsed.data.missing.length > 0) {
          throw new Error(
            `Poneglyph batch response missing requested card IDs: ${parsed.data.missing.join(", ")}`,
          );
        }

        for (const cardNumber of chunk) {
          const detail = parsed.data.data[cardNumber];

          if (detail === undefined) {
            throw new Error(
              `Poneglyph batch response missing requested card IDs: ${cardNumber}`,
            );
          }

          orderedData[cardNumber] = validatePoneglyphCardDetail(detail);
        }
      }

      return { data: orderedData, missing: [] };
    },
  };
}

async function requestJson(
  fetch: PoneglyphFetch,
  url: string,
  init?: FetchInit,
): Promise<unknown> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(
      `Poneglyph request failed with status ${String(response.status)}`,
    );
  }

  try {
    return await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Poneglyph response was not valid JSON: ${message}`);
  }
}

function buildUrl(
  baseUrl: string,
  pathname: string,
  query: { lang: string | undefined },
): string {
  const url = new URL(pathname, `${baseUrl}/`);

  if (query.lang !== undefined) {
    url.searchParams.set("lang", query.lang);
  }

  return url.toString();
}

function uniqueInOrder(values: string[]): string[] {
  return [...new Set(values)];
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }

  return result;
}
