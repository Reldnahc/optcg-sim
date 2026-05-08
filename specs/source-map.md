---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "source-map"
doc_title: "Source Map"
doc_type: "traceability"
status: "canonical"
machine_readable: true
---

# Source Map

<!-- SECTION_REF: source-map.s001 -->

Section Ref: `source-map.s001`

This package is based on three original PDFs:

- `optcg-simulator-plan.pdf`
- `optcg-engine-spec.pdf`
- `optcg-effect-system.pdf`

The detailed coverage table is in [`source-coverage-matrix.md`](source-coverage-matrix.md). The original extracted text is preserved in [`source-original-pdfs/`](source-original-pdfs/).

## Major source-to-doc moves

<!-- SECTION_REF: source-map.s002 -->

Section Ref: `source-map.s002`

| Original source                                           | Main rewritten docs                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Simulator plan: project overview, architecture, modules   | `00-project-overview.md`, `01-system-architecture.md`                                      |
| Simulator plan: Poneglyph card-data layer                 | `09-card-data-and-support-policy.md`, `01-system-architecture.md`, `10-database-schema.md` |
| Simulator plan: match server, WebSockets, reconnect       | `07-match-server-protocol.md`, `08-replay-rollback-recovery.md`                            |
| Simulator plan: rollback, anti-cheat, spectator           | `08-replay-rollback-recovery.md`, `06-visibility-security.md`                              |
| Simulator plan: observability, crash recovery             | `01-system-architecture.md`, `08-replay-rollback-recovery.md`, `11-testing-quality.md`     |
| Simulator plan: database schema                           | `10-database-schema.md`                                                                    |
| Engine spec: zones, turn structure, battle                | `02-engine-mechanics.md`                                                                   |
| Engine spec: effects, replacement, permanent effects      | `04-effect-runtime.md`, `05-effect-dsl-reference.md`                                       |
| Engine spec: visibility and filtering                     | `06-visibility-security.md`                                                                |
| Effect-system design: DSL and examples                    | `05-effect-dsl-reference.md`                                                               |
| Effect-system design: queue/runtime/custom handlers       | `04-effect-runtime.md`, `09-card-data-and-support-policy.md`                               |
| Effect-system design: card addition pipeline and coverage | `09-card-data-and-support-policy.md`, `11-testing-quality.md`, `12-roadmap.md`             |

## Intentional changes from source drafts

<!-- SECTION_REF: source-map.s003 -->

Section Ref: `source-map.s003`

Some source draft choices were preserved but hardened:

- Missing effect definitions are no longer treated as safe vanilla defaults in public modes.
- `lastAction` trigger detection is replaced by an explicit event journal.
- Continuous effects produce a computed view instead of mutating canonical state repeatedly.
- Spectator delay is not only N turns; v2 supports time and action delay as well.
- Crash recovery does not blindly replay a crashing action; v2 uses recovery modes.
- Deck-card variant uniqueness is fixed to allow multiple variants of the same base Poneglyph card.
- Active-ban indexing avoids non-immutable `now()` in a Postgres partial index.

## Poneglyph coverage

<!-- SECTION_REF: source-map.s004 -->

Section Ref: `source-map.s004`

Poneglyph is explicitly covered in:

- `README.md` - high-level decision.
- `01-system-architecture.md` - topology and stack.
- `05-effect-dsl-reference.md` - card IDs and text-to-DSL pipeline.
- `09-card-data-and-support-policy.md` - detailed integration policy.
- `10-database-schema.md` - persisted Poneglyph IDs and variants.
- `12-roadmap.md` - original and revised build order.
- `13-content-publication-policy.md` - content/image/text handling policy.

## Poneglyph OpenAPI / supplied card examples

<!-- SECTION_REF: source-map.s005 -->

Section Ref: `source-map.s005`

| Supplied source                          | Added / tightened docs                                                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Poneglyph OpenAPI JSON                   | `19-poneglyph-api-contract.md`, `16-typescript-interface-draft.md`, `18-acceptance-tests.md`, `fixtures/poneglyph/openapi.optcg-api-0.1.0.json`             |
| `OP01-060` Donquixote Doflamingo payload | `20-card-implementation-examples.md`, `17-first-card-fixtures.md`, `18-acceptance-tests.md`, `fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json` |
| `OP05-091` Rebecca payload               | `20-card-implementation-examples.md`, `17-first-card-fixtures.md`, `18-acceptance-tests.md`, `fixtures/poneglyph/cards/OP05-091.rebecca.json`               |

The supplied examples corrected the variant persistence model: use Poneglyph `variants[].index` and generate a simulator `variant_key`; do not assume a Poneglyph `variant_id` field exists.

## Official comprehensive rules PDF added in v4

<!-- SECTION_REF: source-map.s006 -->

Section Ref: `source-map.s006`

The supplied comprehensive rules PDF is included directly in the bundle as `source-official-rules/rule_comprehensive_v1.2.0_2026-01-16.pdf` and is reflected in `02-engine-mechanics.md`, `07-match-server-protocol.md`, `08-replay-rollback-recovery.md`, `09-card-data-and-support-policy.md`, and `18-acceptance-tests.md`.
