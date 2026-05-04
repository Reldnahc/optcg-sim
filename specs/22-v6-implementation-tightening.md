---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "22-v6-implementation-tightening"
doc_title: "V5 Implementation Tightening"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# v6 Implementation Tightening Pass

<!-- SECTION_REF: 22-v6-implementation-tightening.s001 -->

Section Ref: `22-v6-implementation-tightening.s001`

This file records the implementation-readiness tightening pass applied after the comprehensive review. It is not another high-level roadmap; it is a set of decisions that close ambiguity before the first production implementation.

## Implementation readiness verdict after this pass

<!-- SECTION_REF: 22-v6-implementation-tightening.s002 -->

Section Ref: `22-v6-implementation-tightening.s002`

The package is now ready to start:

- repo and package setup,
- `@optcg/types` from `contracts/canonical-types.ts`,
- vanilla deterministic engine,
- fixture-backed Poneglyph adapter,
- CLI acceptance tests,
- hidden-information player views,
- first replay smoke tests.

The package still intentionally gates broad full-card automation and public alpha until the effect DSL examples are validated against `contracts/effect-dsl.schema.json` and the first 20-card fixture suite passes.

## Files added

<!-- SECTION_REF: 22-v6-implementation-tightening.s003 -->

Section Ref: `22-v6-implementation-tightening.s003`

| File                                   | Purpose                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `SPEC_VERSION.md`                      | Canonical version manifest and supersession order.                                              |
| `contracts/canonical-types.ts`         | Compile-ready TypeScript implementation contract with previously missing types resolved.        |
| `contracts/tsconfig.json`              | Strict TypeScript check for the canonical type contract.                                        |
| `contracts/effect-dsl.schema.json`     | Canonical JSON Schema for effect-definition fixture validation.                                 |
| `contracts/database-schema-v6.sql`     | Corrected DDL contract for auth, sessions, variants, loadouts, manifests, replays, and reports. |
| `22-v6-implementation-tightening.md`   | This patch log and remaining gate list.                                                         |
| `29-game-types-queues-and-lobbies.md`  | Canonical game-type split for ranked, unranked, and custom session entry.                       |
| `30-formats-and-ranked-competition.md` | Format profiles, ladder identity, Elo policy, and disconnect discipline.                        |

## Critical ambiguity closures

<!-- SECTION_REF: 22-v6-implementation-tightening.s004 -->

Section Ref: `22-v6-implementation-tightening.s004`

### 1. Versioning and source of truth

<!-- SECTION_REF: 22-v6-implementation-tightening.s005 -->

Section Ref: `22-v6-implementation-tightening.s005`

The historical root folder name `optcg-md-specs-v3` is no longer used in the tightened package. `SPEC_VERSION.md` is the source of truth.

Implementation should use this order when resolving conflicts:

1. `SPEC_VERSION.md`
2. canonical contract files under `contracts/`
3. v5-tightening patch sections in Markdown docs
4. earlier Markdown prose and examples

### 2. TypeScript model

<!-- SECTION_REF: 22-v6-implementation-tightening.s006 -->

Section Ref: `22-v6-implementation-tightening.s006`

The old `16-typescript-interface-draft.md` was a draft and referenced undefined symbols. The implementation contract is now `contracts/canonical-types.ts`.

Resolved and normalized items include:

- `Color` -> `CardColor`
- `Attribute`
- `ZoneRef`
- `MatchCardManifest`
- `RngState`
- `EffectQueueEntry`
- `ContinuousEffect`
- `EventVisibility`
- `CardRef`
- `DecisionResponse`
- `Cost`
- `PaymentOption`
- `TargetRequest`
- `CardSelectionRequest`
- `EffectOption`
- `PublicEffectEvent` replacement via filtered `EngineEvent[]`
- `PlayerView` and initial live-filtered `SpectatorView`
- public live-view DTO support contracts
- `eventLog`/`eventJournal` conflict resolved to `eventJournal`
- `activeBattle`/`battle` conflict resolved to `battle`
- serializable arrays instead of `Set`

The contract compiles with:

```bash
cd contracts
tsc -p tsconfig.json
```

### 3. DSL schema

<!-- SECTION_REF: 22-v6-implementation-tightening.s007 -->

Section Ref: `22-v6-implementation-tightening.s007`

The canonical schema is `contracts/effect-dsl.schema.json`.

Key decisions:

- `CardFilter.costOp` and `CardFilter.costValue` are deprecated.
- Use `CardFilter.cost: { op, value }` or `CardFilter.cost: { min, max }`.
- `CardFilter.type`, `typeIncludes`, and `typeIncludesAny` are merged into `typesAny` and `typesAll`.
- `CardFilter.color` and `colorIncludes` are merged into `colorsAny` and `colorsAll`.
- `CardFilter.attribute` is merged into `attributesAny` and `attributesAll`.
- `moveSelected` has one signature: `{ type: "moveSelected", selection, from, to, position? }`.
- Transient reveal/selection primitives are canonical runtime concepts, not UI concepts.
- `sequence.effects[]` uses explicit connector semantics.

### 4. Life orientation

<!-- SECTION_REF: 22-v6-implementation-tightening.s008 -->

Section Ref: `22-v6-implementation-tightening.s008`

Canonical state convention:

```text
player.life[0] = top Life card = next Life card taken for damage.
```

Setup algorithm:

1. Take `leader.life` cards from the top of deck in deck order.
2. Let that draw-order list be `[A, B, C, ...]`, where `A` was originally top of deck.
3. Store Life as `reverse([A, B, C, ...])`.
4. This makes the original top-deck card the bottom Life card.

Damage algorithm:

```text
take player.life[0]
remove it from life
process trigger/hand/trash path
```

### 5. Phase and battle timing

<!-- SECTION_REF: 22-v6-implementation-tightening.s009 -->

Section Ref: `22-v6-implementation-tightening.s009`

The engine now has explicit handling for:

- start-of-main-phase trigger collection before the active player receives Main Phase action priority,
- defender-side opponent-attack effects before ordinary counter actions,
- post-Counter-Step legality check before Damage Step,
- attached DON!! having no active/rested state while attached,
- `DON!! -X` cost sources and failure behavior,
- precise once-per-turn consumption timing.

### 6. Effect queue ordering

<!-- SECTION_REF: 22-v6-implementation-tightening.s010 -->

Section Ref: `22-v6-implementation-tightening.s010`

Each queue entry has:

```text
timingWindowId
generation
controllerId
orderingGroup
createdAtEventSeq
queuedAtStateSeq
```

Ordering rule:

1. Resolve the oldest timing window first.
2. Inside a timing window, resolve lower `generation` first.
3. Inside a generation, turn-player bucket resolves before non-turn-player bucket.
4. Inside each player's simultaneous bucket, that player chooses order when there is more than one legal ordering.
5. Newly generated effects during resolution receive a higher generation and do not jump ahead of older pending entries.
6. Damage-processing triggers are collected and released only after the full damage process completes, except `[Trigger]` resolution itself.

### 7. Replacement effects

<!-- SECTION_REF: 22-v6-implementation-tightening.s011 -->

Section Ref: `22-v6-implementation-tightening.s011`

Replacement resolution is now a loop over a replaceable process:

1. Build a process object with `processId`, type, payload, and `usedReplacementIds`.
2. Collect applicable replacements not already used by that process.
3. Resolve priority and optional choices through `chooseReplacement` decisions.
4. Mark the selected replacement as used for that process.
5. Apply its transformation/effect.
6. Re-check replacements against the transformed process.
7. Execute the final process when no applicable replacement remains.

A replacement cannot apply more than once to the same process.

### 8. Replay determinism

<!-- SECTION_REF: 22-v6-implementation-tightening.s012 -->

Section Ref: `22-v6-implementation-tightening.s012`

A replay artifact must contain either:

```text
initialSnapshot
```

or:

```text
rngSeed + initialDeckOrders
```

A seed commitment alone is not enough to reconstruct a match.

Replay entries are split into:

- deterministic replay entries, and
- audit envelopes for client IDs, received timestamps, signatures, and transport metadata.

Only deterministic entries participate in replay hashing.

### 9. Database readiness

<!-- SECTION_REF: 22-v6-implementation-tightening.s013 -->

Section Ref: `22-v6-implementation-tightening.s013`

`contracts/database-schema-v6.sql` fixes the earlier DDL traps:

- no nullable variant uniqueness bug,
- generated `variant_key`,
- unique `sessions.token_hash`,
- provider-neutral `auth_accounts`,
- account-level `loadouts`,
- match-level card manifest hash and snapshot,
- replay-level manifest hash and snapshot,
- mandatory replay reconstruction source,
- report target typing.

### 10. Spectator policy

<!-- SECTION_REF: 22-v6-implementation-tightening.s014 -->

Section Ref: `22-v6-implementation-tightening.s014`

Initial spectator scope is now singular and narrowed for implementation:

| Match type       | Default spectator policy                                        |
| ---------------- | --------------------------------------------------------------- |
| Casual public    | `live-filtered`                                                 |
| Ranked public    | `disabled`                                                      |
| Private lobby    | Host-configurable between `disabled` and `live-filtered` only   |
| Tournament       | Deferred from initial implementation                            |
| Completed replay | Full information, unless a future privacy policy says otherwise |

`delayed-filtered` and `delayed-full` are deferred from initial implementation. They remain future design options, not active implementation scope.

### 11. Protocol idempotency

<!-- SECTION_REF: 22-v6-implementation-tightening.s015 -->

Section Ref: `22-v6-implementation-tightening.s015`

`clientActionId` is idempotent only when the repeated payload hash matches the original payload hash.

- Same `clientActionId` + same `actionHash`: return the original result.
- Same `clientActionId` + different `actionHash`: reject as an idempotency conflict.
- Lower `expectedStateSeq`: reject as stale unless it is a matching idempotent retry.
- Higher `expectedStateSeq`: reject or hold according to server policy; do not apply speculatively.

### 12. Public-alpha gates

<!-- SECTION_REF: 22-v6-implementation-tightening.s016 -->

Section Ref: `22-v6-implementation-tightening.s016`

Public alpha still requires:

- first 20-card support fixtures pass,
- DSL examples validate against schema,
- hidden-information tests pass,
- replay reconstruction passes from a persisted artifact,
- server protocol idempotency tests pass,
- spectator policy implementation passes tests,
- legal/image mode is finalized.

## Remaining known risks

<!-- SECTION_REF: 22-v6-implementation-tightening.s017 -->

Section Ref: `22-v6-implementation-tightening.s017`

This pass makes the spec implementation-ready for the foundation. It does not eliminate all risk. The largest remaining work items are:

1. Convert all existing example card DSL snippets to schema-valid JSON fixtures.
2. Add official-ruling-backed edge cases as cards are implemented.
3. Decide whether initial public launch uses official images, proxied Poneglyph image URLs, or text-only placeholders.
4. Validate `contracts/database-schema-v6.sql` against the selected Postgres version and migration tool.
5. Produce the first golden replay fixture after Milestone 1 engine implementation.

### 12. Repository tooling is now required

<!-- SECTION_REF: 22-v6-implementation-tightening.s018 -->

Section Ref: `22-v6-implementation-tightening.s018`

The package no longer treats repo tooling as implied team preference. The required enforcement contract now lives in [`23-repo-tooling-and-enforcement.md`](23-repo-tooling-and-enforcement.md).

Implementation is not considered ready for multi-contributor expansion until the repo defines:

- root workspace tooling,
- strict TypeScript config,
- ESLint with boundary restrictions,
- Prettier,
- git hooks,
- `pnpm verify`,
- CI merge gates,
- contract/schema validation,
- hidden-information regression enforcement.

This closes the remaining gap between architecture and mechanical enforcement.

### 13. Spec-driven delivery artifacts are now defined

<!-- SECTION_REF: 22-v6-implementation-tightening.s019 -->

Section Ref: `22-v6-implementation-tightening.s019`

The package now defines concrete planning artifacts for turning the specification into implementation work:

- a canonical story schema in [`24-story-schema.md`](24-story-schema.md),
- a copy-ready approved story template in [`25-story-template.md`](25-story-template.md),
- a standard agent assignment packet in [`26-agent-packet-template.md`](26-agent-packet-template.md),
- and the generation workflow and prompts in [`27-spec-driven-story-generation-workflow.md`](27-spec-driven-story-generation-workflow.md).

This closes another implementation-readiness gap: the spec no longer depends on ad hoc human translation into tickets before agent-based delivery can begin.

### 14. Game types and session entry

<!-- SECTION_REF: 22-v6-implementation-tightening.s020 -->

Section Ref: `22-v6-implementation-tightening.s020`

Public session terminology is now explicit:

- `ranked` = queue-backed competitive entry,
- `unranked` = queue-backed non-rated entry,
- `custom` = lobby-backed entry with optional password support.

Older prose that used `casual` should be read as either `unranked` for public queue play or `custom` for host-created private/public lobbies, depending on context. Tournament administration remains a future organizer layer, not a first-class launch game type.

### 15. Format profiles and ladders

<!-- SECTION_REF: 22-v6-implementation-tightening.s021 -->

Section Ref: `22-v6-implementation-tightening.s021`

Formats are now treated as explicit profiles, not an implied string. The new canonical format/ranked policy document is [`30-formats-and-ranked-competition.md`](30-formats-and-ranked-competition.md).

Key closures:

- `formatId` identifies a match/deck validation profile,
- queue eligibility is format-specific,
- ranked ladders are keyed by `ladderId`,
- launch ranked play uses a simple Elo ladder instead of an unspecified future rating system.

### 16. Ranked Elo and disconnect discipline

<!-- SECTION_REF: 22-v6-implementation-tightening.s022 -->

Section Ref: `22-v6-implementation-tightening.s022`

Ranked competitive policy is no longer left implicit.

- Ranked uses simple Elo first.
- Ranked disconnect grace expiry counts as a match loss unless a service-incident or admin override policy says otherwise.
- Ranked disconnect forfeits are logged as discipline events and may trigger temporary ranked queue lockouts.
- Unranked and custom matches do not update Elo.

This closes a fairness gap that previously sat between protocol timers, recovery, and persistence without a canonical competitive rule set.

## v6 delivery tightening additions

<!-- SECTION_REF: 22-v6-implementation-tightening.s023 -->

Section Ref: `22-v6-implementation-tightening.s023`

v6 adds a delivery-governance pass on top of the gameplay/runtime tightening work carried forward from v5.

Required tightening outcomes:

- approved story files should validate against [`contracts/story.schema.json`](contracts/story.schema.json),
- story examples and templates should cite stable `SECTION_REF` identifiers instead of heading-anchor examples,
- GitHub board exports should preserve story ID, priority, status, type, area, dependencies, and authoritative spec refs,
- Codex-facing repo instructions should live in checked-in `AGENTS.md` and skill files under [`.agents/skills/`](.agents/skills/),
- ambiguity handling should create explicit backlog items instead of being lost in chat history.
