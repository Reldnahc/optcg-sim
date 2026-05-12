<!-- agent-packet:story-id ENG-046E -->
<!-- agent-packet:story-path stories/approved/ENG-046E-multiple-damage-event-hash-hidden-info.yaml -->
<!-- agent-packet:story-sha256 6a6b65bd50608826f5d880715bce47aa4006ec2786746d3b8d6020cac7ef783c -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-046E
Epic ID: KICK-001
Title: Add event hash and hidden-info regressions
Type: implementation
Area: engine
Primary Concern: rules

## Why

Add integrated regression coverage for multiple-damage event ordering, state hashes, PlayerView hidden-info safety, and no-choice single-damage baselines.

## Authoritative Spec References

- 02-engine-mechanics.s004 (Authority and official-rules defaults)
- 02-engine-mechanics.s023 (Damage processing)
- 02-engine-mechanics.s039 (Damage-processing deferral)
- 03-game-state-events-decisions.s006 (Event visibility)
- 03-game-state-events-decisions.s018 (Canonical event visibility)
- 03-game-state-events-decisions.s020 (State hashing)
- 04-effect-runtime.s009 (Queue ordering)
- 06-visibility-security.s003 (Player zone visibility)
- 06-visibility-security.s009 (Anti-cheat layers)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s004 (Authority and official-rules defaults)

- Official card wording overrides the comprehensive rules when they conflict.
- Official FAQ/rulings/errata refine behavior when printed text alone is insufficient.
- The simulator must implement that authority through DSL/custom handlers and card-specific tests.
- Simultaneous player choices are ordered turn player first, then non-turn player.
- When both players have triggered effects at the same timing, turn-player effects resolve first under the official timing rules.
- Effects triggered during damage processing wait until damage processing is complete, except for `[Trigger]` handling which follows the official interrupt path.

### 02-engine-mechanics.s023 (Damage processing)

For each point of damage:

1. If player has 0 life, mark defeat condition and run rule processing.
2. Otherwise, take the top life card.
3. If the card has `[Trigger]`, ask whether to reveal and activate it instead of adding it to hand.
4. If trigger is activated, the card is temporarily in no zone while the trigger resolves.
5. After trigger resolution, trash the card unless the trigger or a replacement says otherwise.
6. If trigger is declined or unavailable, add the card to hand hidden.

When damage is greater than 1, repeat this process one point at a time in official order.

`[Banish]` replaces the normal life-to-hand/trigger path by trashing the life card instead.

### 02-engine-mechanics.s039 (Damage-processing deferral)

When damage is 2 or more, process each point of damage separately. Effects that trigger during damage processing wait until all damage processing completes before resolving. This matches the original note tied to rule 8-6-2.

### 03-game-state-events-decisions.s006 (Event visibility)

Events may contain hidden data. Filter them before sending to clients.

```ts
type EventVisibility =
  | { type: "public" }
  | { type: "private"; playerId: PlayerId }
  | { type: "hidden" }
  | { type: "replayOnly" };
```

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

### 04-effect-runtime.s009 (Queue ordering)

Every trigger collection creates or joins a timing window. Queue order is deterministic and must not depend on JavaScript array discovery order except where the spec explicitly says discovery order is the canonical tie-breaker.

Normative ordering algorithm:

```text
1. Assign every collected trigger a timingWindowId.
2. Assign generation = 0 for effects triggered by the original timing event.
3. When resolving an effect produces new triggers, enqueue them with generation = currentGeneration + 1 in the same timing window unless a new official timing window has opened.
4. Resolve older timing windows before newer timing windows.
5. Within a timing window, resolve lower generation before higher generation.
6. Within a generation, resolve turn-player bucket before non-turn-player bucket.
7. Within a player's bucket, if more than one effect is pending, create chooseTriggerOrder for that player.
8. If no choice is required, use stable tie-breakers: createdAtEventSeq, then source instance id, then effect id.
```

Consequences:

- If turn player effect A and non-turn player effect B are pending, and A creates turn player effect C while resolving, B resolves before C.
- Effects triggered during damage processing wait until all damage points are complete, except `[Trigger]` resolution itself.
- Effects triggered during an effect or card activation wait until the triggering process completes.
- Optional triggered effects create `chooseOptionalActivation` decisions at the point they would enter or begin resolution, according to the card's timing rule.

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

### 06-visibility-security.s009 (Anti-cheat layers)

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

Own only integrated regressions and small safety hardening needed for the ENG-046 foundation. Do not add new multiple-damage capabilities or real-card fixtures.

## Scope

- assert deterministic event sequencing for ordinary, Life Trigger, and custom effect-resolved follow-up deferral multiple-damage paths
- assert stable state hash coverage for supported accepted paths and fail-closed unsupported paths
- assert PlayerView exposes only public damage, Life movement, and reveal information while hiding private Life card identities until intentionally revealed
- assert no raw damage-continuation or queue internals leak through PlayerView
- preserve existing no-choice single-damage baseline regressions

## Out of Scope

- new gameplay behavior beyond ENG-046A through ENG-046D
- real-card fixtures or card-data integration
- server, client, API, or UI work
- broad hidden-info framework changes

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/battle-resolution.ts
- packages/engine-core/src/battle-damage-multiple.test.ts
- packages/engine-core/src/battle-damage-vanilla.test.ts
- packages/engine-core/src/filter-state-for-player.ts
- packages/engine-core/src/filter-state-for-player.test.ts
- packages/engine-core/src/filter-state-for-player.real-states-battle.test.ts
- stories/generated/ENG-046E-multiple-damage-event-hash-hidden-info.yaml
- stories/approved/ENG-046E-multiple-damage-event-hash-hidden-info.yaml
- agent-packets/ENG-046E.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-046E packet while implementing this story
- stay within allowed_touch_points
- target the ENG-046 parent integration branch
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

- run `corepack pnpm exec vitest run packages/engine-core/src/battle-damage-multiple.test.ts packages/engine-core/src/battle-damage-vanilla.test.ts packages/engine-core/src/filter-state-for-player.test.ts packages/engine-core/src/filter-state-for-player.real-states-battle.test.ts`
- run `corepack pnpm --filter @optcg/engine-core typecheck`
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- integrated supported multiple-damage paths have deterministic event-order assertions
- supported and unsupported multiple-damage paths have state-hash assertions
- PlayerView does not expose private Life identities or raw queue/damage-continuation internals
- single-damage baseline tests still pass and remain covered

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
