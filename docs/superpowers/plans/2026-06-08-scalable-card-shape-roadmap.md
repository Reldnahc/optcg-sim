# Scalable Card Shape Roadmap

> **For agentic workers:** This is a roadmap document, not an execution plan. Convert each phase into a detailed implementation plan before changing code.

**Goal:** Improve scalable card support so generated cards become playable only through reusable primitive parser evidence and reusable runtime capability evidence.

**Architecture:** Build the system in phases. First define parser/runtime support evidence contracts, then use those contracts to decompose runtime modules, expand cross-product scalability tests, and improve support-probe diagnostics.

**Tech Stack:** TypeScript strict mode, pnpm workspaces, Vitest, existing `@optcg/types`, `@optcg/cards`, `@optcg/engine-core`, `@optcg/card-support`, and `@optcg/match-server`.

---

## Phase 1: Structured Support Certificate

**Objective:** Create parser-side support certificates that group flat parser evidence by authority family.

**Shape:**

- `entry:onPlay` becomes `family: "entryPoint", id: "onPlay"`.
- `instruction:draw` becomes `family: "body", id: "draw"`.
- `filter:category:stage` becomes `family: "filter", id: "category:stage"`.
- `composition:sequence` becomes `family: "composition", id: "sequence"`.

**Rules:**

- Certificate records must be generated from primitive parser evidence.
- Parser rule names, shape IDs, component labels, card IDs, fixture IDs, and runtime capability IDs may appear as diagnostics only.
- Generated card support must fail closed when a runtime effect line has no primitive parser evidence.

**Primary Files:**

- `packages/types/src/support-certification.ts`
- `packages/cards/src/materialization/support-certificate.ts`
- `packages/cards/src/materialization/effect-definitions.ts`
- `packages/cards/src/architecture-boundaries.test.ts`

**Exit Criteria:**

- Materialized generated support exposes a complete parser certificate.
- Missing parser evidence prevents generated support.
- Anti-authority tests prove diagnostics cannot certify support.

---

## Phase 2: Runtime Support Report

**Objective:** Replace coarse runtime admission output with structured primitive-family runtime support reports while preserving compatibility with `supported` and `reason`.

**Shape:**

- Supported records: `entryPoint:onPlay`, `sourcePresence:mustRemainInSameZone`, `body:draw`.
- Missing records: `family`, `id`, and `reason` for unsupported boundaries.
- Top-level `supported` remains the compatibility gate.

**Rules:**

- Runtime reports prove runtime capability only.
- Runtime reports must not become parser authority.
- Existing callers that only read `supported` or `reason` must continue to work.

**Primary Files:**

- `packages/types/src/support-certification.ts`
- `packages/engine-core/src/effect-runtime-support-report.ts`
- `packages/engine-core/src/effect-runtime-admission.ts`
- `packages/card-support/src/support-probe-report.ts`

**Exit Criteria:**

- Runtime admission returns records and missing entries for representative supported and unsupported blocks.
- Card-support tooling can surface runtime records.
- Parser/runtime contract tests show both sides reporting reusable primitive boundaries.

---

## Phase 3: Runtime Module Decomposition

**Objective:** Split oversized runtime modules by cohesive primitive concern after the certificate/report contract is in place.

**Targets:**

- `packages/engine-core/src/replacement/primitives.ts`
- `packages/engine-core/src/replacement/field-removal-process.ts`
- `packages/engine-core/src/effect-runtime-sequence/runner.ts`
- `packages/engine-core/src/effect-runtime-sequence/saved-field-object.ts`
- `packages/engine-core/src/effect-runtime-queue/results.ts`

**Rules:**

- Preserve existing public barrels and import paths unless a caller migration is explicitly planned.
- Split by responsibility, not line count.
- Each extracted module must own one testable concern such as target resolution, saved references, movement, decision resume, support admission, or execution.

**Exit Criteria:**

- No touched production runtime module remains above the hard 1000-line guard.
- Extracted modules have focused tests or preserve existing primitive tests.
- No new dumping-ground module is created.

---

## Phase 4: Cross-Product Scalability Tests

**Objective:** Prove reusable primitive support rather than one-card or one-line success.

**Required Test Families:**

- Same body under at least two wrappers.
- Same wrapper with at least two bodies.
- Same body with at least two target/filter/cardinality variations when supported.
- Same cost with at least two bodies when supported.
- Negative authority tests proving parser rule names, shape IDs, card IDs, runtime capability IDs, valid DSL, or generated inventory rows cannot certify support without primitive evidence.

**Primary Files:**

- `tests/cards-engine/parser-engine-contract.test.mjs`
- `packages/cards/src/architecture-boundaries.test.ts`
- `packages/engine-core/src/package-boundary.test.ts`
- Primitive-specific parser/runtime test files added near each concern.

**Exit Criteria:**

- New primitive support cannot land with only a single real-card example.
- Anti-shape tests cover prior failure modes.
- Generated support fails closed when primitive parser evidence is absent.

---

## Phase 5: Primitive-First Probe Output

**Objective:** Make `support:probe` explain parser and runtime support by primitive family, not by vague shape labels.

**Output Sections:**

- Parser certificate records.
- Runtime support records.
- Missing parser evidence.
- Missing runtime capability evidence.
- Source spans and parse diagnostics as human diagnostics only.

**Rules:**

- Probe output must not make diagnostics look authoritative.
- Failures should identify the next missing boundary, for example: parser target evidence exists but runtime target support is missing.

**Primary Files:**

- `packages/card-support/src/support-probe-report.ts`
- `packages/card-support/src/support-probe.test.ts`
- `packages/card-support/src/runtime-supported-cards.ts`

**Exit Criteria:**

- Probe output is useful for both a single text line and deck-hash support audits.
- Unsupported lines report the missing parser/runtime primitive boundary.
- Raw unsupported-line mode remains stable for scripting.

---

## Recommended Execution Order

1. Implement Phase 1 and Phase 2 together using the detailed plan in `docs/superpowers/plans/2026-06-08-support-certificates-runtime-reports-detailed.md`.
2. Use the new evidence contract to plan Phase 3 decompositions one subsystem at a time.
3. Add Phase 4 tests alongside each new primitive or decomposition.
4. Upgrade Phase 5 probe output after parser/runtime reports are stable enough to format.

## Verification Expectations

Each phase should run:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- relevant focused Vitest files
- `pnpm verify`
- `pnpm coverage` when behavior or support reporting changes
