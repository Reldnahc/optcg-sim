# Generic Parser Composition Implementation Plan

> **For agentic workers:** Execute after parser certificate semantics are
> trustworthy. Preserve source maps and evidence while migrating one syntax
> family at a time.

**Goal:** Replace exact full-line parsers that emit several primitives with
atomic parsers plus reusable composition rules.

**Architecture:** Atomic parsers recognize one semantic primitive and emit its
own evidence. Composers combine parsed primitives through typed connectors,
saved values, and branches. A printed full line may be a regression fixture,
but it may not be production support authority.

**Authoritative References:**

- `03-effects.s008`, `.s010`, `.s017`, `.s020`
- `09-card-data-repository.s006`, `.s007`, `.s009`
- `docs/code-standard.md` scalable card-shape rules
- [Parser Evidence Certification](./2026-07-14-parser-evidence-certification.md)

---

## Scope

### In Scope

- Inventory composite parsers that anchor an entire printed line.
- Add missing generic connectors and saved-value composition.
- Migrate the hand reset and draw-equal-to-trash-count examples first.
- Preserve typed output, source mapping, evidence, and runtime behavior.
- Install architecture tests that reject composite support authority.

### Out Of Scope

- Banning anchored regular expressions for atomic grammar.
- Changing effect runtime semantics.
- Adding support by card ID or printed-line allowlist.
- Replacement execution; use the replacement-runtime plan.

## Composition Rules

- Atomic syntax may use exact anchors when it owns one semantic primitive.
- A body parser must not recognize multiple clauses and directly construct the
  complete `sequence`, conditional, or optional tree.
- Connectors own ordering and branch semantics; primitive parsers own operands.
- Saved numbers and targets are typed references, not values copied by a
  card-specific parser.
- Every composed node preserves child source spans and parser evidence.
- Parser precedence is deterministic and cannot depend on registration order.

## Task 1: Inventory And Characterize Composite Rules

**Files:**

- Modify: parser architecture/source-scan tests
- Modify: focused parser tests for each identified family
- Create: a migration inventory beside this plan or in the tracking issue

- [ ] Find production rules that match conjunctions, punctuation-delimited
      clauses, or whole sentences and emit more than one typed primitive.
- [ ] Record each rule by missing atomic primitive, connector, saved reference,
      branch, or normalization capability.
- [ ] Distinguish valid atomic anchors from composite full-line authorization.
- [ ] Add output, source-map, and evidence characterization tests before edits.
- [ ] Use cross-product fixtures that vary counts, zones, players, filters, and
      connector wording; do not test only the original card line.
- [ ] Commit the inventory and failing genericity tests.

## Task 2: Add Missing Generic Composition Capabilities

**Files:**

- Modify: `packages/cards/src/connectors/*`
- Modify: `packages/cards/src/card-effect-line-parser/expression-registry.ts`
- Create: focused saved-number and connector modules/tests as needed

- [ ] Add a typed saved-number producer and consumer so a later primitive can
      reuse a count obtained by an earlier primitive.
- [ ] Add reusable same-number composition without naming either participating
      action in the connector.
- [ ] Make conjunction, sentence boundary, then, and if-you-do semantics explicit
      composer variants rather than parser-specific string handling.
- [ ] Compose shuffle as an ordinary following primitive where source text
      requires it.
- [ ] Define failure behavior for ambiguous connectors and unresolved saved
      references; fail closed with source diagnostics.
- [ ] Emit evidence for connector and reference boundaries as required by the
      certificate plan.
- [ ] Add cross-product tests independent of card IDs.
- [ ] Commit each missing generic capability separately.

## Task 3: Migrate The Two Confirmed Exact Parsers

**Files:**

- Modify: `packages/cards/src/instructions/hand-to-deck-bottom.ts`
- Modify: `packages/cards/src/segments/draw-for-each-field-trash-same.ts`
- Modify: their focused parser tests and expression registration

- [ ] Parse hand-to-deck-bottom, fixed draw, and shuffle as independent
      primitives, then compose them through generic sequence connectors.
- [ ] Parse field-trash count into a saved number and feed that reference into a
      generic draw primitive.
- [ ] Keep the current printed lines as regression fixtures only.
- [ ] Add variants for player, zone, quantity, filter, punctuation, and supported
      connector wording.
- [ ] Compare old and new typed trees, source spans, evidence requirements, and
      runtime results for the original fixtures.
- [ ] Remove the exact composite entry points once all callers use composition.
- [ ] Commit each migrated family independently.

## Task 4: Migrate Remaining Composite Families

**Files:**

- Modify: composite rules identified by Task 1
- Modify: parser group and expression registration
- Modify: focused and repository-level parser tests

- [ ] Order migrations by reusable capability, not by set or card number.
- [ ] For every family, add the missing primitive or composer first.
- [ ] Migrate all matching card lines to the generic path and compare generated
      support reports before deleting the specialized rule.
- [ ] Split ambiguous normalization from semantic parsing when punctuation or
      reminder text currently drives the whole-line matcher.
- [ ] Preserve deterministic precedence and reject ambiguous double matches.
- [ ] Do not retain a hidden exact fallback or allowlist after migration.
- [ ] Commit each cohesive syntax family separately.

## Task 5: Enforce The Composition Boundary

**Files:**

- Modify: parser architecture and source-scan tests
- Modify: repository support probes

- [ ] Prevent instruction and segment parsers from directly constructing a
      multi-child `sequence`; sequence construction belongs to composers.
- [ ] Scan for known retired full-line patterns and specialized function names.
- [ ] Reject production card-ID and exact-line mappings used as parser authority.
- [ ] Add a cross-product gate for every migrated family.
- [ ] Assert all composed source spans and evidence requirements are retained.
- [ ] Run the master card probe and review support-count deltas explicitly.
- [ ] Commit the permanent guard after all migrations land.

---

## Migration And Compatibility Notes

- Keep public effect and certificate contracts stable. This plan changes the
  parser implementation path, not the response schema.
- A compatibility adapter may translate an old internal node temporarily, but
  it must not recognize exact card lines or create certificate evidence.
- Support-count increases require generic cross-product proof. Unexpected
  decreases block completion until classified.
- Exact full-line strings remain useful fixtures and diagnostics; the ban is on
  using them as production authorization.

## Acceptance Criteria

- The two confirmed exact parsers are removed from production registration.
- Their supported semantics parse through atomic primitives and composers.
- Saved-number composition works across unrelated action pairs.
- No production body parser directly authorizes a multi-primitive full line.
- Source maps and complete evidence survive composition.
- Cross-product and master probes show only reviewed support changes.

## Verification

```sh
corepack pnpm exec vitest run packages/cards/src/card-effect-line-parser-draw-for-each-field-trash-same.test.ts
corepack pnpm exec vitest run packages/cards/src/card-effect-line-parser-hand-bottom-deck.test.ts
corepack pnpm exec vitest run packages/cards/src/card-effect-line-parser-source-map.test.ts
corepack pnpm exec vitest run packages/card-support
corepack pnpm support:probe
corepack pnpm master:probe
corepack pnpm test:tooling
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm coverage
corepack pnpm verify
```
