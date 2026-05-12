---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "12-roadmap"
doc_title: "Roadmap"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Roadmap

<!-- SECTION_REF: 12-roadmap.s001 -->

Section Ref: `12-roadmap.s001`

## v6 milestone gates

<!-- SECTION_REF: 12-roadmap.s002 -->

Section Ref: `12-roadmap.s002`

Milestone 0 may start immediately. Milestone 1 may start for the vanilla engine and fixture adapter. Full effect runtime, production server, DB migrations, ranked spectator flows, and public alpha are gated by the checklist in `22-v6-implementation-tightening.md`.

Required gates before full card/effect implementation:

```text
[ ] contracts/canonical-types.ts compiles in CI
[ ] effect DSL fixtures validate against contracts/effect-dsl.schema.json
[ ] life orientation, main-phase start trigger, counter-step, post-counter legality tests pass
[ ] effect queue generation ordering tests pass
[ ] replacement choice/chaining tests pass
[ ] replay reconstruction source policy implemented
[ ] database-schema-v6.sql accepted by migration tooling
```

## Revised build order

<!-- SECTION_REF: 12-roadmap.s003 -->

Section Ref: `12-roadmap.s003`

The project should prove the engine before building too much infrastructure.

1. `@optcg/types`
2. `@optcg/engine-core` with hardcoded sample card metadata
3. CLI game runner with 10–20 cards
4. Event journal + pending decision model
5. Invariant tests and basic fuzz tests
6. Minimal `@optcg/effects` definitions for sample cards
7. Minimal `@optcg/cards` adapter, no Redis requirement yet
8. Minimal browser board using mocked/local filtered views
9. Match server with WebSocket sequencing/idempotency
10. Redis recovery baseline
11. Platform API: auth, deck builder, deck validation
12. Replay viewer
13. Bot
14. Unranked queue, custom lobbies, ranked ladder, spectator, tournament features

## Milestone 0: repo foundation

<!-- SECTION_REF: 12-roadmap.s004 -->

Section Ref: `12-roadmap.s004`

Deliverables:

- Monorepo setup.
- TypeScript config.
- Package boundaries.
- CI for typecheck/lint/test.
- Initial docs and ADRs.

Exit criteria:

- All packages build.
- Boundary lint rules prevent client importing server-only engine internals.

## Milestone 1: terminal engine

<!-- SECTION_REF: 12-roadmap.s005 -->

Section Ref: `12-roadmap.s005`

Deliverables:

- `GameState` model.
- Setup, draw, DON!!, main, end phases.
- Play Character/Stage/Event skeleton.
- Attack/battle/damage with vanilla cards.
- Event journal.
- State hash.
- CLI runner.

Exit criteria:

- CLI can play a complete vanilla match through normal legal actions.
- Character play from hand exists.
- Stage play from hand exists.
- DON!! attach/refresh works.
- Attacks against Leader and rested Character work.
- Damage, life-to-hand, K.O., deck-out, and concession endings work.
- Every accepted action has stable state hash output.
- Event journal seq is strictly increasing.
- Local deterministic CLI command/decision script smoke from fixture boot
  reproduces script-defined state-hash checkpoints and final hash, without
  requiring production ReplayCheckpoint artifacts.
- production `filterStateForPlayer` hidden-info tests consume real engine output.
- Invariant tests pass after every accepted action.

Milestone 1 does not include server, client, Poneglyph live adapter, Redis, ranked, broad card pool work, or production ReplayLog, ReplayHeader, persisted replay storage, rollback, recovery, version migration, or replay viewer.

## Milestone 2: first effect runtime

<!-- SECTION_REF: 12-roadmap.s006 -->

Section Ref: `12-roadmap.s006`

Deliverables:

- EffectDefinition schema.
- Stable effect IDs.
- Effect queue.
- Pending decisions.
- Draw, trash, K.O., power modification, blocker, counter, trigger.
- Continuous computed view.
- SourcePresencePolicy.

Exit criteria:

- 10–20 representative cards implemented and tested.
- Simultaneous trigger test passes.
- On K.O. resolves correctly after source movement.
- Hidden-info tests for trigger/search pass.

## Milestone 3: local browser prototype

<!-- SECTION_REF: 12-roadmap.s007 -->

Section Ref: `12-roadmap.s007`

Deliverables:

- Board UI.
- Hand display.
- Target selection UI.
- Pending decision prompts.
- Local mocked match state or single-process server.

Exit criteria:

- One person can play both sides through browser UI.
- UI never needs raw full `GameState`.

## Milestone 4: live match server

<!-- SECTION_REF: 12-roadmap.s008 -->

Section Ref: `12-roadmap.s008`

Deliverables:

- WebSocket rooms.
- Action envelopes.
- Idempotency.
- Reconnect.
- Timers.
- Filtered per-player views.
- Basic spectator view.

Exit criteria:

- Two browsers can play a sample-card match.
- Double-click/resend does not double-apply actions.
- Reconnect resumes match.
- Stale action rejected cleanly.

## Milestone 5: deck builder and card data

<!-- SECTION_REF: 12-roadmap.s009 -->

Section Ref: `12-roadmap.s009`

Deliverables:

- Card-data adapter.
- Local overlay and generated support registry.
- Complete-parse generated support index and runtime capability matrix.
- Deck CRUD.
- Deck validation.
- Variant storage.
- Unsupported-card rejection.

Exit criteria:

- Player can create legal sample deck.
- Ranked validation rejects unsupported non-vanilla cards.
- Complete-parse common-template cards can be supported by certified parser rules without manual per-card mapping.
- Partial, stale, ambiguous, unparsed, or capability-missing generated support remains rejected in normal play.
- Variant split counts correctly.

## Milestone 6: replay/rollback/recovery

<!-- SECTION_REF: 12-roadmap.s010 -->

Section Ref: `12-roadmap.s010`

Deliverables:

- Replay header with versions.
- Action/decision log.
- Checkpoints.
- Casual rollback.
- Hidden-info rollback classification.
- Redis active match snapshot.
- Crash freeze/recovery path.

Exit criteria:

- Completed match replay final hash matches.
- Rollback past revealed info is blocked in ranked policy.
- Simulated process restart recovers or freezes safely.

## Milestone 7: public unranked alpha and custom lobbies

<!-- SECTION_REF: 12-roadmap.s011 -->

Section Ref: `12-roadmap.s011`

Deliverables:

- Accounts.
- Unranked queue.
- Custom lobby system with optional passwords.
- Reports.
- Observability dashboard.
- Legal/content policy decided.
- Limited card pool.

Exit criteria:

- No known hidden-info leaks.
- Crash reports include enough debug data.
- Passworded custom lobbies and public unranked queue both work end to end.
- Unsupported cards are user-visible in deck validation.

## Milestone 8: ranked ladder beta

<!-- SECTION_REF: 12-roadmap.s012 -->

Section Ref: `12-roadmap.s012`

Deliverables:

- Simple Elo rating system.
- Ranked queue.
- Strict deck validation.
- Ranked disconnect discipline and queue lockouts.
- Judge/admin tools.
- Enhanced anti-cheat logging.
- Spectator policy locked down.

Exit criteria:

- Replay drift tests in CI.
- Rollback policy reviewed.
- Admin can freeze/review matches.
- Elo changes and disconnect strikes are recorded correctly.

## Open decisions

<!-- SECTION_REF: 12-roadmap.s013 -->

Section Ref: `12-roadmap.s013`

| Decision                | Recommendation                                                             | Needed by       |
| ----------------------- | -------------------------------------------------------------------------- | --------------- |
| Effect DSL storage      | Repo JSON/JSONC in Phase 1                                                 | Milestone 2     |
| Frontend hosting        | Any static host; decide later                                              | Milestone 4     |
| WebSocket library       | `ws` for control or `socket.io` for ergonomics                             | Milestone 4     |
| Replay snapshot storage | Postgres JSONB first, object storage later                                 | Milestone 6     |
| Card images             | Decide legal/content mode before public alpha                              | Milestone 7     |
| Spectator ranked mode   | Deferred; ranked matches are not spectatable in the initial implementation | Later milestone |
| Ranking formula         | Start simple Elo; migrate later if needed                                  | Milestone 8     |

## Risk register

<!-- SECTION_REF: 12-roadmap.s014 -->

Section Ref: `12-roadmap.s014`

| Risk                       | Impact                    | Mitigation                                           |
| -------------------------- | ------------------------- | ---------------------------------------------------- |
| Hidden-info leak           | Severe trust failure      | Default-hidden views, tests, no full state on client |
| Effect queue bug           | Incorrect games           | Event journal, golden replays, interaction tests     |
| Unsupported card allowed   | Silent unfairness         | Support registry and deck validation                 |
| Replay drift               | Replays unusable          | Version headers and checkpoint hashes                |
| Continuous effect mutation | State corruption          | Computed view layer only                             |
| Crash loops on recovery    | Match cannot recover      | Recovery modes and freeze-for-review                 |
| Scope creep                | Never ships               | Narrow sample-card milestones                        |
| Card-data source downtime  | Deck/match start failures | Cache and clear degraded behavior                    |
| Legal/content issue        | Public launch blocked     | Decide image/trademark/takedown policy early         |
| Contributor churn          | Modules abandoned         | Small package boundaries and docs                    |

## Immediate next tasks

<!-- SECTION_REF: 12-roadmap.s015 -->

Section Ref: `12-roadmap.s015`

1. Create `@optcg/types` skeleton.
2. Define `GameState`, `PlayerView`, `Action`, `EngineEvent`, `PendingDecision` types.
3. Write invariant utilities.
4. Implement deterministic RNG wrapper.
5. Implement setup and vanilla turn flow.
6. Create CLI runner.
7. Add first golden replay test.

## Original phase plan preserved

<!-- SECTION_REF: 12-roadmap.s016 -->

Section Ref: `12-roadmap.s016`

The original simulator plan used broad time-boxed phases. The revised milestone order above changes the solo-dev sequencing, but the original phases are still useful as a product-level roadmap.

### Original Phase 1 - Foundation, weeks 1-4

<!-- SECTION_REF: 12-roadmap.s017 -->

Section Ref: `12-roadmap.s017`

- Set up monorepo with Turborepo or equivalent.
- Define `@optcg/types` for card schema, game state shape, action types, and shared contracts.
- Build `@optcg/cards` with Poneglyph API client, local/cache layer, and validation.
- Validate that Poneglyph card data matches the engine's expected card schema.
- Implement core `@optcg/engine-core` turn flow with a handful of vanilla cards.
- Write a CLI test harness that plays a terminal game against the engine.

### Original Phase 2 - Playable prototype, weeks 5-10

<!-- SECTION_REF: 12-roadmap.s018 -->

Section Ref: `12-roadmap.s018`

- Stand up `@optcg/match-server`.
- Allow two clients to connect and play a basic match.
- Build initial client board, hand display, card play, and attack UI.
- Implement platform auth and deck builder endpoints.
- Run first browser-based human playtest.

### Original Phase 3 - Feature completion, weeks 11-18

<!-- SECTION_REF: 12-roadmap.s019 -->

Section Ref: `12-roadmap.s019`

- Expand engine to cover effects, keywords, triggers, and counter steps.
- Expand card data coverage toward all released sets from Poneglyph.
- Add matchmaking, Elo/rating, and game history.
- Polish client animations, sound, responsive layout, and mobile support.
- Build a basic bot opponent.

### Original Phase 4 - Launch and iterate

<!-- SECTION_REF: 12-roadmap.s020 -->

Section Ref: `12-roadmap.s020`

- Replay system.
- Spectator mode.
- Tournament/lobby features.
- Community features such as deck sharing and ratings.
- Performance optimization and scaling.
- New set releases as card-data/effect-definition updates.

## Why the revised solo order differs

<!-- SECTION_REF: 12-roadmap.s021 -->

Section Ref: `12-roadmap.s021`

The original plan placed `@optcg/cards` and Redis early. The revised solo-development order starts with `@optcg/types`, `@optcg/engine-core`, a CLI runner, and sample hardcoded Poneglyph-shaped card IDs before full Poneglyph/Redis integration. That reduces infrastructure work before proving the hardest part: correct gameplay.

Once the terminal engine works, add `@optcg/cards` and Poneglyph read-through cache as the bridge from fixture cards to real card data.
