# Deck Hash Lobby Submissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace dev deck text lists with Poneglyph-compatible deck hash submissions, wire custom lobbies to accept guest deck hashes, and preserve per-copy variant art outside the engine.

**Architecture:** Decode deck hashes at the match-server boundary into a `DeckSubmission` model, validate card and variant availability with the cards package, and create normal engine setup from base card IDs only. Store variant choices in match-server display metadata keyed by deterministic engine instance IDs so the client can render the chosen art without leaking deck contents or coupling art to gameplay.

**Tech Stack:** TypeScript, pnpm workspaces, `optcg-deck-hash`, `@optcg/cards`, match-server local lobby registry, client controller/transport, React lobby/loading UI, Vitest.

---

## File Structure

- Modify `packages/match-server/package.json` and `pnpm-lock.yaml`
  - Add `optcg-deck-hash` as a match-server dependency only.
- Create `packages/match-server/src/deck-submission.ts`
  - Decode deck hashes through an injectable codec port.
  - Normalize leader/main entries into typed match-server submission data.
  - Ignore decoded DON data for match setup.
- Create `packages/match-server/src/deck-submission.test.ts`
  - Unit tests for hash decode, invalid input, leader validation, variant index preservation, and DON ignore behavior.
- Modify `packages/match-server/src/default-dev-manifest.ts`
  - Replace `.txt` dev decklist parsing with `.hash` submission loading.
  - Add helpers that convert ready submissions into `DevMatchPlayerSetup`.
  - Validate requested variants against resolved Poneglyph details.
  - Keep player-specific DON deck counts in setup, separate from deck hash DON data.
- Modify `packages/match-server/src/default-dev-manifest-boundary.test.ts`
  - Replace old `1xCARD` parser tests with hash submission boundary tests.
  - Keep tests proving match-server does not parse card text or read fixtures.
- Rename dev deck examples:
  - Delete `packages/match-server/dev-decks/deck1.txt.example`
  - Delete `packages/match-server/dev-decks/deck2.txt.example`
  - Add `packages/match-server/dev-decks/deck1.hash.example`
  - Add `packages/match-server/dev-decks/deck2.hash.example`
- Modify `.gitignore`
  - Ignore `packages/match-server/dev-decks/deck1.hash` and `deck2.hash`.
  - Remove or leave old `.txt` ignores only if the files are still locally present; production code must no longer read them.
- Modify `packages/match-server/src/local-match.ts`
  - Store display variant overrides in `LocalDevMatch`, not in `GameState`.
  - Build deterministic instance override keys from player setup.
- Modify `packages/match-server/src/local-card-catalog.ts`
  - Prefer per-instance variant overrides when building visible catalog entries.
  - Keep card-id fallback metadata for non-variant and legacy paths.
- Modify `packages/match-server/src/dev-snapshot-types.ts`
  - Add optional `instances: Record<InstanceId, DevCardCatalogEntry>` to `DevPlayerCardCatalog`.
- Modify `packages/client/src/transport.ts`
  - Add deck status fields to lobby types.
  - Add `submitLobbyDeck` to `MatchTransport`.
  - Add optional per-instance catalog entries to `MatchCardCatalog`.
- Modify `packages/client/src/transport-http.ts`
  - Add `POST /api/lobbies/:lobbyId/deck` transport method.
- Modify `packages/client/src/controller.ts`
  - Add `submitLobbyDeckHash`.
  - Keep guest identity as the authority for the submitted lobby seat.
  - Do not decode hashes in the client.
- Modify `packages/client/src/controller.test.ts`
  - Test submit passes guest token and updates lobby state.
  - Test match claim still happens from lobby sync only after a match exists.
- Modify `packages/match-server/src/dev-http-server.ts`
  - Store per-seat deck submission status in the local lobby registry.
  - Add deck submission route.
  - Create the match only when both seats are claimed and both decks are ready.
  - Broadcast lobby state after submission.
- Modify `packages/match-server/src/dev-http-server.test.ts`
  - Test deck submission auth, hidden lobby response, ready gating, and no deck content leak.
- Modify `packages/client/src/react/MatchLoadingPanel.tsx`
  - Render a deck hash input for waiting lobbies.
  - Show own submission state and public seat readiness.
- Modify `packages/client/src/react/MatchApp.tsx`
  - Pass lobby state and submit callback into `MatchLoadingPanel`.
- Modify `packages/client/src/react/card-model.ts`
  - Prefer instance catalog entries over card-id catalog entries for image/name/text lookup.
- Modify `packages/client/src/react/*catalog/view-model tests as needed`
  - Cover same card ID with different visible variant images.

## Task 1: Add Deck Submission Decoder Boundary

**Files:**

- Modify: `packages/match-server/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `packages/match-server/src/deck-submission.ts`
- Create: `packages/match-server/src/deck-submission.test.ts`

- [ ] **Step 1: Add the dependency**

Run:

```bash
corepack pnpm add optcg-deck-hash@^0.1.1 --filter @optcg/match-server
```

Expected:

```text
dependencies:
+ optcg-deck-hash ^0.1.1
```

- [ ] **Step 2: Write failing decoder tests**

Create `packages/match-server/src/deck-submission.test.ts`:

```ts
import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { CardId } from "@optcg/types";

import {
  decodeDeckHashSubmission,
  type DeckHashCodecPort,
} from "./deck-submission.js";

const fakeCodec = (
  deck: Awaited<ReturnType<DeckHashCodecPort["decode"]>>,
): DeckHashCodecPort => ({
  decode: async () => deck,
});

describe("deck hash submissions", () => {
  test("decodes leader and main entries while preserving variant indexes", async () => {
    const submission = await decodeDeckHashSubmission({
      hash: "hash-value",
      donDeckCount: 6,
      codec: fakeCodec({
        leader: {
          card_number: "OP15-058",
          count: 1,
          variant_index: 2,
        },
        main: [
          { card_number: "OP15-061", count: 4, variant_index: 0 },
          { card_number: "OP15-066", count: 2 },
        ],
        don: { card_number: "DON!!", count: 10, variant_index: 9 },
        format: "opcg",
      }),
    });

    assert.equal(submission.status, "ready");
    if (submission.status !== "ready") {
      throw new Error("expected ready submission");
    }
    assert.equal(submission.source, "deckHash");
    assert.equal(submission.hash, "hash-value");
    assert.equal(submission.donDeckCount, 6);
    assert.deepEqual(submission.decoded.leader, {
      cardId: "OP15-058" as CardId,
      count: 1,
      variantIndex: 2,
    });
    assert.deepEqual(submission.decoded.main, [
      { cardId: "OP15-061" as CardId, count: 4, variantIndex: 0 },
      { cardId: "OP15-066" as CardId, count: 2 },
    ]);
  });

  test("ignores decoded DON entries because DON deck setup is separate", async () => {
    const submission = await decodeDeckHashSubmission({
      hash: "hash-value",
      donDeckCount: 10,
      codec: fakeCodec({
        leader: { card_number: "OP15-058", count: 1 },
        main: [{ card_number: "OP15-061", count: 4 }],
        don: { card_number: "DON!!", count: 1, variant_index: 7 },
      }),
    });

    assert.equal(submission.status, "ready");
    if (submission.status !== "ready") {
      throw new Error("expected ready submission");
    }
    assert.equal(JSON.stringify(submission).includes("DON!!"), false);
    assert.equal(submission.donDeckCount, 10);
  });

  test("fails closed when the hash has no one-copy leader", async () => {
    const noLeader = await decodeDeckHashSubmission({
      hash: "hash-value",
      donDeckCount: 10,
      codec: fakeCodec({
        leader: null,
        main: [{ card_number: "OP15-061", count: 4 }],
        don: null,
      }),
    });
    assert.equal(noLeader.status, "invalid");
    assert.match(noLeader.error, /one leader/u);

    const tooManyLeaders = await decodeDeckHashSubmission({
      hash: "hash-value",
      donDeckCount: 10,
      codec: fakeCodec({
        leader: { card_number: "OP15-058", count: 2 },
        main: [],
        don: null,
      }),
    });
    assert.equal(tooManyLeaders.status, "invalid");
    assert.match(tooManyLeaders.error, /one leader/u);
  });

  test("fails closed for invalid counts and codec failures", async () => {
    const badCount = await decodeDeckHashSubmission({
      hash: "hash-value",
      donDeckCount: 10,
      codec: fakeCodec({
        leader: { card_number: "OP15-058", count: 1 },
        main: [{ card_number: "OP15-061", count: 0 }],
        don: null,
      }),
    });
    assert.equal(badCount.status, "invalid");
    assert.match(badCount.error, /positive integer/u);

    const failedDecode = await decodeDeckHashSubmission({
      hash: "hash-value",
      donDeckCount: 10,
      codec: {
        decode: async () => {
          throw new Error("bad hash");
        },
      },
    });
    assert.equal(failedDecode.status, "invalid");
    assert.match(failedDecode.error, /bad hash/u);
  });
});
```

- [ ] **Step 3: Run the failing test**

Run:

```bash
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/deck-submission.test.ts
```

Expected: FAIL because `deck-submission.ts` does not exist.

- [ ] **Step 4: Implement the decoder boundary**

Create `packages/match-server/src/deck-submission.ts`:

```ts
import {
  createApiDeckHashDictionarySource,
  createDeckHashCodec,
  type DeckHashDeck,
} from "optcg-deck-hash";
import type { CardId } from "@optcg/types";

export interface DeckSubmissionEntry {
  readonly cardId: CardId;
  readonly count: number;
  readonly variantIndex?: number;
}

export interface ReadyDeckSubmission {
  readonly source: "deckHash";
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
  readonly source: "deckHash";
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
  entry: NonNullable<DeckHashDeck["leader"]> | DeckHashDeck["main"][number],
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
```

- [ ] **Step 5: Run the decoder tests**

Run:

```bash
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/deck-submission.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/match-server/package.json pnpm-lock.yaml packages/match-server/src/deck-submission.ts packages/match-server/src/deck-submission.test.ts
git commit -m "Add deck hash submission decoder"
```

## Task 2: Replace Dev Deck Text Files With Hash Submissions

**Files:**

- Modify: `packages/match-server/src/default-dev-manifest.ts`
- Modify: `packages/match-server/src/default-dev-manifest-boundary.test.ts`
- Delete: `packages/match-server/dev-decks/deck1.txt.example`
- Delete: `packages/match-server/dev-decks/deck2.txt.example`
- Add: `packages/match-server/dev-decks/deck1.hash.example`
- Add: `packages/match-server/dev-decks/deck2.hash.example`
- Modify: `.gitignore`

- [ ] **Step 1: Write failing dev manifest tests**

Replace the old `parseDevDecklistText` tests in `packages/match-server/src/default-dev-manifest-boundary.test.ts` with tests for `ReadyDeckSubmission` input:

```ts
import type { ReadyDeckSubmission } from "./deck-submission.js";
```

Add this helper near the top:

```ts
const readySubmission = (
  leaderCardId: CardId,
  main: readonly Array<{
    cardId: CardId;
    count: number;
    variantIndex?: number;
  }>,
  donDeckCount = 10,
): ReadyDeckSubmission => ({
  source: "deckHash",
  hash: "hash-value",
  status: "ready",
  decoded: {
    leader: { cardId: leaderCardId, count: 1 },
    main,
  },
  donDeckCount,
});
```

Replace the parser import with:

```ts
  createDevDecklistFromSubmission,
  validateDevDeckSubmissionVariants,
```

Add these tests:

```ts
test("creates dev decklists from ready deck hash submissions", () => {
  const decklist = createDevDecklistFromSubmission(
    readySubmission("OP13-079" as CardId, [
      { cardId: "OP13-080" as CardId, count: 4 },
      { cardId: "OP13-082" as CardId, count: 2, variantIndex: 1 },
    ]),
  );

  assert.equal(decklist.leader.cardId, "OP13-079");
  assert.deepEqual(decklist.deckEntries, [
    { cardId: "OP13-080", count: 4 },
    { cardId: "OP13-082", count: 2, variantIndex: 1 },
  ]);
  assert.deepEqual(createDevDeckCardIds(decklist.deckEntries), [
    "OP13-080",
    "OP13-080",
    "OP13-080",
    "OP13-080",
    "OP13-082",
    "OP13-082",
  ]);
});

test("rejects non-ready deck submissions before setup creation", () => {
  assert.throws(
    () =>
      createDevDecklistFromSubmission({
        source: "deckHash",
        hash: "bad",
        status: "invalid",
        error: "bad hash",
        donDeckCount: 10,
      }),
    /ready deck submission/u,
  );
});

test("validates requested variant indexes against resolved card details", () => {
  validateDevDeckSubmissionVariants(
    createDevDecklistFromSubmission(
      readySubmission("OP13-079" as CardId, [
        { cardId: "OP13-080" as CardId, count: 1, variantIndex: 2 },
      ]),
    ),
    {
      cards: {
        ["OP13-079" as CardId]: {
          category: "leader",
          life: 5,
          variants: [{ variantIndex: 0, variantKey: "OP13-079:v0" }],
        },
        ["OP13-080" as CardId]: {
          category: "character",
          variants: [{ variantIndex: 2, variantKey: "OP13-080:v2" }],
        },
      },
    },
  );

  assert.throws(
    () =>
      validateDevDeckSubmissionVariants(
        createDevDecklistFromSubmission(
          readySubmission("OP13-079" as CardId, [
            { cardId: "OP13-080" as CardId, count: 1, variantIndex: 9 },
          ]),
        ),
        {
          cards: {
            ["OP13-079" as CardId]: {
              category: "leader",
              life: 5,
              variants: [{ variantIndex: 0, variantKey: "OP13-079:v0" }],
            },
            ["OP13-080" as CardId]: {
              category: "character",
              variants: [{ variantIndex: 2, variantKey: "OP13-080:v2" }],
            },
          },
        },
      ),
    /variant 9 is not available for OP13-080/u,
  );
});
```

Delete these old tests:

```ts
  test("parses dev decklists with a required first-line one-copy leader", ...)
  test("rejects decklists whose first entry is not exactly one leader copy", ...)
  test("rejects malformed dev decklist lines", ...)
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/default-dev-manifest-boundary.test.ts
```

Expected: FAIL because the new helpers do not exist.

- [ ] **Step 3: Implement hash-based dev manifest helpers**

In `packages/match-server/src/default-dev-manifest.ts`:

1. Import `ReadyDeckSubmission` and `decodeDeckHashSubmission`.
2. Change `DevDecklist` to preserve the leader and per-card variants:

```ts
export interface DevDecklist {
  readonly leader: DevDeckCardEntry;
  readonly deckEntries: readonly DevDeckCardEntry[];
  readonly donDeckCount: number;
}
```

3. Replace `parseDevDecklistText` with:

```ts
export const createDevDecklistFromSubmission = (
  submission: DeckSubmission,
): DevDecklist => {
  if (submission.status !== "ready") {
    throw new TypeError("Dev match setup requires a ready deck submission.");
  }
  return {
    leader: submission.decoded.leader,
    deckEntries: submission.decoded.main,
    donDeckCount: submission.donDeckCount,
  };
};
```

4. Update `createDevManifestCardIds` to read `decklist.leader.cardId`.
5. Add variant validation:

```ts
export const validateDevDeckSubmissionVariants = (
  decklist: DevDecklist,
  manifest: Pick<MatchCardManifest, "cards">,
): void => {
  for (const entry of [decklist.leader, ...decklist.deckEntries]) {
    if (entry.variantIndex === undefined) {
      continue;
    }
    const card = manifest.cards[entry.cardId];
    const variant = card?.variants.find(
      (candidate) => candidate.variantIndex === entry.variantIndex,
    );
    if (variant === undefined) {
      throw new TypeError(
        `Deck hash requested variant ${String(entry.variantIndex)} is not available for ${String(entry.cardId)}.`,
      );
    }
  }
};
```

6. Change `createDevPlayerSetupFromDecklist` to use `decklist.leader.cardId` and include variant indexes in the returned setup:

```ts
return {
  playerId,
  leaderCardId: decklist.leader.cardId,
  leaderLifeCount,
  leaderVariantIndex: decklist.leader.variantIndex,
  deckCardIds: createDevDeckCardIds(decklist.deckEntries),
  deckVariantIndexes: createDevDeckVariantIndexes(decklist.deckEntries),
  donDeckCardIds,
};
```

7. Add:

```ts
export const createDevDeckVariantIndexes = (
  entries: readonly DevDeckCardEntry[],
): Array<number | undefined> =>
  entries.flatMap((entry) =>
    Array.from({ length: entry.count }, () => entry.variantIndex),
  );
```

8. Replace file names:

```ts
const firstDevDeckHashFile = "deck1.hash";
const secondDevDeckHashFile = "deck2.hash";
```

9. Change `readDefaultDevDecklist` to read one hash string and decode it:

```ts
const readDefaultDevDeckSubmission = async (
  filename: string,
  donDeckCount: number,
): Promise<ReadyDeckSubmission> => {
  const hash = (await readFile(devDeckFileUrl(filename), "utf8")).trim();
  const submission = await decodeDeckHashSubmission({ hash, donDeckCount });
  if (submission.status !== "ready") {
    throw new TypeError(`Invalid ${filename}: ${submission.error}`);
  }
  return submission;
};
```

10. In `createDefaultDevMatchSetup`, call `resolveDevDonCounts`, decode both hash files with each player’s DON count, validate variants after building the combined manifest, and create player setup from those submissions.

- [ ] **Step 4: Replace dev deck examples**

After Task 1 dependency is installed, convert the current example lists into committed hash examples. Use this one-time command from the repo root:

```bash
node --input-type=module -e "import { readFile, writeFile } from 'node:fs/promises'; import { createDeckHashCodec, createApiDeckHashDictionarySource } from 'optcg-deck-hash'; const parse = (text) => text.trim().split(/\r?\n/u).map((line) => { const match = /^(?<count>[1-9]\d*)x(?<cardId>[A-Z0-9-]+)$/u.exec(line.trim()); if (!match?.groups) throw new Error(`bad line ${line}`); return { card_number: match.groups.cardId, count: Number(match.groups.count) }; }); const toDeck = (entries) => ({ leader: entries[0], main: entries.slice(1), don: null }); const codec = createDeckHashCodec({ dictionarySource: createApiDeckHashDictionarySource({ baseUrl: 'https://poneglyph.one' }) }); await codec.refreshDictionary(); for (const name of ['deck1', 'deck2']) { const entries = parse(await readFile(`packages/match-server/dev-decks/${name}.txt.example`, 'utf8')); const hash = await codec.encode(toDeck(entries)); await writeFile(`packages/match-server/dev-decks/${name}.hash.example`, `${hash}\n`); }"
```

Then delete the old examples:

```bash
git rm packages/match-server/dev-decks/deck1.txt.example packages/match-server/dev-decks/deck2.txt.example
```

Update `.gitignore`:

```gitignore
packages/match-server/dev-decks/deck1.hash
packages/match-server/dev-decks/deck2.hash
```

- [ ] **Step 5: Run manifest tests**

Run:

```bash
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/default-dev-manifest-boundary.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add .gitignore packages/match-server/src/default-dev-manifest.ts packages/match-server/src/default-dev-manifest-boundary.test.ts packages/match-server/dev-decks
git commit -m "Load dev decks from deck hashes"
```

## Task 3: Preserve Per-Copy Variant Art Outside Engine State

**Files:**

- Modify: `packages/match-server/src/local-match.ts`
- Modify: `packages/match-server/src/local-card-catalog.ts`
- Modify: `packages/match-server/src/dev-snapshot-types.ts`
- Modify: `packages/client/src/transport.ts`
- Modify: `packages/client/src/react/card-model.ts`
- Test: `packages/match-server/src/local-match.test.ts`
- Test: `packages/client/src/view-model.test.ts` or `packages/client/src/react/card-model.test.ts`

- [ ] **Step 1: Write failing server catalog variant test**

Add a test in `packages/match-server/src/local-match.test.ts` that creates a setup with two copies of the same card using different `deckVariantIndexes`, moves both into visible hand or visible trash, and asserts the catalog has different per-instance images:

```ts
test("local dev catalog preserves per-instance deck hash variants", () => {
  const match = createLocalDevMatch({
    matchId: "variant-match" as MatchId,
    firstPlayerId: "p1" as PlayerId,
    playerOrder: ["p1" as PlayerId, "p2" as PlayerId],
    rngSeed: "variant-seed",
    shuffleDecks: false,
    players: [
      {
        playerId: "p1" as PlayerId,
        leaderCardId: "L1" as CardId,
        leaderLifeCount: 0,
        deckCardIds: [
          "C1" as CardId,
          "C1" as CardId,
          "C2" as CardId,
          "C2" as CardId,
          "C2" as CardId,
        ],
        deckVariantIndexes: [0, 1, undefined, undefined, undefined],
        donDeckCardIds: [],
      },
      {
        playerId: "p2" as PlayerId,
        leaderCardId: "L2" as CardId,
        leaderLifeCount: 0,
        deckCardIds: [
          "C2" as CardId,
          "C2" as CardId,
          "C2" as CardId,
          "C2" as CardId,
          "C2" as CardId,
        ],
        donDeckCardIds: [],
      },
    ],
    cardManifest: {
      manifestHash: "variant-manifest",
      source: "dev",
      cardDataVersion: "test",
      effectDefinitionsVersion: "test",
      customHandlerVersion: "test",
      banlistVersion: "test",
      createdAt: "2026-05-31T00:00:00.000Z",
      cards: {
        ["L1" as CardId]: {
          cardId: "L1" as CardId,
          language: "en",
          name: "Leader One",
          category: "leader",
          set: "TEST",
          setName: "TEST",
          released: true,
          colors: ["red"],
          life: 5,
          attributes: [],
          types: [],
          printedKeywords: [],
          variants: [],
          legality: {},
          officialFaq: [],
          errata: [],
          sourceTextHash: "leader-one-source",
          behaviorHash: "leader-one-behavior",
          support: {
            cardId: "L1" as CardId,
            status: "vanilla-confirmed",
            tested: true,
            rulesVersion: "test",
            cardDataVersion: "test",
            sourceTextHash: "leader-one-source",
            behaviorHash: "leader-one-behavior",
          },
        },
        ["L2" as CardId]: {
          cardId: "L2" as CardId,
          language: "en",
          name: "Leader Two",
          category: "leader",
          set: "TEST",
          setName: "TEST",
          released: true,
          colors: ["blue"],
          life: 5,
          attributes: [],
          types: [],
          printedKeywords: [],
          variants: [],
          legality: {},
          officialFaq: [],
          errata: [],
          sourceTextHash: "leader-two-source",
          behaviorHash: "leader-two-behavior",
          support: {
            cardId: "L2" as CardId,
            status: "vanilla-confirmed",
            tested: true,
            rulesVersion: "test",
            cardDataVersion: "test",
            sourceTextHash: "leader-two-source",
            behaviorHash: "leader-two-behavior",
          },
        },
        ["C1" as CardId]: {
          cardId: "C1" as CardId,
          language: "en",
          name: "Variant Character",
          category: "character",
          set: "TEST",
          setName: "TEST",
          released: true,
          colors: ["black"],
          cost: 1,
          power: 1000,
          attributes: [],
          types: [],
          printedKeywords: [],
          variants: [
            {
              variantKey: "C1:v0" as VariantKey,
              variantIndex: 0,
              stockImageFull: "https://cdn.example/c1-v0.png",
            },
            {
              variantKey: "C1:v1" as VariantKey,
              variantIndex: 1,
              stockImageFull: "https://cdn.example/c1-v1.png",
            },
          ],
          legality: {},
          officialFaq: [],
          errata: [],
          sourceTextHash: "c1-source",
          behaviorHash: "c1-behavior",
          support: {
            cardId: "C1" as CardId,
            status: "vanilla-confirmed",
            tested: true,
            rulesVersion: "test",
            cardDataVersion: "test",
            sourceTextHash: "c1-source",
            behaviorHash: "c1-behavior",
          },
        },
        ["C2" as CardId]: {
          cardId: "C2" as CardId,
          language: "en",
          name: "Filler Character",
          category: "character",
          set: "TEST",
          setName: "TEST",
          released: true,
          colors: ["black"],
          cost: 1,
          power: 1000,
          attributes: [],
          types: [],
          printedKeywords: [],
          variants: [],
          legality: {},
          officialFaq: [],
          errata: [],
          sourceTextHash: "c2-source",
          behaviorHash: "c2-behavior",
          support: {
            cardId: "C2" as CardId,
            status: "vanilla-confirmed",
            tested: true,
            rulesVersion: "test",
            cardDataVersion: "test",
            sourceTextHash: "c2-source",
            behaviorHash: "c2-behavior",
          },
        },
      },
    },
  });

  const catalog = getLocalDevCardCatalogForPlayer(match, "p1" as PlayerId);
  const p1Catalog = catalog.players["p1" as PlayerId];
  assert.equal(
    p1Catalog?.instances?.["p1:deck:0:C1" as InstanceId]?.imageUrl,
    "https://cdn.example/c1-v0.png",
  );
  assert.equal(
    p1Catalog?.instances?.["p1:deck:1:C1" as InstanceId]?.imageUrl,
    "https://cdn.example/c1-v1.png",
  );
});
```

- [ ] **Step 2: Run the failing server catalog test**

Run:

```bash
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/local-match.test.ts
```

Expected: FAIL because `deckVariantIndexes` and `instances` catalog entries do not exist.

- [ ] **Step 3: Implement match-server variant override plumbing**

In `packages/match-server/src/local-match.ts`:

1. Extend `DevMatchPlayerSetup`:

```ts
leaderVariantIndex?: number;
deckVariantIndexes?: Array<number | undefined>;
```

2. Extend `LocalDevMatch`:

```ts
cardVariantOverrides: Record<InstanceId, VariantKey>;
```

3. Add a helper:

```ts
const variantKeyForIndex = (
  manifest: MatchCardManifest,
  cardId: CardId,
  variantIndex: number | undefined,
): VariantKey | undefined => {
  if (variantIndex === undefined) {
    return undefined;
  }
  const variant = manifest.cards[cardId]?.variants.find(
    (candidate) => candidate.variantIndex === variantIndex,
  );
  if (variant === undefined) {
    throw new TypeError(
      `Variant ${String(variantIndex)} is not available for ${String(cardId)}.`,
    );
  }
  return variant.variantKey;
};

const cardVariantOverridesForSetup = (
  setup: DevMatchSetup,
): Record<InstanceId, VariantKey> => {
  const overrides: Record<InstanceId, VariantKey> = {};
  for (const player of setup.players) {
    const leaderVariant = variantKeyForIndex(
      setup.cardManifest,
      player.leaderCardId,
      player.leaderVariantIndex,
    );
    if (leaderVariant !== undefined) {
      overrides[`${String(player.playerId)}:leader` as InstanceId] =
        leaderVariant;
    }
    player.deckCardIds.forEach((cardId, index) => {
      const variantKey = variantKeyForIndex(
        setup.cardManifest,
        cardId,
        player.deckVariantIndexes?.[index],
      );
      if (variantKey !== undefined) {
        overrides[
          `${String(player.playerId)}:deck:${String(index)}:${String(cardId)}` as InstanceId
        ] = variantKey;
      }
    });
  }
  return overrides;
};
```

4. Return the overrides from `createLocalDevMatch`.
5. Pass overrides into catalog builders:

```ts
buildLocalDevCardCatalog(
  match.state,
  getLocalDevSnapshot(match),
  match.cardVariantOverrides,
);
```

In `packages/match-server/src/dev-snapshot-types.ts`:

```ts
instances?: Record<InstanceId, DevCardCatalogEntry>;
```

In `packages/match-server/src/local-card-catalog.ts`:

1. Accept `variantOverrides: Record<InstanceId, VariantKey> = {}`.
2. Change `devCardCatalogEntry(card, variantKey)` to choose:

```ts
const selectedVariant =
  variantKey === undefined
    ? card.variants[0]
    : card.variants.find((candidate) => candidate.variantKey === variantKey);
```

3. When adding a visible card, populate both fallback card metadata and the instance metadata:

```ts
ownerCatalog.cards[cardId] = devCardCatalogEntry(manifestCard);
ownerCatalog.instances ??= {};
ownerCatalog.instances[card.instanceId] = devCardCatalogEntry(
  manifestCard,
  variantOverrides[card.instanceId],
);
```

- [ ] **Step 4: Implement client catalog preference**

In `packages/client/src/transport.ts`, add optional instance entries:

```ts
export interface MatchCardCatalog {
  players: Record<
    PlayerId,
    {
      cards: Record<CardId, MatchCardCatalogEntry>;
      instances?: Record<InstanceId, MatchCardCatalogEntry>;
    }
  >;
}
```

In `packages/client/src/react/card-model.ts`, update lookups to prefer instance entries:

```ts
const catalogEntryForCard = (
  catalog: MatchCardCatalog | undefined,
  card: { owner: PlayerId; cardId: CardId; instanceId: InstanceId },
): MatchCardCatalogEntry | undefined => {
  const playerCatalog = catalog?.players[card.owner];
  return (
    playerCatalog?.instances?.[card.instanceId] ??
    playerCatalog?.cards[card.cardId]
  );
};
```

Use this helper from `cardDisplayFromCatalog`, `cardModelFromCatalog`, and action log preview paths that receive an instance-bearing card ref.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/local-match.test.ts
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/match-server/src/local-match.ts packages/match-server/src/local-card-catalog.ts packages/match-server/src/dev-snapshot-types.ts packages/match-server/src/local-match.test.ts packages/client/src/transport.ts packages/client/src/react/card-model.ts packages/client/src
git commit -m "Preserve deck hash variant art per card instance"
```

## Task 4: Gate Custom Lobbies On Deck Hash Submissions

**Files:**

- Modify: `packages/match-server/src/dev-http-server.ts`
- Modify: `packages/match-server/src/default-dev-manifest.ts`
- Modify: `packages/match-server/src/dev-http-server.test.ts`
- Modify: `packages/client/src/transport.ts`

- [ ] **Step 1: Write failing server lobby tests**

Add tests in `packages/match-server/src/dev-http-server.test.ts`:

```ts
test("custom lobby waits for both claimed seats and ready deck submissions", async () => {
  const server = await createDevHttpServer({
    fetchCard: createDefaultDevFixtureFetch(),
    deckHashCodec: {
      decode: async (hash) =>
        hash === "p1-hash"
          ? {
              leader: { card_number: "OP13-079", count: 1 },
              main: [{ card_number: "OP13-080", count: 8 }],
              don: null,
            }
          : {
              leader: { card_number: "OP13-079", count: 1 },
              main: [{ card_number: "OP13-082", count: 8 }],
              don: null,
            },
    },
  });
  await server.listen(0);
  try {
    const root = server.url();
    const created = await createDevLobby(server);
    const joinedA = await joinDevLobby(
      server,
      String(created.lobbyId),
      "guest:a",
    );
    const joinedB = await joinDevLobby(
      server,
      String(created.lobbyId),
      "guest:b",
    );
    assert.equal(joinedA.matchId, undefined);
    assert.equal(joinedB.matchId, undefined);

    const submittedA = await submitDevLobbyDeck(
      server,
      String(created.lobbyId),
      "guest:a",
      "p1-hash",
    );
    assert.equal(submittedA.matchId, undefined);

    const submittedB = await submitDevLobbyDeck(
      server,
      String(created.lobbyId),
      "guest:b",
      "p2-hash",
    );
    assert.equal(typeof submittedB.matchId, "string");
  } finally {
    await server.close();
  }
});

test("lobby deck status does not expose deck contents to the other guest", async () => {
  const server = await createDevHttpServer({
    fetchCard: createDefaultDevFixtureFetch(),
    deckHashCodec: {
      decode: async () => ({
        leader: { card_number: "OP13-079", count: 1 },
        main: [{ card_number: "OP13-080", count: 8 }],
        don: null,
      }),
    },
  });
  await server.listen(0);
  try {
    const created = await createDevLobby(server);
    await joinDevLobby(server, String(created.lobbyId), "guest:a");
    await submitDevLobbyDeck(
      server,
      String(created.lobbyId),
      "guest:a",
      "p1-hash",
    );
    const response = await fetch(
      `${server.url()}/api/lobbies/${String(created.lobbyId)}`,
    );
    assert.equal(response.status, 200);
    const lobby = (await response.json()) as CreatedDevLobbyBody;

    assert.equal(JSON.stringify(lobby).includes("OP13-079"), false);
    assert.equal(JSON.stringify(lobby).includes("p1-hash"), false);
    assert.equal(lobby.seats.p1?.deck.status, "ready");
  } finally {
    await server.close();
  }
});
```

Add this helper beside the existing `joinDevLobby` helper:

```ts
const submitDevLobbyDeck = async (
  server: Awaited<ReturnType<typeof createFixtureDevHttpServer>>,
  lobbyId: string,
  guestToken: string,
  deckHash: string,
): Promise<CreatedDevLobbyBody> => {
  const response = await fetch(`${server.url()}/api/lobbies/${lobbyId}/deck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-optcg-session-token": guestToken,
    },
    body: JSON.stringify({ deckHash }),
  });
  assert.equal(response.status, 200);
  return (await response.json()) as CreatedDevLobbyBody;
};
```

Update `CreatedDevLobbyBody`:

```ts
interface CreatedDevLobbyBody {
  lobbyId?: string;
  matchId?: string;
  seat?: { playerId?: string };
  seats: Record<
    string,
    {
      playerId?: string;
      claimed?: boolean;
      deck: { status: "missing" | "ready" | "invalid" };
    }
  >;
  errors?: string[];
}
```

- [ ] **Step 2: Run failing server tests**

Run:

```bash
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/dev-http-server.test.ts
```

Expected: FAIL because `/deck` and deck status do not exist.

- [ ] **Step 3: Add setup creation from two submissions**

In `packages/match-server/src/default-dev-manifest.ts`, extract setup creation so lobby submissions do not have to touch dev files:

```ts
export interface CreateDevMatchSetupFromDeckSubmissionsInput extends Pick<
  CreatePremadeDevMatchSetupOptions,
  "fetchCard" | "baseUrl" | "redisUrl" | "matchId"
> {
  readonly firstPlayer: ReadyDeckSubmission;
  readonly secondPlayer: ReadyDeckSubmission;
}

export const createDevMatchSetupFromDeckSubmissions = async (
  input: CreateDevMatchSetupFromDeckSubmissionsInput,
): Promise<DevMatchSetup> => {
  const firstDecklist = createDevDecklistFromSubmission(input.firstPlayer);
  const secondDecklist = createDevDecklistFromSubmission(input.secondPlayer);
  const cardIds = createDevManifestCardIds(firstDecklist, secondDecklist);
  const cardManifest = await buildDevManifestFromCardIds(cardIds, input);
  validateDevDeckSubmissionVariants(firstDecklist, cardManifest);
  validateDevDeckSubmissionVariants(secondDecklist, cardManifest);
  return createDevMatchSetupFromDecklists({
    matchId: input.matchId,
    firstDecklist,
    secondDecklist,
    cardManifest,
  });
};
```

If `buildDevManifestFromCardIds` and `createDevMatchSetupFromDecklists` do not already exist, extract them from the current `createDefaultDevMatchSetup` body. Keep the default-file path as a thin reader that calls this submission function.

- [ ] **Step 4: Add deck-aware lobby registry**

In `packages/match-server/src/dev-http-server.ts`:

1. Extend public seat response:

```ts
deck: {
  status: "missing" | "ready" | "invalid";
}
```

2. Extend internal seat:

```ts
deckSubmission?: DeckSubmission;
```

3. Extend registry:

```ts
submitDeck: (
  lobbyId: string,
  auth: AuthContext | undefined,
  deckHash: string,
) =>
  Promise<
    | CreatedDevLobbyResponse
    | "lobbyNotFound"
    | "unauthenticated"
    | "seatNotFound"
    | "invalidDeck"
  >;
```

4. Change `ensureMatchWhenReady`:

```ts
const readySeats = Object.values(lobby.seats).every(
  (seat) =>
    seat.subject !== undefined && seat.deckSubmission?.status === "ready",
);
if (lobby.matchId !== undefined || !readySeats) {
  return;
}
const [first, second] = [
  lobby.seats.p1?.deckSubmission,
  lobby.seats.p2?.deckSubmission,
];
if (first?.status !== "ready" || second?.status !== "ready") {
  return;
}
const created = await matchRegistry.createMatch(
  await createDevMatchSetupFromDeckSubmissions({
    matchId: undefined,
    firstPlayer: first,
    secondPlayer: second,
    fetchCard: options.fetchCard,
    baseUrl: options.baseUrl,
    redisUrl: options.redisUrl,
  }),
);
lobby.matchId = created.matchId;
```

5. Add route:

```ts
const lobbyDeckRoute = /^\/api\/lobbies\/(?<lobbyId>[^/]+)\/deck$/u.exec(
  pathname,
);
if (request.method === "POST" && lobbyDeckRoute !== null) {
  const auth = authProvider.authenticate(request);
  const body = await readRequestJson(request);
  const deckHash = isRecord(body) ? body["deckHash"] : undefined;
  if (typeof deckHash !== "string" || deckHash.trim().length === 0) {
    sendJson(response, 400, { errors: ["Deck hash is required."] });
    return;
  }
  const result = await lobbyRegistry.submitDeck(lobbyId, auth, deckHash.trim());
  // mirror joinLobby error handling
  broadcastLobbyState(result, lobbyConnections);
  sendJson(response, 200, result);
  return;
}
```

6. Use `decodeDeckHashSubmission` in `submitDeck`, with the seat’s player-specific DON count.

- [ ] **Step 5: Run server tests**

Run:

```bash
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/dev-http-server.test.ts packages/match-server/src/default-dev-manifest-boundary.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/match-server/src/dev-http-server.ts packages/match-server/src/default-dev-manifest.ts packages/match-server/src/dev-http-server.test.ts packages/client/src/transport.ts
git commit -m "Gate custom lobbies on deck hash submissions"
```

## Task 5: Add Client Deck Hash Submission Flow

**Files:**

- Modify: `packages/client/src/transport.ts`
- Modify: `packages/client/src/transport-http.ts`
- Modify: `packages/client/src/controller.ts`
- Modify: `packages/client/src/controller.test.ts`
- Modify: `packages/client/src/react/MatchLoadingPanel.tsx`
- Modify: `packages/client/src/react/MatchApp.tsx`

- [ ] **Step 1: Write failing client controller tests**

In `packages/client/src/controller.test.ts`, extend the fake transport with:

```ts
submittedLobbyDecks: Array<{ lobbyId: string; guestToken: string; deckHash: string }>;
submitLobbyDeck(input) {
  submittedLobbyDecks.push(input);
  return Promise.resolve({
    lobbyId: input.lobbyId,
    seats: {
      p1: { playerId: "p1" as PlayerId, claimed: true, deck: { status: "ready" } },
      p2: { playerId: "p2" as PlayerId, claimed: false, deck: { status: "missing" } },
    },
  });
}
```

Add:

```ts
test("submits a lobby deck hash using the local guest identity", async () => {
  const transport = createFakeTransport();
  const controller = createMatchClientController({
    transport,
    sessionStore: createMemorySessionStore(),
  });

  await controller.joinLocalLobby({ lobbyId: "lobby-1" });
  const next = await controller.submitLobbyDeckHash({ deckHash: "deck-hash" });

  assert.deepEqual(transport.submittedLobbyDecks, [
    {
      lobbyId: "lobby-1",
      guestToken: transport.joinedLobbies[0]?.guestToken,
      deckHash: "deck-hash",
    },
  ]);
  assert.equal("lobbyId" in next, true);
});
```

- [ ] **Step 2: Run failing client tests**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/controller.test.ts
```

Expected: FAIL because transport/controller methods do not exist.

- [ ] **Step 3: Add client transport/controller method**

In `packages/client/src/transport.ts`:

```ts
export interface LobbyDeckStatus {
  status: "missing" | "ready" | "invalid";
}

export interface LocalLobby {
  lobbyId: string;
  seats: Record<
    string,
    { playerId: PlayerId; claimed: boolean; deck: LobbyDeckStatus }
  >;
  matchId?: MatchId;
}

submitLobbyDeck: (input: {
  lobbyId: string;
  guestToken: string;
  deckHash: string;
}) => Promise<LocalLobby>;
```

In `packages/client/src/transport-http.ts`:

```ts
async submitLobbyDeck(input) {
  return postJson<LocalLobby>(
    lobbyPath(input.lobbyId, "/deck"),
    { deckHash: input.deckHash },
    input.guestToken,
  );
}
```

In `packages/client/src/controller.ts`:

1. Add to `MatchClientController`:

```ts
submitLobbyDeckHash: (input: { deckHash: string }) =>
  Promise<MatchClientSessionState>;
```

2. Implement:

```ts
async submitLobbyDeckHash(input) {
  if (currentLobbyState === undefined) {
    throw new Error("Cannot submit a deck before joining a lobby.");
  }
  const guest = sessionStore.loadOrCreateGuestIdentity();
  const lobby = await transport.submitLobbyDeck({
    lobbyId: currentLobbyState.lobbyId,
    guestToken: guest.guestToken,
    deckHash: input.deckHash,
  });
  return claimMatchIfReady({
    ...currentLobbyState,
    lobby,
  });
}
```

- [ ] **Step 4: Add waiting lobby UI**

In `packages/client/src/react/MatchLoadingPanel.tsx`, replace the current static section with props:

```ts
export interface MatchLoadingPanelProps {
  firstPlayerSetup: boolean;
  lobbyId?: string | undefined;
  lobby?: LocalLobby | undefined;
  currentPlayerId?: PlayerId | undefined;
  disabled?: boolean | undefined;
  onSubmitDeckHash?: (deckHash: string) => void;
}
```

Render:

```tsx
const [deckHash, setDeckHash] = useState("");
const ownSeat =
  currentPlayerId === undefined
    ? undefined
    : Object.values(lobby?.seats ?? {}).find(
        (seat) => seat.playerId === currentPlayerId,
      );

return (
  <section className="loading-panel">
    <p>
      {firstPlayerSetup
        ? "Waiting for first-player setup"
        : lobbyId === undefined
          ? "Loading match"
          : `Waiting in lobby ${lobbyId}`}
    </p>
    {lobby !== undefined && onSubmitDeckHash !== undefined ? (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitDeckHash(deckHash.trim());
        }}
      >
        <label>
          Deck hash
          <input
            value={deckHash}
            onChange={(event) => setDeckHash(event.currentTarget.value)}
            disabled={disabled === true || ownSeat?.deck.status === "ready"}
          />
        </label>
        <button
          type="submit"
          disabled={
            disabled === true ||
            deckHash.trim().length === 0 ||
            ownSeat?.deck.status === "ready"
          }
        >
          {ownSeat?.deck.status === "ready" ? "Deck Ready" : "Submit Deck"}
        </button>
      </form>
    ) : null}
  </section>
);
```

In `packages/client/src/react/MatchApp.tsx`, pass:

```tsx
<MatchLoadingPanel
  firstPlayerSetup={firstPlayerSetupState !== undefined}
  lobbyId={lobbyState?.lobbyId}
  lobby={lobbyState?.lobby}
  currentPlayerId={currentPlayerId}
  disabled={client.state.actionInFlight}
  onSubmitDeckHash={(deckHash) => {
    void client.submitLobbyDeckHash(deckHash);
  }}
/>
```

If `useMatchClient` does not expose `submitLobbyDeckHash`, add a thin wrapper that calls the controller and updates `clientState`/errors like other session actions.

- [ ] **Step 5: Run client tests**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/client/src/transport.ts packages/client/src/transport-http.ts packages/client/src/controller.ts packages/client/src/controller.test.ts packages/client/src/react/MatchLoadingPanel.tsx packages/client/src/react/MatchApp.tsx packages/client/src/react/useMatchClient.ts packages/client/src/react
git commit -m "Submit deck hashes from custom lobbies"
```

## Task 6: Add Boundary Regression Tests

**Files:**

- Create or modify: `packages/match-server/src/deck-hash-boundary.test.ts`
- Modify: `packages/client/src/package-boundary.test.ts`
- Modify: `packages/engine-core/src/package-boundary.test.ts`

- [ ] **Step 1: Write boundary tests**

Create `packages/match-server/src/deck-hash-boundary.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

describe("deck hash package boundaries", () => {
  test("engine-core does not import deck hash, Redis, or cards package APIs", async () => {
    const source = await readFile(
      new URL("../../engine-core/src/index.ts", import.meta.url),
      "utf8",
    );
    assert.equal(source.includes("optcg-deck-hash"), false);
    assert.equal(source.includes("@optcg/cards"), false);
    assert.equal(source.includes("redis"), false);
  });

  test("client does not decode deck hashes directly", async () => {
    const transportSource = await readFile(
      new URL("../../client/src/transport.ts", import.meta.url),
      "utf8",
    );
    const controllerSource = await readFile(
      new URL("../../client/src/controller.ts", import.meta.url),
      "utf8",
    );
    assert.equal(transportSource.includes("optcg-deck-hash"), false);
    assert.equal(controllerSource.includes("optcg-deck-hash"), false);
  });

  test("default dev manifest no longer reads deck txt lists", async () => {
    const source = await readFile(
      new URL("./default-dev-manifest.ts", import.meta.url),
      "utf8",
    );
    assert.equal(source.includes("deck1.txt"), false);
    assert.equal(source.includes("deck2.txt"), false);
    assert.equal(source.includes("parseDevDecklistText"), false);
  });
});
```

- [ ] **Step 2: Run failing or passing boundary test**

Run:

```bash
corepack pnpm --filter @optcg/match-server exec vitest run --root ../.. packages/match-server/src/deck-hash-boundary.test.ts
```

Expected: PASS if prior tasks removed old text paths and kept boundaries clean. If it fails, fix only the boundary violation identified by the assertion.

- [ ] **Step 3: Commit**

Run:

```bash
git add packages/match-server/src/deck-hash-boundary.test.ts packages/client/src/package-boundary.test.ts packages/engine-core/src/package-boundary.test.ts
git commit -m "Guard deck hash package boundaries"
```

## Task 7: Final Verification

**Files:**

- No production edits unless verification finds a bug.

- [ ] **Step 1: Run focused package tests**

Run:

```bash
corepack pnpm --filter @optcg/match-server test
corepack pnpm --filter @optcg/client test
```

Expected: PASS.

- [ ] **Step 2: Run full repo checks**

Run:

```bash
corepack pnpm run format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm verify
```

Expected: PASS.

- [ ] **Step 3: Commit any verification-only fixes**

If verification required formatting or narrow test fixes:

```bash
git add packages/match-server packages/client .gitignore pnpm-lock.yaml
git commit -m "Fix deck hash verification issues"
```

If no files changed:

```bash
git status --short
```

Expected:

```text

```

No output after the branch header means the worktree is clean.

## Self-Review

**Spec coverage:**

- Custom lobbies accept deck hashes: Task 4 and Task 5.
- Dev deck files become hash files: Task 2.
- Same `DeckSubmission` boundary for dev files and lobbies: Task 1, Task 2, Task 4.
- DON deck remains separate: Task 1 tests decoded DON ignore, Task 2 keeps per-player DON counts.
- Variant art preserved: Task 3 instance override plumbing.
- Engine remains unaware of hashes/variants: Task 3 stores overrides outside `GameState`, Task 6 boundary tests.
- Hidden deck contents are not exposed through lobby state: Task 4 tests no hash/card IDs in public lobby response.

**Placeholder scan:**

- The plan has no `TBD`, `TODO`, "implement later", or unspecified validation steps.
- Code snippets define the new types and methods before later tasks use them.

**Type consistency:**

- `DeckSubmission`, `ReadyDeckSubmission`, and `DeckSubmissionEntry` are defined in Task 1 and reused by Task 2 and Task 4.
- `deckVariantIndexes` is added to `DevMatchPlayerSetup` before catalog override plumbing uses it.
- `instances` catalog entries are added to server and client transport types before `card-model.ts` reads them.
