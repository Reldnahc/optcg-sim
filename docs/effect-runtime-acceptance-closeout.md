# Effect Runtime Acceptance Closeout Matrix

This matrix closes the current engine/effect foundation verification scope by mapping acceptance items to historical work IDs and test evidence, while keeping engine behavior coverage separate from card-data/fixture integration coverage.

`Closed` means the current narrow foundation acceptance item has committed implementation and test evidence. It does not mean broad card-catalog, server/client, live Redis, or full future milestone support is complete.

Spec refs: `18-acceptance-tests.s004`, `18-acceptance-tests.s007`, `11-testing-quality.s004`, `11-testing-quality.s005`, `04-effect-runtime.s005`, `09-card-data-and-support-policy.s010`, `09-card-data-and-support-policy.s011`, `09-card-data-and-support-policy.s013`, `06-visibility-security.s002`, `06-visibility-security.s004`, `06-visibility-security.s017`.

## Milestone 2 (First Effect Runtime) Coverage

| Acceptance item(s)                                                          | Historical work IDs                                                                                                    | Primitive / unit coverage                                                                                                              | Synthetic regression coverage                                                                                                                | Hidden-info coverage                                                                                                                                          | Fail-closed unsupported-card coverage                                                                               | Card-data / fixture integration coverage                                                                           | Status |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------ |
| M2-001 On Play draw queues/resolves                                         | `ENG-012A`..`ENG-012G`, `ENG-031F`, `ENG-038C`, `ENG-048`                                                              | `packages/engine-core/src/effect-runtime-draw.test.ts`, `packages/engine-core/src/effect-runtime-primitives.test.ts`                   | `packages/engine-core/src/play-card-on-play-runtime.test.ts`, `packages/engine-core/src/effect-runtime-queue-processing-no-choice.test.ts`   | `packages/engine-core/src/filter-state-for-player.real-states-triggers.test.ts`                                                                               | `packages/engine-core/src/unsupported-nonvanilla-closeout.test.ts`                                                  | `tests/integration/real-card-dsl-manifest-smoke.test.mjs`                                                          | Closed |
| M2-002, M2-018 attack timing ordering windows                               | `ENG-023A`..`ENG-023D`, `ENG-026`, `ENG-032C`, `ENG-048`                                                               | `packages/engine-core/src/effect-runtime-trigger-order.test.ts`                                                                        | `packages/engine-core/src/battle-declare-attack-timing.test.ts`, `packages/engine-core/src/effect-runtime-trigger-queueing-attack.test.ts`   | `packages/engine-core/src/filter-state-for-player.real-states-battle.test.ts`                                                                                 | `packages/engine-core/src/actions-fail-closed.test.ts`                                                              | `packages/engine-core/src/real-card-dsl-runtime.test.ts`                                                           | Closed |
| M2-003, M2-004, M2-005, M2-019 blocker/counter flow and post-counter guards | `ENG-014A`..`ENG-014E`, `ENG-019A`..`ENG-019C`, `ENG-020`, `ENG-022A`..`ENG-022D`, `ENG-048`                           | `packages/engine-core/src/battle-blocker-flow.test.ts`, `packages/engine-core/src/battle-counter-flow.test.ts`                         | `packages/engine-core/src/battle-pipeline-counter-regression.test.ts`, `packages/engine-core/src/battle-pipeline-regression.test.ts`         | `packages/engine-core/src/actions-battle-projection.test.ts`                                                                                                  | `packages/engine-core/src/unsupported-nonvanilla-closeout.test.ts`                                                  | `packages/engine-core/src/real-card-dsl-runtime.test.ts`                                                           | Closed |
| M2-006, M2-007, M2-010 K.O./life-trigger sequencing                         | `ENG-027A`..`ENG-027D`, `ENG-028A`..`ENG-028E`, `ENG-046A`..`ENG-046E`                                                 | `packages/engine-core/src/effect-runtime-ko-triggers.test.ts`, `packages/engine-core/src/life-trigger-actions.test.ts`                 | `packages/engine-core/src/battle-damage-life-trigger.test.ts`, `packages/engine-core/src/battle-damage-multiple.test.ts`                     | `packages/engine-core/src/filter-state-for-player.real-states-triggers.test.ts`, `tests/hidden-info/hidden-info-lane-smoke.test.mjs`                          | `packages/engine-core/src/actions-fail-closed.test.ts`                                                              | `packages/engine-core/src/real-card-dsl-runtime.test.ts`                                                           | Closed |
| M2-008, M2-009 trigger ordering decisions and A-B-C ordering                | `ENG-025A`..`ENG-025E`, `ENG-026`, `ENG-036A`..`ENG-036F`, `ENG-047C`                                                  | `packages/engine-core/src/trigger-order-actions.test.ts`                                                                               | `packages/engine-core/src/effect-runtime-trigger-order.test.ts`, `packages/engine-core/src/effect-runtime-queue-processing-ordering.test.ts` | `packages/engine-core/src/filter-state-for-player.real-states-triggers.test.ts`                                                                               | `packages/engine-core/src/trigger-order-actions.test.ts` (invalid/stale fail-closed)                                | N/A (engine behavior row)                                                                                          | Closed |
| M2-011, M2-012, M2-020, M2-021 continuous/replacement semantics             | `ENG-044A`..`ENG-044E`, `ENG-045A`..`ENG-045F`                                                                         | `packages/engine-core/src/effect-runtime-replacement-application.test.ts`, `packages/engine-core/src/compute-view.test.ts`             | `packages/engine-core/src/target-selection-actions.test.ts`, `packages/engine-core/src/battle-damage-vanilla.test.ts`                        | `packages/engine-core/src/filter-state-for-player.optional-activation.test.ts`                                                                                | `packages/engine-core/src/actions-fail-closed.test.ts`                                                              | N/A (engine behavior row)                                                                                          | Closed |
| M2-013, M2-016, M2-017 optional + once-per-turn semantics                   | `ENG-042A`..`ENG-042E`, `ENG-043A`..`ENG-043E`                                                                         | `packages/engine-core/src/effect-runtime-optional-activation.test.ts`, `packages/engine-core/src/effect-runtime-once-per-turn.test.ts` | `packages/engine-core/src/effect-runtime-optional-activation-ordering.test.ts`, `packages/engine-core/src/once-per-turn.test.ts`             | `packages/engine-core/src/filter-state-for-player.optional-activation.test.ts`                                                                                | `packages/engine-core/src/effect-runtime-optional-activation.test.ts` (invalid response fail-closed)                | N/A (engine behavior row)                                                                                          | Closed |
| M2-014, M2-022 target visibility + transient reveal cleanup                 | `ENG-029A`..`ENG-029E`, `ENG-047A`..`ENG-047E`, `SEC-003`, `CARD-002F`                                                 | `packages/engine-core/src/target-selection.test.ts`, `packages/engine-core/src/search-reveal-transient-set.test.ts`                    | `packages/engine-core/src/target-selection-actions.test.ts`, `packages/engine-core/src/event-sequencing-regression.test.ts`                  | `packages/engine-core/src/filter-state-for-player.real-states-targeting.test.ts`, `tests/hidden-info/cards-backed-playerview-hidden-info-regression.test.mjs` | `packages/engine-core/src/search-reveal-transient-set.test.ts`                                                      | `tests/hidden-info/cards-backed-playerview-hidden-info-regression.test.mjs`                                        | Closed |
| M2-015 unsupported non-vanilla rejected outside dev/sandbox                 | `ENG-010C`, `ENG-010D`, `ENG-010G`, `ENG-010H`, `ENG-035E`, `ENG-048`, `CARD-001E`, `CARD-004`, `CARD-006`, `CARD-007` | `packages/engine-core/src/play-card-support.test.ts`, `packages/engine-core/src/actions-fail-closed.test.ts`                           | `packages/engine-core/src/unsupported-nonvanilla-closeout.test.ts`                                                                           | `tests/hidden-info/cards-backed-playerview-hidden-info-regression.test.mjs` (no hidden unsupported IDs leakage)                                               | `packages/engine-core/src/unsupported-nonvanilla-closeout.test.ts`, `packages/cards/src/real-card-fixtures.test.ts` | `tests/integration/root-engine-manifest-smoke.test.mjs`, `tests/integration/real-card-dsl-manifest-smoke.test.mjs` | Closed |

## Milestone 5 (Card Data / Deck Builder) Coverage Relevant To This Foundation

| Acceptance item(s)                                                        | Historical work IDs                                                                  | Primitive / unit coverage                                                                                               | Synthetic regression coverage                           | Hidden-info coverage                                                                                            | Fail-closed unsupported-card coverage                                           | Card-data / fixture integration coverage                                                                           | Status                                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| M5-001, M5-003 Poneglyph fetch + schema validation and clear failure      | `CARD-001A`, `CARD-001B`, `CARD-001F`                                                | `packages/cards/src/poneglyph-schema.test.ts`, `packages/cards/src/poneglyph-client.test.ts`                            | `packages/cards/src/cache.test.ts`                      | N/A (card-data package path)                                                                                    | `packages/cards/src/cache.test.ts` malformed cache payload rejection            | `packages/cards/src/fixtures.test.ts`                                                                              | Closed                                                              |
| M5-002 cache hit returns validated data                                   | `CARD-001F`                                                                          | `packages/cards/src/cache.test.ts`                                                                                      | `packages/cards/src/cache.test.ts`                      | N/A                                                                                                             | `packages/cards/src/cache.test.ts`                                              | `packages/cards/src/cache.test.ts`                                                                                 | Local cache coverage closed; live Redis adapter explicitly deferred |
| M5-004, M5-005, M5-006 deck validation unknown/unsupported/variant limits | `CARD-001C`, `CARD-001D`, `CARD-001E`, `CARD-004`, `CARD-006`, `CARD-007`, `ENG-048` | `packages/cards/src/manifest.test.ts`, `packages/cards/src/overlay.test.ts`, `packages/cards/src/normalization.test.ts` | `packages/cards/src/real-card-fixtures.test.ts`         | `tests/hidden-info/cards-backed-playerview-hidden-info-regression.test.mjs` (cards-backed state still filtered) | `packages/cards/src/real-card-fixtures.test.ts` ranked rejection paths          | `tests/integration/root-engine-manifest-smoke.test.mjs`, `tests/integration/real-card-dsl-manifest-smoke.test.mjs` | Closed                                                              |
| M5-007 match manifest snapshot + versions                                 | `CARD-001E`, `CARD-002B`, `CARD-002C`, `CARD-004`                                    | `packages/cards/src/manifest.test.ts`, `packages/cards/src/representative-fixtures.test.ts`                             | `tests/integration/root-engine-manifest-smoke.test.mjs` | N/A                                                                                                             | `packages/cards/src/manifest.test.ts` duplicate/missing-card manifest rejection | `tests/integration/root-engine-manifest-smoke.test.mjs`, `tests/integration/real-card-dsl-manifest-smoke.test.mjs` | Closed                                                              |
| M5-008 client-fetched display data has no gameplay authority              | `CARD-001D`, `CARD-001E`, `CARD-002A`, `CARD-002F`, `SEC-003`                        | `packages/cards/src/overlay.test.ts`, `packages/cards/src/manifest.test.ts`                                             | `packages/cards/src/representative-fixtures.test.ts`    | `tests/hidden-info/cards-backed-playerview-hidden-info-regression.test.mjs`                                     | `packages/cards/src/overlay.test.ts` metadata mismatch fail-closed              | `tests/integration/root-engine-manifest-smoke.test.mjs`                                                            | Engine/card-data authority closed; client implementation deferred   |

## Known Unsupported / Fail-Closed Gaps And Follow-Ups

| Gap                                                                                                                                                                                                                                    | Evidence                                                                                                                                                                                                              | Status                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Broad optional effect shapes, optional Life Trigger choice, optional custom handlers, new cost semantics, and unsupported target shapes remain fail-closed.                                                                            | `ENG-042A`..`ENG-042E`; `packages/engine-core/src/effect-runtime-optional-activation.test.ts`; `packages/engine-core/src/filter-state-for-player.optional-activation.test.ts`                                         | Follow-up behavior work required before support can broaden                                        |
| Once-per-turn support is limited to committed supported effect paths and commitment points; new cost systems or unsupported target-selection shapes are not silently covered.                                                          | `ENG-043A`..`ENG-043E`; `packages/engine-core/src/once-per-turn.test.ts`; `packages/engine-core/src/effect-runtime-once-per-turn.test.ts`; `packages/engine-core/src/effect-runtime-queue-processing-targets.test.ts` | Follow-up behavior work required for broader activation/cost semantics                             |
| Continuous modifiers are limited to the reviewed narrow +1000 power modifier shape. Broad layering, cost modifiers, keyword modifiers, and base-power setters remain unsupported.                                                      | `ENG-044A`..`ENG-044E`; `packages/engine-core/src/compute-view.test.ts`; `packages/engine-core/src/filter-state-for-player.test.ts`                                                                                   | Fail-closed by support gate; not a blocker for this milestone closeout                             |
| Replacement support is limited to the reviewed narrow K.O. replacement process. Full replacement priority, multiple competing replacements, damage/trash/trigger replacement families, and replay rollback storage remain unsupported. | `ENG-045A`..`ENG-045F`; `packages/engine-core/src/effect-runtime-target-primitives.test.ts`; `packages/engine-core/src/effect-runtime-replacement-application.test.ts`                                                | Fail-closed by support gate; follow-up work required for additional processes                      |
| Multiple damage support is limited to the reviewed Double Attack leader-damage path. Unsupported damage counts, Character-target multi-damage, unsupported Banish interaction, and unsupported continuation shapes fail closed.        | `ENG-046A`..`ENG-046E`; `packages/engine-core/src/battle-damage-multiple.test.ts`                                                                                                                                     | Fail-closed by support gate; not a blocker for this milestone closeout                             |
| Search/reveal support is limited to the reviewed top-1 Character transient reveal path. Full search grammar, deck reordering, broad all-card searches, UI display, and replay viewer behavior remain unsupported.                      | `ENG-047A`..`ENG-047E`; `packages/engine-core/src/search-reveal-transient-set.test.ts`                                                                                                                                | Fail-closed by support gate; follow-up work required for broader search behavior                   |
| Broad real-card catalog remains intentionally unsupported outside reviewed implemented entries; unsupported cards must keep failing closed in public modes.                                                                            | `CARD-005`, `CARD-006`, `CARD-007`, `ENG-048`; `packages/cards/src/real-card-fixtures.test.ts`; `packages/engine-core/src/unsupported-nonvanilla-closeout.test.ts`                                                    | Open by policy (`09-card-data-and-support-policy.s011`), not a blocker for this milestone closeout |
| Live Redis cache adapter and client-fetched display surfaces are not part of this engine/effect closeout.                                                                                                                              | `CARD-001F` explicitly defers Redis; ENG-049 non-scope excludes server/client/API/UI work.                                                                                                                            | Deferred to future card-data/server/client work                                                    |
| This closeout verifies foundation acceptance, not full card-catalog gameplay support, replay-era infrastructure milestones, or server/client milestones.                                                                               | Scope boundary in `ENG-049`; acceptance is limited to `18-acceptance-tests.s004` and foundation-relevant `18-acceptance-tests.s007` rows.                                                                             | Closed as out-of-scope for ENG-049                                                                 |

## Runtime Support Gate Parity

Support status must not drift between probe, card materialization, admission,
and execution. The canonical whole-block support contract is
`evaluateEffectBlockRuntimeSupport(block)`.

Strict support rule:

- Parser success is not support.
- Probe support requires executable runtime support.
- If an in-game executor preflight would reject an effect, probe/card
  materialization must mark it unsupported.
- Support coverage may drop when false positives are removed.

Gate ownership:

- `effect-runtime-admission.ts` owns the canonical whole-block report.
- `effect-runtime-block-support.ts` owns auto entry adapter compatibility and
  delegates body capability.
- `effect-runtime-sequence/support.ts` owns sequence body and segment
  capability only.
- `runtime/optional-activation/*` owns activation exposure and cost/optional
  decision routing.
- `runtime/continuous/*` owns continuous materialization capability.
- `effect-runtime-replacement-primitives.ts` owns replacement primitive
  capability.
- `card-support/src/*` owns report/probe output and must call the canonical
  engine support report.

Known drift fixed by this plan:

- Block-level supported conditions were accepted by auto entry support and
  probe, then rejected by sequence support before execution.

Future drift checks:

- Any body support helper that rejects `condition`, `optional`, `cost`,
  `conditionTiming`, `failurePolicy`, or `sourcePresencePolicy` must either be
  the canonical owner for that concern or have a parity test proving the
  canonical report rejects the same block.

Gate parity checklist:

- `packages/engine-core/src/effect-runtime-admission.ts:evaluateEffectBlockRuntimeSupport`:
  canonical
  - Decision: whole-block support source of truth.
  - Required test or code action: parity tests compare downstream gates against
    this report.
- `packages/engine-core/src/effect-runtime-block-support.ts:isSupportedAutoRuntimeEffectBlock`:
  delegates
  - Decision: auto entry adapter and envelope gate used by the canonical report.
  - Required test or code action: keep envelope ownership here; do not let
    downstream sequence support add stricter block-level condition authority.
- `packages/engine-core/src/effect-runtime-sequence/support.ts:toSupportedSequenceBlock`:
  stale-duplicate
  - Decision: sequence support owns body/segment executability, not block-level
    supported condition rejection.
  - Required test or code action: add canonical parity tests and align supported
    condition handling.
- `packages/engine-core/src/effect-runtime-sequence/support.ts:isSupportedSequenceBlock`:
  parity-test-needed
  - Decision: runtime execution preflight can remain as a defensive guard, but
    it must agree with canonical support for shared envelopes.
  - Required test or code action: cover conditioned sequence support and
    unsupported envelope rejection.
- `packages/engine-core/src/runtime/optional-activation/activate-main.ts:isSupportedActivateMainRuntimeEffectBlock`:
  delegates
  - Decision: activate-main exposure owns timing and optional decision routing,
    then delegates sequence bodies to sequence support.
  - Required test or code action: classify optional/cost envelope drift during
    the envelope audit.
- `packages/engine-core/src/runtime/optional-activation/start-of-turn.ts:isSupportedStartOfTurnRuntimeEffectBlock`:
  delegates
  - Decision: start-of-turn exposure owns timing and optional decision routing,
    then delegates sequence bodies to sequence support.
  - Required test or code action: classify optional/cost envelope drift during
    the envelope audit.
- `packages/engine-core/src/runtime/optional-activation/event-reaction.ts:isSupportedActivatedReactionEffect`:
  delegates
  - Decision: activated reaction exposure owns event timing and once-per-turn
    admission, with runtime support delegated to the reaction support helpers.
  - Required test or code action: keep separate from automatic queue support.
- `packages/engine-core/src/runtime/continuous/continuous.ts:isSupportedPermanentContinuousEffectBlock`:
  canonical
  - Decision: continuous materialization capability is the owner for permanent
    continuous blocks.
  - Required test or code action: no sequence parity action.
- `packages/engine-core/src/effect-runtime-replacement-primitives.ts:isSupportedReplacementEffectBlock`:
  canonical
  - Decision: replacement primitive capability is the owner for replacement
    blocks.
  - Required test or code action: no sequence parity action.
- `packages/engine-core/src/effect-runtime-activate-referenced-effect.ts:isSupportedReferencedEffectBlock`:
  delegates
  - Decision: referenced effect activation already delegates referenced block
    support to `evaluateEffectBlockRuntimeSupport`.
  - Required test or code action: keep delegation.
- `packages/engine-core/src/battle/resolution.ts:unsupported-pending-runtime-work`:
  parity-test-needed
  - Decision: this is an execution rollback signal and must not be reachable for
    probe-supported effect blocks.
  - Required test or code action: add a production play-card regression for the
    0-DON optional attach no-op.
- `packages/card-support/src/runtime-supported-cards.ts:engineRuntimeSupportEvaluator`:
  delegates
  - Decision: manifest/card support must use canonical engine reports.
  - Required test or code action: add a parsed-runtime-unsupported false
    positive regression.
- `packages/card-support/src/support-probe-report.ts:evaluateParsedLine`:
  delegates
  - Decision: probe output must require at least one successful runtime report
    for runtime effect lines.
  - Required test or code action: fail closed on empty or failed runtime reports.
