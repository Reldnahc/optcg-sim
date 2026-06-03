import {
  createApiDeckHashDictionarySource,
  createDeckHashCodec,
  type DeckHashDeck,
} from "optcg-deck-hash";
import type { CardId } from "@optcg/types";
import type { ResolvedLoadout } from "./sim-handoff.js";

export interface DeckSubmissionEntry {
  readonly cardId: CardId;
  readonly count: number;
  readonly variantIndex?: number;
}

export interface ReadyDeckSubmission {
  readonly source: "deckHash" | "resolvedLoadout";
  readonly hash: string;
  readonly status: "ready";
  readonly decoded: {
    readonly leader: DeckSubmissionEntry;
    readonly main: readonly DeckSubmissionEntry[];
    readonly format?: string;
  };
  readonly donDeckCount: number;
}

export interface InvalidDeckSubmission {
  readonly source: "deckHash" | "resolvedLoadout";
  readonly hash: string;
  readonly status: "invalid";
  readonly error: string;
  readonly donDeckCount: number;
}

export type DeckSubmission = ReadyDeckSubmission | InvalidDeckSubmission;

export interface DeckHashCodecPort {
  readonly decode: (hash: string) => Promise<DeckHashDeck>;
}

export const createPoneglyphDeckHashCodec = (): DeckHashCodecPort => {
  const codec = createDeckHashCodec({
    dictionarySource: createApiDeckHashDictionarySource({
      baseUrl: "https://poneglyph.one",
    }),
  });
  return {
    decode: (hash) => codec.decode(hash),
  };
};

const invalidSubmission = (
  hash: string,
  donDeckCount: number,
  error: string,
): InvalidDeckSubmission => ({
  source: "deckHash",
  hash,
  status: "invalid",
  error,
  donDeckCount,
});

const assertPositiveInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${label} count must be a positive integer.`);
  }
};

const normalizeEntry = (
  entry: DeckHashDeck["main"][number],
  label: string,
): DeckSubmissionEntry => {
  assertPositiveInteger(entry.count, label);
  return {
    cardId: entry.card_number as CardId,
    count: entry.count,
    ...(entry.variant_index === undefined
      ? {}
      : { variantIndex: entry.variant_index }),
  };
};

export const decodeDeckHashSubmission = async ({
  hash,
  donDeckCount,
  codec = createPoneglyphDeckHashCodec(),
}: {
  readonly hash: string;
  readonly donDeckCount: number;
  readonly codec?: DeckHashCodecPort;
}): Promise<DeckSubmission> => {
  if (!Number.isInteger(donDeckCount) || donDeckCount < 1) {
    return invalidSubmission(
      hash,
      donDeckCount,
      "DON deck count must be a positive integer.",
    );
  }
  try {
    const decoded = await codec.decode(hash);
    if (decoded.leader === null || decoded.leader.count !== 1) {
      return invalidSubmission(
        hash,
        donDeckCount,
        "Deck hash must contain one leader.",
      );
    }
    const leader = normalizeEntry(decoded.leader, "leader");
    const main = decoded.main.map((entry, index) =>
      normalizeEntry(entry, `main card ${String(index + 1)}`),
    );
    return {
      source: "deckHash",
      hash,
      status: "ready",
      decoded: {
        leader,
        main,
        ...(decoded.format === undefined ? {} : { format: decoded.format }),
      },
      donDeckCount,
    };
  } catch (error: unknown) {
    return invalidSubmission(
      hash,
      donDeckCount,
      error instanceof Error ? error.message : String(error),
    );
  }
};

export const createDeckSubmissionFromResolvedLoadout = (
  loadout: ResolvedLoadout,
): ReadyDeckSubmission => ({
  source: "resolvedLoadout",
  hash: loadout.mainDeck.hash ?? `loadout:${loadout.loadoutId}`,
  status: "ready",
  decoded: {
    leader: loadout.mainDeck.leader,
    main: loadout.mainDeck.main,
    ...(loadout.mainDeck.format === undefined
      ? {}
      : { format: loadout.mainDeck.format }),
  },
  donDeckCount: loadout.donDeck.count,
});
