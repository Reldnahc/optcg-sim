<!-- agent-packet:story-id ENG-046B -->
<!-- agent-packet:story-path stories/approved/ENG-046B-life-trigger-per-point-regression.yaml -->
<!-- agent-packet:story-sha256 4ef3254e59d36f4cd68a8ee87e5b32b4df56d58637f1e25c6e08826e74c3cce7 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-046B
Epic ID: KICK-001
Title: Preserve Life Trigger per-point behavior
Type: implementation
Area: engine
Primary Concern: rules

## Why

Preserve supported Life Trigger decision, activation, decline, reveal, and cleanup behavior for each point in the narrow multiple-damage process.

## Authoritative Spec References

- 02-engine-mechanics.s023 (Damage processing)
- 02-engine-mechanics.s039 (Damage-processing deferral)
- 03-game-state-events-decisions.s014 (Life trigger)
- 03-game-state-events-decisions.s018 (Canonical event visibility)
- 04-effect-runtime.s009 (Queue ordering)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 22-v6-implementation-tightening.s008 (4. Life orientation)
- 22-v6-implementation-tightening.s009 (5. Phase and battle timing)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

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

### 03-game-state-events-decisions.s014 (Life trigger)

```ts
interface ConfirmLifeTriggerDecision extends BaseDecision {
  type: "confirmLifeTrigger";
  card: CardRef;
  options: ["activateTrigger", "addToHand"];
}
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

Own only supported Life Trigger behavior while a Double Attack damage loop is in progress. Do not add unsupported Trigger shapes, optional Trigger behavior, replacement effects, Banish plus multiple damage, or real-card fixtures.

## Scope

- preserve the first damage point's `confirmLifeTrigger` decision when the current top Life card has an exact supported Life Trigger
- after a supported Life Trigger activation or decline response completes, continue the same damage process if damage points remain
- allow the next point to create its own supported Life Trigger decision when the next top Life card has an exact supported Life Trigger
- preserve existing single-damage Life Trigger response behavior when no damage points remain
- fail closed without mutation for malformed or stale Life Trigger responses while damage continuation state is present

## Out of Scope

- unsupported Life Trigger effect shapes
- optional or once-per-turn Life Trigger semantics
- Banish plus multiple damage support
- replacement effects or damage replacement integration
- real-card fixtures or card-data integration

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/battle-resolution.ts
- packages/engine-core/src/life-trigger-actions.ts
- packages/engine-core/src/life-trigger-actions.test.ts
- packages/engine-core/src/battle-damage-multiple.test.ts
- packages/types/src/runtime.ts
- packages/types/src/runtime.test.ts
- stories/generated/ENG-046B-life-trigger-per-point-regression.yaml
- stories/approved/ENG-046B-life-trigger-per-point-regression.yaml
- agent-packets/ENG-046B.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-046B packet while implementing this story
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

- run `corepack pnpm exec vitest run packages/engine-core/src/battle-damage-multiple.test.ts packages/engine-core/src/life-trigger-actions.test.ts`
- run `corepack pnpm --filter @optcg/engine-core typecheck`
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- a supported Life Trigger on the first Double Attack damage point pauses before the second point is processed
- accepting the first point's Life Trigger resolves and then continues to the remaining point
- declining the first point's Life Trigger moves that card to hand and then continues to the remaining point
- a supported Life Trigger on the second point creates a second private decision instead of being skipped
- single-damage Life Trigger activation and decline regressions still pass
- malformed continuation state or response fails closed without mutation

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
