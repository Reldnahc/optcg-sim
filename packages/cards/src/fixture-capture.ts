import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CardId, PoneglyphCardDetail } from "@optcg/types";

import {
  createPoneglyphClient,
  type PoneglyphFetch,
} from "./poneglyph-client.js";

export type CapturedPoneglyphCardFixture = {
  cardId: CardId;
  filePath: string;
  relativePath: string;
  written: boolean;
};

export type CapturePoneglyphCardFixturesOptions = {
  baseUrl: string;
  cardIds: CardId[];
  dryRun?: boolean;
  fetch: PoneglyphFetch;
  lang?: string;
  outputDirectory: string;
};

export type CapturePoneglyphCardFixturesResult = {
  captured: CapturedPoneglyphCardFixture[];
};

const defaultBaseUrl = "https://api.poneglyph.one";
const cardIdPattern = /^[A-Z]{2,6}\d{2}-\d{3}$/;

export async function capturePoneglyphCardFixtures(
  options: CapturePoneglyphCardFixturesOptions,
): Promise<CapturePoneglyphCardFixturesResult> {
  const cardIds = uniqueCardIds(options.cardIds);

  if (cardIds.length === 0) {
    throw new Error("At least one Poneglyph card ID is required.");
  }

  const outputDirectory = path.resolve(options.outputDirectory);
  const client = createPoneglyphClient({
    baseUrl: options.baseUrl,
    fetch: options.fetch,
  });
  const response = await client.getCardsBatch(
    cardIds,
    options.lang === undefined ? undefined : { lang: options.lang },
  );
  const entries = cardIds.map((cardId) => {
    const detail = response.data[cardId];

    if (detail === undefined) {
      throw new Error(
        `Poneglyph batch response missing requested card IDs: ${cardId}`,
      );
    }

    assertValidCardId(detail.card_number);
    const relativePath = toPoneglyphCardFixtureFileName(detail);
    const filePath = path.join(outputDirectory, relativePath);

    return {
      cardId,
      detail,
      filePath,
      relativePath,
    };
  });

  if (options.dryRun === true) {
    return {
      captured: entries.map((entry) => ({
        cardId: entry.cardId,
        filePath: entry.filePath,
        relativePath: entry.relativePath,
        written: false,
      })),
    };
  }

  await mkdir(outputDirectory, { recursive: true });

  for (const entry of entries) {
    await writeFile(
      entry.filePath,
      `${stringifyDeterministicJson(entry.detail)}\n`,
      "utf8",
    );
  }

  return {
    captured: entries.map((entry) => ({
      cardId: entry.cardId,
      filePath: entry.filePath,
      relativePath: entry.relativePath,
      written: true,
    })),
  };
}

export function toPoneglyphCardFixtureFileName(
  detail: Pick<PoneglyphCardDetail, "card_number" | "name">,
): string {
  return `${detail.card_number}.${slugify(detail.name)}.json`;
}

export function stringifyDeterministicJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value), null, 2);
}

export async function runCapturePoneglyphFixtureCli(
  argv: string[],
  environment: {
    cwd: string;
    fetch: PoneglyphFetch;
    stderr: Pick<NodeJS.WriteStream, "write">;
    stdout: Pick<NodeJS.WriteStream, "write">;
  },
): Promise<number> {
  const parsed = parseCaptureArgs(argv, environment.cwd);

  if (parsed.help) {
    environment.stdout.write(usageText());
    return 0;
  }

  try {
    const result = await capturePoneglyphCardFixtures({
      baseUrl: parsed.baseUrl,
      cardIds: parsed.cardIds,
      dryRun: parsed.dryRun,
      fetch: environment.fetch,
      outputDirectory: parsed.outputDirectory,
      ...(parsed.lang === undefined ? {} : { lang: parsed.lang }),
    });

    for (const captured of result.captured) {
      environment.stdout.write(
        `${captured.written ? "wrote" : "would write"} ${captured.relativePath}\n`,
      );
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    environment.stderr.write(`${message}\n`);
    return 1;
  }
}

type ParsedCaptureArgs = {
  baseUrl: string;
  cardIds: CardId[];
  dryRun: boolean;
  help: boolean;
  lang: string | undefined;
  outputDirectory: string;
};

function parseCaptureArgs(argv: string[], cwd: string): ParsedCaptureArgs {
  const cardIds: CardId[] = [];
  let baseUrl = defaultBaseUrl;
  let dryRun = false;
  let help = false;
  let lang: string | undefined;
  let outputDirectory = path.resolve(cwd, "../../fixtures/poneglyph/cards");

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--help" || token === "-h") {
      help = true;
      continue;
    }

    if (token === "--") {
      continue;
    }

    if (token === "--dry-run" || token === "--validate-only") {
      dryRun = true;
      continue;
    }

    if (token === "--card") {
      cardIds.push(toCardId(readOptionValue(argv, index, token)));
      index += 1;
      continue;
    }

    if (token === "--cards") {
      for (const cardId of readOptionValue(argv, index, token).split(",")) {
        const trimmed = cardId.trim();
        if (trimmed !== "") {
          cardIds.push(toCardId(trimmed));
        }
      }
      index += 1;
      continue;
    }

    if (token === "--base-url") {
      baseUrl = readOptionValue(argv, index, token);
      index += 1;
      continue;
    }

    if (token === "--lang") {
      lang = readOptionValue(argv, index, token);
      index += 1;
      continue;
    }

    if (token === "--output-dir" || token === "--out-dir") {
      outputDirectory = path.resolve(cwd, readOptionValue(argv, index, token));
      index += 1;
      continue;
    }

    if (token?.startsWith("-") === true) {
      throw new Error(`Unknown option: ${token}`);
    }

    if (token !== undefined) {
      cardIds.push(toCardId(token));
    }
  }

  return {
    baseUrl,
    cardIds,
    dryRun,
    help,
    lang,
    outputDirectory,
  };
}

function readOptionValue(
  argv: string[],
  index: number,
  option: string,
): string {
  const value = argv[index + 1];

  if (value === undefined || value.startsWith("-")) {
    throw new Error(`Missing value for ${option}.`);
  }

  return value;
}

function toCardId(value: string): CardId {
  assertValidCardId(value);
  return value as CardId;
}

function assertValidCardId(value: string): void {
  if (!cardIdPattern.test(value)) {
    throw new Error(`Invalid Poneglyph card ID: ${value}`);
  }
}

function uniqueCardIds(cardIds: CardId[]): CardId[] {
  return [...new Set(cardIds)];
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug === "" ? "card" : slug;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, sortJsonValue(entryValue)]),
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function usageText(): string {
  return [
    "Usage: pnpm --filter @optcg/cards capture:fixture -- --card OP05-091 [--dry-run]",
    "",
    "Options:",
    "  --card <id>        Capture one card ID. Repeat for multiple cards.",
    "  --cards <ids>      Capture comma-separated card IDs.",
    "  --out-dir <path>   Output directory. Defaults to ../../fixtures/poneglyph/cards.",
    "  --base-url <url>   Poneglyph base URL. Defaults to https://api.poneglyph.one.",
    "  --lang <lang>      Optional Poneglyph language query.",
    "  --dry-run          Validate and print intended files without writing.",
    "",
  ].join("\n");
}

function nodeFetchAdapter(): PoneglyphFetch {
  return async (url, init) => {
    const response = await fetch(url, init);
    return {
      json: () => response.json(),
      ok: response.ok,
      status: response.status,
    };
  };
}

if (process.argv[1] !== undefined) {
  const invokedPath = path.resolve(process.argv[1]);
  const modulePath = fileURLToPath(import.meta.url);

  if (invokedPath === modulePath) {
    const exitCode = await runCapturePoneglyphFixtureCli(
      process.argv.slice(2),
      {
        cwd: process.cwd(),
        fetch: nodeFetchAdapter(),
        stderr: process.stderr,
        stdout: process.stdout,
      },
    );
    process.exitCode = exitCode;
  }
}
