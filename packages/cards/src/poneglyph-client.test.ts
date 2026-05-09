import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CardId } from "@optcg/types";
import { describe, expect, it } from "vitest";

import { createPoneglyphClient } from "./poneglyph-client.js";
import { validatePoneglyphCardDetail } from "./poneglyph-schema.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

type CapturedRequest = {
  body: string | undefined;
  method: string | undefined;
  url: string;
};

type FakeResponse = {
  json: () => Promise<unknown>;
  ok: boolean;
  status: number;
};

type BatchRequestBody = {
  card_numbers?: string[];
};

function toCardId(value: string): CardId {
  return value as CardId;
}

async function readJsonFixture(relativePath: string): Promise<unknown> {
  const source = await readFile(path.join(repoRoot, relativePath), "utf8");
  return JSON.parse(source) as unknown;
}

function okJson(value: unknown): FakeResponse {
  return {
    json: () => Promise.resolve(value),
    ok: true,
    status: 200,
  };
}

function parseBatchRequestBody(body: string | undefined): BatchRequestBody {
  const value = JSON.parse(body ?? "{}") as unknown;

  if (typeof value !== "object" || value === null) {
    return {};
  }

  const cardNumbers = (value as { card_numbers?: unknown }).card_numbers;

  if (
    !Array.isArray(cardNumbers) ||
    !cardNumbers.every((cardNumber): cardNumber is string => {
      return typeof cardNumber === "string";
    })
  ) {
    return {};
  }

  return { card_numbers: cardNumbers };
}

describe("Poneglyph client", () => {
  it("validates a successful single-card response before returning it", async () => {
    const fixture = validatePoneglyphCardDetail(
      await readJsonFixture(
        "fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json",
      ),
    );
    const client = createPoneglyphClient({
      baseUrl: "https://poneglyph.test",
      fetch: () => Promise.resolve(okJson(fixture)),
    });

    await expect(client.getCard(toCardId("OP01-060"))).resolves.toMatchObject({
      card_number: "OP01-060",
    });
  });

  it("fails closed when a single-card response has a different card number", async () => {
    const fixture = validatePoneglyphCardDetail(
      await readJsonFixture("fixtures/poneglyph/cards/OP05-091.rebecca.json"),
    );
    const client = createPoneglyphClient({
      baseUrl: "https://poneglyph.test",
      fetch: () => Promise.resolve(okJson(fixture)),
    });

    await expect(client.getCard(toCardId("OP01-060"))).rejects.toThrow(
      /card_number mismatch.*OP01-060.*OP05-091/,
    );
  });

  it("fails closed on non-2xx responses", async () => {
    const client = createPoneglyphClient({
      baseUrl: "https://poneglyph.test",
      fetch: () =>
        Promise.resolve({
          json: () => Promise.resolve({}),
          ok: false,
          status: 503,
        }),
    });

    await expect(client.getCard(toCardId("OP01-060"))).rejects.toThrow(
      /Poneglyph request failed.*503/,
    );
  });

  it("fails closed when JSON parsing fails", async () => {
    const client = createPoneglyphClient({
      baseUrl: "https://poneglyph.test",
      fetch: () =>
        Promise.resolve({
          json: () => Promise.reject(new Error("bad json")),
          ok: true,
          status: 200,
        }),
    });

    await expect(client.getCard(toCardId("OP01-060"))).rejects.toThrow(
      /Poneglyph response was not valid JSON/,
    );
  });

  it("fails closed when a response has malformed card-detail shape", async () => {
    const client = createPoneglyphClient({
      baseUrl: "https://poneglyph.test",
      fetch: () => Promise.resolve(okJson({ card_number: "OP01-060" })),
    });

    await expect(client.getCard(toCardId("OP01-060"))).rejects.toThrow(
      /Invalid Poneglyph card detail/,
    );
  });

  it("fails closed when a batch response reports a missing requested ID", async () => {
    const client = createPoneglyphClient({
      baseUrl: "https://poneglyph.test",
      fetch: () => Promise.resolve(okJson({ data: {}, missing: ["OP01-060"] })),
    });

    await expect(client.getCardsBatch([toCardId("OP01-060")])).rejects.toThrow(
      /missing requested card IDs: OP01-060/,
    );
  });

  it("fails closed when a batch detail has a different card number than its key", async () => {
    const fixture = validatePoneglyphCardDetail(
      await readJsonFixture("fixtures/poneglyph/cards/OP05-091.rebecca.json"),
    );
    const client = createPoneglyphClient({
      baseUrl: "https://poneglyph.test",
      fetch: () =>
        Promise.resolve(okJson({ data: { "OP01-060": fixture }, missing: [] })),
    });

    await expect(client.getCardsBatch([toCardId("OP01-060")])).rejects.toThrow(
      /card_number mismatch.*OP01-060.*OP05-091/,
    );
  });

  it("chunks unique batch requests into groups of at most 60 IDs", async () => {
    const fixture = validatePoneglyphCardDetail(
      await readJsonFixture(
        "fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json",
      ),
    );
    const requests: CapturedRequest[] = [];
    const cardNumbers = Array.from(
      { length: 61 },
      (_value, index) => `OP01-${String(index + 1).padStart(3, "0")}`,
    );

    const client = createPoneglyphClient({
      baseUrl: "https://poneglyph.test",
      fetch: (url, init) => {
        requests.push({ body: init?.body, method: init?.method, url });
        const body = parseBatchRequestBody(init?.body);
        const data = Object.fromEntries(
          (body.card_numbers ?? []).map((cardNumber) => [
            cardNumber,
            { ...fixture, card_number: cardNumber },
          ]),
        );
        return Promise.resolve(okJson({ data, missing: [] }));
      },
    });

    const response = await client.getCardsBatch(
      [...cardNumbers, cardNumbers[0] ?? "OP01-001"].map(toCardId),
    );

    expect(requests).toHaveLength(2);
    expect(
      requests.map((request) => parseBatchRequestBody(request.body)),
    ).toEqual([
      { card_numbers: cardNumbers.slice(0, 60) },
      { card_numbers: cardNumbers.slice(60) },
    ]);
    expect(Object.keys(response.data)).toEqual(cardNumbers);
  });
});
