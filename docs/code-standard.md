# Code Standard Guide

This guide is mandatory implementation guidance for workers and reviewers. The
specification and approved story still win when they are more specific. Use this
guide to decide whether a patch is shaped well enough to review and maintain.

## TypeScript And Module Style

- Keep implementation packages in strict TypeScript. Do not weaken compiler
  settings to make a patch pass. The repo baseline includes `strict`,
  `noImplicitAny`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `useUnknownInCatchVariables`, and `noEmitOnError`
  (`23-repo-tooling-and-enforcement.s006`).
- Avoid `any`, routine non-null assertions (`!`), `@ts-ignore`,
  `@ts-nocheck`, and broad type assertions. If an escape hatch is unavoidable,
  keep it at the trust boundary, make it narrow, and explain the reason in the
  PR.
- Prefer `unknown` plus validation for external input. Do not cast browser,
  API, Redis, Postgres, or card-data payloads directly into trusted engine
  types.
- Prefer named exports. Do not introduce default exports unless the repo later
  adopts them explicitly.
- Keep imports directional and package-safe. Type-only imports should be marked
  as type imports when the compiler setting requires it.
- Do not use `console` in production packages. Use an approved logger or keep
  diagnostics in tests/dev-only paths.
- Let Prettier and ESLint win. Formatting and lint compliance are part of the
  change, not cleanup for later (`23-repo-tooling-and-enforcement.s016`).

## Separation Of Concerns

Each file should have one primary reason to change. A good split separates
policy, orchestration, pure rules, adapters, and presentation when those pieces
change for different reasons. A bad split creates tiny pass-through files that
must be opened together to understand one behavior.

File-size guidance uses effective implementation lines, excluding imports,
blank lines, generated headers, and obvious fixture data:

- 500 lines is suspect. Review why the file is growing and whether it now has
  more than one reason to change.
- 800 lines is high-risk. A PR that grows or keeps a file this large should
  explain why the current boundary is still cohesive.
- 1000 lines is the hard mechanical guard. Do not work around it by hiding logic
  in generated files, barrel files, or unrelated helpers.

Split for cohesion, not for line-count theater. Over-splitting is also a defect:
if every change requires editing a chain of one-function wrappers, merge the
boundary back or move the boundary to a real concept.

Good split examples:

- Move `filterStateForPlayer`, `filterStateForSpectator`, and
  `filterStateForReplay` into separate visibility modules because each has a
  different recipient and leak policy (`06-visibility-security.s021`).
- Keep a pure engine primitive such as draw/KO/search separate from card-specific
  effect definitions because primitive behavior has synthetic regression tests
  while card definitions have real-card behavior tests (`11-testing-quality.s004`,
  `11-testing-quality.s005`).
- Split shared type changes from engine, protocol, and UI changes when a story
  crosses package boundaries, then land package-specific work deliberately
  (`01-system-architecture.s021`).

Bad split examples:

- Splitting one card effect into `validate.ts`, `execute.ts`, `events.ts`, and
  `index.ts` when none of those files can be understood or tested alone.
- Moving hidden-information filtering into client helpers because the UI needs a
  convenient shape. The client-safe view engine operates only on `PlayerView`
  (`06-visibility-security.s019`).
- Adding a card-data fixture update inside an engine-rule story because the
  failing test is nearby. Fixture/card-data coverage is separate unless the
  approved story explicitly owns it.

## Package Boundaries

Respect package authority before local convenience (`01-system-architecture.s003`).

- `@optcg/engine-core` owns full `GameState`, hidden zones, RNG state,
  `applyAction`, `getLegalActions`, `resumeDecision`, rules, battle flow, effect
  queue, event journal, visibility filtering, and state hashes. It must not
  import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP
  clients (`01-system-architecture.s005`).
- `@optcg/view-engine` is client-safe and operates only on `PlayerView` or replay
  snapshots. It may plan UI affordances and animation; it must not infer
  authoritative legal actions from hidden state (`01-system-architecture.s006`).
- `@optcg/cards` adapts card metadata and source-card APIs. The server never
  trusts card data supplied by the browser (`01-system-architecture.s008`,
  `01-system-architecture.s013`).
- `@optcg/match-server` orchestrates live matches, sequencing, timers,
  reconnects, persistence, and replay writes. It calls the engine for rules and
  does not implement card rules itself (`01-system-architecture.s009`).
- `@optcg/api` owns platform services such as auth, deck CRUD, queue control,
  ratings, social, reports, and moderation (`01-system-architecture.s010`).
- `@optcg/client` renders filtered views and talks to server APIs. It must not
  import server-only modules or receive raw `GameState` (`01-system-architecture.s011`,
  `06-visibility-security.s002`).

For cross-package stories, land shared type changes first, then engine/effect,
protocol/server, and client/view changes in reviewable slices. Avoid one PR that
rewrites multiple boundaries unless it is a mechanical migration with explicit
compatibility notes and integration tests (`01-system-architecture.s021`).

## Deterministic Engine Standards

Engine behavior must be deterministic, replayable, and auditable.

- Every accepted atomic mutation emits events. Event IDs and `seq` values must be
  allocated in append order, and result events plus `state.eventJournal` must be
  strictly increasing by `seq` (`03-game-state-events-decisions.s005`).
- Production engine logic should not mutate state in place. Return the next
  state and events through the atomic mutation contract
  (`03-game-state-events-decisions.s007`).
- Do not use `Math.random()`. Use state-backed RNG and carry the next RNG state
  forward. Shuffle events must not reveal hidden order to live players
  (`03-game-state-events-decisions.s019`).
- Keep time deterministic. Exclude timestamps from state hashes unless the spec
  says they are part of replay logic (`03-game-state-events-decisions.s020`).
- Use canonical serialization for hashes: stable key order, stable array order,
  hidden data included for authoritative replay hashes, and separate public-view
  hashes only when useful (`03-game-state-events-decisions.s020`).
- Legal actions must be derived from the current state and pending decision, and
  must not imply hidden opponent options (`03-game-state-events-decisions.s015`).
- All player choices go through `PendingDecision` and
  `respondToDecision`. Decision IDs are single-use except for exact idempotent
  retries accepted by match-server policy (`03-game-state-events-decisions.s017`).
- Run invariant hooks after every accepted action and effect resolution in
  tests/dev. Add or update invariants when a rule introduces a new state
  consistency condition (`03-game-state-events-decisions.s021`).

## Hidden-Information Standards

Hidden-information safety is a server authority boundary, not a UI convention.
Raw `GameState` must never leave the match server except for trusted internal
debugging, persistence, or completed replay storage (`06-visibility-security.s002`).

- If a field is not explicitly allowed in `PlayerView`, `SpectatorView`, or
  `ReplayView`, it is hidden.
- `PlayerView` must not include deck order, opponent hand card IDs, face-down
  life card IDs, RNG seed/state, effect queue internals, private decision
  candidates, or crash/recovery metadata (`06-visibility-security.s004`).
- Events can contain hidden data. Filter events by visibility before they leave
  the trusted runtime (`03-game-state-events-decisions.s006`,
  `03-game-state-events-decisions.s018`).
- Legal actions sent to a client must not reveal hidden options. Auto-pass timing
  and action lists must not disclose whether hidden counter cards, triggers, or
  private choices exist (`06-visibility-security.s023`).
- Queue internals, private reveal candidates, and replay-only data stay out of
  live player paths. Replay can store information that was never sent during live
  play, but live filters still apply while the match is active.
- View helpers and client code operate on filtered views only. Never solve a UI
  problem by importing full state or duplicating server filtering in the client
  (`06-visibility-security.s019`).
- Every new view/filter path needs tests that run the hidden-information filter
  checklist for the relevant recipient (`06-visibility-security.s017`).

## Testing Standards

Tests must match the concern under review. Do not use one test type as a vague
substitute for another.

Engine synthetic/unit/regression behavior tests:

- Use minimal synthetic states, fixtures, or builders to prove engine primitives,
  rule paths, decisions, event order, determinism, visibility, and invariants.
- Do not depend on real card catalog ingestion unless the story is specifically
  about card data or card fixtures.
- Primitive tests assert state, events, decisions, and visibility for behavior
  such as draw, KO, trash, search, power/cost modification, replacement, damage,
  DON attachment, choice, conditionals, and sequence
  (`11-testing-quality.s004`).
- Regression tests should reproduce the bug or edge case directly, then protect
  the behavior against future engine changes.

Real-card fixture integration/card-data tests:

- Use source card metadata, overlays, and fixture data to prove that implemented
  cards and card-data adapters load and behave as expected.
- Every implemented non-vanilla card gets card-focused tests for timing, costs,
  optional decline, legal targets, resolution, moved sources, once-per-turn
  state, edge cases, and expected events (`11-testing-quality.s005`).
- Poneglyph schema handling or source-card adapter changes require card-data
  validation tests; do not silently absorb them into engine behavior stories.

All story work:

- Add or update tests in the same patch unless the approved story is explicitly
  docs-only or test-only.
- Run the story-required tests and the relevant package/root verification.
  `pnpm verify` is the canonical local pre-push command
  (`23-repo-tooling-and-enforcement.s005`).
- Do not claim full verification when a required command was skipped, missing,
  or failed.

## Story And Scope Standards

Implement one approved story at a time. The authoritative order is spec
sections, approved story, packet, repo instructions, workflow docs, local code,
then patch.

- Stay within `allowed_touch_points`. If the needed fix requires another file or
  another concern, stop and raise the ambiguity or split the story.
- Story size is governed by concern boundary, not raw diff size
  (`24-story-schema.s025`). Tests, docs, fixtures, and snapshots that directly
  prove the same concern do not automatically create a second concern.
- Do not broaden a story because adjacent code is weak. Record the weakness or
  create a follow-up story unless it blocks the approved acceptance criteria.
- Fail closed on gameplay rules, hidden-information behavior, replay behavior,
  fairness/timer behavior, persistence/account safety, and security-sensitive
  filtering.
- Parent/substory workflows keep each substory reviewable and preserve packet
  lifecycle evidence until the parent PR lands. `agent-packets/active.json` is a
  single active handoff pointer, not a full parent progress report
  (`32-codex-agent-integration.s013`).
- Avoid silent fixture/card-data absorption into engine stories. If an engine
  behavior test needs synthetic data, keep it synthetic unless the approved story
  also owns real-card fixture or card-data integration.

## Review And PR Standards

A PR should make scope, evidence, and risk easy to verify.

- List changed files by concern, especially when touching more than one package.
- Record exact tests and verification commands run. Include skipped commands and
  why they were skipped.
- State assumptions, blockers, and any ambiguity resolved by spec citation.
- Explain scope fit against the approved story, including any touched file that
  might look outside the main concern.
- For files above the size thresholds, explain why the file remains cohesive or
  include the focused split that keeps the story within scope.
- Include compatibility notes for protocol/shared type changes and integration
  evidence for cross-package changes (`01-system-architecture.s021`).
- Preserve durable review trails: AI review record or human-review fallback,
  revision response when reviewer-subagent review was used, and parent/substory
  records when applicable (`32-codex-agent-integration.s010`,
  `32-codex-agent-integration.s013`).
- Reviewers should lead with correctness, hidden-information safety, determinism,
  package-boundary violations, missing tests, and story-scope drift. Style-only
  comments are secondary unless they block enforcement.
