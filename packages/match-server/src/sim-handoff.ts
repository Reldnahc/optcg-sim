import type { CardId } from "@optcg/types";

export interface SimHandoffClaims {
  readonly jti: string;
  readonly sub: string;
  readonly sid: string;
  readonly loadout_id: string;
  readonly lobby_id: string | null;
  readonly seat_id: string | null;
  readonly aud: "optcg-sim";
  readonly iat: number;
  readonly exp: number;
}

export interface ResolvedLoadoutDeckEntry {
  readonly cardId: CardId;
  readonly count: number;
  readonly variantIndex?: number;
}

export interface ResolvedLoadout {
  readonly loadoutId: string;
  readonly userId: string;
  readonly mainDeck: {
    readonly deckId: string;
    readonly hash: string | null;
    readonly leader: ResolvedLoadoutDeckEntry;
    readonly main: readonly ResolvedLoadoutDeckEntry[];
    readonly format?: string;
  };
  readonly donDeck: {
    readonly donDeckId: string | null;
    readonly count: number;
  };
  readonly cosmetics: {
    readonly playmatId: string;
    readonly donSleeveId: string;
    readonly deckSleeveId: string;
  };
}

export interface VerifiedSimHandoff {
  readonly claims: SimHandoffClaims;
  readonly resolvedLoadout: ResolvedLoadout;
}

export interface SimHandoffVerifier {
  readonly verify: (token: string) => Promise<VerifiedSimHandoff>;
}

export interface CreatePoneglyphSimHandoffVerifierOptions {
  readonly authBaseUrl?: string;
  readonly fetch?: typeof fetch;
}

const defaultAuthBaseUrl = "https://auth.poneglyph.one";

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/u, "");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readString = (
  record: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const readNullableString = (
  record: Record<string, unknown>,
  key: string,
): string | null => {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
};

const readInteger = (
  record: Record<string, unknown>,
  key: string,
): number | undefined => {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : undefined;
};

const normalizeDeckEntry = (
  value: unknown,
  label: string,
): ResolvedLoadoutDeckEntry => {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const cardId = readString(value, "card") ?? readString(value, "card_number");
  if (cardId === undefined) {
    throw new TypeError(`${label} card id is required.`);
  }
  const count = readInteger(value, "count") ?? 1;
  if (count < 1) {
    throw new TypeError(`${label} count must be a positive integer.`);
  }
  const variantIndex =
    readInteger(value, "variant_index") ?? readInteger(value, "variantIndex");
  return {
    cardId: cardId as CardId,
    count,
    ...(variantIndex === undefined ? {} : { variantIndex }),
  };
};

const normalizeDonDeckCount = (payload: unknown): number => {
  if (!isRecord(payload)) {
    return 10;
  }
  const cards = payload["cards"];
  if (!Array.isArray(cards)) {
    return 10;
  }
  let total = 0;
  for (const entry of cards) {
    if (!isRecord(entry)) {
      continue;
    }
    const count = readInteger(entry, "count") ?? 1;
    if (count > 0) {
      total += count;
    }
  }
  return total > 0 ? total : 10;
};

export const normalizeResolvedLoadout = (value: unknown): ResolvedLoadout => {
  if (!isRecord(value)) {
    throw new TypeError("resolved_loadout must be an object.");
  }
  const loadoutId = readString(value, "loadout_id");
  const userId = readString(value, "user_id");
  const mainDeck = value["main_deck"];
  const donDeck = value["don_deck"];
  const cosmetics = value["cosmetics"];
  if (loadoutId === undefined || userId === undefined) {
    throw new TypeError("resolved_loadout identifiers are required.");
  }
  if (!isRecord(mainDeck)) {
    throw new TypeError("resolved_loadout.main_deck must be an object.");
  }
  if (!isRecord(donDeck)) {
    throw new TypeError("resolved_loadout.don_deck must be an object.");
  }
  if (!isRecord(cosmetics)) {
    throw new TypeError("resolved_loadout.cosmetics must be an object.");
  }
  const deck = mainDeck["deck"];
  if (!isRecord(deck)) {
    throw new TypeError("resolved_loadout.main_deck.deck must be an object.");
  }
  const leader = normalizeDeckEntry(deck["leader"], "leader");
  if (leader.count !== 1) {
    throw new TypeError("resolved_loadout leader must have count 1.");
  }
  const main = deck["main"];
  if (!Array.isArray(main)) {
    throw new TypeError("resolved_loadout main deck must be an array.");
  }
  const format = readString(deck, "format");
  const donDeckPayload = donDeck["payload"];
  return {
    loadoutId,
    userId,
    mainDeck: {
      deckId: readString(mainDeck, "deck_id") ?? "",
      hash: readNullableString(mainDeck, "hash"),
      leader,
      main: main.map((entry, index) =>
        normalizeDeckEntry(entry, `main card ${String(index + 1)}`),
      ),
      ...(format === undefined ? {} : { format }),
    },
    donDeck: {
      donDeckId: readNullableString(donDeck, "don_deck_id"),
      count: normalizeDonDeckCount(donDeckPayload),
    },
    cosmetics: {
      playmatId: readString(cosmetics, "playmat_id") ?? "",
      donSleeveId: readString(cosmetics, "don_sleeve_id") ?? "",
      deckSleeveId: readString(cosmetics, "deck_sleeve_id") ?? "",
    },
  };
};

const normalizeClaims = (value: unknown): SimHandoffClaims => {
  if (!isRecord(value)) {
    throw new TypeError("claims must be an object.");
  }
  const aud = value["aud"];
  if (aud !== "optcg-sim") {
    throw new TypeError("handoff token audience must be optcg-sim.");
  }
  const jti = readString(value, "jti");
  const sub = readString(value, "sub");
  const sid = readString(value, "sid");
  const loadoutId = readString(value, "loadout_id");
  const iat = readInteger(value, "iat");
  const exp = readInteger(value, "exp");
  if (
    jti === undefined ||
    sub === undefined ||
    sid === undefined ||
    loadoutId === undefined ||
    iat === undefined ||
    exp === undefined
  ) {
    throw new TypeError("handoff token claims are incomplete.");
  }
  return {
    jti,
    sub,
    sid,
    loadout_id: loadoutId,
    lobby_id: readNullableString(value, "lobby_id"),
    seat_id: readNullableString(value, "seat_id"),
    aud,
    iat,
    exp,
  };
};

const extractErrorMessage = (body: unknown): string | undefined => {
  if (!isRecord(body)) {
    return undefined;
  }
  const error = body["error"];
  if (isRecord(error)) {
    return readString(error, "message");
  }
  return readString(body, "message");
};

export const createPoneglyphSimHandoffVerifier = ({
  authBaseUrl = process.env["PONEGLYPH_AUTH_BASE_URL"] ?? defaultAuthBaseUrl,
  fetch: fetchImpl = fetch,
}: CreatePoneglyphSimHandoffVerifierOptions = {}): SimHandoffVerifier => ({
  async verify(token) {
    const response = await fetchImpl(
      `${trimTrailingSlash(authBaseUrl)}/v1/sim/handoff/verify`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      },
    );
    const body = (await response.json()) as unknown;
    if (!response.ok) {
      throw new Error(
        extractErrorMessage(body) ??
          `Sim handoff verification failed with HTTP ${String(response.status)}.`,
      );
    }
    if (!isRecord(body) || !isRecord(body["data"])) {
      throw new TypeError("Sim handoff verification response is malformed.");
    }
    return {
      claims: normalizeClaims(body["data"]["claims"]),
      resolvedLoadout: normalizeResolvedLoadout(
        body["data"]["resolved_loadout"],
      ),
    };
  },
});
