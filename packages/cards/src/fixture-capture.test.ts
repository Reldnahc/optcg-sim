import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CardId } from "@optcg/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  capturePoneglyphCardFixtures,
  runCapturePoneglyphFixtureCli,
  toPoneglyphCardFixtureFileName,
} from "./fixture-capture.js";
import type { PoneglyphFetch } from "./poneglyph-client.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

type FakeResponse = {
  json: () => Promise<unknown>;
  ok: boolean;
  status: number;
};

type BatchRequestBody = {
  card_numbers?: string[];
};

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "optcg-card-fixtures-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

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

function batchFetch(fixtures: Record<string, unknown>): PoneglyphFetch {
  return (_url, init) => {
    const request = parseBatchRequestBody(init?.body);
    const data = Object.fromEntries(
      (request.card_numbers ?? [])
        .filter((cardNumber) => fixtures[cardNumber] !== undefined)
        .map((cardNumber) => [cardNumber, fixtures[cardNumber]]),
    );
    const missing = (request.card_numbers ?? []).filter(
      (cardNumber) => fixtures[cardNumber] === undefined,
    );
    return Promise.resolve(okJson({ data, missing }));
  };
}

async function listTempFiles(): Promise<string[]> {
  try {
    return (await readdir(tempDir)).sort();
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  }
}

describe("Poneglyph fixture capture", () => {
  it("captures selected Poneglyph card details into deterministic fixture files", async () => {
    const doflamingo = await readJsonFixture(
      "fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json",
    );
    const rebecca = await readJsonFixture(
      "fixtures/poneglyph/cards/OP05-091.rebecca.json",
    );

    const result = await capturePoneglyphCardFixtures({
      baseUrl: "https://poneglyph.test",
      cardIds: [toCardId("OP05-091"), toCardId("OP01-060")],
      fetch: batchFetch({
        "OP01-060": doflamingo,
        "OP05-091": rebecca,
      }),
      outputDirectory: tempDir,
    });

    expect(result.captured.map((item) => item.relativePath)).toEqual([
      "OP05-091.rebecca.json",
      "OP01-060.donquixote-doflamingo.json",
    ]);
    expect(await listTempFiles()).toEqual([
      "OP01-060.donquixote-doflamingo.json",
      "OP05-091.rebecca.json",
    ]);

    const written = await readFile(
      path.join(tempDir, "OP05-091.rebecca.json"),
      "utf8",
    );
    expect(written).toMatch(/^\{\n {2}"attribute": \[\n/);
    expect(written.endsWith("\n")).toBe(true);
    expect(JSON.parse(written)).toMatchObject({
      card_number: "OP05-091",
      name: "Rebecca",
    });
  });

  it("reports intended fixture paths in dry-run mode without writing files", async () => {
    const rebecca = await readJsonFixture(
      "fixtures/poneglyph/cards/OP05-091.rebecca.json",
    );

    const result = await capturePoneglyphCardFixtures({
      baseUrl: "https://poneglyph.test",
      cardIds: [toCardId("OP05-091")],
      dryRun: true,
      fetch: batchFetch({ "OP05-091": rebecca }),
      outputDirectory: tempDir,
    });

    expect(result.captured).toEqual([
      {
        cardId: "OP05-091",
        filePath: path.join(tempDir, "OP05-091.rebecca.json"),
        relativePath: "OP05-091.rebecca.json",
        written: false,
      },
    ]);
    expect(await listTempFiles()).toEqual([]);
  });

  it("fails closed on invalid Poneglyph detail without writing partial output", async () => {
    const rebecca = await readJsonFixture(
      "fixtures/poneglyph/cards/OP05-091.rebecca.json",
    );

    await expect(
      capturePoneglyphCardFixtures({
        baseUrl: "https://poneglyph.test",
        cardIds: [toCardId("OP05-091"), toCardId("OP99-999")],
        fetch: batchFetch({
          "OP05-091": rebecca,
          "OP99-999": { card_number: "OP99-999" },
        }),
        outputDirectory: tempDir,
      }),
    ).rejects.toThrow(/Invalid Poneglyph card detail/);

    expect(await listTempFiles()).toEqual([]);
  });

  it("fails closed on missing Poneglyph card IDs without writing partial output", async () => {
    const rebecca = await readJsonFixture(
      "fixtures/poneglyph/cards/OP05-091.rebecca.json",
    );

    await expect(
      capturePoneglyphCardFixtures({
        baseUrl: "https://poneglyph.test",
        cardIds: [toCardId("OP05-091"), toCardId("OP99-999")],
        fetch: batchFetch({ "OP05-091": rebecca }),
        outputDirectory: tempDir,
      }),
    ).rejects.toThrow(/missing requested card IDs: OP99-999/);

    expect(await listTempFiles()).toEqual([]);
  });

  it("rejects search result DTOs as fixture capture sources", async () => {
    await expect(
      capturePoneglyphCardFixtures({
        baseUrl: "https://poneglyph.test",
        cardIds: [toCardId("OP05-091")],
        fetch: batchFetch({
          "OP05-091": {
            card_number: "OP05-091",
            cards: [],
            total: 1,
          },
        }),
        outputDirectory: tempDir,
      }),
    ).rejects.toThrow(/Invalid Poneglyph card detail/);
  });

  it("rejects unsafe card numbers before writing fixture paths", async () => {
    const rebecca = await readJsonFixture(
      "fixtures/poneglyph/cards/OP05-091.rebecca.json",
    );

    await expect(
      capturePoneglyphCardFixtures({
        baseUrl: "https://poneglyph.test",
        cardIds: [toCardId("../outside")],
        fetch: batchFetch({
          "../outside": {
            ...(rebecca as Record<string, unknown>),
            card_number: "../outside",
          },
        }),
        outputDirectory: tempDir,
      }),
    ).rejects.toThrow(/Invalid Poneglyph card ID/);

    expect(await listTempFiles()).toEqual([]);
  });

  it("derives predictable fixture filenames from card IDs and names", () => {
    expect(
      toPoneglyphCardFixtureFileName({
        card_number: "OP02-001",
        name: "Monkey.D.Luffy / Wanted!",
      }),
    ).toBe("OP02-001.monkey-d-luffy-wanted.json");
  });

  it("accepts the pnpm argument delimiter before CLI options", async () => {
    let stdout = "";
    let stderr = "";
    const exitCode = await runCapturePoneglyphFixtureCli(["--", "--help"], {
      cwd: tempDir,
      fetch: () => {
        throw new Error("help should not fetch");
      },
      stderr: {
        write(value: string | Uint8Array): boolean {
          stderr += String(value);
          return true;
        },
      },
      stdout: {
        write(value: string | Uint8Array): boolean {
          stdout += String(value);
          return true;
        },
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage:");
    expect(stderr).toBe("");
  });
});
