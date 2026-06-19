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
- Modify `packages/card-support/src/support-probe-report.ts`
  - Imports shared source helpers instead of keeping private copies.
  - Keeps support-specific parser/runtime report formatting in this file.
- Modify `packages/card-support/src/behavior-probe.ts`
  - Adds structured failure metadata for materialization failures.
- Modify `packages/card-support/src/behavior-coverage.ts`
  - Adds structured entry results and bucketed summary rows.
  - Keeps aggregation pure over already-loaded text entries.
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
    const fetchCard: PoneglyphFetch = async () =>
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
      { baseUrl: "https://example.test", fetchCard },
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
    const fetchCard: PoneglyphFetch = async (url) => {
      seenUrls.push(String(url));
      if (String(url).includes("/v1/cards?set=OP01")) {
        return jsonResponse({ data: [{ card_number: "OP01-001" }] });
      }
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
      fetchCard,
    });

    expect(entries.ok).toBe(true);
    expect(
      entries.ok ? entries.entries.map((entry) => entry.label) : [],
    ).toEqual(["OP01-001 line 1"]);
    expect(seenUrls).toContain("https://example.test/v1/cards?set=OP01");
  });

  it("loads unique gameplay text entries for a deck hash", async () => {
    const deckHashCodec: DeckHashCodecPort = {
      decode: async () => ({
        leader: { card_number: "OP01-001", count: 1 },
        main: [{ card_number: "OP01-002", count: 4 }],
      }),
    };
    const fetchCard: PoneglyphFetch = async () =>
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
      fetchCard,
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
export const createPoneglyphCoverageEntriesFromCardIds = async (
  cardIds: readonly string[],
  options: { readonly baseUrl: string; readonly fetchCard: PoneglyphFetch },
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

Use `gameplayLinesFromTextParts([card.effect, card.trigger])` in `coverageEntriesForCard`.

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
  type PoneglyphFetch,
  type PoneglyphCardProbePayload,
} from "./poneglyph-card-source.js";
```

Remove the private duplicate declarations/functions from `support-probe-report.ts` after the import compiles.

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
corepack pnpm --filter @optcg/card-support test -- poneglyph-card-source.test.ts support-probe-report.test.ts
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
      expect.stringMatching(/^unsupported-effect-line/u),
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
      reason: expect.stringMatching(/^unsupported-effect-line/u),
    },
  ]);
  expect(report.lines).toContain("Behavior coverage bucket behaviorPassed: 1");
  expect(report.lines).toContain("Behavior coverage bucket scenarioMissing: 1");
  expect(report.lines).toContain(
    "Behavior coverage bucket materializationFailed: 1",
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

Classify:

```ts
const bucketForScenario = (status: BehaviorProbeScenario["status"]) => {
  if (status === "passed") return "behaviorPassed";
  if (status === "failed") return "scenarioFailed";
  return "scenarioMissing";
};
```

When `probe.failure?.kind === "materializationFailed"`, emit one entry result with `bucket: "materializationFailed"` and `reason: probe.failure.diagnostics[0] ?? "materialization failed"`.

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
it("runs coverage for a card id", async () => {
  const report = await createBehaviorCoverageCliReport(
    ["--", "--card", "OP01-001"],
    {
      fetchCard: async () => ({
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
      fetchCard: async (url) => {
        if (String(url).includes("/v1/cards?set=OP01")) {
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
        }),
      },
      fetchCard: async () => ({
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
```

- [ ] **Step 2: Run CLI tests and confirm red**

Run:

```bash
corepack pnpm --filter @optcg/card-support test -- behavior-coverage-cli.test.ts
```

Expected: FAIL because `createBehaviorCoverageCliReport` is synchronous and only supports `--text`.

- [ ] **Step 3: Make CLI async and source-aware**

Change signature:

```ts
export interface BehaviorCoverageCliDependencies {
  readonly fetchCard?: PoneglyphFetch;
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

Resolve source priority:

1. all `--text` values
2. all `--card` values
3. one `--set`
4. one `--deck-hash`
5. one `--fixture corpus`

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

For source errors from Poneglyph/deck hash loading, return a coverage report with one source-failed line:

```ts
{
  exitCode: 1,
  lines: [
    `Behavior coverage source: ${sourceLabel}`,
    "Behavior coverage entries: 0",
    "Behavior coverage bucket sourceFailed: 1",
    `Behavior coverage source failure: ${loaded.error}`,
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
}
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

if (process.argv[1]?.endsWith("behavior-coverage-cli.ts") === true) {
  process.exitCode = await main();
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

import { behaviorCoverageFixtureCorpus } from "./behavior-coverage-fixtures.js";

describe("behavior coverage fixture corpus", () => {
  it("contains stable labels and representative text", () => {
    expect(behaviorCoverageFixtureCorpus).toEqual(
      expect.arrayContaining([
        {
          label: "fixture:draw:on-play",
          text: "[On Play] Draw 1 card.",
          primitiveFamilies: ["draw"],
        },
        {
          label: "fixture:search:on-play",
          text: "[On Play] Look at 3 cards from the top of your deck; reveal up to 1 {Land of Wano} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
          primitiveFamilies: [
            "revealTop",
            "selectFromSet",
            "revealSelected",
            "moveSelected",
            "placeSetRemainder",
          ],
        },
      ]),
    );
  });

  it("does not contain duplicate labels", () => {
    const labels = behaviorCoverageFixtureCorpus.map((entry) => entry.label);
    expect(new Set(labels).size).toBe(labels.length);
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
  readonly primitiveFamilies: readonly string[];
}

export const behaviorCoverageFixtureCorpus = [
  {
    label: "fixture:draw:on-play",
    text: "[On Play] Draw 1 card.",
    primitiveFamilies: ["draw"],
  },
  {
    label: "fixture:draw-up-to:on-play",
    text: "[On Play] Draw up to 2 cards.",
    primitiveFamilies: ["drawUpTo"],
  },
  {
    label: "fixture:search:on-play",
    text: "[On Play] Look at 3 cards from the top of your deck; reveal up to 1 {Land of Wano} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    primitiveFamilies: [
      "revealTop",
      "selectFromSet",
      "revealSelected",
      "moveSelected",
      "placeSetRemainder",
    ],
  },
  {
    label: "fixture:when-attacking:draw",
    text: "[When Attacking] Draw 1 card.",
    primitiveFamilies: ["draw"],
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
    "Behavior coverage entry materializationFailed: materialization - unsupported-effect-line",
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

- [ ] **Step 6: Commit verification-only formatting changes**

If pre-commit or verification changed formatting, run:

```bash
git status --short
git add <changed-files>
git commit -m "Format behavior coverage feedback loop"
```

Expected final status: clean except generated `.probe-output/`.

---

## Self-Review

- Spec coverage: The plan covers real card/set/deck inputs, actionable buckets, fixture corpus, sorted feedback rows, and verification commands.
- Placeholder scan: No open-ended placeholders remain. Every task has files, tests, commands, and expected outcomes.
- Type consistency: `BehaviorCoverageSourceEntry`, `BehaviorCoverageBucket`, `BehaviorCoverageEntryResult`, and CLI dependency names are used consistently across tasks.
- Scope check: The plan stops at the feedback loop and first corpus. It does not attempt to add new scenario runners for every trigger; those should be driven by the bucket output in later implementation plans.
