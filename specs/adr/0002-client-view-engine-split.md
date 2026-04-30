---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "0002-client-view-engine-split"
doc_title: "ADR 0002 Client View Engine Split"
doc_type: "adr"
status: "supporting"
machine_readable: true
---

# ADR 0002: Split Server Engine from Client View Engine

<!-- SECTION_REF: 0002-client-view-engine-split.s001 -->

Section Ref: `0002-client-view-engine-split.s001`

## Status

<!-- SECTION_REF: 0002-client-view-engine-split.s002 -->

Section Ref: `0002-client-view-engine-split.s002`

Accepted.

## Context

<!-- SECTION_REF: 0002-client-view-engine-split.s003 -->

Section Ref: `0002-client-view-engine-split.s003`

The browser needs responsive UI and may benefit from prediction, but giving it full engine state would leak hidden information such as opponent hand contents, deck order, face-down life, RNG seed, and internal queue state.

## Decision

<!-- SECTION_REF: 0002-client-view-engine-split.s004 -->

Section Ref: `0002-client-view-engine-split.s004`

Use two layers:

- `@optcg/engine-core`: server-only, authoritative, full `GameState`.
- `@optcg/view-engine`: client-safe helpers that operate only on `PlayerView`.

## Consequences

<!-- SECTION_REF: 0002-client-view-engine-split.s005 -->

Section Ref: `0002-client-view-engine-split.s005`

Positive:

- Stronger hidden-information boundary.
- Easier security testing.
- Client code cannot accidentally depend on hidden fields.

Negative:

- Some logic is duplicated as UI affordance logic.
- Client prediction is less powerful.

## Implementation notes

<!-- SECTION_REF: 0002-client-view-engine-split.s006 -->

Section Ref: `0002-client-view-engine-split.s006`

The server may send legal action summaries to the client. The client should not derive authoritative legality from hidden state.
