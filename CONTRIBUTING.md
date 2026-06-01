# Contributing

Thanks for helping build OPTCG Simulator. This project is an unofficial,
deterministic, server-authoritative OPTCG simulator. The hard part is not making
one card work once. The hard part is adding rules and card support in a way that
keeps working as the card pool grows.

## Start Here

Read these before opening a meaningful PR:

- [README.md](README.md) for the repo map, setup, and verification commands.
- [specs/README.md](specs/README.md) for the canonical spec index.
- [AGENTS.md](AGENTS.md) for the repo's scaling invariants and agent guidance.
- [docs/code-standard.md](docs/code-standard.md) for mandatory implementation
  standards.

Authority order is specs first, then the active request/issue, then code
standards, then existing code and tests.

## Local Setup

Use the package manager declared in `package.json`:

```sh
corepack enable
corepack pnpm install
```

Useful local commands:

```sh
corepack pnpm run dev
corepack pnpm run cli:boot
corepack pnpm --filter @optcg/engine-core test
corepack pnpm --filter @optcg/cards test
```

## What Makes A Good Contribution

Good changes are scoped, tested, and shaped around reusable primitives.

- Keep one PR focused on one concern.
- Inspect the relevant specs and code before editing.
- Add or update tests for behavior changes.
- Preserve deterministic engine behavior and hidden-information safety.
- Respect package boundaries. The engine must not import client, server,
  Redis, HTTP, or browser code.
- Do not silently absorb adjacent cleanup just because it is nearby.

If you find a larger design problem while working, call it out. Do not hide it
inside a patch that claims to do something smaller.

## Card And Effect Work

Card support must be scalable. Do not make a card work by recognizing:

- one card ID
- one exact printed line
- one exact full-card template
- one exact wrapper/body pair
- one generated-support inventory row
- one shape/component label as parser certification

The correct shape is:

1. The card layer parses printed text into reusable primitive boundaries.
2. Primitive parser evidence certifies what was actually parsed.
3. Generic composers combine entry points, costs, conditions, targets, filters,
   durations, body primitives, and sequences.
4. The engine executes reusable primitives and generic compositions.
5. If the parser can express a primitive the engine cannot run yet, keep the
   correct primitive and fail closed at the engine support layer.

Before adding card/effect code, ask:

- Would this body work under another valid entry point?
- Would this entry point work with another supported body?
- Can the target, condition, cost, duration, filter, and quantity vary without a
  new full-line branch?
- Does support fail closed if primitive parser evidence is missing?

If the answer is no, stop and redesign the shape.

## Engine Work

The engine owns authoritative game behavior. Keep timing, legal-action exposure,
effect queueing, costs, body execution, replacement effects, triggers, and
continuous effects separated.

- Entry-point adapters route timing and queue work. They must not whitelist
  exact body shapes.
- Body executors perform one reusable behavior family.
- Conditions, filters, quantities, and targets should be data consumed by
  generic evaluators.
- Costs should use reusable cost handling, then resume the body.
- K.O., trash, discard, return, play, and move can share low-level movement
  helpers only where the game semantics are actually common.
- Multi-effect definitions are normal. Do not authorize or reject support based
  on `definition.effects.length`.

Unsupported behavior should fail closed with useful diagnostics.

## Hidden Information And Determinism

This is a server-authoritative simulator. Hidden information safety is a core
correctness rule, not a UI detail.

- Raw `GameState` must not leak to clients.
- Client code should operate on filtered views.
- Legal actions must not reveal hidden opponent options.
- Events sent to players must be visibility-filtered.
- Engine mutations must be deterministic and replayable.
- Use state-backed RNG, stable event order, and stable state hashes.

When in doubt, fail closed.

## Working With Agents

Agents can help, but they do not own the PR. The human contributor who opens or
merges the PR owns it.

If you use an agent, explicitly instruct it to follow the scaling invariant:

- no exact card IDs
- no exact printed-line support
- no wrapper/body template certification
- no runtime capability as parser certification
- no shape/component labels as support authority
- primitive parser evidence required
- reusable engine primitives required

Then audit the result. Do not accept "it passes tests" as enough. Check whether
the code actually follows the primitive parser and engine primitive patterns.

You must be able to explain and defend every meaningful line of your PR under
review. If an agent wrote code you do not understand, the PR is not ready.
Reviewers should reject agent-generated changes that are only relabeled
templates, card-specific branches, or exact-shape support gates.

## Testing Expectations

Tests should prove the reusable shape, not just one card success.

For parser/generated-support changes:

- Test primitive parsing independently when possible.
- Test reusable bodies under more than one entry point when claiming reuse.
- Test composition separately from child primitives.
- Add negative tests proving exact parser rule names, shape IDs, runtime
  capability IDs, valid DSL, or known card metadata cannot make support pass
  without primitive parser evidence.

For engine changes:

- Test primitive executors with minimal synthetic state.
- Test entry-point routing separately from body execution.
- Test sequence, optional cost, condition, selection, trigger ordering, and
  resume behavior where relevant.
- Test hidden-information filtering for decisions, reveals, searches, and
  private zones.

For UI/client changes:

- Keep view model, control logic, transport, and presentation separated.
- Do not solve hidden-information problems in the client.
- Include screenshots or short notes for visible behavior changes when useful.

## Verification

Run the narrow checks for your package while developing. Before claiming a broad
change is ready, run:

```sh
corepack pnpm run verify
```

Common checks:

```sh
corepack pnpm run format:check
corepack pnpm run lint
corepack pnpm run typecheck
corepack pnpm run test
corepack pnpm run test:hidden-info
corepack pnpm run test:tooling
corepack pnpm run contracts
corepack pnpm run coverage
```

If a command is skipped, fails, or cannot run in your environment, say that in
the PR. Do not claim full verification unless it actually passed.

## Pull Request Checklist

Every PR should include:

- What changed.
- Why it belongs in this scope.
- Specs or docs consulted.
- Tests and verification commands run, with results.
- Known risks, assumptions, or skipped checks.
- Screenshots or short recordings for meaningful UI changes.

Reviewers should prioritize correctness, hidden-information safety,
determinism, package boundaries, missing tests, and scalable primitive shape.
Style-only feedback is secondary unless enforcement blocks it.
