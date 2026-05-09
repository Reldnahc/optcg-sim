import type { PoneglyphCardDetail } from "@optcg/types";
import { z } from "zod";

const PoneglyphOfficialFaqSchema = z.looseObject({
  answer: z.string(),
  question: z.string(),
  updated_on: z.string(),
});

const PoneglyphLegalityRecordSchema = z.looseObject({
  banned_at: z.string().optional(),
  max_copies: z.number().int().optional(),
  paired_with: z.array(z.string()).optional(),
  reason: z.string().optional(),
  status: z.string(),
});

const PoneglyphErrataSchema = z.looseObject({
  after_text: z.string().nullable(),
  before_text: z.string().nullable(),
  date: z.string(),
  images: z
    .looseObject({
      scan: z
        .looseObject({
          display: z.string().nullable(),
          full: z.string().nullable(),
          thumb: z.string().nullable(),
        })
        .optional(),
      source: z.string().nullable().optional(),
    })
    .optional(),
  label: z.string().nullable(),
});

const PoneglyphVariantSchema = z.looseObject({
  artist: z.string().nullable(),
  errata: z.array(PoneglyphErrataSchema),
  images: z.looseObject({
    scan: z.looseObject({
      display: z.string().nullable(),
      full: z.string().nullable(),
      thumb: z.string().nullable(),
    }),
    stock: z.looseObject({
      full: z.string().nullable(),
      thumb: z.string().nullable(),
    }),
  }),
  index: z.number().int(),
  label: z.string().nullable(),
  market: z.looseObject({
    high_price: z.string().nullable(),
    low_price: z.string().nullable(),
    market_price: z.string().nullable(),
    mid_price: z.string().nullable(),
    tcgplayer_url: z.string().nullable(),
  }),
  name: z.string().nullable(),
  product: z.looseObject({
    id: z.string().nullable(),
    name: z.string().nullable(),
    released_at: z.string().nullable(),
    set_code: z.string().nullable(),
    slug: z.string().nullable(),
  }),
});

const PoneglyphCardDetailSchema = z.looseObject({
  attribute: z.array(z.string()).nullable(),
  available_languages: z.array(z.string()),
  block: z.string().nullable(),
  card_number: z.string(),
  card_type: z.string(),
  color: z.array(z.string()),
  cost: z.number().int().nullable(),
  counter: z.number().int().nullable(),
  effect: z.string().nullable(),
  language: z.string(),
  legality: z.record(z.string(), PoneglyphLegalityRecordSchema),
  life: z.number().int().nullable(),
  name: z.string(),
  official_faq: z.array(PoneglyphOfficialFaqSchema),
  power: z.number().int().nullable(),
  rarity: z.string().nullable(),
  released: z.boolean(),
  released_at: z.string().nullable(),
  set: z.string(),
  set_name: z.string(),
  trigger: z.string().nullable(),
  types: z.array(z.string()),
  variants: z.array(PoneglyphVariantSchema),
});

export function validatePoneglyphCardDetail(
  value: unknown,
): PoneglyphCardDetail {
  const result = PoneglyphCardDetailSchema.safeParse(value);

  if (!result.success) {
    throw new Error(
      `Invalid Poneglyph card detail: ${result.error.issues
        .map((issue) => issue.path.join(".") || "<root>")
        .join(", ")}`,
    );
  }

  return result.data as PoneglyphCardDetail;
}
