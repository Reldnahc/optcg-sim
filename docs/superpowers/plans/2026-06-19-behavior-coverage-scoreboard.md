# Behavior Coverage Scoreboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first behavior coverage scoreboard that turns behavior probe results into structured primitive proof coverage.

**Architecture:** Keep single-card/text execution in `behavior-probe.ts`, add structured scenario data to its report, then aggregate those scenarios in a new behavior coverage module. Add a CLI as a thin parser/formatter over the coverage module so future card/set/deck sources can reuse the same aggregation core.

**Tech Stack:** TypeScript, Vitest, existing `@optcg/card-support` CLI/report pattern, existing TypeScript AST primitive inventory.

---

### Task 1: Structured Behavior Probe Scenarios

**Files:**

- Modify: `packages/card-support/src/behavior-probe.ts`
- Modify: `packages/card-support/src/behavior-probe.test.ts`

- [ ] **Step 1: Write the failing test**

Add assertions that `createBehaviorProbeReport()` returns `scenarios` for passed and skipped probes:

```ts
expect(report.scenarios).toEqual([
  {
    index: 1,
    entrypoint: "playCard",
    cardCategory: "character",
    status: "passed",
    primitiveTypes: ["draw"],
  },
]);
```

For skipped probes, assert:

```ts
expect(report.scenarios).toEqual([
  {
    index: 1,
    status: "skipped",
    primitiveTypes: ["draw"],
    reason: "no generated scenario for trigger whenAttacking",
  },
]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @optcg/card-support test -- behavior-probe.test.ts`

Expected: FAIL because `BehaviorProbeReport` has no `scenarios` field.

- [ ] **Step 3: Write minimal implementation**

Add exported scenario types and populate `scenarios` in all `createBehaviorProbeReport()` branches:

```ts
export interface BehaviorProbeScenario {
  readonly index: number;
  readonly entrypoint?: "playCard";
  readonly cardCategory?: "character" | "event";
  readonly status: "passed" | "failed" | "skipped";
  readonly primitiveTypes: readonly string[];
  readonly reason?: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm --filter @optcg/card-support test -- behavior-probe.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/card-support/src/behavior-probe.ts packages/card-support/src/behavior-probe.test.ts
git commit -m "Structure behavior probe scenarios"
```

### Task 2: Behavior Coverage Aggregator

**Files:**

- Create: `packages/card-support/src/behavior-coverage.ts`
- Create: `packages/card-support/src/behavior-coverage.test.ts`
- Modify: `packages/card-support/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create tests proving aggregation over text entries:

```ts
const report = createBehaviorCoverageReport({
  entries: [
    { label: "draw", text: "[On Play] Draw 1 card." },
    { label: "attack", text: "[When Attacking] Draw 1 card." },
  ],
  inventoryPrimitiveTypes: ["draw", "ko"],
});

expect(report.lines).toContain("Behavior coverage entries: 2");
expect(report.lines).toContain("Behavior coverage primitive coverage: 1/2");
expect(report.lines).toContain("Behavior coverage passed scenarios: 1");
expect(report.lines).toContain("Behavior coverage skipped scenarios: 1");
expect(report.lines).toContain("Behavior coverage missing primitive: ko");
expect(report.lines).toContain(
  "Behavior coverage skipped reason: no generated scenario for trigger whenAttacking x1",
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @optcg/card-support test -- behavior-coverage.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement `createBehaviorCoverageReport()` by running `createBehaviorProbeReport()` for each entry, counting scenario statuses, collecting primitive types from passed scenarios, and comparing against the provided inventory primitive types.

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm --filter @optcg/card-support test -- behavior-coverage.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/card-support/src/behavior-coverage.ts packages/card-support/src/behavior-coverage.test.ts packages/card-support/src/index.ts
git commit -m "Add behavior coverage aggregation"
```

### Task 3: Behavior Coverage CLI

**Files:**

- Create: `packages/card-support/src/behavior-coverage-cli.ts`
- Create: `packages/card-support/src/behavior-coverage-cli.test.ts`
- Modify: `packages/card-support/package.json`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create CLI tests proving `--text` input and usage errors:

```ts
const report = createBehaviorCoverageCliReport([
  "--",
  "--text",
  "[On Play] Draw 1 card.",
]);

expect(report.exitCode).toBe(0);
expect(report.lines).toContain("Behavior coverage entries: 1");
expect(report.lines).toContain("Behavior coverage passed scenarios: 1");
```

Usage test:

```ts
expect(report.errors).toEqual([
  "Usage: behavior:coverage -- --text <effect line>",
]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @optcg/card-support test -- behavior-coverage-cli.test.ts`

Expected: FAIL because the CLI module does not exist.

- [ ] **Step 3: Write minimal implementation**

Add `createBehaviorCoverageCliReport(argv)` that parses one or more `--text` args and invokes `createBehaviorCoverageReport()`. Register package/root scripts named `behavior:coverage`.

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm --filter @optcg/card-support test -- behavior-coverage-cli.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/card-support/src/behavior-coverage-cli.ts packages/card-support/src/behavior-coverage-cli.test.ts packages/card-support/package.json package.json
git commit -m "Add behavior coverage CLI"
```

### Task 4: Verification

**Files:**

- No new files.

- [ ] **Step 1: Run focused package tests**

Run: `corepack pnpm --filter @optcg/card-support test`

Expected: PASS.

- [ ] **Step 2: Run root typecheck**

Run: `corepack pnpm run typecheck`

Expected: PASS.

- [ ] **Step 3: Run root lint**

Run: `corepack pnpm run lint`

Expected: PASS.

- [ ] **Step 4: Commit any verification-only formatting changes**

Run only if formatting hooks changed files:

```bash
git status --short
git add <changed-files>
git commit -m "Format behavior coverage tooling"
```

Expected: clean except generated `.probe-output/`.

---

## Self-Review

- Spec coverage: The plan implements structured behavior probe results, an aggregation layer, and a CLI scoreboard. It intentionally leaves network card/set/deck enumeration for the next slice after the aggregation substrate is stable.
- Placeholder scan: No placeholders remain.
- Type consistency: `BehaviorProbeScenario`, `createBehaviorCoverageReport`, and `createBehaviorCoverageCliReport` are named consistently across tasks.
