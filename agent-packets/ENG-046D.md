<!-- agent-packet:story-id ENG-046D -->
<!-- agent-packet:story-path stories/approved/ENG-046D-banish-unsupported-interaction-guard.yaml -->
<!-- agent-packet:story-sha256 3e080707cc685c646a9ded1b079215ee5306699fba59d09b7cd2a5f2236d9989 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-046D
Epic ID: KICK-001
Title: Guard Banish and unsupported multiple-damage interactions
Type: implementation
Area: engine
Primary Concern: rules

## Why

Preserve existing Banish single-damage behavior and fail closed for Banish combined with multiple damage or unsupported damage-count interactions.

## Authoritative Spec References

- 02-engine-mechanics.s023 (Damage processing)
- 02-engine-mechanics.s025 (Keyword behavior)
- 02-engine-mechanics.s039 (Damage-processing deferral)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 22-v6-implementation-tightening.s008 (4. Life orientation)
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

### 02-engine-mechanics.s025 (Keyword behavior)

| Keyword         | Engine behavior                                                      |
| --------------- | -------------------------------------------------------------------- |
| Rush            | Character may attack the turn it was played.                         |
| Rush: Character | Character may attack Characters, not Leader, the turn it was played. |
| Double Attack   | Leader damage count is 2.                                            |
| Banish          | Damaged life card is trashed; no normal trigger/hand path.           |
| Blocker         | During Block Step, can rest to redirect attack.                      |
| Unblockable     | Skips opponent blocker window.                                       |
| Activate: Main  | Legal only during controller's Main Phase outside battle.            |
| Main            | Event usable during controller's Main Phase.                         |
| Counter         | Event usable during opponent's Counter Step.                         |
| Once Per Turn   | Tracked by stable effect ID and card instance per turn.              |
| DON!! xX        | Condition is attached DON!! count greater than or equal to X.        |

### 02-engine-mechanics.s039 (Damage-processing deferral)

When damage is 2 or more, process each point of damage separately. Effects that trigger during damage processing wait until all damage processing completes before resolving. This matches the original note tied to rule 8-6-2.

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

Own only guard coverage and small support-gate hardening for unsupported multiple-damage interactions. Do not implement Banish plus Double Attack or any new keyword behavior.

## Scope

- keep existing Banish single-damage leader behavior unchanged
- keep Banish damage on Life Trigger cards from creating Life Trigger decisions
- fail closed without mutation for Banish combined with Double Attack
- fail closed without mutation for unsupported multi-damage counts, unsupported targets, or unsupported keyword combinations
- preserve existing battle support gate behavior for unsupported battle envelopes

## Out of Scope

- Banish plus Double Attack support
- new Banish effect text support
- replacement effects or damage replacement integration
- real-card fixtures or card-data integration

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/battle-resolution.ts
- packages/engine-core/src/battle-support.ts
- packages/engine-core/src/battle-actions.test.ts
- packages/engine-core/src/battle-damage-banish-only.test.ts
- packages/engine-core/src/battle-damage-multiple.test.ts
- stories/generated/ENG-046D-banish-unsupported-interaction-guard.yaml
- stories/approved/ENG-046D-banish-unsupported-interaction-guard.yaml
- agent-packets/ENG-046D.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-046D packet while implementing this story
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

- run `corepack pnpm exec vitest run packages/engine-core/src/battle-damage-banish-only.test.ts packages/engine-core/src/battle-damage-multiple.test.ts packages/engine-core/src/battle-actions.test.ts`
- run `corepack pnpm --filter @optcg/engine-core typecheck`
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- Banish single-damage tests still pass unchanged
- Banish plus Double Attack fails closed without mutation and without events
- unsupported damage count values fail closed without mutation
- unsupported multiple-damage Character target cases fail closed unless already supported by earlier child scope

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
