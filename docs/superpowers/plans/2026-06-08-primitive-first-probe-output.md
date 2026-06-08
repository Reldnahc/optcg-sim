# Primitive-First Probe Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `support:probe` explain parser and runtime support through primitive-family evidence for text, card, and deck-hash audit reports while preserving raw unsupported-line output.

**Architecture:** Keep `packages/card-support/src/support-probe-report.ts` as the public orchestration module. Extract primitive support evidence formatting into a focused helper so parser certificate records, runtime support records, missing parser evidence, and missing runtime capability evidence can be reused across single-line, fetched-card, and deck-hash reports. Keep source spans, raw parser evidence, trigger/category/source-presence summaries, and parse failure details under diagnostics so they remain human debugging aids rather than support authority.

**Tech Stack:** TypeScript strict mode, Vitest, pnpm workspaces, existing `@optcg/types`, `@optcg/cards`, `@optcg/engine-core`, and `@optcg/card-support`.

---

## Scope

This plan implements Phase 5 from `docs/superpowers/plans/2026-06-08-scalable-card-shape-roadmap.md`.

In scope:

- Single `--text` probe reports should lead with primitive parser/runtime status and evidence sections.
- Fetched `--card` probe reports should include primitive evidence sections for parsed effect lines.
- Deck-hash report mode should include primitive evidence sections for failing parsed effect lines.
- Deck-hash `--raw-unsupported-lines` output must remain exact raw text lines with no diagnostics.
- Source spans and flat parser evidence remain visible only as diagnostics.
- Existing parser/runtime authority remains unchanged; formatting must not certify support.

Out of scope:

- Adding new parser primitives or runtime capabilities.
- Changing `RuntimeSupportReport` or `ParserSupportCertificate` contracts.
- Changing Poneglyph fetching or deck-hash decoding behavior.
- Changing generated-card support admission.

## File Structure

Create:

- `packages/card-support/src/primitive-support-output.ts`
  - Formats `ParserSupportCertificate` and `RuntimeSupportReport` values into primitive-first report sections.
- `packages/card-support/src/primitive-support-output.test.ts`
  - Unit tests for section order, record formatting, missing evidence formatting, and prefixing for card/deck reports.

Modify:

- `packages/card-support/src/support-probe-report.ts`
  - Reuse the primitive support formatter for text reports, fetched-card line reports, and deck-hash failure reports.
  - Move flat evidence and source spans under a diagnostics block for text reports.
  - Preserve raw unsupported-line output mode.
- `packages/card-support/src/support-probe.test.ts`
  - Update single-text expectations to the primitive-first headings.
  - Add fetched-card and deck-hash assertions that primitive sections are present on unsupported parsed lines.
  - Keep the raw unsupported-lines exact-output test unchanged.

Read-only validation:

- `packages/card-support/src/runtime-supported-cards.ts`
  - Confirm no changes are needed because the enriched runtime evaluator already returns `RuntimeSupportReport` data.

## Task 1: Extract Primitive Support Output Formatting

**Files:**

- Create: `packages/card-support/src/primitive-support-output.test.ts`
- Create: `packages/card-support/src/primitive-support-output.ts`

- [ ] **Step 1: Write the failing formatter tests**

Create `packages/card-support/src/primitive-support-output.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type {
  ParserSupportCertificate,
  RuntimeSupportReport,
} from "@optcg/types";

import {
  formatPrimitiveSupportSections,
  prefixPrimitiveSupportLines,
} from "./primitive-support-output.js";

describe("primitive support output", () => {
  it("formats parser certificate and runtime report records before missing evidence", () => {
    const parserCertificate = {
      complete: false,
      records: [
        {
          authority: "parser",
          family: "target",
          id: "opponentCharacters",
          sourceSpanIds: ["span:body"],
        },
      ],
      missing: [
        {
          authority: "parser",
          family: "unknown",
          id: "primitiveEvidence",
          reason: "runtime effect line has no primitive parser evidence",
        },
      ],
    } satisfies ParserSupportCertificate;
    const runtimeReports = [
      {
        supported: false,
        reason: "unsupported target primitive",
        records: [
          {
            authority: "runtime",
            family: "target",
            id: "opponentCharacters",
            supported: false,
            reason: "unsupported target primitive",
          },
        ],
        missing: [
          {
            authority: "runtime",
            family: "target",
            id: "opponentCharacters",
            reason: "unsupported target primitive",
          },
        ],
      },
    ] satisfies readonly RuntimeSupportReport[];

    expect(
      formatPrimitiveSupportSections({
        parserCertificate,
        runtimeReports,
      }),
    ).toEqual([
      "Primitive parser: failed",
      "Primitive runtime: failed",
      "Parser certificate records:",
      "- parser target:opponentCharacters spans span:body",
      "Runtime support records:",
      "- runtime target:opponentCharacters failed",
      "Missing parser evidence:",
      "- parser unknown:primitiveEvidence missing runtime effect line has no primitive parser evidence",
      "Missing runtime capability evidence:",
      "- runtime target:opponentCharacters missing unsupported target primitive",
    ]);
  });

  it("prefixes primitive support lines for card and deck audit contexts", () => {
    const lines = prefixPrimitiveSupportLines("OP01-002 line 1 ", [
      "Primitive runtime: failed",
      "Runtime support records:",
      "- runtime entryPoint:onBlock failed",
    ]);

    expect(lines).toEqual([
      "OP01-002 line 1 primitive runtime: failed",
      "OP01-002 line 1 runtime support records:",
      "OP01-002 line 1 - runtime entryPoint:onBlock failed",
    ]);
  });
});
```

- [ ] **Step 2: Run the formatter test and verify it fails**

Run:

```bash
corepack pnpm exec vitest run packages/card-support/src/primitive-support-output.test.ts
```

Expected: FAIL because `./primitive-support-output.js` does not exist.

- [ ] **Step 3: Implement the formatter helper**

Create `packages/card-support/src/primitive-support-output.ts`:

```ts
import type {
  MissingSupportEvidence,
  ParserSupportCertificate,
  RuntimeSupportReport,
  SupportEvidenceRecord,
} from "@optcg/types";

export interface PrimitiveSupportSectionInput {
  readonly parserCertificate: ParserSupportCertificate;
  readonly runtimeReports: readonly RuntimeSupportReport[];
}

export const formatPrimitiveSupportSections = ({
  parserCertificate,
  runtimeReports,
}: PrimitiveSupportSectionInput): readonly string[] => {
  const runtimeSupported = runtimeReports.every((report) => report.supported);
  const runtimeRecords = runtimeReports.flatMap((report) => report.records);
  const runtimeMissing = runtimeReports.flatMap((report) => report.missing);

  return [
    `Primitive parser: ${parserCertificate.complete ? "passed" : "failed"}`,
    `Primitive runtime: ${runtimeSupported ? "passed" : "failed"}`,
    ...(parserCertificate.records.length === 0
      ? []
      : [
          "Parser certificate records:",
          ...parserCertificate.records.map(formatSupportEvidenceRecord),
        ]),
    ...(runtimeRecords.length === 0
      ? []
      : [
          "Runtime support records:",
          ...runtimeRecords.map(formatSupportEvidenceRecord),
        ]),
    ...(parserCertificate.missing.length === 0
      ? []
      : [
          "Missing parser evidence:",
          ...parserCertificate.missing.map(formatMissingSupportEvidence),
        ]),
    ...(runtimeMissing.length === 0
      ? []
      : [
          "Missing runtime capability evidence:",
          ...runtimeMissing.map(formatMissingSupportEvidence),
        ]),
  ];
};

export const prefixPrimitiveSupportLines = (
  prefix: string,
  lines: readonly string[],
): readonly string[] =>
  lines.map((line) => `${prefix}${lowercaseSectionLead(line)}`);

const lowercaseSectionLead = (line: string): string =>
  line.length === 0
    ? line
    : `${line.charAt(0).toLocaleLowerCase("en-US")}${line.slice(1)}`;

const formatSupportEvidenceRecord = (record: SupportEvidenceRecord): string => {
  const status =
    record.supported === undefined
      ? ""
      : record.supported
        ? " passed"
        : " failed";
  const spans =
    record.sourceSpanIds === undefined || record.sourceSpanIds.length === 0
      ? ""
      : ` spans ${record.sourceSpanIds.join(", ")}`;
  return `- ${record.authority} ${record.family}:${record.id}${status}${spans}`;
};

const formatMissingSupportEvidence = (
  missing: MissingSupportEvidence,
): string =>
  `- ${missing.authority} ${missing.family}:${missing.id} missing ${missing.reason}`;
```

- [ ] **Step 4: Run the formatter test and verify it passes**

Run:

```bash
corepack pnpm exec vitest run packages/card-support/src/primitive-support-output.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/card-support/src/primitive-support-output.ts packages/card-support/src/primitive-support-output.test.ts
git commit -m "feat(card-support): format primitive support sections"
```

## Task 2: Use Primitive-First Output In Text And Card Probe Reports

**Files:**

- Modify: `packages/card-support/src/support-probe-report.ts`
- Modify: `packages/card-support/src/support-probe.test.ts`

- [ ] **Step 1: Write failing text/card output tests**

Modify the existing `reports parser certificates and runtime records for parsed text` test in `packages/card-support/src/support-probe.test.ts` to assert the Phase 5 headings:

```ts
it("reports primitive-first parser and runtime sections for parsed text", async () => {
  const report = await createSupportProbeReport({
    text: "[On Play] Draw 1 card.",
  });

  expect(report.exitCode).toBe(0);
  expect(report.lines).toContain("Primitive parser: passed");
  expect(report.lines).toContain("Primitive runtime: passed");
  expect(report.lines).toContain("Parser certificate records:");
  expect(report.lines).toContain("- parser entryPoint:onPlay spans span:entry");
  expect(report.lines).toContain("Runtime support records:");
  expect(report.lines).toContain("- runtime body:draw passed");
  expect(report.lines).toContain("Diagnostics:");
  expect(report.lines).toContain("Parser evidence diagnostics:");
  expect(report.lines).not.toContain("Evidence:");
});
```

Append this fetched-card unsupported-runtime test:

```ts
it("includes primitive missing runtime sections in card probe failures", async () => {
  const report = await createSupportProbeReport({
    cardId: "OP01-002",
    fetchCard: () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: {
              card_number: "OP01-002",
              effect: "[On Block] Draw 1 card.",
              trigger: null,
            },
          }),
      }),
  });

  expect(report.exitCode).toBe(1);
  expect(report.lines).toContain("Line 1 primitive parser: passed");
  expect(report.lines).toContain("Line 1 primitive runtime: failed");
  expect(report.lines).toContain("Line 1 runtime support records:");
  expect(report.lines).toContain("Line 1 - runtime entryPoint:onBlock failed");
  expect(report.lines).toContain("Line 1 missing runtime capability evidence:");
  expect(report.lines).toContain(
    "Line 1 - runtime entryPoint:onBlock missing unsupported trigger/category/source-presence envelope",
  );
});
```

- [ ] **Step 2: Run support probe tests and verify they fail**

Run:

```bash
corepack pnpm exec vitest run packages/card-support/src/support-probe.test.ts
```

Expected: FAIL because the current output still uses `Parser support evidence:`, `Runtime support evidence:`, and does not include primitive sections in card probe failures.

- [ ] **Step 3: Import the formatter and remove local support-line formatters**

In `packages/card-support/src/support-probe-report.ts`, add:

```ts
import {
  formatPrimitiveSupportSections,
  prefixPrimitiveSupportLines,
} from "./primitive-support-output.js";
```

Remove these local helpers after they are no longer used:

- `parserSupportLines`
- `runtimeSupportLines`
- `formatSupportEvidenceRecord`
- `formatMissing`

- [ ] **Step 4: Update text report output ordering**

In `createTextLineReport`, replace:

```ts
lines.push(
  `Engine runtime: ${lineReport.runtimeSupported ? "passed" : "failed"}`,
);
if (!lineReport.runtimeSupported) {
  lines.push(`Engine runtime reason: ${runtimeReason(lineReport)}`);
}
lines.push(...parserSupportLines(lineReport.parserCertificate));
lines.push(...runtimeSupportLines(lineReport.runtimeReports));
lines.push("Evidence:");
```

with:

```ts
lines.push(
  `Engine runtime: ${lineReport.runtimeSupported ? "passed" : "failed"}`,
);
if (!lineReport.runtimeSupported) {
  lines.push(`Engine runtime reason: ${runtimeReason(lineReport)}`);
}
lines.push(
  ...formatPrimitiveSupportSections({
    parserCertificate: lineReport.parserCertificate,
    runtimeReports: lineReport.runtimeReports,
  }),
);
lines.push("Diagnostics:");
lines.push("Parser evidence diagnostics:");
```

Leave the existing flat evidence loop in place after the new `Parser evidence diagnostics:` heading.

- [ ] **Step 5: Add primitive sections to fetched-card parsed effect lines**

In `createCardSupportProbeReport`, after the existing runtime reason block, add this guarded block:

```ts
if (lineReport.kind === "effect") {
  lines.push(
    ...prefixPrimitiveSupportLines(
      `Line ${String(lineNumber)} `,
      formatPrimitiveSupportSections({
        parserCertificate: lineReport.parserCertificate,
        runtimeReports: lineReport.runtimeReports,
      }),
    ),
  );
}
```

Raw keyword and metadata lines do not have parser certificates or runtime reports, so this guard must stay in place.

- [ ] **Step 6: Run support probe tests**

Run:

```bash
corepack pnpm exec vitest run packages/card-support/src/support-probe.test.ts packages/card-support/src/primitive-support-output.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/card-support/src/support-probe-report.ts packages/card-support/src/support-probe.test.ts
git commit -m "feat(card-support): show primitive support in probe reports"
```

## Task 3: Add Primitive Sections To Deck-Hash Audit Failures

**Files:**

- Modify: `packages/card-support/src/support-probe-report.ts`
- Modify: `packages/card-support/src/support-probe.test.ts`

- [ ] **Step 1: Write the failing deck-hash audit test**

Extend the existing `prints only failing cards in deck-hash probe mode` test in `packages/card-support/src/support-probe.test.ts` with these assertions:

```ts
expect(report.lines).toContain("OP01-002 line 1 primitive parser: passed");
expect(report.lines).toContain("OP01-002 line 1 primitive runtime: failed");
expect(report.lines).toContain("OP01-002 line 1 runtime support records:");
expect(report.lines).toContain(
  "OP01-002 line 1 - runtime entryPoint:onBlock failed",
);
expect(report.lines).toContain(
  "OP01-002 line 1 missing runtime capability evidence:",
);
expect(report.lines).toContain(
  "OP01-002 line 1 - runtime entryPoint:onBlock missing unsupported trigger/category/source-presence envelope",
);
```

Do not change the `prints only raw unsupported text lines in deck-hash raw mode` test.

- [ ] **Step 2: Run support probe tests and verify they fail**

Run:

```bash
corepack pnpm exec vitest run packages/card-support/src/support-probe.test.ts
```

Expected: FAIL because deck-hash failures do not yet include primitive support sections.

- [ ] **Step 3: Add primitive lines to deck-hash runtime failures**

In `createDeckHashSupportProbeReport`, inside the `if (!lineReport.runtimeSupported)` branch after the engine runtime reason line, add:

```ts
if (lineReport.kind === "effect") {
  cardFailureLines.push(
    ...prefixPrimitiveSupportLines(
      `${card.cardId} line ${String(lineNumber)} `,
      formatPrimitiveSupportSections({
        parserCertificate: lineReport.parserCertificate,
        runtimeReports: lineReport.runtimeReports,
      }),
    ),
  );
}
```

Do not add primitive sections to the `unsupportedTextLines` output path. That mode must continue to return only `unsupportedTextLines`.

- [ ] **Step 4: Run support probe tests**

Run:

```bash
corepack pnpm exec vitest run packages/card-support/src/support-probe.test.ts packages/card-support/src/primitive-support-output.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/card-support/src/support-probe-report.ts packages/card-support/src/support-probe.test.ts
git commit -m "feat(card-support): show primitive support in deck audits"
```

## Task 4: Final Verification

**Files:**

- Verify all files changed by this plan.

- [ ] **Step 1: Run focused card-support tests**

Run:

```bash
corepack pnpm exec vitest run packages/card-support/src/primitive-support-output.test.ts packages/card-support/src/support-probe.test.ts packages/card-support/src/runtime-supported-cards.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run parser/runtime contract tests touched by evidence output**

Run:

```bash
corepack pnpm exec vitest run tests/cards-engine/parser-engine-contract.test.mjs packages/cards/src/materialization/support-certificate.test.ts packages/engine-core/src/runtime-support-report.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run repo quality checks**

Run:

```bash
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run canonical repo verification**

Run:

```bash
corepack pnpm test
corepack pnpm verify
corepack pnpm coverage
```

Expected: PASS. If socket-bound match-server tests fail in the sandbox with localhost permission errors, rerun the same command with escalation.

- [ ] **Step 5: Confirm raw unsupported-line output remains stable**

Run:

```bash
corepack pnpm exec vitest run packages/card-support/src/support-probe.test.ts -t "prints only raw unsupported text lines in deck-hash raw mode"
```

Expected: PASS with the same exact `report.lines` array:

```ts
["[On Block] Draw 1 card.", "[Main] unsupported body."];
```

- [ ] **Step 6: Record final file sizes and worktree state**

Run:

```bash
wc -l packages/card-support/src/support-probe-report.ts packages/card-support/src/primitive-support-output.ts packages/card-support/src/support-probe.test.ts
git status --short
```

Expected: `support-probe-report.ts` does not materially grow, the formatter is focused, and the worktree is clean.

## Completion Notes

- Phase 5 output sections map directly to the roadmap:
  - Parser certificate records: `Parser certificate records:`
  - Runtime support records: `Runtime support records:`
  - Missing parser evidence: `Missing parser evidence:`
  - Missing runtime capability evidence: `Missing runtime capability evidence:`
  - Source spans and parse diagnostics: `Diagnostics:`, `Parser evidence diagnostics:`, and `Source spans:`
- Raw unsupported-line mode remains a scripting interface and must not receive primitive diagnostics.
- `runtime-supported-cards.ts` remains unchanged unless implementation reveals that the enriched runtime support evaluator is no longer wired through.
