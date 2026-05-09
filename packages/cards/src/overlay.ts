import type {
  BanlistRecord,
  CardId,
  CardImplementationRecord,
  ResolvedCard,
  ResolvedCardOverlay,
  RulingNote,
} from "@optcg/types";
import { z } from "zod";

import type { NormalizedPoneglyphCard } from "./normalization.js";

export type SimulatorOverlayRegistry = Record<CardId, ResolvedCardOverlay>;

export type MergedSimulatorOverlayCard = {
  card: ResolvedCard;
  errataOverrideDeferral: string;
  overlay: ResolvedCardOverlay;
};

const CardSupportStatusSchema = z.enum([
  "vanilla-confirmed",
  "implemented-dsl",
  "implemented-custom",
  "unsupported",
  "banned-in-simulator",
]);

const NonEmptyStringSchema = z.string().min(1);

const CardImplementationRecordSchema = z.strictObject({
  cardDataVersion: NonEmptyStringSchema,
  cardId: NonEmptyStringSchema,
  customHandlerIds: z.array(NonEmptyStringSchema).optional(),
  behaviorHash: NonEmptyStringSchema,
  effectDefinitionId: NonEmptyStringSchema.optional(),
  notes: NonEmptyStringSchema.optional(),
  rulesVersion: NonEmptyStringSchema,
  sourceTextHash: NonEmptyStringSchema,
  status: CardSupportStatusSchema,
  tested: z.boolean(),
});

const RulingNoteSchema = z.strictObject({
  source: z.enum(["official-faq", "errata", "simulator-note"]),
  text: NonEmptyStringSchema,
});

const BanlistRecordSchema = z.strictObject({
  cardId: NonEmptyStringSchema,
  effectiveFrom: NonEmptyStringSchema,
  format: NonEmptyStringSchema,
  maxCopies: z.number().int().optional(),
  reason: NonEmptyStringSchema.optional(),
  status: z.enum([
    "legal",
    "banned",
    "restricted",
    "leaderLocked",
    "simulatorBanned",
  ]),
});

const ResolvedCardOverlaySchema = z.strictObject({
  banlist: z.array(BanlistRecordSchema).optional(),
  cardId: NonEmptyStringSchema,
  customHandlerIds: z.array(NonEmptyStringSchema).optional(),
  effectDefinitionId: NonEmptyStringSchema.optional(),
  rulingNotes: z.array(RulingNoteSchema).optional(),
  simulatorTags: z.array(NonEmptyStringSchema).optional(),
  support: CardImplementationRecordSchema,
});

export function validateSimulatorOverlay(value: unknown): ResolvedCardOverlay {
  const result = ResolvedCardOverlaySchema.safeParse(value);

  if (!result.success) {
    throw new Error(
      `Invalid simulator overlay: ${result.error.issues
        .map((issue) => issue.path.join(".") || "<root>")
        .join(", ")}`,
    );
  }

  const overlay: ResolvedCardOverlay = {
    cardId: toCardId(result.data.cardId),
    support: normalizeSupport(result.data.support),
  };

  addOptionalOverlayString(
    overlay,
    "effectDefinitionId",
    result.data.effectDefinitionId,
  );
  addOptionalOverlayStringArray(
    overlay,
    "customHandlerIds",
    result.data.customHandlerIds,
  );
  addOptionalOverlayRulingNotes(overlay, result.data.rulingNotes);
  addOptionalOverlayBanlist(overlay, result.data.banlist);
  addOptionalOverlayStringArray(
    overlay,
    "simulatorTags",
    result.data.simulatorTags,
  );

  assertOverlayReferencesCard(overlay.cardId, overlay);
  assertOverlayMetadataMatchesSupport(overlay);

  return overlay;
}

export function validateSimulatorOverlayRegistry(
  value: unknown,
): SimulatorOverlayRegistry {
  const result = z
    .record(z.string(), ResolvedCardOverlaySchema)
    .safeParse(value);

  if (!result.success) {
    throw new Error(
      `Invalid simulator overlay registry: ${result.error.issues
        .map((issue) => issue.path.join(".") || "<root>")
        .join(", ")}`,
    );
  }

  const registry: SimulatorOverlayRegistry = {};

  for (const [cardId, overlayInput] of Object.entries(result.data)) {
    const overlay = validateSimulatorOverlay(overlayInput);

    if (overlay.cardId !== cardId) {
      throw new Error(
        `Simulator overlay registry key ${cardId} does not match overlay cardId ${overlay.cardId}`,
      );
    }

    registry[toCardId(cardId)] = overlay;
  }

  return registry;
}

export function mergeSimulatorOverlay(
  normalized: NormalizedPoneglyphCard,
  overlayInput?: unknown,
): MergedSimulatorOverlayCard {
  const overlay =
    overlayInput === undefined
      ? createUnsupportedOverlay(normalized)
      : validateSimulatorOverlay(overlayInput);

  assertOverlayReferencesCard(normalized.cardId, overlay);

  return {
    card: {
      ...toEngineCardBase(normalized),
      support: overlay.support,
    },
    errataOverrideDeferral:
      "Current contracts expose simulator ruling notes but no errata override field; CARD-001D records this as an explicit deferral.",
    overlay,
  };
}

function toEngineCardBase(
  normalized: NormalizedPoneglyphCard,
): Omit<ResolvedCard, "support"> {
  const { raw: auditPayload, ...card } = normalized;
  void auditPayload;
  return card;
}

function normalizeSupport(
  support: z.infer<typeof CardImplementationRecordSchema>,
): CardImplementationRecord {
  const normalized: CardImplementationRecord = {
    behaviorHash: support.behaviorHash,
    cardDataVersion: support.cardDataVersion,
    cardId: toCardId(support.cardId),
    rulesVersion: support.rulesVersion,
    sourceTextHash: support.sourceTextHash,
    status: support.status,
    tested: support.tested,
  };

  addOptionalString(
    normalized,
    "effectDefinitionId",
    support.effectDefinitionId,
  );
  addOptionalStringArray(
    normalized,
    "customHandlerIds",
    support.customHandlerIds,
  );
  addOptionalString(normalized, "notes", support.notes);

  return normalized;
}

function createUnsupportedOverlay(
  normalized: NormalizedPoneglyphCard,
): ResolvedCardOverlay {
  return {
    cardId: normalized.cardId,
    support: {
      behaviorHash: normalized.behaviorHash,
      cardDataVersion: "unreviewed",
      cardId: normalized.cardId,
      notes: "No simulator overlay is present; card is unsupported by default.",
      rulesVersion: "unreviewed",
      sourceTextHash: normalized.sourceTextHash,
      status: "unsupported",
      tested: false,
    },
  };
}

function assertOverlayReferencesCard(
  cardId: CardId,
  overlay: ResolvedCardOverlay,
) {
  if (overlay.cardId !== cardId) {
    throw new Error(
      `Simulator overlay cardId ${overlay.cardId} does not match normalized card ${cardId}`,
    );
  }

  if (overlay.support.cardId !== cardId) {
    throw new Error(
      `Simulator overlay support.cardId ${overlay.support.cardId} does not match normalized card ${cardId}`,
    );
  }

  for (const banlist of overlay.banlist ?? []) {
    if (banlist.cardId !== cardId) {
      throw new Error(
        `Simulator overlay banlist cardId ${banlist.cardId} does not match normalized card ${cardId}`,
      );
    }
  }
}

function assertOverlayMetadataMatchesSupport(overlay: ResolvedCardOverlay) {
  if (
    overlay.effectDefinitionId !== undefined &&
    overlay.effectDefinitionId !== overlay.support.effectDefinitionId
  ) {
    throw new Error(
      `Simulator overlay effectDefinitionId ${overlay.effectDefinitionId} does not match support.effectDefinitionId ${String(
        overlay.support.effectDefinitionId,
      )} for ${String(overlay.cardId)}`,
    );
  }

  if (
    overlay.customHandlerIds !== undefined &&
    !stringArraysEqual(
      overlay.customHandlerIds,
      overlay.support.customHandlerIds ?? [],
    )
  ) {
    throw new Error(
      `Simulator overlay customHandlerIds do not match support.customHandlerIds for ${String(
        overlay.cardId,
      )}`,
    );
  }
}

function stringArraysEqual(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function addOptionalString(
  target: CardImplementationRecord,
  key: "effectDefinitionId" | "notes",
  value: string | undefined,
) {
  if (value !== undefined) {
    target[key] = value;
  }
}

function addOptionalStringArray(
  target: CardImplementationRecord,
  key: "customHandlerIds",
  value: string[] | undefined,
) {
  if (value !== undefined) {
    target[key] = [...value];
  }
}

function addOptionalOverlayString(
  target: ResolvedCardOverlay,
  key: "effectDefinitionId",
  value: string | undefined,
) {
  if (value !== undefined) {
    target[key] = value;
  }
}

function addOptionalOverlayStringArray(
  target: ResolvedCardOverlay,
  key: "customHandlerIds" | "simulatorTags",
  value: string[] | undefined,
) {
  if (value !== undefined) {
    target[key] = [...value];
  }
}

function addOptionalOverlayRulingNotes(
  target: ResolvedCardOverlay,
  value: RulingNote[] | undefined,
) {
  if (value !== undefined) {
    target.rulingNotes = value.map((note) => ({ ...note }));
  }
}

function addOptionalOverlayBanlist(
  target: ResolvedCardOverlay,
  value: Array<z.infer<typeof BanlistRecordSchema>> | undefined,
) {
  if (value !== undefined) {
    target.banlist = value.map((record) => {
      const normalized: BanlistRecord = {
        cardId: toCardId(record.cardId),
        effectiveFrom: record.effectiveFrom,
        format: record.format,
        status: record.status,
      };

      if (record.maxCopies !== undefined) {
        normalized.maxCopies = record.maxCopies;
      }

      if (record.reason !== undefined) {
        normalized.reason = record.reason;
      }

      return normalized;
    });
  }
}

function toCardId(value: string): CardId {
  return value as CardId;
}
