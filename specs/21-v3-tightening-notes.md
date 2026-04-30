---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "21-v3-tightening-notes"
doc_title: "V3 Tightening Notes"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# v3 Tightening Notes

<!-- SECTION_REF: 21-v3-tightening-notes.s001 -->

Section Ref: `21-v3-tightening-notes.s001`

## Why this revision exists

<!-- SECTION_REF: 21-v3-tightening-notes.s002 -->

Section Ref: `21-v3-tightening-notes.s002`

The v2 rebuild restored Poneglyph as a named dependency, but it still treated the API shape too abstractly. The supplied OpenAPI JSON and card examples revealed implementation details that must be reflected in the docs before coding:

- Poneglyph variants use `index` in the provided payloads, not a standalone `variant_id`.
- Search results and detail results have different authority levels.
- Batch card lookup has a maximum of 60 card numbers per request.
- FAQ entries and errata can affect behavior and must feed implementation-review hashing.
- Some product/market fields are nullable and must not break deck rendering.
- Real effects need transient reveal sets, selected-card references, and sequence-local state.

## Files changed or added

<!-- SECTION_REF: 21-v3-tightening-notes.s003 -->

Section Ref: `21-v3-tightening-notes.s003`

| File                                 | Change                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `09-card-data-and-support-policy.md` | Added concrete Poneglyph adapter rules, variant-index policy, source/behavior hash split, and batch resolution notes. |
| `10-database-schema.md`              | Changed deck variant persistence from assumed `variant_id` to `variant_index` plus generated `variant_key`.           |
| `15-implementation-kickoff.md`       | Added fixture-first Poneglyph contract testing before live HTTP/Redis.                                                |
| `16-typescript-interface-draft.md`   | Added Poneglyph detail, variant, legality, FAQ, resolved-card, and transient selection interfaces.                    |
| `17-first-card-fixtures.md`          | Added OP01-060 and OP05-091 as real Poneglyph-backed fixtures.                                                        |
| `18-acceptance-tests.md`             | Added Poneglyph adapter tests plus Doflamingo and Rebecca card tests.                                                 |
| `19-poneglyph-api-contract.md`       | New detailed Poneglyph API and normalization contract.                                                                |
| `20-card-implementation-examples.md` | New concrete card implementation examples and DSL deltas.                                                             |
| `fixtures/poneglyph/`                | New OpenAPI and card payload fixtures for tests.                                                                      |

## Implementation priority change

<!-- SECTION_REF: 21-v3-tightening-notes.s004 -->

Section Ref: `21-v3-tightening-notes.s004`

Build the engine first, but add `@optcg/cards` fixture schemas immediately. The first engine tests should load local Poneglyph-shaped fixtures rather than hand-typed fake card metadata. Live Poneglyph HTTP, Redis caching, and search UI can still wait until after the CLI engine loop works.
