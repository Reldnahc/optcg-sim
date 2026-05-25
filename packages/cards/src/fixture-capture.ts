import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PoneglyphCardDetail } from "@optcg/types";

export interface FixtureCaptureRequest {
  readonly cardIds: readonly string[];
  readonly outDir?: string;
  readonly baseUrl?: string;
  readonly lang?: string;
  readonly dryRun?: boolean;
  readonly fetchCard?: PoneglyphFetch;
}

export interface FixtureCaptureResult {
  readonly exitCode: number;
  readonly lines: readonly string[];
  readonly errors: readonly string[];
  readonly files: readonly string[];
}

interface PoneglyphFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

type PoneglyphFetch = (url: string) => Promise<PoneglyphFetchResponse>;

const defaultPoneglyphBaseUrl = "https://api.poneglyph.one";
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const defaultOutDir = path.join(repoRoot, "fixtures", "poneglyph", "cards");

export const capturePoneglyphFixtures = async (
  request: FixtureCaptureRequest,
): Promise<FixtureCaptureResult> => {
  const cardIds = uniqueCardIds(request.cardIds);
  if (cardIds.length === 0) {
    return {
      exitCode: 1,
      lines: [],
      errors: ["At least one --card or --cards value is required."],
      files: [],
    };
  }

  const fetchCard = request.fetchCard ?? fetchPoneglyphCard;
  const baseUrl = request.baseUrl ?? defaultPoneglyphBaseUrl;
  const fetched: PoneglyphCardDetail[] = [];
  for (const cardId of cardIds) {
    const result = await fetchPoneglyphCardDetail(cardId, {
      baseUrl,
      fetchCard,
      ...(request.lang === undefined ? {} : { lang: request.lang }),
    });
    if (!result.ok) {
      return {
        exitCode: 1,
        lines: [],
        errors: [result.error],
        files: [],
      };
    }
    fetched.push(result.card);
  }

  const outDir = request.outDir ?? defaultOutDir;
  const files = fetched.map((card) => path.join(outDir, fixtureFileName(card)));
  if (request.dryRun === true) {
    return {
      exitCode: 0,
      lines: fetched.map(
        (card, index) =>
          `Validated ${card.card_number} ${card.name} -> ${requiredFile(
            files[index],
          )}`,
      ),
      errors: [],
      files,
    };
  }

  await mkdir(outDir, { recursive: true });
  await Promise.all(
    fetched.map((card, index) =>
      writeFile(requiredFile(files[index]), `${stableStringify(card)}\n`),
    ),
  );

  return {
    exitCode: 0,
    lines: fetched.map(
      (card, index) =>
        `Wrote ${card.card_number} ${card.name} -> ${requiredFile(
          files[index],
        )}`,
    ),
    errors: [],
    files,
  };
};

const uniqueCardIds = (cardIds: readonly string[]): string[] => [
  ...new Set(cardIds.map((cardId) => cardId.trim()).filter(Boolean)),
];

const fetchPoneglyphCardDetail = async (
  cardId: string,
  options: {
    readonly baseUrl: string;
    readonly fetchCard: PoneglyphFetch;
    readonly lang?: string;
  },
): Promise<
  | { readonly ok: true; readonly card: PoneglyphCardDetail }
  | { readonly ok: false; readonly error: string }
> => {
  const url = cardDetailUrl(cardId, options);
  const response = await options.fetchCard(url);
  if (!response.ok) {
    return {
      ok: false,
      error: `Poneglyph fixture capture failed for ${cardId}: HTTP ${String(response.status)}`,
    };
  }

  const payload = await response.json();
  const card = toPoneglyphCardDetail(payload);
  if (card === undefined) {
    return {
      ok: false,
      error: `Poneglyph fixture capture failed for ${cardId}: invalid response payload`,
    };
  }
  if (card.card_number !== cardId) {
    return {
      ok: false,
      error: `Poneglyph fixture capture failed for ${cardId}: response card_number was ${card.card_number}`,
    };
  }
  return { ok: true, card };
};

const cardDetailUrl = (
  cardId: string,
  options: { readonly baseUrl: string; readonly lang?: string },
): string => {
  const url = `${options.baseUrl.replace(/\/+$/u, "")}/v1/cards/${encodeURIComponent(cardId)}`;
  return options.lang === undefined || options.lang.length === 0
    ? url
    : `${url}?lang=${encodeURIComponent(options.lang)}`;
};

const toPoneglyphCardDetail = (
  payload: unknown,
): PoneglyphCardDetail | undefined => {
  if (isPoneglyphCardDetail(payload)) {
    return payload;
  }
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const data = (payload as Record<string, unknown>)["data"];
  return isPoneglyphCardDetail(data) ? data : undefined;
};

const isPoneglyphCardDetail = (
  value: unknown,
): value is PoneglyphCardDetail => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["card_number"] === "string" &&
    typeof candidate["name"] === "string" &&
    typeof candidate["language"] === "string" &&
    typeof candidate["set"] === "string" &&
    typeof candidate["set_name"] === "string" &&
    typeof candidate["released"] === "boolean" &&
    typeof candidate["card_type"] === "string" &&
    Array.isArray(candidate["color"]) &&
    (candidate["cost"] === null || typeof candidate["cost"] === "number") &&
    (candidate["power"] === null || typeof candidate["power"] === "number") &&
    (candidate["counter"] === null ||
      typeof candidate["counter"] === "number") &&
    (candidate["life"] === null || typeof candidate["life"] === "number") &&
    (candidate["attribute"] === null ||
      Array.isArray(candidate["attribute"])) &&
    Array.isArray(candidate["types"]) &&
    (candidate["effect"] === null || typeof candidate["effect"] === "string") &&
    (candidate["trigger"] === null ||
      typeof candidate["trigger"] === "string") &&
    Array.isArray(candidate["variants"]) &&
    typeof candidate["legality"] === "object" &&
    candidate["legality"] !== null &&
    Array.isArray(candidate["available_languages"]) &&
    Array.isArray(candidate["official_faq"])
  );
};

const fixtureFileName = (card: PoneglyphCardDetail): string =>
  `${card.card_number}.${slugify(card.name)}.json`;

const slugify = (value: string): string => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return slug.length === 0 ? "card" : slug;
};

const requiredFile = (value: string | undefined): string => {
  if (value === undefined) {
    throw new Error("Internal fixture capture file mapping failed.");
  }
  return value;
};

const stableStringify = (value: unknown): string =>
  JSON.stringify(sortJson(value), null, 2);

const sortJson = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, sortJson(record[key])]),
  );
};

const fetchPoneglyphCard: PoneglyphFetch = async (url) => fetch(url);
