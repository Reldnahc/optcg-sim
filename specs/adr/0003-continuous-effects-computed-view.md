---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "0003-continuous-effects-computed-view"
doc_title: "ADR 0003 Continuous Effects Computed View"
doc_type: "adr"
status: "supporting"
machine_readable: true
---

# ADR 0003: Continuous Effects Produce a Computed View

<!-- SECTION_REF: 0003-continuous-effects-computed-view.s001 -->

Section Ref: `0003-continuous-effects-computed-view.s001`

## Status

<!-- SECTION_REF: 0003-continuous-effects-computed-view.s002 -->

Section Ref: `0003-continuous-effects-computed-view.s002`

Accepted.

## Context

<!-- SECTION_REF: 0003-continuous-effects-computed-view.s003 -->

Section Ref: `0003-continuous-effects-computed-view.s003`

A fixed-point loop that mutates canonical state risks repeatedly applying modifiers such as `+1000 power` and mixing base facts with derived values.

## Decision

<!-- SECTION_REF: 0003-continuous-effects-computed-view.s004 -->

Section Ref: `0003-continuous-effects-computed-view.s004`

Canonical state stores base facts and active modifier records. `computeView(state)` derives current power, cost, keywords, restrictions, and protections.

## Consequences

<!-- SECTION_REF: 0003-continuous-effects-computed-view.s005 -->

Section Ref: `0003-continuous-effects-computed-view.s005`

Positive:

- Prevents double-application of modifiers.
- Makes state hashes more stable.
- Keeps replay state cleaner.
- Makes expiration easier to reason about.

Negative:

- Computed view performance must be measured.
- Some rule interactions may require careful layering.

## Implementation notes

<!-- SECTION_REF: 0003-continuous-effects-computed-view.s006 -->

Section Ref: `0003-continuous-effects-computed-view.s006`

If official rules require fixed-point processing, run the fixed point over computed views/modifier activation, not by writing derived values into canonical card state.
