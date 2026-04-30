---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "0004-explicit-card-support-status"
doc_title: "ADR 0004 Explicit Card Support Status"
doc_type: "adr"
status: "supporting"
machine_readable: true
---

# ADR 0004: Require Explicit Card Support Status

<!-- SECTION_REF: 0004-explicit-card-support-status.s001 -->

Section Ref: `0004-explicit-card-support-status.s001`

## Status

<!-- SECTION_REF: 0004-explicit-card-support-status.s002 -->

Section Ref: `0004-explicit-card-support-status.s002`

Accepted.

## Context

<!-- SECTION_REF: 0004-explicit-card-support-status.s003 -->

Section Ref: `0004-explicit-card-support-status.s003`

Treating a missing effect definition as vanilla can silently make non-vanilla cards behave incorrectly in real matches.

## Decision

<!-- SECTION_REF: 0004-explicit-card-support-status.s004 -->

Section Ref: `0004-explicit-card-support-status.s004`

Every card used in normal play must have a `CardImplementationRecord` with explicit status.

Allowed ranked statuses:

- `vanilla-confirmed`
- `implemented-dsl`
- `implemented-custom` with tests/review

Rejected ranked statuses:

- `unsupported`
- `banned-in-simulator`

## Consequences

<!-- SECTION_REF: 0004-explicit-card-support-status.s005 -->

Section Ref: `0004-explicit-card-support-status.s005`

Positive:

- No silent missing-effect bugs.
- Deck validation communicates unsupported cards.
- Coverage is measurable.

Negative:

- More bookkeeping.
- New sets require triage before broad play.

## Implementation notes

<!-- SECTION_REF: 0004-explicit-card-support-status.s006 -->

Section Ref: `0004-explicit-card-support-status.s006`

Development sandbox may permit unsupported cards behind a clear flag.
