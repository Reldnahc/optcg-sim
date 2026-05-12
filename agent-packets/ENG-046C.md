<!-- agent-packet:story-id ENG-046C -->
<!-- agent-packet:story-path stories/approved/ENG-046C-damage-trigger-deferral.yaml -->
<!-- agent-packet:story-sha256 a3d34e3049ab8ca8b00cf7a0b7d14bace483bdb7c68bc6473c0439952f1f646a -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-046C
Epic ID: KICK-001
Title: Defer damage-created non-Trigger effects
Type: implementation
Area: engine
Primary Concern: rules

## Why

Ensure the first concrete non-Trigger effects created during damage processing wait until the complete damage process finishes before queue resolution begins.

## Authoritative Spec References

- 02-engine-mechanics.s004 (Authority and official-rules defaults)
- 02-engine-mechanics.s021 (Damage Step)
- 02-engine-mechanics.s039 (Damage-processing deferral)
- 02-engine-mechanics.s044 (Confirmed rulings carried forward)
- 03-game-state-events-decisions.s006 (Event visibility)
- 04-effect-runtime.s009 (Queue ordering)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 18-acceptance-tests.s002 (Purpose)
- 22-v6-implementation-tightening.s009 (5. Phase and battle timing)
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

### 02-engine-mechanics.s021 (Damage Step)

1. Compute attacker and target power from `ComputedGameView`.
2. If attacker power is lower than target power, no damage/K.O. occurs.
3. If attacker power is equal or greater:
   - Target Leader: deal damage.
   - Target Character: K.O. target.
4. Emit events for damage, life movement, K.O., card movement.
5. Triggered effects during damage wait until damage processing completes.

### 02-engine-mechanics.s039 (Damage-processing deferral)

When damage is 2 or more, process each point of damage separately. Effects that trigger during damage processing wait until all damage processing completes before resolving. This matches the original note tied to rule 8-6-2.

### 02-engine-mechanics.s044 (Confirmed rulings carried forward)

- Effect resolution uses a queue model.
- If turn player effect A and non-turn player effect B are waiting, and resolving A triggers turn player effect C, B resolves before C.
- Simultaneous effects controlled by the same player are ordered by that player.
- Effects triggered during damage processing wait until all damage processing finishes.
- Effects triggered by card/effect activation resolve after the triggering effect finishes.
- Start-of-game effects can modify the deck before opening draw.

### 03-game-state-events-decisions.s006 (Event visibility)

Events may contain hidden data. Filter them before sending to clients.

```ts
type EventVisibility =
  | { type: "public" }
  | { type: "private"; playerId: PlayerId }
  | { type: "hidden" }
  | { type: "replayOnly" };
```

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

### 18-acceptance-tests.s002 (Purpose)

Implementation readiness should be measured by named tests, not only by prose. These tests define the minimum acceptable behavior for each milestone.

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

Own only queue deferral and release for the existing supported custom `effectResolved:<life-trigger-effect-id>` draw follow-up path when it is created by resolving a supported Life Trigger during Double Attack damage processing. Do not add new trigger categories, custom handlers, On K.O. damage examples, or real-card fixtures.

## Scope

- identify the supported damage-processing window while battle damage points are being processed
- cover a supported Life Trigger draw that resolves during the first Double Attack damage point and creates an existing supported custom `effectResolved:<life-trigger-effect-id>` draw follow-up from a public field source
- prevent that custom follow-up queue entry from resolving until the final damage point completes
- release the deferred queue through the existing deterministic runtime path after the damage process finishes
- preserve `[Trigger]` Life Trigger interrupt behavior from ENG-046B
- prove deterministic ordering when deferred effects are released after all damage events

## Out of Scope

- new trigger categories
- On K.O. damage-created trigger examples
- card-specific fixture coverage
- broad simultaneous-trigger priority redesign
- replacement effects or damage replacement integration
- Banish plus multiple damage support

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/battle-resolution.ts
- packages/engine-core/src/life-trigger-actions.ts
- packages/engine-core/src/effect-runtime.ts
- packages/engine-core/src/effect-runtime-trigger-queueing-ko.ts
- packages/engine-core/src/effect-runtime-queue-processing.ts
- packages/engine-core/src/effect-runtime-queue-results.ts
- packages/engine-core/src/battle-damage-multiple.test.ts
- packages/engine-core/src/life-trigger-actions.test.ts
- packages/engine-core/src/effect-runtime-queue-processing-ordering.test.ts
- packages/types/src/runtime.ts
- packages/types/src/runtime.test.ts
- stories/generated/ENG-046C-damage-trigger-deferral.yaml
- stories/approved/ENG-046C-damage-trigger-deferral.yaml
- agent-packets/ENG-046C.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-046C packet while implementing this story
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

- run `corepack pnpm exec vitest run packages/engine-core/src/battle-damage-multiple.test.ts packages/engine-core/src/life-trigger-actions.test.ts packages/engine-core/src/effect-runtime-queue-processing-ordering.test.ts`
- run `corepack pnpm --filter @optcg/engine-core typecheck`
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- the supported custom `effectResolved:<life-trigger-effect-id>` follow-up created during damage processing remains queued until the last damage point finishes
- the released follow-up resolves after all damage events for the process
- Life Trigger decisions still interrupt per point and are not treated as deferred non-Trigger effects
- queue ordering remains deterministic and covered by event-order assertions
- fail-closed behavior remains for unsupported queued shapes

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
