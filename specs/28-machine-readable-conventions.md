---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "28-machine-readable-conventions"
doc_title: "Machine Readable Conventions"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Machine-Readable Conventions

<!-- SECTION_REF: 28-machine-readable-conventions.s001 -->

Section Ref: `28-machine-readable-conventions.s001`

This document defines how scripts, planning tools, and agents should parse and consume this specification package.

## Parsing contract

<!-- SECTION_REF: 28-machine-readable-conventions.s002 -->

Section Ref: `28-machine-readable-conventions.s002`

### Required file-level metadata

<!-- SECTION_REF: 28-machine-readable-conventions.s003 -->

Section Ref: `28-machine-readable-conventions.s003`

Every Markdown file in this package starts with YAML front matter containing at least:

- `spec_version`
- `spec_package_name`
- `doc_id`
- `doc_title`
- `doc_type`
- `status`
- `machine_readable`

Consumers should treat that front matter as the first machine-readable lookup layer before reading body prose.

### Canonical package identity

<!-- SECTION_REF: 28-machine-readable-conventions.s004 -->

Section Ref: `28-machine-readable-conventions.s004`

- `spec_version` is the canonical human-readable version.
- `spec_package_name` is the canonical filesystem/package name.
- `SPEC_VERSION.md` and `spec-manifest.json` are the package identity sources of truth.

### Document identifiers

<!-- SECTION_REF: 28-machine-readable-conventions.s005 -->

Section Ref: `28-machine-readable-conventions.s005`

- `doc_id` must be stable unless the document is intentionally superseded.
- Numbered documents keep their numeric prefixes for ordering.
- Scripts should not infer authority from alphabetical order alone.
- When authority conflicts exist, use the order defined in `SPEC_VERSION.md`.

## Normative language

<!-- SECTION_REF: 28-machine-readable-conventions.s006 -->

Section Ref: `28-machine-readable-conventions.s006`

Consumers should interpret prose using the following priority:

- `must` / `must not` = mandatory requirement
- `should` / `should not` = strong recommendation; deviations must be justified
- `may` = optional behavior within stated bounds
- examples are illustrative unless explicitly marked as canonical

Where prose conflicts with canonical contract artifacts, the canonical contract artifacts win.

## Preferred extraction targets

<!-- SECTION_REF: 28-machine-readable-conventions.s007 -->

Section Ref: `28-machine-readable-conventions.s007`

Automation should extract in this order:

1. YAML front matter
2. `SPEC_VERSION.md`
3. `spec-manifest.json`
4. canonical contract files under `contracts/`
5. numbered specification documents
6. supporting notes and historical tightening documents

## Stable heading usage

<!-- SECTION_REF: 28-machine-readable-conventions.s008 -->

Section Ref: `28-machine-readable-conventions.s008`

Every heading in every Markdown document must be followed immediately by both of the following machine-readable lines:

```text
<!-- SECTION_REF: <doc_id>.sNNN -->
Section Ref: `<doc_id>.sNNN`
```

Where:

- `<doc_id>` is the file-level stable document identifier from YAML front matter
- `sNNN` is the zero-padded section sequence within that document
- the HTML comment is the primary machine-readable marker
- the visible `Section Ref:` line is the human-verifiable marker

Consumers should prefer `section_ref` identifiers over raw heading text whenever available.

Preferred reference formats:

```text
00-project-overview.s004
00-project-overview.s004 (Product scope)
```

Fallback format when a section ref is unavailable should be:

```text
doc_id#Exact Heading Text
```

Do not rely on renderer-specific generated anchor slugs as the sole reference key. In v6, derived implementation notes, tests, and review records should default to `doc_id.sNNN (Heading)` citations.

## Section index

<!-- SECTION_REF: 28-machine-readable-conventions.s009 -->

Section Ref: `28-machine-readable-conventions.s009`

This package includes a generated `section-index.json` file containing the canonical section list for every Markdown document. Consumers that need fast lookup should prefer `section-index.json` over scraping headings at runtime, while still treating the in-document `SECTION_REF` markers as the body-level source of truth.

## Work item generation rules

<!-- SECTION_REF: 28-machine-readable-conventions.s010 -->

Section Ref: `28-machine-readable-conventions.s010`

When generating work items from this package:

- cite stable `SECTION_REF` values for every behavior or architecture claim
- keep implementation scope tied to a single coherent concern
- fail closed on ambiguity instead of inventing missing rules

## Change-management rules

<!-- SECTION_REF: 28-machine-readable-conventions.s011 -->

Section Ref: `28-machine-readable-conventions.s011`

A spec change is machine-significant if it changes any of:

- YAML front matter values
- canonical contract files under `contracts/`
- authority order in `SPEC_VERSION.md`
- acceptance criteria, invariants, or explicit non-goals
- any normative `must` or `must not` statement

When those change, downstream implementation notes, tests, or review records that cite the changed sections should be treated as stale and rechecked.

## Recommended downstream tooling behavior

<!-- SECTION_REF: 28-machine-readable-conventions.s012 -->

Section Ref: `28-machine-readable-conventions.s012`

Scripts that consume this spec should:

- validate front matter presence on all Markdown files
- validate that referenced docs exist
- validate that canonical contract file names match the manifest
- surface ambiguous or conflicting requirements as errors
- preserve exact cited text ranges when building implementation summaries or review records
- record the `spec_version` used for each generated artifact
- preserve section-ref citations when exporting work items or review notes

## Backward-compatibility policy

<!-- SECTION_REF: 28-machine-readable-conventions.s013 -->

Section Ref: `28-machine-readable-conventions.s013`

This package supersedes prior `v4-tightened` and earlier bundles. Downstream systems should treat this package as the canonical root moving forward and should not mix manifests from prior packages with this one.
