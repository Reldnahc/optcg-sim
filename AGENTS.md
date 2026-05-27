# AGENTS.md

## Purpose

This repository now uses direct spec/code/test delivery. Agents should solve the
current user request against the authoritative specs and the existing codebase,
without story files, agent packets, packet cleanup, or generated workflow state.

## Authority Order

Use this order when making changes:

1. cited specification sections under `specs/`
2. the current user request and any explicit constraints in the active thread
3. mandatory implementation guidance in `docs/code-standard.md`
4. local code reality and existing tests
5. the proposed patch

If a lower layer conflicts with a higher layer, the higher layer wins. If the
spec is missing or contradicted by current code, surface that clearly and make
the smallest defensible change that preserves safety.

## Working Rules

- Inspect the relevant code before editing it.
- Keep changes scoped to the requested concern.
- Do not silently absorb adjacent engine, card, server, client, UI, replay, or
  tooling work just because it is nearby.
- Preserve user changes already present in the worktree. Do not revert files you
  did not intentionally change.
- Prefer repo patterns and shared helpers over new one-off abstractions.
- Add or update tests with behavior changes unless the request is explicitly
  docs-only or cleanup-only.
- Record assumptions, skipped checks, and residual risks in the final response.

## Scaling Invariant

The most important engineering constraint in this repo is scalable effect
support. Do not make a card work by recognizing one full printed line, one card
ID, one exact template, or one exact wrapper/body pair. A supported card should
work because its text is parsed into reusable primitive boundaries and the
engine can execute those reusable primitives.

When adding or changing card support, ask this before writing production code:

- Would the same body primitive work under another valid entry point?
- Would the same entry point work with another supported body primitive?
- Can the target, condition, cost, duration, filter, and quantity vary without
  adding another exact full-line branch?
- Does support fail closed when primitive evidence is missing, even if the
  parser rule name, shape label, runtime capability, card ID, or DSL happens to
  look familiar?

If the answer is no, the shape is not scalable enough for this repo.

## Card Parsing Layer Pattern

The card layer parses printed text into typed primitive data and primitive
parser evidence. The parser is allowed to recognize printed syntax literals, but
only primitive parser evidence may certify support.

Required decomposition:

- Entry points and wrappers: `[On Play]`, `[When Attacking]`, `[Counter]`,
  `[Main]`, `[Activate: Main]`, `[On K.O.]`, `[Trigger]`, start-of-game,
  continuous turn windows, and similar timing wrappers are parsed separately
  from effect bodies.
- Markers and modifiers: `[Once Per Turn]`, DON markers, optionality, and
  activation commitment are separate from the body primitive.
- Costs: resting DON, trashing from hand, resting this card, moving cards, and
  choose-one costs are parsed as reusable cost primitives. Do not bind a cost to
  one effect body.
- Conditions: condition family, comparator, threshold, owner, zone, card filter,
  and subject are separate reusable data. Do not emit bundles such as
  `condition:block-level` when the parts can be represented independently.
- Targets and filters: owner, zone, object kind, chooser, cardinality, color,
  type, name exclusion, cost/power predicates, saved-reference behavior, and
  duration are separate reusable data. Do not emit pseudo-primitives such as
  `target:select-opponent-character` when those boundaries are needed.
- Body primitives: draw, trash, move, rest, K.O., play, search, reveal, bottom,
  return, power modify, base-power set, keyword grant, protection, negate,
  attach DON, and cost modification are independent body primitives.
- Composition: sequence, conditional, optional cost, conjunction, saved
  reference, and line-separated effects are generic composers that merge child
  primitive evidence. A composer does not replace missing child evidence.

Forbidden support-authority shapes:

- card IDs, fixture IDs, external card lists, or manual per-card allowlists
- exact full-line parser rules
- exact wrapper/body parser rules
- exact shape IDs or component labels used as parser certification
- generated-support inventory rows used as parser certification
- runtime capability IDs used as parser certification
- parser-rule-to-certification maps
- shape/component-to-certification maps
- template-named certification arrays
- wrapper gates outside primitive wrapper parsing, such as exact `[On Play]`
  prefix checks in higher-level support logic

Diagnostics may keep parser rule names, shape IDs, and component labels for
human reporting, grouping, or migration notes. They must not be the authority
that makes a generated card playable.

## Engine Primitive Pattern

The engine executes reusable primitives and generic compositions. Entry-point
adapters expose legal actions or queue effects; body executors perform reusable
game mutations. These concerns must remain separate.

Required engine shape:

- Entry-point adapters handle timing, source-presence policy, once-per-turn
  commitment, legal-action exposure, and queue insertion. They do not whitelist
  exact body shapes.
- Body primitive executors handle one reusable behavior family. Draw does not
  care which wrapper produced it. Trash from hand, trash from deck top, and
  trash selected cards enter shared movement behavior through distinct doors
  that preserve game semantics.
- Conditions, filters, and target selection are data consumed by generic
  evaluators. Do not hardcode one condition into one effect executor when it can
  be expressed as reusable condition/filter data.
- Costs are paid through reusable cost handling and then resume the body. Do not
  create one executor per cost/body pair.
- Continuous effects materialize from reusable modifier primitives. Unsupported
  modifier families should fail closed as unsupported primitives, not because a
  whole effect definition has an unfamiliar size or exact metadata shape.
- K.O., trash, discard, return, play, and move are not all the same game event.
  Share concrete movement helpers where behavior is genuinely common, but keep
  semantic entry doors distinct so triggers and replacement effects remain
  correct.
- Multi-effect definitions are normal. Do not authorize or reject support based
  on `definition.effects.length` or similar full-definition-size checks.

If the parser can emit a primitive that the engine cannot execute yet, preserve
the correct parsed primitive and fail closed at the engine capability/runtime
layer. Do not reshape parser output to fit a weaker current engine shortcut.

## Testing For Scalability

Tests must prove the scalable shape, not just one card success.

For card parsing and generated support:

- Test primitives independently from entry points when possible.
- Test at least two wrappers for reusable body primitives when claiming
  cross-entry-point reuse.
- Test composition separately from child primitives.
- Add negative authority tests proving exact parser rule, shape/component ID,
  runtime capability, valid DSL, or known card metadata cannot make support pass
  without emitted primitive parser evidence.
- Add anti-shape tests or source scans when a past failure mode can reappear as
  a whitelist, exact template, full-line branch, or full-definition-size gate.

For engine primitives:

- Test the primitive executor directly with minimal synthetic state.
- Test entry-point routing separately from body execution.
- Test composition/resume behavior for sequence, optional cost, conditional,
  selection, and simultaneous trigger/order flows.
- Test hidden-information filtering for any decision, reveal, search, or private
  zone behavior.
- Test that unsupported primitives fail closed with useful diagnostics.

Passing broad test suites is useful, but it is not enough when the concern is
scalability. A patch that only proves one real card or one exact printed line
works can still be wrong.

## Safety Boundaries

Fail closed on ambiguity for gameplay rules, hidden-information behavior, replay
behavior, fairness and timer behavior, persistence and account safety, and
security-sensitive filtering or projection behavior.

Preserve these package boundaries:

- `engine-core` must stay free of React, browser code, WebSocket transport,
  Redis, Postgres, and live HTTP clients.
- client code must not import server-only modules.
- view/filtering code must not leak hidden state into public or player-facing
  outputs.
- replay validation code must not depend on client rendering code.
- hidden-state test helpers must not enter production client bundles.

## Code Standards

`docs/code-standard.md` is mandatory implementation guidance.

- TypeScript must remain strict.
- Do not weaken `tsconfig` strictness to make a patch pass.
- Do not introduce `any` without a narrow, documented trust-boundary
  justification.
- Do not use non-null assertions (`!`) as a routine escape hatch.
- Do not use `@ts-ignore` or `@ts-nocheck` unless explicitly approved for a
  narrow reason.
- Avoid unchecked type assertions across trust boundaries.
- Prefer named exports. Do not introduce default exports unless the repo later
  adopts them explicitly.
- Do not use `console` in production packages; use an approved logger
  abstraction.
- Keep files focused and cohesive.
- Tests are part of the change, not a follow-up task.
- Prettier formatting and ESLint compliance are required, not optional.

## Verification

Before claiming completion, run the relevant narrow checks and the canonical repo
commands when feasible:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm coverage`
- `pnpm verify`

If a required command does not exist, is too broad for the current change, or
cannot be run in the environment, say so explicitly. Do not claim full
verification when the command contract is missing, skipped, or failed.
