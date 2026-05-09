<!-- agent-packet:story-id CARD-001G -->
<!-- agent-packet:story-path stories/approved/CARD-001G-representative-fixtures-boundary-tests.yaml -->
<!-- agent-packet:story-sha256 229d63f9cf14c8d536aa1544802566b7532d2aac45900efa2452ccab73f52d46 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-001G
Epic ID: CARD-001
Title: Add representative fixtures and package-boundary tests
Type: implementation
Area: cards
Primary Concern: verification

## Why

Add representative card fixtures for upcoming engine/effect stories and mechanical package-boundary tests proving engine-core remains isolated from @optcg/cards and external data clients.

## Authoritative Spec References

- 09-card-data-and-support-policy.s002 (Purpose)
- 09-card-data-and-support-policy.s003 (Data ownership model)
- 09-card-data-and-support-policy.s006 (Why the match server fetches card data)
- 09-card-data-and-support-policy.s011 (Support policy by mode)
- 15-implementation-kickoff.s015 (Spec-driven backlog and agent delivery)
- 15-implementation-kickoff.s012 (Guardrails)
- 19-poneglyph-api-contract.s002 (Purpose)
- 19-poneglyph-api-contract.s012 (Match creation behavior)
- 17-first-card-fixtures.s007 (Real Poneglyph-backed fixtures added in v3)
- 17-first-card-fixtures.s008 (Updated first fixture slice)
- 18-acceptance-tests.s011 (v3 Poneglyph adapter acceptance tests)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 09-card-data-and-support-policy.s002 (Purpose)

The card-data layer is the bridge between external printed-card metadata and simulator-owned rule implementation data. The original plan made **Poneglyph API (`api.poneglyph.one`) the source of truth for card text, stats, images, variants, and metadata**. This spec keeps that decision explicit and adds a support policy so unsupported effect cards cannot silently behave as vanilla cards.

`@optcg/cards` is a thin typed adapter over Poneglyph plus a simulator overlay. The engine consumes resolved cards from this adapter; it does not call Poneglyph directly during effect resolution.

### 09-card-data-and-support-policy.s003 (Data ownership model)

| Data                    | Source / authority                                            | Notes                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base card ID            | Poneglyph                                                     | This is the canonical `cardId` used by decks, effects, state, and DB rows.                                                                                                     |
| Printed name            | Poneglyph                                                     | Display and search.                                                                                                                                                            |
| Category                | Poneglyph                                                     | Leader, Character, Event, Stage, DON!!.                                                                                                                                        |
| Color                   | Poneglyph                                                     | Used by deck validation and display.                                                                                                                                           |
| Cost/life/power/counter | Poneglyph                                                     | Engine reads this only after server-side validation.                                                                                                                           |
| Type/attribute          | Poneglyph                                                     | Used by filters and effects.                                                                                                                                                   |
| Printed card text       | Poneglyph                                                     | Used for display, text hashes, effect-authoring pipeline, and human review.                                                                                                    |
| Images and variants     | Poneglyph                                                     | Cosmetic display only. No gameplay authority.                                                                                                                                  |
| Effect DSL definitions  | Simulator overlay                                             | Local JSON/JSONC/YAML keyed by Poneglyph card ID.                                                                                                                              |
| Custom handler IDs      | Simulator overlay                                             | Used only for cards that cannot be represented by DSL.                                                                                                                         |
| Ruling overrides        | Simulator overlay                                             | Local rules/ruling notes keyed by Poneglyph card ID.                                                                                                                           |
| Card support status     | Simulator overlay                                             | Determines if a card can be used in each play mode.                                                                                                                            |
| Banlist / restrictions  | Poneglyph legality data plus simulator overlay/format service | Poneglyph is the source of truth for per-format card legality status and copy-limit inputs; simulator overlays add unsupported-card policy and any platform-local enforcement. |

### 09-card-data-and-support-policy.s006 (Why the match server fetches card data)

The server is authoritative. The client may render card names, images, and text from Poneglyph for convenience, but **client-supplied card data has no gameplay authority**.

At match creation, the server resolves every card ID in both decks through `@optcg/cards`, validates it, merges overlays, and snapshots the resolved manifest for the match. During the match, the engine reads the match snapshot rather than refetching live card data.

This prevents:

- Modified clients changing card stats or text.
- Deck submissions with fake card metadata.
- Mid-match behavior changes if Poneglyph updates text or metadata.
- Inconsistent replays caused by live external data changing.

### 09-card-data-and-support-policy.s011 (Support policy by mode)

| Status                |              Dev sandbox | Unranked / custom |                         Ranked |
| --------------------- | -----------------------: | ----------------: | -----------------------------: |
| `vanilla-confirmed`   |                  Allowed |           Allowed |                        Allowed |
| `implemented-dsl`     |                  Allowed |           Allowed |                        Allowed |
| `implemented-custom`  |                  Allowed | Allowed if tested | Allowed if tested and reviewed |
| `unsupported`         |     Allowed with warning |          Rejected |                       Rejected |
| `banned-in-simulator` | Rejected unless override |          Rejected |                       Rejected |

Missing overlay records should fail closed in public modes. A non-vanilla Poneglyph card without support metadata is treated as `unsupported`.

### 15-implementation-kickoff.s015 (Spec-driven backlog and agent delivery)

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

### 15-implementation-kickoff.s012 (Guardrails)

- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code.
- The client must not import `engine-core` once hidden state exists; use `view-engine`.
- The card-data package may call Poneglyph, but effect resolution must consume resolved manifests, not live HTTP calls.
- Unsupported cards must fail closed outside dev sandbox.

### 19-poneglyph-api-contract.s002 (Purpose)

This document tightens the `@optcg/cards` implementation against the provided Poneglyph OpenAPI contract and real card payload examples. The original simulator plan says Poneglyph is the source of truth for printed card text, stats, images, variants, and metadata. This document makes that actionable without giving Poneglyph gameplay authority.

The engine never calls Poneglyph during effect resolution. `@optcg/cards` resolves Poneglyph data, validates it, normalizes it, merges simulator overlays, and produces a match-time manifest.

### 19-poneglyph-api-contract.s012 (Match creation behavior)

1. Collect unique base card IDs from both leaders, main decks, and DON!! decks.
2. Resolve through batch endpoint in chunks of 60.
3. Validate and normalize each returned card.
4. Fail if any requested card appears in `missing`.
5. Merge simulator overlays.
6. Reject unsupported, stale, unreleased, or format-illegal cards according to mode.
7. Snapshot the full match manifest, including hash/version fields.

### 17-first-card-fixtures.s007 (Real Poneglyph-backed fixtures added in v3)

Use these two real card payloads immediately because they test the card-data adapter and effect DSL more effectively than pure fake cards.

| Card                             | Fixture path                                                   | Why it is included early                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OP01-060` Donquixote Doflamingo | `fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json` | Tests variant index `0`, source-attached DON!! condition, paid attack trigger, public reveal, optional effect-play rested, and FAQ-driven face-down return. |
| `OP05-091` Rebecca               | `fixtures/poneglyph/cards/OP05-091.rebecca.json`               | Tests nullable variant fields, `[Blocker]`, trash-to-hand, then hand-to-field sequence, `other than [Rebecca]`, and FAQ-confirmed same-card play.           |

These do not replace the 20-card coverage set. They anchor it to actual Poneglyph payloads so the adapter, effect DSL, and tests evolve together.

### 17-first-card-fixtures.s008 (Updated first fixture slice)

For the first implementation sprint, use this tighter subset:

```text
1. FX-LEADER-VANILLA      - fake vanilla leader for minimal combat
2. FX-CHAR-VANILLA        - fake vanilla character for play/K.O.
3. FX-BLOCKER             - fake blocker if Rebecca is not yet loaded
4. FX-ONPLAY-DRAW         - simple on-play draw primitive
5. OP01-060               - real Doflamingo fixture, implemented after transient reveal primitives
6. OP05-091               - real Rebecca fixture, implemented after sequence-local selections
```

The fake cards keep the CLI loop simple. The real cards prove that the Poneglyph adapter and DSL are not drifting away from actual card payloads.

### 18-acceptance-tests.s011 (v3 Poneglyph adapter acceptance tests)

```text
PON-001 OpenAPI fixture parses as JSON and exposes /v1/cards/{card_number}, /v1/cards/batch, /v1/search, /v1/cards/{card_number}/text, /v1/formats.
PON-002 Poneglyph detail Zod schema accepts OP01-060 and OP05-091 fixtures.
PON-003 Batch resolver chunks unique card IDs into requests of <=60 IDs.
PON-004 Batch resolver fails match creation if any requested ID is returned in missing.
PON-005 Search result DTO is rejected as a match-manifest source.
PON-006 OP01-060 variant indexes normalize to OP01-060:v0, OP01-060:v1, OP01-060:v2.
PON-007 OP05-091 variant with null product set_code and null market price normalizes without throwing.
PON-008 sourceTextHash changes when effect or trigger text changes.
PON-009 behaviorHash changes when official_faq, errata, stats, type line, effect, or trigger changes.
PON-010 Unreleased cards are rejected in public modes unless explicitly enabled by format policy.
PON-011 variant_index defaults to 0 and generated variant_key is non-null.
PON-012 search result DTO cannot be used to build MatchCardManifest.
PON-013 attributes and colors normalize as arrays.
```

### 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)

Package-boundary enforcement is required, not optional.

At minimum, lint rules or dependency-cruiser / equivalent boundary tooling must enforce:

- `@optcg/engine-core` cannot import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients.
- `@optcg/view-engine` cannot import hidden-information-only server modules.
- `@optcg/client` cannot import server-only packages.
- `@optcg/server` cannot bypass `@optcg/cards` to call card-data sources directly from engine execution paths.
- test helpers that expose hidden state cannot be imported into browser/client production bundles.
- replay validation code cannot depend on client rendering code.

If stronger tooling is adopted, such as dependency-cruiser, Knip, or custom graph checks, CI must fail on violations.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own representative fixture closeout and package-boundary verification only. Do not add new gameplay semantics, server/client integration, persistence, or broader card support coverage in this story.

## Scope

- add representative card fixtures usable by upcoming engine/effect stories
- include fixture coverage for vanilla leader, vanilla character, blocker, simple on-play draw, OP01-060, and OP05-091 where supported by current contracts
- add package-boundary tests proving engine-core does not import @optcg/cards, Poneglyph HTTP code, Redis, Postgres, server code, or client code
- add fixture export or loader surfaces under @optcg/cards for tests without requiring live Poneglyph or live Redis
- document any unsupported representative fixture behavior as support metadata, not gameplay implementation

## Out of Scope

- full released-card support coverage
- automated effect generation pipeline
- implementing new effect primitives
- changing gameplay semantics
- changing engine-core to fetch cards directly
- match-server, platform API, database, client, or UI integration

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cards/**
- fixtures/poneglyph/**
- tests/contracts/**
- tests/lint/**
- eslint.config.mjs
- stories/generated/CARD-001G-representative-fixtures-boundary-tests.yaml
- stories/approved/CARD-001G-representative-fixtures-boundary-tests.yaml
- agent-packets/CARD-001G.md
- agent-packets/active.json

## Constraints

- do not add new gameplay semantics in fixture closeout
- engine-core must remain isolated from @optcg/cards and external data clients
- tests must not require live Poneglyph or live Redis
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- fixture availability test for representative card set
- package-boundary test for engine-core to @optcg/cards import ban
- package-boundary test for engine-core to Poneglyph HTTP, Redis, Postgres, server, and client import bans
- full `corepack pnpm verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- representative fixtures are available from @optcg/cards test/package surfaces without live network calls
- boundary tests fail if engine-core imports @optcg/cards
- boundary tests fail if engine-core imports Poneglyph HTTP, Redis, Postgres, server, or client code
- fixture support metadata distinguishes unsupported behavior from implemented behavior

## Ambiguity Rule

Policy: fail_and_escalate

If the story or cited specification is ambiguous, do not invent behavior. Report the ambiguity and stop at the narrowest safe point.

## Agent Instruction Footer

```text
You are implementing a constrained story in an existing codebase.
The cited specification is authoritative.
Do not invent behavior not supported by the cited spec.
Stay within scope.
Stay within the approved story boundary and allowed touch points.
Follow repo tooling and code standard requirements.
Include tests for the listed acceptance criteria.
If the spec is ambiguous, report the ambiguity instead of guessing.
```
