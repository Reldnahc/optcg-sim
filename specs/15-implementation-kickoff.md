---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "15-implementation-kickoff"
doc_title: "Implementation Kickoff"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Implementation Kickoff

<!-- SECTION_REF: 15-implementation-kickoff.s001 -->

Section Ref: `15-implementation-kickoff.s001`

## v5 kickoff gates

<!-- SECTION_REF: 15-implementation-kickoff.s002 -->

Section Ref: `15-implementation-kickoff.s002`

Start implementation from these files:

1. `SPEC_VERSION.md`
2. `contracts/canonical-types.ts`
3. `contracts/effect-dsl.schema.json`
4. `contracts/database-schema-v6.sql`
5. `22-v6-implementation-tightening.md`

First repo task: copy `contracts/canonical-types.ts` into `@optcg/types` or import it as the initial source of truth, then run `tsc -p contracts/tsconfig.json`. Do not begin broad card DSL work until effect fixtures can be validated against the schema.

## Goal

<!-- SECTION_REF: 15-implementation-kickoff.s003 -->

Section Ref: `15-implementation-kickoff.s003`

Start coding with the smallest slice that proves the engine is real: a deterministic, terminal-playable OPTCG game loop using Poneglyph-shaped card IDs and hardcoded fixture card metadata.

Do not start with full auth, matchmaking, Redis, or all released cards. Prove the game rules first.

## Package bootstrap order

<!-- SECTION_REF: 15-implementation-kickoff.s004 -->

Section Ref: `15-implementation-kickoff.s004`

```text
packages/
  types/
  engine-core/
  effects/
  cards/
  view-engine/
  match-server/
  api/
  client/
  bot/
integration/
fixtures/
```

### Step 1 - `@optcg/types`

<!-- SECTION_REF: 15-implementation-kickoff.s005 -->

Section Ref: `15-implementation-kickoff.s005`

Create shared types with no dependency on server/client packages.

Initial exports:

- Branded IDs: `CardId`, `InstanceId`, `PlayerId`, `MatchId`, `EffectId`.
- `Action` union.
- `PendingDecision` union.
- Public protocol DTOs.
- `PlayerView` and `SpectatorView`.
- Card metadata interfaces shaped around Poneglyph IDs.

### Step 2 - `@optcg/engine-core`

<!-- SECTION_REF: 15-implementation-kickoff.s006 -->

Section Ref: `15-implementation-kickoff.s006`

Implement the pure deterministic engine.

Initial exports:

```ts
createInitialState(input): GameState
getLegalActions(state, playerId): LegalAction[]
applyAction(state, action): EngineResult
resumeDecision(state, response): EngineResult
computeView(state): ComputedGameView
filterStateForPlayer(state, playerId): PlayerView
hashGameState(state): string
```

### Step 3 - CLI runner

<!-- SECTION_REF: 15-implementation-kickoff.s007 -->

Section Ref: `15-implementation-kickoff.s007`

A CLI runner should allow one developer to play both sides.

Minimum CLI commands:

```text
show
hand
play <handIndex>
attach-don <donIndex> <target>
attack <attacker> <target>
counter <handIndex>
pass
respond <choice>
concede
hash
```

The CLI should print state sequence, current phase, pending decision, legal actions, and state hash after every action.

For local/developer automation, command-script mode may support an optional
strict flag using the exact form `--command-script <script> --strict`.
In strict mode, command parse errors must exit nonzero. In strict mode, engine
or CLI dispatch errors must exit nonzero. Strict failure diagnostics must be
deterministic and useful: stderr must include the failed command and error
reason, and stdout command-result output for the failed command must remain
available. Non-strict command-script behavior remains unchanged unless a later
spec section changes it. Interactive developer behavior remains unchanged.
This is local/developer CLI behavior only, not match server protocol behavior,
browser client behavior, replay schema behavior, hidden-information filtering,
or database contracts.

## First milestone scope

<!-- SECTION_REF: 15-implementation-kickoff.s008 -->

Section Ref: `15-implementation-kickoff.s008`

Implement:

- Setup.
- Opening hands.
- Official mulligan flow.
- Refresh, Draw, DON!!, Main, End phases.
- Playing Characters and Stages.
- Event-card skeleton.
- DON!! attach and refresh return.
- Attacks against Leader and rested Characters.
- Leader damage and life-to-hand.
- Character K.O.
- Deck-out and concession.
- State hash.
- Event journal.
- Invariant tests.

Do not implement yet:

- Full Poneglyph client.
- Redis.
- Browser UI.
- Matchmaking.
- Ranked.
- Complete card pool.

## Hardcoded card metadata policy

<!-- SECTION_REF: 15-implementation-kickoff.s009 -->

Section Ref: `15-implementation-kickoff.s009`

Use fixture cards that look like resolved Poneglyph records, even before `@optcg/cards` is implemented.

```ts
const OP01_001: CardMetadata = {
  cardId: "OP01-001" as CardId,
  source: "poneglyph-fixture",
  name: "Fixture Leader",
  category: "leader",
  color: ["red"],
  life: 5,
  power: 5000,
  text: "",
};
```

This keeps the transition to real Poneglyph data straightforward.

## Required repo tooling before feature expansion

<!-- SECTION_REF: 15-implementation-kickoff.s010 -->

Section Ref: `15-implementation-kickoff.s010`

Before broad feature work, the repo must implement the baseline tooling and enforcement defined in [`23-repo-tooling-and-enforcement.md`](23-repo-tooling-and-enforcement.md).

Minimum required before the team starts scaling implementation across multiple packages:

- root workspace config with `pnpm`, shared TypeScript base config, ESLint, and Prettier,
- root `pnpm verify` command,
- git hooks for staged-file quality checks,
- CI pipeline that mirrors the main local verification steps,
- package-boundary enforcement for engine/server/client separation,
- contract/schema validation for canonical types and effect DSL fixtures.

The kickoff phase is not considered complete if the repo can compile locally but cannot automatically reject boundary violations, hidden-information leaks, or contract drift.

## Definition of done for kickoff

<!-- SECTION_REF: 15-implementation-kickoff.s011 -->

Section Ref: `15-implementation-kickoff.s011`

- `pnpm test` passes.
- CLI can play a complete vanilla match through normal legal actions.
- Character play from hand exists.
- Stage play from hand exists.
- DON!! attach/refresh works.
- Attacks against Leader and rested Character work.
- Damage, life-to-hand, K.O., deck-out, and concession endings work.
- Every accepted action increments `stateSeq`.
- Every accepted action has stable state hash output.
- Every atomic mutation emits at least one `EngineEvent` or has an explicit no-event reason.
- Event journal seq is strictly increasing.
- `hashGameState()` is stable across repeated runs with the same seed.
- Local deterministic CLI command/decision script smoke from fixture boot
  reproduces script-defined state-hash checkpoints and final hash, without
  requiring production ReplayCheckpoint artifacts.
- production `filterStateForPlayer` hidden-info tests consume real engine output
  and prove opponent hand, deck order, face-down life, RNG, and effect queue
  internals stay hidden.
- Milestone 1 does not include server, client, Poneglyph live adapter, Redis,
  ranked, broad card pool work, or production ReplayLog, ReplayHeader, persisted
  replay storage, rollback, recovery, version migration, or replay viewer.

## Guardrails

<!-- SECTION_REF: 15-implementation-kickoff.s012 -->

Section Ref: `15-implementation-kickoff.s012`

- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code.
- The client must not import `engine-core` once hidden state exists; use `view-engine`.
- The card-data package may call Poneglyph, but effect resolution must consume resolved manifests, not live HTTP calls.
- Unsupported cards must fail closed outside dev sandbox.

## v3 fixture-first card-data step

<!-- SECTION_REF: 15-implementation-kickoff.s013 -->

Section Ref: `15-implementation-kickoff.s013`

Before live Poneglyph HTTP or Redis exists, add a tiny `@optcg/cards` fixture loader:

```text
packages/cards/src/fixtures.ts
packages/cards/src/poneglyph-schema.ts
packages/cards/src/normalize.ts
```

Minimum exports:

```ts
loadPoneglyphFixture(cardId: CardId): PoneglyphCardDetail
validatePoneglyphCard(raw: unknown): PoneglyphCardDetail
normalizePoneglyphCard(raw: PoneglyphCardDetail, overlay: ResolvedCardOverlay): ResolvedCard
buildVariantKey(cardId: CardId, variantIndex: number): VariantKey
computeSourceTextHash(card: PoneglyphCardDetail): string
computeBehaviorHash(card: PoneglyphCardDetail): string
```

This keeps the engine-first plan intact while preventing fake card metadata from drifting away from actual Poneglyph JSON. Live HTTP and Redis can wait; the schemas and normalizer should not.

## Early platform note

<!-- SECTION_REF: 15-implementation-kickoff.s014 -->

Section Ref: `15-implementation-kickoff.s014`

When platform persistence is added, store account-level `loadouts`, not browser-local saved decks.

## Spec-driven backlog and agent delivery

<!-- SECTION_REF: 15-implementation-kickoff.s015 -->

Section Ref: `15-implementation-kickoff.s015`

Before parallel feature implementation begins, the repo should adopt the planning contract defined in:

- [`24-story-schema.md`](24-story-schema.md)
- [`25-story-template.md`](25-story-template.md)
- [`26-agent-packet-template.md`](26-agent-packet-template.md)
- [`27-spec-driven-story-generation-workflow.md`](27-spec-driven-story-generation-workflow.md)

Required kickoff outcome:

1. spec sections are mapped into candidate epics and stories,
2. approved implementation stories exist in a canonical schema,
3. each assigned story is converted into a constrained agent packet,
4. implementation/review agents are instructed to escalate ambiguity instead of inventing behavior,
5. completed work cites the spec sections it implemented.

The spec is the authority. Stories and agent packets are delivery artifacts derived from that authority. If a story packet conflicts with the cited spec, the cited spec wins and the packet must be corrected.

The first post-foundation platform backlog should also reserve explicit stories for:

- queue-backed `ranked` and `unranked` session entry,
- custom lobby creation/join flows with optional password support,
- format registry and `formatId` enforcement,
- ranked ladder identity, simple Elo updates, and disconnect discipline persistence.
