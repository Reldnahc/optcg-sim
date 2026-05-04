---
epic_id: "M1-001"
title: "Terminal engine foundation"
status: "generated"
summary: >
  Start Milestone 1 by replacing placeholder shared types, adding the pure
  deterministic engine package, and preparing the terminal runner sequence
  without introducing browser, server, database, or full card-data concerns.
spec_refs:
  - 12-roadmap.s003 (Revised build order)
  - 12-roadmap.s005 (Milestone 1: terminal engine)
  - 12-roadmap.s015 (Immediate next tasks)
  - 15-implementation-kickoff.s003 (Goal)
  - 15-implementation-kickoff.s004 (Package bootstrap order)
  - 15-implementation-kickoff.s005 (Step 1 - @optcg/types)
  - 15-implementation-kickoff.s006 (Step 2 - @optcg/engine-core)
  - 15-implementation-kickoff.s007 (Step 3 - CLI runner)
---

# M1-001 Terminal Engine Foundation

## Goal

Build the smallest spec-backed path from shared contracts to a deterministic
terminal-playable vanilla engine.

## Why This Is Next

Repository tooling, contract validation, hidden-information regression checks,
and story workflow gates are now in place. The current implementation package
state is still effectively a placeholder: `@optcg/types` exports no real domain
contract, and `@optcg/engine-core` does not exist.

The spec says Milestone 1 starts with `@optcg/types`, then `@optcg/engine-core`,
then a CLI runner. This epic preserves that order and prevents client, server,
card-data, or replay work from being absorbed too early.

## In Scope

- real shared TypeScript type exports in `@optcg/types`
- package-level compile and test contracts for `@optcg/types`
- initial `@optcg/engine-core` package shell after shared contracts exist
- deterministic utility primitives needed before turn-flow implementation
- later CLI runner stories after engine primitives exist

## Out of Scope

- production browser client
- match server and WebSocket protocol
- Redis, Postgres, auth, queues, or ranked systems
- live Poneglyph HTTP adapter
- full effect runtime and full card pool
- replay/rollback implementation

## Child Story Strategy

Parent stories are generated as non-implementable context and immediately
replaced by concern-sliced child stories. Only child stories should be approved
and packetized.

Initial child focus:

- `TYP-001A` through `TYP-001H` replace the placeholder shared type package in
  small canonical-contract slices ordered by dependency.
- `TYP-002` tracks the public/player/spectator view DTO authority gap until the
  spec and canonical contract agree on exact DTO names and shapes.
- `TYP-002A` resolves that gap for initial live player and live-filtered
  spectator DTO contracts only. Full-information live spectator policy remains a
  later explicit policy story.
- `TYP-003` keeps the completed shared type surface reviewable by splitting the
  package source and tests by concern without changing the public API.
- `ENG-001A` through `ENG-001C` prepare engine package and deterministic
  primitives after the required type slices land.
- CLI stories stay generated/deferred until engine behavior exists.
