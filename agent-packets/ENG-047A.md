<!-- agent-packet:story-id ENG-047A -->
<!-- agent-packet:story-path stories/approved/ENG-047A-transient-reveal-set-model.yaml -->
<!-- agent-packet:story-sha256 ca4442537ec68a51c55a47f9e96c7ce19cb17b26447e7dd49548dc1f34515bfd -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-047A
Epic ID: KICK-001
Title: Add transient reveal set model and support gate
Type: implementation
Area: engine
Primary Concern: rules

## Why

Add the first narrow transient reveal set representation for a supported synthetic top-of-deck search/look path and fail closed for unsupported reveal/search shapes.

## Authoritative Spec References

- 04-effect-runtime.s017 (Transient reveal and selection sets)
- 05-effect-dsl-reference.s014 (Search request)
- 05-effect-dsl-reference.s015 (Visibility)
- 06-visibility-security.s002 (Security principle)
- 06-visibility-security.s003 (Player zone visibility)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 22-v6-implementation-tightening.s008 (4. Life orientation)
- 22-v6-implementation-tightening.s009 (5. Phase and battle timing)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 04-effect-runtime.s017 (Transient reveal and selection sets)

Transient sets are part of effect execution context, not normal zones. They exist for patterns such as revealing the top card, selecting from a revealed set, and returning unselected cards face-down.

Rules:

1. A transient set has an origin, visibility, and cleanup policy.
2. Cards in a transient set are not simultaneously in hand/deck/trash/life.
3. Movement from a transient set to a real zone must emit a `cardMoved` event with appropriate visibility.
4. If an effect exits early, cleanup policy runs before the queue continues.
5. Opponent views may see a revealed card only for the duration and visibility specified by the effect. If the card returns face-down to a hidden zone, future opponent views must not retain its ID.

### 05-effect-dsl-reference.s014 (Search request)

```ts
interface SearchRequest {
  zone: "deck" | "trash" | "life";
  player: PlayerRef;
  lookCount?: number;
  filter: CardFilter;
  min: number;
  max: number;
  destination: Zone;
  revealTo: Visibility;
  remainingCards?: {
    destination: Zone;
    position: "top" | "bottom";
    order: "ownerChoice" | "random";
  };
  shuffleAfter?: boolean;
}
```

### 05-effect-dsl-reference.s015 (Visibility)

```ts
type Visibility =
  | "bothPlayers"
  | "chooserOnly"
  | "ownerOnly"
  | "controllerOnly"
  | "hidden"
  | "replayOnly";
```

### 06-visibility-security.s002 (Security principle)

The server holds `GameState`. Clients receive filtered views. A raw `GameState` must never leave the match server except for trusted internal debugging, persistence, or completed replay storage.

```ts
filterStateForPlayer(state, playerId) -> PlayerView
filterStateForSpectator(state, spectatorPolicy) -> SpectatorView
filterStateForReplay(state) -> ReplayView
```

If a field is not explicitly allowed in a view, it is hidden.

### 06-visibility-security.s003 (Player zone visibility)

| Zone           | Self view                        | Opponent view                    |
| -------------- | -------------------------------- | -------------------------------- |
| Deck           | Count only                       | Count only                       |
| DON!! Deck     | Count only / cosmetic art policy | Count only / cosmetic art policy |
| Hand           | Full card data                   | Count only                       |
| Trash          | Full ordered public data         | Full ordered public data         |
| Leader Area    | Full public data                 | Full public data                 |
| Character Area | Full public data                 | Full public data                 |
| Stage Area     | Full public data                 | Full public data                 |
| Cost Area      | Full public DON!! state          | Full public DON!! state          |
| Life Area      | Count + face-up cards only       | Count + face-up cards only       |
| No Zone        | Only if revealed to that player  | Only if revealed to that player  |

### 11-testing-quality.s004 (Unit tests per DSL primitive)

Every primitive has tests independent of specific cards:

- `draw`
- `ko`
- `trash`
- `bounce`
- `search`
- `lookAtTop`
- `modifyPower`
- `modifyCost`
- `giveKeyword`
- `replacement`
- `damage`
- `addLife`
- `attachDon`
- `returnDon`
- `choice`
- `conditional`
- `sequence`

Primitive tests should assert events, state, decisions, and visibility where applicable.

### 22-v6-implementation-tightening.s008 (4. Life orientation)

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

### 22-v6-implementation-tightening.s009 (5. Phase and battle timing)

The engine now has explicit handling for:

- start-of-main-phase trigger collection before the active player receives Main Phase action priority,
- defender-side opponent-attack effects before ordinary counter actions,
- post-Counter-Step legality check before Damage Step,
- attached DON!! having no active/rested state while attached,
- `DON!! -X` cost sources and failure behavior,
- precise once-per-turn consumption timing.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

### 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)

Boundary enforcement is mechanical: `@optcg/engine-core` cannot import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients.

### 15-implementation-kickoff.s012 (Guardrails)

Kickoff guardrails require the engine to stay free of Redis, Postgres, WebSocket, React, and Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution consumes resolved manifests rather than live HTTP calls.

## Story Boundary

Own only model/support-gate work needed to create an internal transient set from the exact supported top-1 deck search shape: `type: search`, `zone: deck`, `player: self`, `lookCount: 1`, `filter: categories character`, `min: 0`, `max: 1`, `destination: hand`, `revealTo: chooserOnly`, and `shuffleAfter: false`. Do not create decisions, resolve choices, move selected cards, or add broad search grammar here.

## Scope

- define the minimal transient reveal set state needed by the exact supported top-1 deck search shape
- record origin `topOfDeck`, owner/controller, chooser-only visibility, candidate refs, and return-to-origin cleanup policy deterministically
- create a transient set only when the top deck card exists and matches `categories: [character]`
- leave deck order unchanged and create no transient set when the top card is absent or ineligible
- fail closed without mutation for unsupported zones, counts, filters, reveal visibility, shuffle behavior, or cleanup policies
- fail closed without mutation for any `remainingCards` policy in this first story

## Out of Scope

- choice decision creation
- choice response validation or resolution
- selected-card movement
- PlayerView/event/legal-action projection changes except tests needed for model safety
- real-card fixtures or card-data integration

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/types/src/runtime.ts
- packages/types/src/game-state.test.ts
- packages/types/src/runtime.test.ts
- packages/engine-core/src/effect-runtime*.ts
- packages/engine-core/src/search-reveal*.test.ts
- stories/generated/ENG-047A-transient-reveal-set-model.yaml
- stories/approved/ENG-047A-transient-reveal-set-model.yaml
- agent-packets/ENG-047A.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-047A packet while implementing this story
- stay within allowed_touch_points
- target the ENG-047 parent integration branch
- do not run packets:complete after merging only into the parent integration branch
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

### Code Standard

Follow [`docs/code-standard.md`](docs/code-standard.md). Non-negotiables:

- stay inside the approved story boundary
- preserve package boundaries
- use strict TypeScript without `any`, routine non-null assertions, or ignored TS errors
- prefer named exports and precise types
- keep files cohesive; 500 effective lines is suspect, 800 is high-risk, 1000 is the hard mechanical guard
- split by reason-to-change, not by line count
- do not over-split into tiny files or generic dumping grounds
- keep engine-core pure and hidden-info safe
- prove engine behavior with synthetic/unit/regression tests
- keep real-card fixture tests separate from engine behavior requirements
- preserve deterministic event ordering and state hashes
- record ambiguity instead of inventing behavior

## Required Tests

- run focused transient reveal set model tests
- run `corepack pnpm --filter @optcg/engine-core typecheck`
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- supported top-1 Character deck search creates one deterministic transient reveal set for an eligible top card
- transient set records `topOfDeck` origin, chooser-only visibility, candidate refs, and return-to-origin cleanup policy
- unsupported search/reveal shapes fail closed without mutation or events
- state hash handling is deterministic for transient set IDs and contents

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
