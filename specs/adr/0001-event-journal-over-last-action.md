---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "0001-event-journal-over-last-action"
doc_title: "ADR 0001 Event Journal Over Last Action"
doc_type: "adr"
status: "supporting"
machine_readable: true
---

# ADR 0001: Use an Event Journal Instead of `lastAction`

<!-- SECTION_REF: 0001-event-journal-over-last-action.s001 -->

Section Ref: `0001-event-journal-over-last-action.s001`

## Status

<!-- SECTION_REF: 0001-event-journal-over-last-action.s002 -->

Section Ref: `0001-event-journal-over-last-action.s002`

Accepted.

## Context

<!-- SECTION_REF: 0001-event-journal-over-last-action.s003 -->

Section Ref: `0001-event-journal-over-last-action.s003`

Card effects can cause several atomic state changes. Each change may trigger different effects. A single `lastAction` value is not expressive enough to support correct trigger detection, replay debugging, or audit logs.

## Decision

<!-- SECTION_REF: 0001-event-journal-over-last-action.s004 -->

Section Ref: `0001-event-journal-over-last-action.s004`

Every atomic mutation emits structured `EngineEvent`s. Trigger detection consumes event batches.

## Consequences

<!-- SECTION_REF: 0001-event-journal-over-last-action.s005 -->

Section Ref: `0001-event-journal-over-last-action.s005`

Positive:

- Trigger detection is precise.
- Replays are easier to inspect.
- Debugging has a causality trail.
- Hidden-information filtering can operate on event visibility.

Negative:

- More data to design and store.
- More tests needed for event payload correctness.

## Implementation notes

<!-- SECTION_REF: 0001-event-journal-over-last-action.s006 -->

Section Ref: `0001-event-journal-over-last-action.s006`

`EngineEvent` must include type, source, affected cards, payload, cause, visibility, and sequence metadata.
