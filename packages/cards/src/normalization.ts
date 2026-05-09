import { createHash } from "node:crypto";
import type {
  Attribute,
  CardCategory,
  CardColor,
  CardId,
  Keyword,
  NormalizedErrata,
  PoneglyphCardDetail,
  PoneglyphErrata,
  PoneglyphLegalityRecord,
  PoneglyphOfficialFaq,
  ResolvedCard,
  ResolvedCardVariant,
  VariantKey,
} from "@optcg/types";

import { validatePoneglyphCardDetail } from "./poneglyph-schema.js";

export type NormalizedPoneglyphCard = Omit<ResolvedCard, "support"> & {
  raw: PoneglyphCardDetail;
};

type MutableResolvedCardVariant = {
  artist?: string;
  label?: string;
  productId?: string;
  productName?: string;
  productSetCode?: string;
  productSlug?: string;
  scanImageDisplay?: string;
  scanImageFull?: string;
  scanImageThumb?: string;
  stockImageFull?: string;
  stockImageThumb?: string;
  variantIndex: number;
  variantKey: VariantKey;
};

type OptionalVariantStringKey = Exclude<
  keyof MutableResolvedCardVariant,
  "variantIndex" | "variantKey"
>;
type OptionalCardStringKey =
  | "block"
  | "effectText"
  | "rarity"
  | "releasedAt"
  | "triggerText";
type OptionalCardNumberKey = "cost" | "counter" | "life" | "power";

export function normalizePoneglyphCardDetail(
  value: unknown,
): NormalizedPoneglyphCard {
  const detail = validatePoneglyphCardDetail(value);
  const cardId = toCardId(detail.card_number);
  const variants = normalizeVariants(cardId, detail);
  const errata = normalizeErrata(cardId, detail);
  const sourceTextHash = computeSourceTextHash(detail);
  const behaviorHash = computeBehaviorHash(detail);
  const normalized: NormalizedPoneglyphCard = {
    attributes: normalizeAttributes(detail.attribute),
    behaviorHash,
    cardId,
    category: normalizeCategory(detail.card_type),
    colors: normalizeColors(detail.color),
    errata,
    language: detail.language,
    legality: sortRecord(detail.legality),
    name: detail.name,
    officialFaq: normalizeOfficialFaq(detail.official_faq),
    printedKeywords: extractPrintedKeywords(detail),
    raw: detail,
    released: detail.released,
    set: detail.set,
    setName: detail.set_name,
    sourceTextHash,
    types: [...detail.types],
    variants,
  };

  addOptionalCardString(normalized, "block", detail.block);
  addOptionalCardNumber(normalized, "cost", detail.cost);
  addOptionalCardNumber(normalized, "counter", detail.counter);
  addOptionalCardString(normalized, "effectText", detail.effect);
  addOptionalCardNumber(normalized, "life", detail.life);
  addOptionalCardNumber(normalized, "power", detail.power);
  addOptionalCardString(normalized, "rarity", detail.rarity);
  addOptionalCardString(normalized, "releasedAt", detail.released_at);
  addOptionalCardString(normalized, "triggerText", detail.trigger);

  return normalized;
}

export function variantKey(cardId: CardId, variantIndex: number): VariantKey {
  return `${cardId}:v${String(variantIndex)}` as VariantKey;
}

export function computeSourceTextHash(detail: PoneglyphCardDetail): string {
  return sha256(
    normalizeText(`${detail.effect ?? ""}\n${detail.trigger ?? ""}`),
  );
}

export function computeBehaviorHash(detail: PoneglyphCardDetail): string {
  return sha256(
    canonicalJson({
      attribute: detail.attribute ?? [],
      card_number: detail.card_number,
      card_type: detail.card_type,
      color: detail.color,
      cost: detail.cost,
      counter: detail.counter,
      effect: normalizeText(detail.effect ?? ""),
      life: detail.life,
      name: detail.name,
      official_faq: normalizeOfficialFaq(detail.official_faq),
      power: detail.power,
      trigger: normalizeText(detail.trigger ?? ""),
      types: detail.types,
      variant_errata_after_text: normalizeErrataAfterText(detail),
    }),
  );
}

function normalizeVariants(
  cardId: CardId,
  detail: PoneglyphCardDetail,
): ResolvedCardVariant[] {
  return [...detail.variants]
    .sort((left, right) => left.index - right.index)
    .map((variant) => {
      const result: MutableResolvedCardVariant = {
        variantIndex: variant.index,
        variantKey: variantKey(cardId, variant.index),
      };

      addOptionalString(result, "artist", variant.artist);
      addOptionalString(result, "label", variant.label);
      addOptionalString(result, "productId", variant.product.id);
      addOptionalString(result, "productName", variant.product.name);
      addOptionalString(result, "productSetCode", variant.product.set_code);
      addOptionalString(result, "productSlug", variant.product.slug);
      addOptionalString(
        result,
        "scanImageDisplay",
        variant.images.scan.display,
      );
      addOptionalString(result, "scanImageFull", variant.images.scan.full);
      addOptionalString(result, "scanImageThumb", variant.images.scan.thumb);
      addOptionalString(result, "stockImageFull", variant.images.stock.full);
      addOptionalString(result, "stockImageThumb", variant.images.stock.thumb);

      return result;
    });
}

function normalizeErrata(
  cardId: CardId,
  detail: PoneglyphCardDetail,
): NormalizedErrata[] {
  return [...detail.variants]
    .sort((left, right) => left.index - right.index)
    .flatMap((variant) =>
      [...variant.errata].sort(compareErrata).map((erratum) => ({
        ...erratum,
        variantIndex: variant.index,
        variantKey: variantKey(cardId, variant.index),
      })),
    );
}

function normalizeErrataAfterText(detail: PoneglyphCardDetail): string[] {
  return [...detail.variants]
    .sort((left, right) => left.index - right.index)
    .flatMap((variant) =>
      [...variant.errata]
        .sort(compareErrata)
        .map((erratum) => normalizeText(erratum.after_text ?? "")),
    );
}

function compareErrata(left: PoneglyphErrata, right: PoneglyphErrata): number {
  return (
    left.date.localeCompare(right.date) ||
    (left.label ?? "").localeCompare(right.label ?? "") ||
    (left.before_text ?? "").localeCompare(right.before_text ?? "") ||
    (left.after_text ?? "").localeCompare(right.after_text ?? "")
  );
}

function normalizeCategory(cardType: string): CardCategory {
  const normalized = cardType.toLowerCase();

  if (normalized === "leader") {
    return "leader";
  }
  if (normalized === "character") {
    return "character";
  }
  if (normalized === "event") {
    return "event";
  }
  if (normalized === "stage") {
    return "stage";
  }
  if (normalized === "don!!" || normalized === "don") {
    return "don";
  }

  throw new Error(`Unsupported Poneglyph card_type: ${cardType}`);
}

function normalizeColors(colors: string[]): CardColor[] {
  return colors.map((color) => {
    const normalized = color.toLowerCase();

    if (
      normalized === "red" ||
      normalized === "green" ||
      normalized === "blue" ||
      normalized === "purple" ||
      normalized === "black" ||
      normalized === "yellow"
    ) {
      return normalized;
    }

    throw new Error(`Unsupported Poneglyph color: ${color}`);
  });
}

function normalizeAttributes(attributes: string[] | null): Attribute[] {
  return (attributes ?? []).map((attribute) => {
    const normalized = attribute.toLowerCase();

    if (
      normalized === "slash" ||
      normalized === "strike" ||
      normalized === "ranged" ||
      normalized === "special" ||
      normalized === "wisdom"
    ) {
      return normalized;
    }

    throw new Error(`Unsupported Poneglyph attribute: ${attribute}`);
  });
}

function extractPrintedKeywords(detail: PoneglyphCardDetail): Keyword[] {
  const text = `${detail.effect ?? ""}\n${detail.trigger ?? ""}`;
  const keywords: Keyword[] = [];
  const keywordPatterns: Array<[RegExp, Keyword]> = [
    [/\[Blocker\]/iu, "blocker"],
    [/\[Rush\]/iu, "rush"],
    [/\[Double Attack\]/iu, "doubleAttack"],
    [/\[Banish\]/iu, "banish"],
    [/\[Unblockable\]/iu, "unblockable"],
  ];

  for (const [pattern, keyword] of keywordPatterns) {
    if (pattern.test(text)) {
      keywords.push(keyword);
    }
  }

  return keywords;
}

function normalizeOfficialFaq(
  officialFaq: PoneglyphOfficialFaq[],
): PoneglyphOfficialFaq[] {
  return officialFaq
    .map((entry) => ({
      answer: entry.answer,
      question: entry.question,
      updated_on: entry.updated_on,
    }))
    .sort(
      (left, right) =>
        left.updated_on.localeCompare(right.updated_on) ||
        left.question.localeCompare(right.question) ||
        left.answer.localeCompare(right.answer),
    );
}

function sortRecord(
  value: Record<string, PoneglyphLegalityRecord>,
): Record<string, PoneglyphLegalityRecord> {
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, record]) => [key, record]),
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJson(entry));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJson(entry)]),
  );
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function addOptionalString(
  target: MutableResolvedCardVariant,
  key: OptionalVariantStringKey,
  value: string | null,
) {
  if (value !== null) {
    target[key] = value;
  }
}

function addOptionalCardString(
  target: NormalizedPoneglyphCard,
  key: OptionalCardStringKey,
  value: string | null,
) {
  if (value !== null) {
    target[key] = value;
  }
}

function addOptionalCardNumber(
  target: NormalizedPoneglyphCard,
  key: OptionalCardNumberKey,
  value: number | null,
) {
  if (value !== null) {
    target[key] = value;
  }
}

function toCardId(value: string): CardId {
  return value as CardId;
}
