<!-- agent-packet:story-id ENG-047C -->
<!-- agent-packet:story-path stories/approved/ENG-047C-choice-resolution-cleanup.yaml -->
<!-- agent-packet:story-sha256 728158a90294a41ca9c5ca193acf61d09cf76ac5c13ffe6c5f608a8238092084 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-047C
Epic ID: KICK-001
Title: Resolve choices and clean up transient sets
Type: implementation
Area: engine
Primary Concern: rules

## Why

Resolve the supported reveal choice decision, validate selected candidates, move chosen cards through the narrow path, and clean up transient reveal state deterministically.

## Authoritative Spec References

- 03-game-state-events-decisions.s013 (Targets/cards)
- 03-game-state-events-decisions.s017 (Canonical decision routing)
- 03-game-state-events-decisions.s018 (Canonical event visibility)
- 03-game-state-events-decisions.s020 (State hashing)
- 04-effect-runtime.s017 (Transient reveal and selection sets)
- 05-effect-dsl-reference.s014 (Search request)
- 05-effect-dsl-reference.s026 (Transient reveal and selection primitives)
- 06-visibility-security.s003 (Player zone visibility)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 03-game-state-events-decisions.s013 (Targets/cards)

```ts
interface SelectTargetsDecision extends BaseDecision {
  type: "selectTargets";
  request: TargetRequest;
  candidates: TargetCandidate[];
}

interface SelectCardsDecision extends BaseDecision {
  type: "selectCards";
  request: CardSelectionRequest;
  candidates: CardSelectionCandidate[];
}
```

### 03-game-state-events-decisions.s017 (Canonical decision routing)

All player choices are represented as `PendingDecision` and answered by exactly one action shape:

```ts
{
  type: ("respondToDecision", decisionId, response);
}
```

The engine validates the response against the current pending decision. The client never gets to submit raw target IDs or payment choices outside the active decision context.

The following decision families are implementation-required for Milestones 1-2:

```text
mulligan
chooseTriggerOrder
chooseOptionalActivation
payCost
selectTargets
selectCards
chooseEffectOption
confirmTriggerFromLife
chooseReplacement
orderCards
chooseCharacterToTrashForOverflow
```

Decision IDs are single-use. A response for an old decision ID is stale unless it is an exact idempotent retry already accepted by the match server.

### 03-game-state-events-decisions.s018 (Canonical event visibility)

Each `EngineEvent` has one visibility policy:

```text
public          safe for both players immediately
private         visible only to listed player IDs
replayOnly      hidden during live play but available in completed full replay
serverOnly      never leaves trusted server/runtime logs
```

Visibility is independent of replay determinism. Replay artifacts may store information that was never sent to either player during the live match.

### 03-game-state-events-decisions.s020 (State hashing)

Replays and recovery need state hashes.

```ts
interface StateHashInput {
  state: GameState;
  includeHidden: boolean;
  normalizeTransientIds: boolean;
}
```

Use canonical JSON serialization:

- Stable object-key ordering.
- Stable array ordering.
- Exclude timestamps unless explicitly part of replay logic.
- Include hidden data for authoritative replay hashes.
- Use separate public-view hash for client sync if useful.

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

### 05-effect-dsl-reference.s026 (Transient reveal and selection primitives)

```ts
type SelectionSetId = string;
type SelectionId = string;

type Effect =
  | {
      type: "revealTop";
      player: PlayerRef;
      count: number;
      saveAs: SelectionSetId;
      visibility: Visibility;
    }
  | {
      type: "selectFromSet";
      set: SelectionSetId;
      chooser: PlayerRef;
      min: number;
      max: number;
      filter?: CardFilter;
      saveAs: SelectionId;
    }
  | {
      type: "selectCards";
      zone: Zone;
      player: PlayerRef;
      chooser: PlayerRef;
      min: number;
      max: number;
      filter?: CardFilter;
      saveAs: SelectionId;
      visibility: Visibility;
    }
  | {
      type: "playSelected";
      selection: SelectionId;
      enterRested?: boolean;
      ignoreCost?: boolean;
    }
  | {
      type: "returnUnselectedToDeck";
      set: SelectionSetId;
      player: PlayerRef;
      position: "top" | "bottom";
      order: "original" | "ownerChoice" | "random";
      faceDown: boolean;
    }
  | {
      type: "moveSelected";
      selection: SelectionId;
      from: Zone | SelectionSetId;
      to: Zone;
    };
```

These are not UI concepts. They are deterministic effect-runtime concepts. They let the runtime represent "reveal top card, maybe play it, otherwise return it face-down" without losing hidden-information boundaries.

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

Own only choice response validation, selected-card movement, and cleanup for the supported transient reveal path created by ENG-047A/B. Accept only a `cards` decision response with 0 or 1 card from the active transient set that matches the Character-category candidate filter. Move one selected card from the transient set to the controller's hand. Return zero-selected or otherwise unchosen revealed cards to the top of their owner's deck in original order face-down, then delete the transient set before queue continuation. Do not add broad deck search ordering, UI, real-card fixtures, or unrelated movement primitives.

## Scope

- validate chosen card ids against the active transient set and `categories: [character]` candidate filter
- reject malformed, duplicate, stale, out-of-range, or unauthorized responses without mutation
- move one chosen card to hand through existing event/state mutation patterns
- return zero-selected or unchosen revealed cards to deck top in original order face-down without leaking hidden identities
- remove transient reveal state after decision completion or early exit

## Out of Scope

- creating the initial reveal decision
- broad owner-choice ordering
- full search grammar
- real-card fixtures or card-data integration

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/types/src/decisions.ts
- packages/types/src/game-state.ts
- packages/engine-core/src/action-dispatcher*.ts
- packages/engine-core/src/effect-runtime*.ts
- packages/engine-core/src/search-reveal*.test.ts
- stories/generated/ENG-047C-choice-resolution-cleanup.yaml
- stories/approved/ENG-047C-choice-resolution-cleanup.yaml
- agent-packets/ENG-047C.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-047C packet while implementing this story
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

- focused choice accept/invalid/stale response tests
- cleanup regression proving no transient set remains after completion
- run `corepack pnpm --filter @optcg/engine-core typecheck`
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- accepted choices move only valid revealed Character candidates to hand
- invalid or stale responses fail closed without mutation
- unchosen transient cards are cleaned up and no stale candidates remain
- cleanup preserves deterministic top-of-deck order for returned face-down cards

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
