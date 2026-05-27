---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "README"
doc_title: "Spec Authority Index"
doc_type: "spec-index"
status: "canonical"
machine_readable: true
---

# Spec Authority Index

<!-- SECTION_REF: README.s001 -->

Section Ref: `README.s001`

## Canonical authority index

Use this index only to find the authoritative files. It does not replace the
stable `SECTION_REF` citations inside each spec document.

| Concern                    | Canonical files                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| GameState/events/decisions | `03-game-state-events-decisions.md`; `contracts/canonical-types.ts` for compile-ready TypeScript                                                  |
| Effect DSL                 | `05-effect-dsl-reference.md`; `contracts/effect-dsl.schema.json` for JSON fixture validation; `contracts/canonical-types.ts` for TypeScript types |
| terminal engine milestone  | `12-roadmap.md`; `15-implementation-kickoff.md`; `18-acceptance-tests.md`                                                                         |
| repo process               | `AGENTS.md`; `docs/code-standard.md`; `23-repo-tooling-and-enforcement.md`                                                                        |

## Historical/explanatory files

Historical/explanatory files preserve design history or examples. They must not
override canonical contract files or package source types.

- `16-typescript-interface-draft.md` is historical/non-normative.
- `source-original-pdfs/` preserves source extraction history.
