---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "SPEC_VERSION"
doc_title: "Specification Version Manifest"
doc_type: "manifest"
status: "canonical"
machine_readable: true
---

# Specification Version Manifest

<!-- SECTION_REF: SPEC_VERSION.s001 -->

Section Ref: `SPEC_VERSION.s001`

This package is the canonical **v6** OPTCG simulator specification.

## Identity

<!-- SECTION_REF: SPEC_VERSION.s002 -->

Section Ref: `SPEC_VERSION.s002`

```yaml
specVersion: v6
specPackageName: optcg-md-specs-v6
supersedes:
  - v5
createdFrom: optcg-md-specs-v5-tightening-pass-queues-formats-ranked-poneglyph-legality.zip
rulesAuthority: Official comprehensive rules v1.2.0, last updated 2026-01-16, plus official card wording and rulings/errata
poneglyphFixtureApiVersion: 0.1.0
poneglyphFixtureCards:
  - OP01-060 Donquixote Doflamingo
  - OP05-091 Rebecca
canonicalTypeContract: contracts/canonical-types.ts
canonicalDslSchema: contracts/effect-dsl.schema.json
canonicalDatabaseContract: contracts/database-schema-v6.sql
implementationPatchLog: 22-v6-implementation-tightening.md
machineReadableManifest: spec-manifest.json
machineReadableConventions: 28-machine-readable-conventions.md
```

## Package guarantees

<!-- SECTION_REF: SPEC_VERSION.s003 -->

Section Ref: `SPEC_VERSION.s003`

- Every Markdown document in this package includes YAML front matter.
- `SPEC_VERSION.md` and `spec-manifest.json` are the package identity sources of truth.
- Section references, not renderer-specific anchor slugs, are the canonical citation keys for implementation notes, tests, and review records.
- The canonical contract artifacts remain the highest-precision implementation sources inside this package.

## Authority order for implementation

<!-- SECTION_REF: SPEC_VERSION.s004 -->

Section Ref: `SPEC_VERSION.s004`

1. Official card wording and official comprehensive rules.
2. Official FAQ, rulings, and errata.
3. Frozen Poneglyph metadata snapshot for normalized printed data.
4. Simulator effect implementation through DSL or custom handlers.
5. Card-specific acceptance tests.
6. Generic engine tests and invariants.

## Canonical document order

<!-- SECTION_REF: SPEC_VERSION.s005 -->

Section Ref: `SPEC_VERSION.s005`

1. `SPEC_VERSION.md`
2. `spec-manifest.json`
3. `README.md`
4. `00-project-overview.md`
5. `01-system-architecture.md`
6. `02-engine-mechanics.md`
7. `03-game-state-events-decisions.md`
8. `04-effect-runtime.md`
9. `05-effect-dsl-reference.md`
10. `06-visibility-security.md`
11. `07-match-server-protocol.md`
12. `08-replay-rollback-recovery.md`
13. `09-card-data-and-support-policy.md`
14. `10-database-schema.md`
15. `11-testing-quality.md`
16. `12-roadmap.md`
17. `13-content-publication-policy.md`
18. `14-glossary.md`
19. `15-implementation-kickoff.md`
20. `16-typescript-interface-draft.md`
21. `17-first-card-fixtures.md`
22. `18-acceptance-tests.md`
23. `19-poneglyph-api-contract.md`
24. `20-card-implementation-examples.md`
25. `21-v3-tightening-notes.md`
26. `22-v6-implementation-tightening.md`
27. `23-repo-tooling-and-enforcement.md`
28. `28-machine-readable-conventions.md`
29. `29-game-types-queues-and-lobbies.md`
30. `30-formats-and-ranked-competition.md`
31. `contracts/canonical-types.ts`
32. `contracts/effect-dsl.schema.json`
33. `contracts/database-schema-v6.sql`

## Supersession rule

<!-- SECTION_REF: SPEC_VERSION.s006 -->

Section Ref: `SPEC_VERSION.s006`

Where older prose conflicts with `contracts/canonical-types.ts`, `contracts/effect-dsl.schema.json`, `contracts/database-schema-v6.sql`, `22-v6-implementation-tightening.md`, or the manifest metadata in this package, the v6 contract wins.

Do not implement against abbreviated Markdown snippets when a canonical contract file defines the same structure more precisely.

## Machine-readable section references

<!-- SECTION_REF: SPEC_VERSION.s007 -->

Section Ref: `SPEC_VERSION.s007`

This package includes explicit in-document section references and a generated `section-index.json` index file. Consumers should prefer section refs over renderer-specific heading anchors.
