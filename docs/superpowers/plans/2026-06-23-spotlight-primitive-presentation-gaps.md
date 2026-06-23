# Spotlight Primitive Presentation Gap Plan

Date: 2026-06-23

## Goal

Make `corepack pnpm run spotlight:probe -- --set OP01` through `--set OP15`
pass without card-specific presentation patches.

The failures are runtime-supported effect blocks that have no generated
`presentation`. The engine can execute them, but the card parser path did not
emit source-backed `presentationSpans`, so the generated DSL has no text anchor
for spotlight.

## Current Probe Baseline

`OP16` is clean after the selected-base-power snapshot fix:

```text
Set: OP16
Cards: 119
Runtime-supported cards: 107
Runtime-supported effect blocks: 158
Spotlight-ready effect blocks: 158
Failures: none
```

`OP01` through `OP15` currently have 34 missing presentations across 2133
runtime-supported effect blocks, about 1.6%.

Clean set:

- `OP02`

Failing sets and failing blocks:

- `OP01`: `OP01-029`, `OP01-105`
- `OP03`: `OP03-001`, `OP03-043`
- `OP04`: `OP04-040`, `OP04-093`, `OP04-094`, `OP04-095`
- `OP05`: `OP05-111`, `OP05-114`
- `OP06`: `OP06-014`, `OP06-038`, `OP06-095:generated:1:1`, `OP06-095:generated:1:2`
- `OP07`: `OP07-035`, `OP07-095`
- `OP08`: `OP08-043`, `OP08-096`
- `OP09`: `OP09-101`
- `OP10`: `OP10-097`
- `OP11`: `OP11-024`, `OP11-035`, `OP11-059`
- `OP12`: `OP12-020`, `OP12-096`, `OP12-098`
- `OP13`: `OP13-001`
- `OP14`: `OP14-001`, `OP14-017`, `OP14-021`
- `OP15`: `OP15-002:generated:1:1`, `OP15-002:generated:1:2`, `OP15-086`, `OP15-092`

## Non-Goals

- Do not authorize gameplay support from presentation spans.
- Do not add card ID allowlists or exact failing-card branches.
- Do not loosen `spotlight:probe`.
- Do not make static presentation coverage pretend to validate arrow correctness
  or runtime target-link quality. That belongs in behavior probes.

## Invariants

- Parser primitive evidence remains the support authority.
- Presentation is derived from real source slices, not synthetic card metadata.
- Composer fixes should preserve child spans first.
- Whole-body fallback spans are acceptable only when the parser owns a complete
  reusable expression and cannot currently segment child text safely.
- A whole-body fallback may be added only after checking that child spans are
  absent or dropped, documenting the owner branch in the test name, and proving
  the fallback covers the reusable expression body rather than only entry/cost
  text.
- A runtime-supported block with no spotlightable text remains a probe failure.
- OP01-OP16 probes are the acceptance gate for this plan.

## Failure Assignment Matrix

Every current failing block must be assigned to one implementation slice before
work starts:

| Failure                  | Primary family                                    | Slice |
| ------------------------ | ------------------------------------------------- | ----- |
| `OP01-029`               | selected target continuation                      | B     |
| `OP01-105`               | opponent hand reveal leaf primitive               | E     |
| `OP03-001`               | optional cost / paid-count body                   | C     |
| `OP03-043`               | optional cost / if-you-do body                    | C     |
| `OP04-040`               | conditional choice / instead composer             | D     |
| `OP04-093`               | selected target continuation                      | B     |
| `OP04-094`               | conditional choice / instead composer             | D     |
| `OP04-095`               | selected target continuation                      | B     |
| `OP05-111`               | optional play cost plus field-to-life movement    | G     |
| `OP05-114`               | selected target continuation                      | B     |
| `OP06-014`               | optional cost / paid-count body                   | C     |
| `OP06-038`               | selected target continuation                      | B     |
| `OP06-095:generated:1:1` | multi-entry optional paid-count body              | C     |
| `OP06-095:generated:1:2` | multi-entry optional paid-count body              | C     |
| `OP07-035`               | selected target continuation                      | B     |
| `OP07-095`               | selected target continuation                      | B     |
| `OP08-043`               | planned attack restriction / opponent attack cost | G     |
| `OP08-096`               | reveal-top conditional counter                    | G     |
| `OP09-101`               | field-to-life costed movement plus hand trash     | G     |
| `OP10-097`               | selected target continuation                      | B     |
| `OP11-024`               | optional cost / if-you-do play body               | C     |
| `OP11-035`               | optional cost / if-you-do play body               | C     |
| `OP11-059`               | selected target continuation                      | B     |
| `OP12-020`               | delayed activate-main sequence                    | F     |
| `OP12-096`               | conditional choice / instead composer             | D     |
| `OP12-098`               | selected target continuation                      | B     |
| `OP13-001`               | optional cost / paid-count body                   | C     |
| `OP14-001`               | base-power swap leaf primitive                    | E     |
| `OP14-017`               | base-power swap leaf primitive                    | E     |
| `OP14-021`               | selected refresh-lock / implicit reaction         | G     |
| `OP15-002:generated:1:1` | multi-entry optional paid-count body              | C     |
| `OP15-002:generated:1:2` | multi-entry optional paid-count body              | C     |
| `OP15-086`               | played object keyword continuation                | E     |
| `OP15-092`               | apply-each continuous leaf primitive              | E     |

## Failure Families

### 1. Selected Target Continuations

Representative failures:

- `OP01-029`
- `OP04-093`
- `OP04-095`
- `OP05-114`
- `OP06-038`
- `OP07-035`
- `OP07-095`
- `OP10-097`
- `OP11-059`
- `OP12-098`

Common printed shapes:

```text
Up to 1 of your Leader or Character cards gains +2000 power during this battle.
Then, if ..., that card gains an additional +2000 power during this battle.
```

```text
Up to 1 of your {Dressrosa} type Characters gains +6000 power during this turn.
Then, if ..., that card gains [Double Attack] during this turn.
```

Likely owner:

- `packages/cards/src/segments/selected-power-continuation.ts`

Problem:

Several selected continuation parsers build a reusable select-then-apply
sequence and evidence, but return no `presentationSpans`.

Plan:

1. Add a local `bodySpan(input, evidence)` helper in
   `selected-power-continuation.ts`, following the OP16 fix pattern in
   `selected-base-power-snapshot.ts`.
2. Add `presentationSpans` to:
   - `parseSelectedPowerContinuation`
   - `parseExplicitSelectKeywordContinuation`
   - `parseSelectedPowerKeywordContinuation`
   - `parseSelectedPowerRefreshLockContinuation`
   - `parseSelectedPowerKoProtectionContinuation`
   - `parseSelectedFieldActivationPowerContinuation`, if probe failures remain
3. Preserve any child spans if a child parser already provides them; do not
   duplicate the same span ID.
4. Add focused parser tests for:
   - conditional additional power
   - conditional keyword grant
   - existing non-conditional selected continuation
5. Re-run `spotlight:probe` for sets with this family before moving on.

Expected impact:

This should clear the largest cluster of event/counter missing presentations.

### 2. Optional Cost And Paid-Count Bodies

Representative failures:

- `OP03-001`
- `OP03-043`
- `OP06-014`
- `OP06-095`
- `OP11-024`
- `OP11-035`
- `OP13-001`
- `OP15-002`

Common printed shapes:

```text
You may trash any number of Event or Stage cards from your hand.
This Leader gains +1000 power during this battle for every card trashed.
```

```text
You may rest 1 of your DON!! cards. If you do, play up to 1 ... from your hand.
```

Likely owners:

- `packages/cards/src/segments/optional-costed-effect.ts`
- `packages/cards/src/costs/*`
- relevant body parsers reached by `parseOptionalCostedBody`

Problem:

`optional-costed-effect.ts` already combines cost and body presentation spans,
but many cost/body child parsers in these shapes return no spans. When both
sides are spanless, the whole optional-costed expression is spanless.

Plan:

1. Audit the failing optional-cost inputs with `parseCardEffectLineDetailed` to
   confirm whether the missing side is cost, body, or both.
2. Prefer fixing leaf parsers first:
   - costs should expose cost spans from their consumed source slices.
   - body parsers should expose body spans from their consumed source slices.
3. Add a conservative fallback in `optional-costed-effect.ts` only if a parsed
   optional-cost expression has `input.source` and both cost/body spans are
   absent. The fallback should be a single `span:body` or
   `span:body:optionalCosted` source span over the whole expression.
4. Add tests proving optional-costed effects with paid-count dynamic values emit
   source-map spans without changing evidence.
5. Re-run probes for `OP03`, `OP06`, `OP11`, `OP13`, and `OP15`.

Expected impact:

This should clear the implicit reaction and paid-count power failures, but may
also improve future optional-costed effects.

### 3. Conditional Choice / Instead Composers

Representative failures:

- `OP04-040`
- `OP04-094`
- `OP12-096`

Common printed shapes:

```text
If condition, do A. If stronger condition, you may do B instead of A.
```

Likely owners:

- `packages/cards/src/segments/composed-expression.ts`
- `packages/cards/src/segments/choose-one.ts`
- condition-specific expression registry branches under
  `packages/cards/src/card-effect-line-parser/expression-registry.ts`

Problem:

The parser produces valid conditional/choice/select-then-apply effects, but the
composer path can lose child body spans or never creates a body span for the
combined conditional choice.

Plan:

1. Identify the exact parser branch for each representative line with
   `parseCardEffectLineDetailed`.
2. If child body spans exist, preserve them through the conditional composer.
3. If no child spans exist, first confirm which branch consumed the full
   reusable conditional-choice expression.
4. Add a source-backed body span only at that owning branch, and add a test
   named for the reusable parser family proving the span covers the body text.
5. Add tests for:
   - conditional stronger KO selection
   - conditional draw-vs-life replacement line
6. Re-run probes for `OP04` and `OP12`.

Expected impact:

This should clear the conditional choice cluster without changing runtime
semantics.

### 4. Multi-Entry Alternatives

Representative failures:

- `OP06-095:generated:1:1`
- `OP06-095:generated:1:2`
- `OP15-002:generated:1:1`
- `OP15-002:generated:1:2`

Common printed shapes:

```text
[Main]/[Counter] ...
```

```text
[When Attacking]/[On Your Opponent's Attack] ...
```

Likely owners:

- `packages/cards/src/orchestrator.ts`
- entry-point alternative parsing
- body parser families from slices 1 and 2

Problem:

Entry alternatives produce one block per entry. The entry spans exist, but if
the shared body parser returns no body spans both generated blocks fail.

Plan:

1. Do not special-case entry alternatives first.
2. Fix the underlying shared body families in slices 1 and 2.
3. After those fixes, re-probe OP06 and OP15.
4. Only touch entry-alternative code if body spans are present in detailed parse
   output but not copied to all generated blocks.

Expected impact:

These should likely clear as side effects of selected continuation and
optional-cost fixes.

### 5. Special Leaf Primitives

Representative failures:

- `OP01-105`: opponent hand reveal
- `OP14-001`, `OP14-017`: base-power swap
- `OP15-092`: apply-each continuous

Likely owners:

- `packages/cards/src/segments/opponent-hand-reveal.ts`
- `packages/cards/src/segments/base-power-swap.ts`
- `packages/cards/src/segments/apply-each-continuous.ts`

Problem:

These are reusable primitive parsers that emit strong evidence and executable
effects but no source spans.

Plan:

1. Add source-backed body spans to each leaf parser.
2. In `base-power-swap.ts`, use one span for the whole reusable swap expression
   first. Do not split selection and swap text unless that split is already
   reliable.
3. In `opponent-hand-reveal.ts`, use one body span over the hand selection and
   reveal instruction.
4. In `apply-each-continuous.ts`, preserve bullet-level spans if feasible from
   `parseBulletListPayload`; otherwise use one body span over the whole
   apply-each expression as an interim static coverage fix.
5. Add direct parser tests for each primitive.

Expected impact:

Clears isolated misses while staying primitive-owned.

### 6. Played Object Continuations

Representative failure:

- `OP15-086`

Common printed shape:

```text
play up to 1 ... from your trash. The Character played with this effect gains
[Rush] during this turn.
```

Likely owner:

- `packages/cards/src/segments/played-object-keyword-grant.ts`

Problem:

The parser connects `playSelected` to a keyword grant on the played object, but
presentation does not survive into the generated effect.

Plan:

1. Add source-backed body spans to the played-object keyword continuation parser.
2. Verify the effect still targets the saved played object, not source or self.
3. Add a parser test with a non-OP15 exact text variant if possible, to prove
   primitive ownership.
4. Re-probe `OP15`.

Expected impact:

Clears `OP15-086`.

### 7. Delayed / Activate-Main Sequence

Representative failure:

- `OP12-020`

Common printed shape:

```text
If this Leader battles your opponent's Character during this turn, set this
Leader as active. Then, this Leader cannot attack ...
```

Likely owners:

- `packages/cards/src/segments/composed-expression.ts`
- delayed expression parser branch in `expression-registry.ts`
- selected attack restriction / activation body parsers

Problem:

This is a delayed condition plus sequence. The attached DON, entry, and
once-per-turn marker spans exist, but the delayed body has no body span.

Plan:

1. Identify the exact delayed parser branch and whether child body spans are
   absent or dropped.
2. Preserve child spans first.
3. If child spans are absent, confirm the delayed expression parser consumed the
   whole reusable body and add one body span there, not in the entry/marker
   layer.
4. Add a parser test for this delayed activate-main sequence.
5. Re-probe `OP12`.

Expected impact:

Clears `OP12-020`.

### 8. Movement, Reveal-Conditional, And Restriction Leaf Paths

Representative failures:

- `OP05-111`
- `OP08-043`
- `OP08-096`
- `OP09-101`
- `OP14-021`

Common printed shapes:

```text
You may play 1 [Name] from your hand: Add up to 1 of your opponent's Characters
... to the top or bottom of your opponent's Life cards face-up.
```

```text
Trash 1 card from the top of your deck. If the trashed card has a cost of 6 or
more, up to 1 of your Leader or Character cards gains +5000 power ...
```

```text
none of the selected Characters can attack unless your opponent trashes 2 cards
from their hand whenever they attack.
```

Likely owners:

- `packages/cards/src/segments/optional-play-costed-effect.ts`
- `packages/cards/src/instructions/field-to-life.ts`
- `packages/cards/src/segments/reveal-top-conditional.ts`
- `packages/cards/src/instructions/planned-field-effects/blocker-restriction.ts`
- `packages/cards/src/segments/selected-refresh-lock.ts`
- possibly `packages/cards/src/segments/opponent-optional-cost.ts` for the
  opponent attack-cost restriction body

Problem:

These are not one family, but they are the remaining current failures outside
the larger selected-continuation, optional-costed, and special-leaf clusters.
They all show the same static-coverage symptom: reusable movement/restriction
logic is runtime-supported but the owning parser path emits no body
presentation span.

Plan:

1. For each representative failure, run `parseCardEffectLineDetailed` and
   identify the first parser owner that consumes the reusable body text.
2. Prefer adding spans in the leaf movement/restriction parser that emits the
   runtime primitive:
   - field-to-life movement for `OP05-111` and `OP09-101`
   - reveal-top conditional for `OP08-096`
   - planned attack restriction for `OP08-043`
   - selected refresh lock for `OP14-021`
3. If the body parser already emits spans and a composer drops them, fix only
   the composer.
4. Add parser tests for each owner using reusable shape text and asserting:
   - `sourceMap.spans` contains a body span
   - generated `presentation.spanIds` refer to existing source-map spans
   - the body span text includes the movement/restriction instruction, not just
     the entry or cost
5. Re-probe `OP05`, `OP08`, `OP09`, and `OP14`.

Expected impact:

Clears the five previously unassigned failures without folding them into
unrelated broad fallbacks.

## Implementation Slices

### Slice A: Probe Visibility And Regression Harness

Purpose:

Make it easy to verify all failing families during development.

Tasks:

1. Add a local list of failing representative texts to
   `packages/card-support/src/spotlight-probe.test.ts` or a card parser test
   file.
2. Assert each representative generated runtime-supported block has
   presentation.
3. For every local representative, assert:
   - every `presentation.spanIds` entry exists in the generated source map
   - every block's `presentation.spanIds` are unique
   - source-map span IDs are unique
   - at least one active body span text includes the relevant body instruction
     text, not only entry, marker, or cost text
4. Keep the existing live set probe as the final acceptance gate.

Exit criteria:

- Local tests fail before primitive fixes and pass after.
- `spotlight:probe -- --set OP16` remains clean.

### Slice B: Selected Continuation Spans

Purpose:

Clear the largest event/counter cluster.

Tasks:

1. Patch `selected-power-continuation.ts`.
2. Add direct parser tests for additional power and keyword continuations.
3. Run focused tests and re-probe:
   - `OP01`
   - `OP04`
   - `OP05`
   - `OP06`
   - `OP07`
   - `OP10`
   - `OP11`
   - `OP12`

Exit criteria:

- All selected-continuation cards listed in family 1 no longer appear as
  missing-presentation failures.

### Slice C: Optional Cost / Paid Count Spans

Purpose:

Clear optional-costed implicit reactions and dynamic paid-count power effects.

Tasks:

1. Patch leaf cost/body parser span emissions where source slices exist.
2. Add conservative fallback in `optional-costed-effect.ts` only if needed,
   after tests prove child spans are absent rather than dropped.
3. Add parser tests for paid-count power and if-you-do play bodies.
4. Re-probe:
   - `OP03`
   - `OP06`
   - `OP11`
   - `OP13`
   - `OP15`

Exit criteria:

- Paid-count and if-you-do optional-cost cards no longer fail missing
  presentation.
- Tests prove any optional-cost fallback span covers the reusable costed effect
  body and is not an entry-only or cost-only highlight.

### Slice D: Conditional Choice / Instead Spans

Purpose:

Clear conditional branch replacement/stronger-selection effects.

Tasks:

1. Patch the owning conditional choice composer.
2. Preserve child spans where already available.
3. Add tests for `OP04-094` and `OP12-096` shapes without card ID branching.
4. Re-probe `OP04` and `OP12`.

Exit criteria:

- Conditional choice failures disappear.

### Slice E: Special Leaf Primitive Spans

Purpose:

Clear isolated reusable primitives.

Tasks:

1. Patch `opponent-hand-reveal.ts`.
2. Patch `base-power-swap.ts`.
3. Patch `apply-each-continuous.ts`.
4. Patch `played-object-keyword-grant.ts`.
5. Add direct parser tests for each.
6. Re-probe `OP01`, `OP14`, and `OP15`.

Exit criteria:

- OP01-105, OP14-001, OP14-017, OP15-086, and OP15-092 are clean.

### Slice F: Delayed Activate-Main Span

Purpose:

Clear `OP12-020`.

Tasks:

1. Patch the delayed expression owner after confirming the exact branch.
2. Add a direct parser test.
3. Re-probe `OP12`.

Exit criteria:

- `OP12-020` is clean.

### Slice G: Movement / Reveal / Restriction Leaf Spans

Purpose:

Clear remaining field-to-life, reveal-top conditional, planned attack
restriction, and selected refresh-lock failures.

Tasks:

1. Patch only the confirmed owners from family 8.
2. Add direct parser tests for each owner.
3. Re-probe:
   - `OP05`
   - `OP08`
   - `OP09`
   - `OP14`

Exit criteria:

- `OP05-111`, `OP08-043`, `OP08-096`, `OP09-101`, and `OP14-021` are clean.
- No new failures appear in the same sets.

### Slice H: Final Probe Sweep And Review

Purpose:

Prove the plan fixed the full observed surface.

Tasks:

1. Run `corepack pnpm run spotlight:probe -- --set OP01` through `OP16`.
2. Run `corepack pnpm run support:probe -- --card <id>` for every failing card
   in the assignment matrix, or run an equivalent support probe sweep over
   OP01-OP16 if the CLI supports it.
3. Run focused parser tests for all touched files.
4. Run `corepack pnpm run verify`.
5. Have a reviewer inspect the final diff for:
   - card-ID leakage
   - exact full-line branches
   - support authority changes
   - broad whole-body span fallbacks in the wrong layer
   - hidden target/source disclosure risk

Exit criteria:

- OP01-OP16 set probes report `Failures: none`.
- Support probes still pass for every card in the assignment matrix.
- Full verify passes.
- Reviewer has no blocking findings.

## Acceptance Checklist

- No card IDs in production parser fixes.
- No exact full failing-line support branches.
- All new presentation spans come from `input.source` or a child source slice.
- Runtime support evidence unchanged except for tests that explicitly assert it.
- `support:probe` still passes for every card in the assignment matrix.
- `spotlight:probe` passes for OP01-OP16.
- `corepack pnpm run verify` passes.

## Risk Notes

- Whole-body spans are less precise than child spans. They are acceptable for
  static coverage but may not improve fine-grained highlight quality.
- Some composer fixes could duplicate span IDs if child and fallback spans are
  both emitted. Tests should assert unique source-map span IDs where applicable.
- Fixing static source spans does not automatically validate runtime arrows or
  target links. Separate behavior probes should cover that.
- Implicit reaction entries are more likely to need careful source slicing
  because they do not have bracketed entry markers.
