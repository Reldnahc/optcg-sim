# Behavior Proof Feedback Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `behavior:coverage` into a real feedback loop that proves supported card effects by running behavior scenarios over text, cards, sets, deck hashes, and a curated primitive fixture corpus.

**Architecture:** Keep behavior execution in `behavior-probe.ts`, aggregate proof in `behavior-coverage.ts`, and add a shared Poneglyph card text source so `support:probe` and `behavior:coverage` do not duplicate fetch/deck/set logic. Coverage output should classify each text line into actionable buckets: behavior passed, probe scenario missing, probe scenario failed, parser/runtime materialization failed, and source fetch failed.

**Tech Stack:** TypeScript, Vitest, existing `@optcg/card-support` package scripts, `optcg-deck-hash`, existing Poneglyph API fetch pattern, existing TypeScript AST engine primitive inventory.

---

## File Structure

- Create `packages/card-support/src/poneglyph-card-source.ts`
  - Owns Poneglyph card/set/deck text loading.
  - Exports typed fetch/deck ports so tests can inject fake cards and fake deck hashes.
  - Contains the shared batch fetch/chunk/deck aggregation helpers currently private in `support-probe-report.ts`.
  - Exposes lower-level card/deck/set helpers for `support:probe`, plus coverage-entry adapters for `behavior:coverage`.
- Modify `packages/card-support/src/support-probe-report.ts`
  - Imports shared source helpers instead of keeping private copies.
  - Keeps support-specific parser/runtime report formatting in this file.
- Modify `packages/card-support/src/behavior-probe.ts`
  - Adds structured failure metadata for materialization failures.
- Modify `packages/card-support/src/behavior-coverage.ts`
  - Adds structured entry results and bucketed summary rows.
  - Keeps aggregation pure over already-loaded text entries.
  - Exposes a small source-failure report factory so CLI source failures do not pollute text aggregation.
- Modify `packages/card-support/src/behavior-coverage-cli.ts`
  - Adds `--card`, `--set`, `--deck-hash`, and `--fixture corpus`.
  - Resolves sources, then calls the aggregator.
- Create `packages/card-support/src/behavior-coverage-fixtures.ts`
  - Curated representative text corpus for fast local primitive proof.
- Add or update tests beside each module.

---

### Task 1: Extract Shared Poneglyph Card Text Source

**Files:**

- Create: `packages/card-support/src/poneglyph-card-source.ts`
- Modify: `packages/card-support/src/support-probe-report.ts`
- Test: `packages/card-support/src/poneglyph-card-source.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/card-support/src/poneglyph-card-source.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  createPoneglyphCoverageEntriesFromCardIds,
  createPoneglyphCoverageEntriesFromDeckHash,
  createPoneglyphCoverageEntriesFromSet,
  type DeckHashCodecPort,
  type PoneglyphFetch,
} from "./poneglyph-card-source.js";

const jsonResponse = (payload: unknown) => ({
  ok: true,
  status: 200,
  json: async () => payload,
});

describe("poneglyph card source", () => {
  it("loads gameplay text entries for card ids", async () => {
    const fetchPoneglyph: PoneglyphFetch = async () =>
      jsonResponse({
        data: {
          "OP01-001": {
            card_number: "OP01-001",
            effect: "[On Play] Draw 1 card.",
            trigger: null,
          },
        },
        missing: [],
      });

    const entries = await createPoneglyphCoverageEntriesFromCardIds(
      ["OP01-001"],
      { baseUrl: "https://example.test", fetchPoneglyph },
    );

    expect(entries).toEqual({
      ok: true,
      entries: [
        {
          label: "OP01-001 line 1",
          cardId: "OP01-001",
          lineNumber: 1,
          text: "[On Play] Draw 1 card.",
        },
      ],
    });
  });

  it("loads gameplay text entries for a set code", async () => {
    const seenUrls: string[] = [];
    const fetchPoneglyph: PoneglyphFetch = async (url, init) => {
      seenUrls.push(String(url));
      if (String(url).includes("/v1/search?")) {
        return jsonResponse({ data: [{ card_number: "OP01-001" }] });
      }
      expect(String(url)).toBe("https://example.test/v1/cards/batch");
      expect(JSON.parse(String(init?.body))).toEqual({
        card_numbers: ["OP01-001"],
      });
      return jsonResponse({
        data: {
          "OP01-001": {
            card_number: "OP01-001",
            effect: "[On Play] Draw 1 card.",
            trigger: null,
          },
        },
        missing: [],
      });
    };

    const entries = await createPoneglyphCoverageEntriesFromSet("op01", {
      baseUrl: "https://example.test",
      fetchPoneglyph,
    });

    expect(entries.ok).toBe(true);
    expect(
      entries.ok ? entries.entries.map((entry) => entry.label) : [],
    ).toEqual(["OP01-001 line 1"]);
    expect(seenUrls).toEqual([
      "https://example.test/v1/search?page=1&limit=500&sort=card_number&order=asc&collapse=card",
      "https://example.test/v1/cards/batch",
    ]);
  });

  it("loads unique gameplay text entries for a deck hash", async () => {
    const deckHashCodec: DeckHashCodecPort = {
      decode: async () => ({
        leader: { card_number: "OP01-001", count: 1 },
        main: [{ card_number: "OP01-002", count: 4 }],
        don: null,
      }),
    };
    const fetchPoneglyph: PoneglyphFetch = async () =>
      jsonResponse({
        data: {
          "OP01-001": {
            card_number: "OP01-001",
            effect: "[Activate: Main] Draw 1 card.",
            trigger: null,
          },
          "OP01-002": {
            card_number: "OP01-002",
            effect: "[On Play] Draw 1 card.",
            trigger: null,
          },
        },
        missing: [],
      });

    const entries = await createPoneglyphCoverageEntriesFromDeckHash("hash", {
      baseUrl: "https://example.test",
      deckHashCodec,
      fetchPoneglyph,
    });

    expect(entries).toEqual({
      ok: true,
      entries: [
        {
          label: "OP01-001 line 1",
          cardId: "OP01-001",
          lineNumber: 1,
          text: "[Activate: Main] Draw 1 card.",
        },
        {
          label: "OP01-002 line 1",
          cardId: "OP01-002",
          lineNumber: 1,
          text: "[On Play] Draw 1 card.",
        },
      ],
    });
  });

  it("returns source errors instead of throwing for failed fetch and json parsing", async () => {
    const thrownFetch = await createPoneglyphCoverageEntriesFromCardIds(
      ["OP01-001"],
      {
        baseUrl: "https://example.test",
        fetchPoneglyph: async () => {
          throw new Error("network down");
        },
      },
    );
    expect(thrownFetch).toEqual({
      ok: false,
      error: "Poneglyph card batch fetch failed: network down",
    });

    const thrownJson = await createPoneglyphCoverageEntriesFromCardIds(
      ["OP01-001"],
      {
        baseUrl: "https://example.test",
        fetchPoneglyph: async () => ({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error("bad json");
          },
        }),
      },
    );
    expect(thrownJson).toEqual({
      ok: false,
      error: "Poneglyph card batch fetch failed: bad json",
    });
  });

  it("returns source errors for invalid batch payloads, missing cards, and set catalog HTTP failures", async () => {
    const invalidBatch = await createPoneglyphCoverageEntriesFromCardIds(
      ["OP01-001"],
      {
        baseUrl: "https://example.test",
        fetchPoneglyph: async () => jsonResponse({ nope: true }),
      },
    );
    expect(invalidBatch).toEqual({
      ok: false,
      error: "Poneglyph card batch fetch failed: invalid response payload",
    });

    const missingBatch = await createPoneglyphCoverageEntriesFromCardIds(
      ["OP01-001"],
      {
        baseUrl: "https://example.test",
        fetchPoneglyph: async () =>
          jsonResponse({
            data: {},
            missing: ["OP01-001"],
          }),
      },
    );
    expect(missingBatch).toEqual({
      ok: false,
      error: "Poneglyph card batch fetch failed: missing OP01-001",
    });

    const setHttpFailure = await createPoneglyphCoverageEntriesFromSet("OP01", {
      baseUrl: "https://example.test",
      fetchPoneglyph: async () => ({
        ok: false,
        status: 503,
        json: async () => ({}),
      }),
    });
    expect(setHttpFailure).toEqual({
      ok: false,
      error: "Poneglyph set catalog fetch failed for OP01: HTTP 503",
    });
  });

  it("returns source errors for deck hash decode rejection", async () => {
    const deckHashCodec: DeckHashCodecPort = {
      decode: async () => {
        throw new Error("bad deck");
      },
    };

    const result = await createPoneglyphCoverageEntriesFromDeckHash("hash", {
      baseUrl: "https://example.test",
      deckHashCodec,
      fetchPoneglyph: async () => jsonResponse({ data: {}, missing: [] }),
    });

    expect(result).toEqual({
      ok: false,
      error: "Deck hash decode failed: bad deck",
    });
  });
});
```

- [ ] **Step 2: Run tests and confirm red**

Run:

```bash
corepack pnpm --filter @optcg/card-support test -- poneglyph-card-source.test.ts
```

Expected: FAIL with `Cannot find module './poneglyph-card-source.js'`.

- [ ] **Step 3: Implement shared source module**

Create `packages/card-support/src/poneglyph-card-source.ts` with these public types and functions:

```ts
import { gameplayLinesFromTextParts } from "@optcg/cards";
import {
  createApiDeckHashDictionarySource,
  createDeckHashCodec,
  type DeckHashDeck,
} from "optcg-deck-hash";

export interface BehaviorCoverageSourceEntry {
  readonly label: string;
  readonly text: string;
  readonly cardId?: string;
  readonly lineNumber?: number;
}

export interface PoneglyphCardProbePayload {
  readonly cardId: string;
  readonly effect: string | null;
  readonly trigger: string | null;
}

export interface PoneglyphFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export interface PoneglyphFetchRequest {
  readonly method?: "GET" | "POST";
  readonly headers?: Record<string, string>;
  readonly body?: string;
}

export type PoneglyphFetch = (
  url: string | URL,
  init?: PoneglyphFetchRequest,
) => Promise<PoneglyphFetchResponse>;

export interface DeckHashCodecPort {
  readonly decode: (hash: string) => Promise<DeckHashDeck>;
}

export const defaultPoneglyphBaseUrl = "https://api.poneglyph.one";

export const createPoneglyphDeckHashCodec = (): DeckHashCodecPort => {
  const codec = createDeckHashCodec({
    dictionarySource: createApiDeckHashDictionarySource({
      baseUrl: "https://poneglyph.one",
    }),
  });
  return { decode: (hash) => codec.decode(hash) };
};
```

Move the existing private fetch/deck helpers from `support-probe-report.ts` into this file and expose:

```ts
export interface DeckHashProbeEntry {
  readonly cardId: string;
  readonly count: number;
  readonly variantIndex?: number;
}

export interface AggregatedDeckHashProbeEntry {
  readonly cardId: string;
  readonly count: number;
  readonly variantIndexes: readonly number[];
}

export const decodeProbeDeckHash = async (
  deckHash: string,
  codec: DeckHashCodecPort,
): Promise<
  | { readonly ok: true; readonly entries: readonly DeckHashProbeEntry[] }
  | { readonly ok: false; readonly error: string }
> => {
  try {
    const decoded = await codec.decode(deckHash);
    return { ok: true, entries: deckHashEntriesFromDecodedDeck(decoded) };
  } catch (error: unknown) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const deckHashEntriesFromDecodedDeck = (
  decoded: DeckHashDeck,
): readonly DeckHashProbeEntry[] => [
  ...(decoded.leader === null
    ? []
    : [
        {
          cardId: decoded.leader.card_number,
          count: decoded.leader.count,
          ...(decoded.leader.variant_index === undefined
            ? {}
            : { variantIndex: decoded.leader.variant_index }),
        },
      ]),
  ...decoded.main.map((entry) => ({
    cardId: entry.card_number,
    count: entry.count,
    ...(entry.variant_index === undefined
      ? {}
      : { variantIndex: entry.variant_index }),
  })),
];

export const aggregateDeckHashEntries = (
  entries: readonly DeckHashProbeEntry[],
): readonly AggregatedDeckHashProbeEntry[] => {
  const byCardId = new Map<string, AggregatedDeckHashProbeEntry>();
  for (const entry of entries) {
    const existing = byCardId.get(entry.cardId);
    const variantIndexes =
      entry.variantIndex === undefined ? [] : [entry.variantIndex];
    if (existing === undefined) {
      byCardId.set(entry.cardId, {
        cardId: entry.cardId,
        count: entry.count,
        variantIndexes,
      });
      continue;
    }
    byCardId.set(entry.cardId, {
      cardId: existing.cardId,
      count: existing.count + entry.count,
      variantIndexes: uniqueNumbers([
        ...existing.variantIndexes,
        ...variantIndexes,
      ]),
    });
  }
  return [...byCardId.values()];
};

const uniqueNumbers = (values: readonly number[]): readonly number[] => [
  ...new Set(values),
];

export const createPoneglyphCoverageEntriesFromCardIds = async (
  cardIds: readonly string[],
  options: {
    readonly baseUrl: string;
    readonly fetchPoneglyph: PoneglyphFetch;
  },
): Promise<
  | {
      readonly ok: true;
      readonly entries: readonly BehaviorCoverageSourceEntry[];
    }
  | { readonly ok: false; readonly error: string }
> => {
  const fetchedCards = await fetchPoneglyphCardPayloads(cardIds, options);
  const entries: BehaviorCoverageSourceEntry[] = [];
  for (const cardId of uniqueStrings(cardIds)) {
    const fetched = fetchedCards.get(cardId);
    if (fetched === undefined || !fetched.ok) {
      return {
        ok: false,
        error:
          fetched?.error ??
          `Poneglyph card fetch failed for ${cardId}: missing batch result`,
      };
    }
    entries.push(...coverageEntriesForCard(fetched.card));
  }
  return { ok: true, entries };
};
```

Use `gameplayLinesFromTextParts([card.effect, card.trigger])` in `coverageEntriesForCard`. The lower-level helpers (`decodeProbeDeckHash`, `aggregateDeckHashEntries`, `fetchPoneglyphCardPayload`, `fetchPoneglyphCardPayloads`, and `fetchPoneglyphSetCardIds`) must preserve the current `support:probe` behavior, including counts, variant indexes, `/v1/search` set catalog lookup, and `/v1/cards/batch` detail loading.

Also export `fetchPoneglyphCard` from this module as the default network adapter:

```ts
export const fetchPoneglyphCard = (
  url: string | URL,
  init?: PoneglyphFetchRequest,
): Promise<PoneglyphFetchResponse> => fetch(url, init);
```

Move the current implementations of `fetchPoneglyphCardPayload`, `fetchPoneglyphCardPayloads`, and `fetchPoneglyphSetCardIds` from `support-probe-report.ts` into `poneglyph-card-source.ts`, changing the option field name from `fetchCard` to `fetchPoneglyph` without changing URL behavior. All source helpers must catch thrown `fetchPoneglyph`, thrown `response.json()`, invalid payloads, missing batch cards, set catalog HTTP failures, and deck hash decode failures, returning `{ ok: false, error }` instead of throwing.

- [ ] **Step 4: Update support probe imports**

Modify `packages/card-support/src/support-probe-report.ts` to import shared helpers:

```ts
import {
  createPoneglyphDeckHashCodec,
  defaultPoneglyphBaseUrl,
  fetchPoneglyphCard,
  fetchPoneglyphCardPayload,
  fetchPoneglyphCardPayloads,
  fetchPoneglyphSetCardIds,
  type DeckHashCodecPort,
  type AggregatedDeckHashProbeEntry,
  type DeckHashProbeEntry,
  type PoneglyphFetch,
  type PoneglyphCardProbePayload,
} from "./poneglyph-card-source.js";
```

Remove the private duplicate declarations/functions from `support-probe-report.ts` after the import compiles.

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
corepack pnpm --filter @optcg/card-support test -- poneglyph-card-source.test.ts support-probe.test.ts
corepack pnpm --filter @optcg/card-support typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/card-support/src/poneglyph-card-source.ts packages/card-support/src/poneglyph-card-source.test.ts packages/card-support/src/support-probe-report.ts
git commit -m "Extract Poneglyph card text source"
```

### Task 2: Add Structured Coverage Buckets

**Files:**

- Modify: `packages/card-support/src/behavior-probe.ts`
- Modify: `packages/card-support/src/behavior-probe.test.ts`
- Modify: `packages/card-support/src/behavior-coverage.ts`
- Modify: `packages/card-support/src/behavior-coverage.test.ts`

Bucket exit-code policy:

| Bucket                  | Meaning                                                                        | Affects coverage proof?                                | Exit code |
| ----------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------ | --------- |
| `behaviorPassed`        | Scenario ran and drained successfully                                          | Covers primitives in that scenario                     | `0`       |
| `scenarioMissing`       | Parser/runtime supported it, but probe cannot generate that game situation yet | Does not cover primitives; actionable scenario work    | `0`       |
| `scenarioFailed`        | Probe generated the scenario but engine/probe execution failed                 | Does not cover primitives; likely bug                  | `1`       |
| `materializationFailed` | Parser/runtime materialization failed before behavior scenario generation      | Does not cover primitives; parser/runtime support work | `1`       |
| `sourceFailed`          | Card/set/deck text could not be loaded                                         | Does not cover primitives; source/network/deck issue   | `1`       |

- [ ] **Step 1: Write failing behavior probe failure metadata test**

Add this test to `behavior-probe.test.ts`:

```ts
it("reports materialization failures as structured probe failures", () => {
  const report = createBehaviorProbeReport({
    text: "[On Play] Do something unknown.",
  });

  expect(report.exitCode).toBe(1);
  expect(report.failure).toEqual({
    kind: "materializationFailed",
    diagnostics: expect.arrayContaining([
      "line 1 parse failed: no expression parser matched",
    ]),
  });
  expect(report.scenarios).toEqual([]);
});
```

- [ ] **Step 2: Run behavior probe test and confirm red**

Run:

```bash
corepack pnpm --filter @optcg/card-support test -- behavior-probe.test.ts
```

Expected: FAIL because `BehaviorProbeReport` has no `failure` field.

- [ ] **Step 3: Add behavior probe failure metadata**

Modify `BehaviorProbeReport`:

```ts
export type BehaviorProbeFailure = {
  readonly kind: "materializationFailed";
  readonly diagnostics: readonly string[];
};

export interface BehaviorProbeReport {
  readonly exitCode: number;
  readonly lines: readonly string[];
  readonly errors: readonly string[];
  readonly scenarios: readonly BehaviorProbeScenario[];
  readonly failure?: BehaviorProbeFailure;
}
```

When materialization fails, return:

```ts
failure: {
  kind: "materializationFailed",
  diagnostics: materialized.diagnostics,
},
```

- [ ] **Step 4: Write failing coverage bucket test**

Add this test to `behavior-coverage.test.ts`:

```ts
it("classifies each entry into actionable feedback buckets", () => {
  const report = createBehaviorCoverageReport({
    entries: [
      { label: "passed", text: "[On Play] Draw 1 card." },
      { label: "scenario-missing", text: "[When Attacking] Draw 1 card." },
      { label: "materialization", text: "[On Play] Do something unknown." },
    ],
    inventoryPrimitiveTypes: ["draw", "ko"],
  });

  expect(report.bucketSummary).toEqual({
    behaviorPassed: 1,
    scenarioMissing: 1,
    scenarioFailed: 0,
    materializationFailed: 1,
    sourceFailed: 0,
  });
  expect(report.entryResults).toEqual([
    {
      label: "passed",
      bucket: "behaviorPassed",
      primitiveTypes: ["draw"],
    },
    {
      label: "scenario-missing",
      bucket: "scenarioMissing",
      primitiveTypes: ["draw"],
      reason: "no generated scenario for trigger whenAttacking",
    },
    {
      label: "materialization",
      bucket: "materializationFailed",
      primitiveTypes: [],
      reason: "line 1 parse failed: no expression parser matched",
    },
  ]);
  expect(report.lines).toContain("Behavior coverage bucket behaviorPassed: 1");
  expect(report.lines).toContain("Behavior coverage bucket scenarioMissing: 1");
  expect(report.lines).toContain(
    "Behavior coverage bucket materializationFailed: 1",
  );
});
```

Add this source-failure report test:

```ts
it("creates source failure reports without running text aggregation", () => {
  const report = createBehaviorCoverageSourceFailureReport({
    sourceLabel: "card OP01-001",
    error: "Poneglyph card fetch failed for OP01-001: HTTP 503",
  });

  expect(report.exitCode).toBe(1);
  expect(report.bucketSummary).toEqual({
    behaviorPassed: 0,
    scenarioMissing: 0,
    scenarioFailed: 0,
    materializationFailed: 0,
    sourceFailed: 1,
  });
  expect(report.entryResults).toEqual([]);
  expect(report.lines).toContain("Behavior coverage source: card OP01-001");
  expect(report.lines).toContain("Behavior coverage bucket sourceFailed: 1");
  expect(report.lines).toContain(
    "Behavior coverage source failure: Poneglyph card fetch failed for OP01-001: HTTP 503",
  );
});
```

- [ ] **Step 5: Run coverage test and confirm red**

Run:

```bash
corepack pnpm --filter @optcg/card-support test -- behavior-coverage.test.ts
```

Expected: FAIL because `bucketSummary` and `entryResults` do not exist.

- [ ] **Step 6: Implement structured coverage bucket output**

Add types to `behavior-coverage.ts`:

```ts
export type BehaviorCoverageBucket =
  | "behaviorPassed"
  | "scenarioMissing"
  | "scenarioFailed"
  | "materializationFailed"
  | "sourceFailed";

export interface BehaviorCoverageEntryResult {
  readonly label: string;
  readonly bucket: BehaviorCoverageBucket;
  readonly primitiveTypes: readonly string[];
  readonly reason?: string;
}

export interface BehaviorCoverageBucketSummary {
  readonly behaviorPassed: number;
  readonly scenarioMissing: number;
  readonly scenarioFailed: number;
  readonly materializationFailed: number;
  readonly sourceFailed: number;
}
```

Add a report factory for source failures:

```ts
export const createBehaviorCoverageSourceFailureReport = (input: {
  readonly sourceLabel: string;
  readonly error: string;
}): BehaviorCoverageReport => ({
  exitCode: 1,
  lines: [
    `Behavior coverage source: ${input.sourceLabel}`,
    "Behavior coverage entries: 0",
    "Behavior coverage primitive coverage: 0/0",
    "Behavior coverage bucket behaviorPassed: 0",
    "Behavior coverage bucket scenarioMissing: 0",
    "Behavior coverage bucket scenarioFailed: 0",
    "Behavior coverage bucket materializationFailed: 0",
    "Behavior coverage bucket sourceFailed: 1",
    `Behavior coverage source failure: ${input.error}`,
  ],
  errors: [],
  bucketSummary: {
    behaviorPassed: 0,
    scenarioMissing: 0,
    scenarioFailed: 0,
    materializationFailed: 0,
    sourceFailed: 1,
  },
  entryResults: [],
});
```

Classify:

```ts
const bucketForScenario = (status: BehaviorProbeScenario["status"]) => {
  if (status === "passed") return "behaviorPassed";
  if (status === "failed") return "scenarioFailed";
  return "scenarioMissing";
};
```

When `probe.failure?.kind === "materializationFailed"`, emit one entry result with `bucket: "materializationFailed"` and `reason: probe.failure.diagnostics[0] ?? "materialization failed"`.

Set `exitCode` to `1` when any `scenarioFailed`, `materializationFailed`, or `sourceFailed` bucket is nonzero. Keep `scenarioMissing` as exit `0` so missing scenario families are visible without making the coverage command unusable as a discovery tool.

- [ ] **Step 7: Run tests and typecheck**

Run:

```bash
corepack pnpm --filter @optcg/card-support test -- behavior-probe.test.ts behavior-coverage.test.ts
corepack pnpm --filter @optcg/card-support typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add packages/card-support/src/behavior-probe.ts packages/card-support/src/behavior-probe.test.ts packages/card-support/src/behavior-coverage.ts packages/card-support/src/behavior-coverage.test.ts
git commit -m "Classify behavior coverage feedback buckets"
```

### Task 3: Wire `behavior:coverage` to Cards, Sets, and Deck Hashes

**Files:**

- Modify: `packages/card-support/src/behavior-coverage-cli.ts`
- Modify: `packages/card-support/src/behavior-coverage-cli.test.ts`

- [ ] **Step 1: Write failing CLI source tests**

Add tests to `behavior-coverage-cli.test.ts` that inject fake source dependencies:

```ts
// Update the existing --text and usage tests in this file to await
// createBehaviorCoverageCliReport(...) after the CLI becomes async.

it("keeps text coverage output compatible after the CLI becomes async", async () => {
  const report = await createBehaviorCoverageCliReport([
    "--",
    "--text",
    "[On Play] Draw 1 card.",
  ]);

  expect(report.exitCode).toBe(0);
  expect(report.lines).toContain("Behavior coverage source: text");
  expect(report.lines).toContain("Behavior coverage entries: 1");
  expect(report.lines).toContain("Behavior coverage passed scenarios: 1");
});

it("runs coverage for a card id", async () => {
  const report = await createBehaviorCoverageCliReport(
    ["--", "--card", "OP01-001"],
    {
      fetchPoneglyph: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            "OP01-001": {
              card_number: "OP01-001",
              effect: "[On Play] Draw 1 card.",
              trigger: null,
            },
          },
          missing: [],
        }),
      }),
      baseUrl: "https://example.test",
    },
  );

  expect(report.exitCode).toBe(0);
  expect(report.lines).toContain("Behavior coverage source: card OP01-001");
  expect(report.lines).toContain("Behavior coverage entries: 1");
  expect(report.lines).toContain("Behavior coverage passed scenarios: 1");
});

it("runs coverage for a set", async () => {
  const report = await createBehaviorCoverageCliReport(
    ["--", "--set", "OP01"],
    {
      fetchPoneglyph: async (url) => {
        if (String(url).includes("/v1/search?")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ data: [{ card_number: "OP01-001" }] }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              "OP01-001": {
                card_number: "OP01-001",
                effect: "[On Play] Draw 1 card.",
                trigger: null,
              },
            },
            missing: [],
          }),
        };
      },
      baseUrl: "https://example.test",
    },
  );

  expect(report.exitCode).toBe(0);
  expect(report.lines).toContain("Behavior coverage source: set OP01");
});
```

Add a deck hash test:

```ts
it("runs coverage for a deck hash", async () => {
  const report = await createBehaviorCoverageCliReport(
    ["--", "--deck-hash", "hash"],
    {
      deckHashCodec: {
        decode: async () => ({
          leader: null,
          main: [{ card_number: "OP01-001", count: 4 }],
          don: null,
        }),
      },
      fetchPoneglyph: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            "OP01-001": {
              card_number: "OP01-001",
              effect: "[On Play] Draw 1 card.",
              trigger: null,
            },
          },
          missing: [],
        }),
      }),
      baseUrl: "https://example.test",
    },
  );

  expect(report.exitCode).toBe(0);
  expect(report.lines).toContain("Behavior coverage source: deck hash");
});

it("returns source-failed coverage when source loading fails", async () => {
  const report = await createBehaviorCoverageCliReport(
    ["--", "--card", "OP01-001"],
    {
      fetchPoneglyph: async () => ({
        ok: false,
        status: 503,
        json: async () => ({}),
      }),
      baseUrl: "https://example.test",
    },
  );

  expect(report.exitCode).toBe(1);
  expect(report.bucketSummary.sourceFailed).toBe(1);
  expect(report.lines).toContain("Behavior coverage source: card OP01-001");
  expect(report.lines).toContain("Behavior coverage bucket sourceFailed: 1");
});

it("rejects conflicting source families instead of silently choosing one", async () => {
  const report = await createBehaviorCoverageCliReport([
    "--",
    "--text",
    "[On Play] Draw 1 card.",
    "--set",
    "OP01",
  ]);

  expect(report.exitCode).toBe(1);
  expect(report.errors).toEqual([
    "Choose exactly one behavior coverage source family: --text, --card, --set, --deck-hash, or --fixture",
  ]);
});
```

- [ ] **Step 2: Run CLI tests and confirm red**

Run:

```bash
corepack pnpm --filter @optcg/card-support test -- behavior-coverage-cli.test.ts
```

Expected: FAIL because source labels, source args, dependency injection, source failures, and conflicting-source validation are not implemented yet.

- [ ] **Step 3: Make CLI async and source-aware**

Change signature:

```ts
export interface BehaviorCoverageCliDependencies {
  readonly fetchPoneglyph?: PoneglyphFetch;
  readonly deckHashCodec?: DeckHashCodecPort;
  readonly baseUrl?: string;
}

export const createBehaviorCoverageCliReport = async (
  argv: readonly string[],
  dependencies: BehaviorCoverageCliDependencies = {},
): Promise<BehaviorCoverageReport> => {
  // parse --text, --card, --set, --deck-hash, --fixture
};
```

Resolve source selection:

- `--text` accepts one or more text values.
- `--card` accepts one or more card ids.
- `--set` accepts exactly one set code.
- `--deck-hash` accepts exactly one deck hash.
- `--fixture` accepts exactly one fixture name.
- Mixed source families are invalid and must return `Choose exactly one behavior coverage source family: --text, --card, --set, --deck-hash, or --fixture`.

If no source args exist, return:

```ts
{
  exitCode: 1,
  lines: [],
  errors: [
    "Usage: behavior:coverage -- --text <effect line> | --card <card id> | --set <set code> | --deck-hash <hash> | --fixture corpus",
  ],
}
```

For source errors from Poneglyph/deck hash loading, return `createBehaviorCoverageSourceFailureReport({ sourceLabel, error: loaded.error })` from `behavior-coverage.ts`. Do not duplicate source-failure line formatting in the CLI.

```ts
return createBehaviorCoverageSourceFailureReport({
  sourceLabel,
  error: loaded.error,
});
```

For successful sources, call `createBehaviorCoverageReport(...)` and prefix the source label in the returned report:

```ts
const coverage = createBehaviorCoverageReport({
  entries: source.entries,
  inventoryPrimitiveTypes,
});
return {
  ...coverage,
  lines: [`Behavior coverage source: ${source.sourceLabel}`, ...coverage.lines],
};
```

- [ ] **Step 4: Update CLI main**

Change main:

```ts
const main = async (): Promise<number> => {
  const report = await createBehaviorCoverageCliReport(process.argv.slice(2));
  for (const line of report.lines) {
    writeLine(line);
  }
  for (const error of report.errors) {
    writeError(error);
  }
  return report.exitCode;
};

const safeMain = async (): Promise<number> => {
  try {
    return await main();
  } catch (error: unknown) {
    const report = createBehaviorCoverageSourceFailureReport({
      sourceLabel: "unknown",
      error: error instanceof Error ? error.message : String(error),
    });
    for (const line of report.lines) {
      writeLine(line);
    }
    return report.exitCode;
  }
};

if (process.argv[1]?.endsWith("behavior-coverage-cli.ts") === true) {
  process.exitCode = await safeMain();
}
```

- [ ] **Step 5: Run tests and smoke commands**

Run:

```bash
corepack pnpm --filter @optcg/card-support test -- behavior-coverage-cli.test.ts
corepack pnpm run behavior:coverage -- --text "[On Play] Draw 1 card."
corepack pnpm --filter @optcg/card-support typecheck
```

Expected: PASS for tests/typecheck and CLI output includes `Behavior coverage source: text`.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/card-support/src/behavior-coverage-cli.ts packages/card-support/src/behavior-coverage-cli.test.ts
git commit -m "Wire behavior coverage to card sources"
```

### Task 4: Add Curated Behavior Proof Corpus

**Files:**

- Create: `packages/card-support/src/behavior-coverage-fixtures.ts`
- Create: `packages/card-support/src/behavior-coverage-fixtures.test.ts`
- Modify: `packages/card-support/src/behavior-coverage-cli.ts`
- Modify: `packages/card-support/src/behavior-coverage-cli.test.ts`

- [ ] **Step 1: Write failing corpus tests**

Create `behavior-coverage-fixtures.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createBehaviorProbeReport } from "./behavior-probe.js";
import { behaviorCoverageFixtureCorpus } from "./behavior-coverage-fixtures.js";

describe("behavior coverage fixture corpus", () => {
  it("contains stable labels and representative text", () => {
    expect(behaviorCoverageFixtureCorpus).toEqual(
      expect.arrayContaining([
        {
          label: "fixture:draw:on-play",
          text: "[On Play] Draw 1 card.",
          expectedPrimitiveTypes: ["draw"],
        },
        {
          label: "fixture:search:on-play",
          text: "[On Play] Look at 3 cards from the top of your deck; reveal up to 1 {Land of Wano} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
          expectedPrimitiveTypes: [
            "moveSelected",
            "placeSetRemainder",
            "revealSelected",
            "revealTop",
            "selectFromSet",
            "sequence",
          ],
        },
      ]),
    );
  });

  it("does not contain duplicate labels", () => {
    const labels = behaviorCoverageFixtureCorpus.map((entry) => entry.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps expected primitive metadata aligned with emitted primitives", () => {
    for (const fixture of behaviorCoverageFixtureCorpus) {
      const report = createBehaviorProbeReport({ text: fixture.text });
      const emitted = [
        ...new Set(
          report.scenarios.flatMap((scenario) => scenario.primitiveTypes),
        ),
      ].sort((left, right) => left.localeCompare(right));
      const expected = [...fixture.expectedPrimitiveTypes].sort((left, right) =>
        left.localeCompare(right),
      );

      expect(emitted, fixture.label).toEqual(expected);
    }
  });
});
```

Add CLI test:

```ts
it("runs coverage for the curated fixture corpus", async () => {
  const report = await createBehaviorCoverageCliReport([
    "--",
    "--fixture",
    "corpus",
  ]);

  expect(report.exitCode).toBe(0);
  expect(report.lines).toContain("Behavior coverage source: fixture corpus");
  expect(report.lines).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/^Behavior coverage entries: [1-9]\d*/u),
    ]),
  );
});
```

- [ ] **Step 2: Run tests and confirm red**

Run:

```bash
corepack pnpm --filter @optcg/card-support test -- behavior-coverage-fixtures.test.ts behavior-coverage-cli.test.ts
```

Expected: FAIL because the fixture module and CLI option do not exist.

- [ ] **Step 3: Implement initial corpus**

Create `behavior-coverage-fixtures.ts`:

```ts
export interface BehaviorCoverageFixtureEntry {
  readonly label: string;
  readonly text: string;
  readonly expectedPrimitiveTypes: readonly string[];
}

export const behaviorCoverageFixtureCorpus = [
  {
    label: "fixture:draw:on-play",
    text: "[On Play] Draw 1 card.",
    expectedPrimitiveTypes: ["draw"],
  },
  {
    label: "fixture:draw-up-to:on-play",
    text: "[On Play] Draw up to 2 cards.",
    expectedPrimitiveTypes: ["drawUpTo"],
  },
  {
    label: "fixture:search:on-play",
    text: "[On Play] Look at 3 cards from the top of your deck; reveal up to 1 {Land of Wano} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    expectedPrimitiveTypes: [
      "moveSelected",
      "placeSetRemainder",
      "revealSelected",
      "revealTop",
      "selectFromSet",
      "sequence",
    ],
  },
  {
    label: "fixture:when-attacking:draw",
    text: "[When Attacking] Draw 1 card.",
    expectedPrimitiveTypes: ["draw"],
  },
] as const satisfies readonly BehaviorCoverageFixtureEntry[];
```

This first corpus intentionally includes a known scenario-missing trigger so the feedback loop proves that skipped bucket accounting works.

- [ ] **Step 4: Wire `--fixture corpus`**

In `behavior-coverage-cli.ts`, map corpus entries to coverage entries:

```ts
if (fixtureName === "corpus") {
  return {
    sourceLabel: "fixture corpus",
    entries: behaviorCoverageFixtureCorpus.map((entry) => ({
      label: entry.label,
      text: entry.text,
    })),
  };
}
```

For unknown fixture names return usage error:

```ts
errors: ["Unknown behavior coverage fixture: " + fixtureName];
```

- [ ] **Step 5: Run tests**

Run:

```bash
corepack pnpm --filter @optcg/card-support test -- behavior-coverage-fixtures.test.ts behavior-coverage-cli.test.ts
corepack pnpm run behavior:coverage -- --fixture corpus
```

Expected: PASS for tests and CLI output includes `Behavior coverage source: fixture corpus`.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/card-support/src/behavior-coverage-fixtures.ts packages/card-support/src/behavior-coverage-fixtures.test.ts packages/card-support/src/behavior-coverage-cli.ts packages/card-support/src/behavior-coverage-cli.test.ts
git commit -m "Add behavior proof fixture corpus"
```

### Task 5: Sort Output for the Feedback Loop

**Files:**

- Modify: `packages/card-support/src/behavior-coverage.ts`
- Modify: `packages/card-support/src/behavior-coverage.test.ts`

- [ ] **Step 1: Write failing sorted output test**

Add this test to `behavior-coverage.test.ts`:

```ts
it("prints actionable entry rows grouped by bucket", () => {
  const report = createBehaviorCoverageReport({
    entries: [
      { label: "scenario-missing", text: "[When Attacking] Draw 1 card." },
      { label: "passed", text: "[On Play] Draw 1 card." },
      { label: "materialization", text: "[On Play] Do something unknown." },
    ],
    inventoryPrimitiveTypes: ["draw"],
  });

  const entryLines = report.lines.filter((line) =>
    line.startsWith("Behavior coverage entry "),
  );

  expect(entryLines).toEqual([
    "Behavior coverage entry materializationFailed: materialization - line 1 parse failed: no expression parser matched",
    "Behavior coverage entry scenarioMissing: scenario-missing - no generated scenario for trigger whenAttacking",
    "Behavior coverage entry behaviorPassed: passed - draw",
  ]);
});
```

- [ ] **Step 2: Run test and confirm red**

Run:

```bash
corepack pnpm --filter @optcg/card-support test -- behavior-coverage.test.ts
```

Expected: FAIL because entry rows are not printed.

- [ ] **Step 3: Implement grouped entry row output**

Add bucket order:

```ts
const bucketOrder: readonly BehaviorCoverageBucket[] = [
  "materializationFailed",
  "sourceFailed",
  "scenarioFailed",
  "scenarioMissing",
  "behaviorPassed",
];
```

Add lines:

```ts
...entryResults
  .slice()
  .sort((left, right) => {
    const bucketDelta =
      bucketOrder.indexOf(left.bucket) - bucketOrder.indexOf(right.bucket);
    return bucketDelta === 0
      ? left.label.localeCompare(right.label)
      : bucketDelta;
  })
  .map((entry) => {
    const detail = entry.reason ?? entry.primitiveTypes.join(", ");
    return `Behavior coverage entry ${entry.bucket}: ${entry.label} - ${detail}`;
  }),
```

- [ ] **Step 4: Run tests**

Run:

```bash
corepack pnpm --filter @optcg/card-support test -- behavior-coverage.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/card-support/src/behavior-coverage.ts packages/card-support/src/behavior-coverage.test.ts
git commit -m "Group behavior coverage feedback rows"
```

### Task 6: Verification and First Feedback Report

**Files:**

- No production edits expected.

- [ ] **Step 1: Run package tests**

Run:

```bash
corepack pnpm --filter @optcg/card-support test
```

Expected: PASS.

- [ ] **Step 2: Run root typecheck**

Run:

```bash
corepack pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run root lint**

Run:

```bash
corepack pnpm run lint
```

Expected: PASS.

- [ ] **Step 4: Run corpus coverage**

Run:

```bash
corepack pnpm run behavior:coverage -- --fixture corpus
```

Expected output includes:

```text
Behavior coverage source: fixture corpus
Behavior coverage entries: 4
Behavior coverage bucket behaviorPassed:
Behavior coverage bucket scenarioMissing:
```

- [ ] **Step 5: Run one real-card coverage smoke test**

Run:

```bash
corepack pnpm run behavior:coverage -- --card OP01-001
```

Expected: command exits with either:

- `exitCode 0` and `Behavior coverage source: card OP01-001`, or
- `exitCode 1` with `Behavior coverage bucket sourceFailed: 1` if Poneglyph/network is unavailable.

The command must not throw an uncaught exception.

- [ ] **Step 6: Confirm no verification-only edits remain**

Run:

```bash
git status --short
```

Expected final status: clean except generated `.probe-output/`. If verification unexpectedly changed files, do not hide that in a broad formatting commit; inspect the diff and either fold the change into the relevant task commit before continuing or create a narrowly named follow-up commit for the exact files that changed.

---

## Self-Review

- Spec coverage: The plan covers real card/set/deck inputs, actionable buckets, fixture corpus, sorted feedback rows, and verification commands.
- Placeholder scan: No open-ended placeholders remain. Every task has files, tests, commands, and expected outcomes.
- Type consistency: `BehaviorCoverageSourceEntry`, `BehaviorCoverageBucket`, `BehaviorCoverageEntryResult`, and CLI dependency names are used consistently across tasks.
- Scope check: The plan stops at the feedback loop and first corpus. It does not attempt to add new scenario runners for every trigger; those should be driven by the bucket output in later implementation plans.
