---
epic_id: "M1-001"
title: "Terminal engine foundation"
status: "done"
closed_at: "2026-05-07"
summary: >
  Closed the terminal engine foundation by replacing placeholder shared types,
  adding the pure deterministic engine package, delivering deterministic
  terminal runner smoke coverage, and preserving browser, server, database,
  production replay, rollback, and full card-data concerns for later milestones.
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

## Closeout Status

Closed on 2026-05-07 by DOC-002. This closeout is evidence-only: no engine
behavior, CLI behavior, effect runtime behavior, production replay contract,
server/client behavior, card-data behavior, database behavior, or story workflow
machinery was added to make the milestone pass.

Story-review for DOC-002 independently checked the terminal-engine acceptance
evidence and found no actual M1 acceptance gap.

## Why This Was First

Repository tooling, contract validation, hidden-information regression checks,
and story workflow gates were put in place before terminal-engine work. At the
start of this epic, `@optcg/types` still needed real domain contracts and
`@optcg/engine-core` still needed to be introduced.

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
- `ENG-002A` through `ENG-002F` form the next engine behavior foundation group:
  invariants, deterministic setup, official mulligan flow, vanilla phase
  progression, legal-action skeleton, and first replay smoke.
- CLI stories stay generated/deferred until engine behavior exists.

## Closeout Evidence Map

The terminal-engine exit criteria in `12-roadmap.s005` and kickoff done lines in
`15-implementation-kickoff.s011` are covered by existing tests, fixtures, and
completed stories:

| Acceptance line                                                                                               | Existing evidence                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm test` passes                                                                                            | Root `corepack pnpm run verify` includes `corepack pnpm run test`; DOC-002 reruns full verification.                                                                                                                     |
| `GameState` model                                                                                             | `TYP-001G`, `ENG-001A`, and `ENG-002A`; package tests in `packages/types/src/game-state.test.ts` and engine invariant tests in `packages/engine-core/src/invariants.test.ts`.                                            |
| setup creates legal starting state and deterministic opening hands                                            | `ENG-002B` and `ENG-002C`; `packages/engine-core/src/initial-state.test.ts`, `packages/engine-core/src/mulligan.test.ts`, and M1 acceptance IDs M1-001 through M1-003 in `specs/18-acceptance-tests.md`.                 |
| setup, draw, DON!!, main, and end phases                                                                      | `ENG-002D`, `CLI-002B`, and phase coverage in `packages/engine-core/src/phases.test.ts` plus `packages/cli/src/cli.test.ts`.                                                                                             |
| CLI can play a complete vanilla match through normal legal actions                                            | `CLI-002A`; `packages/cli/src/smoke.test.ts` has the `full-vanilla-terminal-match` command-script smoke from normal fixture boot through completed status.                                                               |
| Character play from hand exists                                                                               | `ENG-005A`, `ENG-005B`, `CLI-001E`, `CLI-001F`, and `CLI-001H`; covered by `packages/engine-core/src/play-card.test.ts` and CLI smoke tests.                                                                             |
| Stage play from hand exists                                                                                   | `ENG-005A`, `ENG-005B`, and `ENG-005C`; covered by `packages/engine-core/src/play-card.test.ts` and replay smoke scenarios.                                                                                              |
| Event skeleton exists                                                                                         | `ENG-006`; covered by `packages/engine-core/src/play-card.test.ts` and the local play-card replay smoke.                                                                                                                 |
| DON!! attach/refresh works                                                                                    | `ENG-002D`, `ENG-002E`, `CLI-001C`, `CLI-002A`, and `CLI-002B`; covered by `packages/engine-core/src/phases.test.ts`, `packages/engine-core/src/actions.test.ts`, and `packages/cli/src/smoke.test.ts`.                  |
| Attacks against Leader and rested Character work                                                              | `ENG-003B`, `ENG-003C`, `ENG-003E`, and `CLI-002A`; covered by `packages/engine-core/src/battle-actions.test.ts`, `packages/engine-core/src/battle-damage-banish.test.ts`, replay smoke, and CLI smoke.                  |
| Damage, life-to-hand, K.O., deck-out, and concession endings work                                             | `ENG-003C`, `ENG-003D`, `ENG-003E`, `CLI-001C`, and `CLI-002A`; covered by battle, rule-processing, turn-action, replay smoke, and CLI smoke tests.                                                                      |
| Every accepted action increments `stateSeq` and has stable state hash output                                  | `ENG-001C`, `ENG-002E`, `ENG-016`, and CLI runner stories; covered by action-result, phase/action/play-card/battle tests, `packages/engine-core/src/event-sequencing-regression.test.ts`, and CLI output tests.          |
| Every atomic mutation emits an `EngineEvent` or has explicit no-event handling                                | `TYP-001C`, `ENG-002E`, `ENG-004A`, and `ENG-016`; covered by event sequencing and engine path regression tests.                                                                                                         |
| Event journal seq is strictly increasing                                                                      | `ENG-016`; covered by `packages/engine-core/src/event-sequencing-regression.test.ts` across mulligan, phase advancement, play card, DON attach, attack, effect queue, and terminal/concession paths.                     |
| `hashGameState()` / canonical state hash is stable across repeated runs with the same seed                    | `ENG-001C`, `ENG-002F`, `ENG-003E`, `ENG-005C`, and `CLI-002A`; covered by `initial-state`, replay smoke, play-card, and CLI smoke hash pinning/drift tests.                                                             |
| Local deterministic CLI command/decision script smoke from fixture boot reproduces checkpoints and final hash | `SPEC-001` clarifies this as the M1 replay scope; `CLI-002A` provides the full vanilla terminal command-script smoke, and `packages/cli/src/smoke.test.ts` asserts repeated checkpoints/final hashes and drift failures. |
| production `filterStateForPlayer` hidden-info tests consume real engine output                                | `ENG-015` and `SEC-002`; covered by `packages/engine-core/src/filter-state-for-player.real-states.test.ts` and CLI PlayerView filtering tests.                                                                           |
| Invariant tests pass after accepted actions                                                                   | `ENG-002A` plus accepted-action tests throughout `engine-core`; the root test suite exercises invariants and canonical hashability under `corepack pnpm run verify`.                                                     |

## Later-Milestone Follow-Ups

The following remain non-blocking for terminal-engine closeout and belong to
later milestones:

- first effect runtime expansion: broader supported sample effects, simultaneous
  triggers, On K.O. follow-through, and hidden-info tests for trigger/search
  behavior
- production replay, rollback, recovery, version migration, persisted replay
  storage, and replay viewer work
- browser UI and view-engine package
- live match server, WebSocket sequencing, reconnect, timers, and Redis recovery
- card-data adapter, broad card pool support, deck builder, and Poneglyph live
  adapter
- platform API, accounts, matchmaking, lobbies, ranked, spectator, tournament,
  and database-backed product features
