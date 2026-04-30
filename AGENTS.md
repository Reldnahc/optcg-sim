# AGENTS.md

## Purpose

This repository uses a spec-driven delivery workflow. Agents must implement one approved story at a time against the authoritative spec, not against chat memory or issue-body drift.

## Authority Order

For execution in this repo, use this order:

1. cited specification sections under `specs/`
2. approved story file under `stories/approved/`
3. generated story packet under `agent-packets/`
4. this `AGENTS.md`
5. local code reality
6. proposed patch

If a lower layer conflicts with a higher layer, the higher layer wins.

## Repo Locations

- Specification bundle: `specs/`
- Epics: `epics/`
- Generated stories: `stories/generated/`
- Approved stories: `stories/approved/`
- Blocked stories: `stories/blocked/`
- Done stories: `stories/done/`
- Ambiguities: `stories/ambiguities/`
- Story sync metadata: `stories/.sync/`
- Agent packets: `agent-packets/`

Use stable `SECTION_REF` citations from the spec. Do not cite heading anchors or vague file-level references when exact section refs exist.

## Story Execution Rules

- Read `AGENTS.md` first, then the approved story, then the corresponding packet.
- Implement only one approved story at a time.
- Stay inside the story's `scope`, `story_boundary`, and `allowed_touch_points`.
- Do not silently absorb adjacent contract, engine, server, client, replay, or UI work just because it is nearby.
- If the needed work crosses concerns, stop and split the story or raise the ambiguity instead of broadening the patch.
- Supporting tests, fixtures, snapshots, and docs for the same concern are allowed in the same story.

## Superpowers Plugin

If the Superpowers plugin or its skills are available in the current Codex session, use them as the preferred process layer for disciplined execution. They accelerate the workflow, but they do not override the cited spec, approved story, or packet.

Use the matching skill for the task:

- new feature or workflow design: `superpowers:brainstorming`
- turning an approved design into stepwise execution: `superpowers:writing-plans`
- implementation of an approved story: `superpowers:test-driven-development`
- bug investigation or unexpected behavior: `superpowers:systematic-debugging`
- before claiming work is complete: `superpowers:verification-before-completion`
- asking for review on completed work: `superpowers:requesting-code-review`
- responding to review feedback: `superpowers:receiving-code-review`

If the plugin is unavailable, follow the same discipline manually.

## Ambiguity Policy

Fail closed on ambiguity for:

- gameplay rules
- hidden-information behavior
- replay behavior
- fairness and timer behavior
- persistence and account safety
- security-sensitive filtering or projection behavior

If cited spec text does not decide behavior:

1. stop at the narrowest safe point
2. do not invent uncited behavior
3. record the ambiguity in `stories/ambiguities/`
4. report the blocker explicitly in the implementation note

## Code Standards

The repo is intentionally strict. Prefer enforcement over convention.

- TypeScript must remain strict.
- Do not weaken `tsconfig` strictness to make a patch pass.
- Do not introduce `any` without a narrow, documented trust-boundary justification.
- Do not use non-null assertions (`!`) as a routine escape hatch.
- Do not use `@ts-ignore` or `@ts-nocheck` unless explicitly approved for a narrow reason.
- Avoid unchecked type assertions across trust boundaries.
- Prefer named exports. Do not introduce default exports unless the repo later adopts them explicitly.
- Do not use `console` in production packages; use an approved logger abstraction.
- Keep files focused. Split multi-purpose code before it turns into a large review blob.
- Tests are part of the change, not a follow-up task.
- Prettier formatting and ESLint compliance are required, not optional.

## Architecture Boundaries

Until stricter tooling is in place, agents must manually preserve these boundaries:

- `engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients.
- client code must not import server-only modules.
- view/filtering code must not leak hidden state into public or player-facing outputs.
- replay validation code must not depend on client rendering code.
- hidden-state test helpers must not enter production client bundles.

## Verification

Before claiming completion, run the canonical repo commands when they exist:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm coverage`
- `pnpm verify`

If a required command does not exist yet, say so explicitly. Do not claim full verification when the command contract is still missing.

For story-scoped work, also run the story's required tests and report the exact commands used.

## Review Workflow

Code review is required. Use this flow unless a higher-authority story or packet says otherwise:

1. keep the patch inside one approved story
2. run `pnpm verify` and the story's required tests
3. run a separate Codex review invocation for scope creep, missing tests, contract drift, and correctness risk
4. use `codex.cmd exec review --base main` or the platform-equivalent Codex CLI review command as the default review path; GitHub `@codex review` remains an allowed alternate path when that surface is used intentionally
5. give the default Codex CLI review step a 60-minute timeout budget before treating it as timed out or failed
6. self-review by the implementation agent does not satisfy the Codex review gate
7. copy the findings and verdict from that separate Codex review output into an AI review comment on the pull request before human review is requested
8. fix the material findings or post a revision response comment that records the disposition of each unresolved item
9. request human review only after the AI review record exists and the revision response comment is up to date
10. require human review before merge for gameplay, policy-sensitive, or architecture-sensitive changes
11. if review finds multi-concern drift, split the story or narrow the patch before merge

Passing AI review does not replace human review.

The PR review record must contain two durable comments:

- an AI review comment with findings and verdict
- a revision response comment that tracks the follow-up commits and dispositions

The AI review comment must state:

- that the review came from a separate Codex review invocation rather than implementation-agent self-review
- the exact review path and command or mode used
- the 60-minute timeout budget for the default Codex CLI review step
- the findings and verdict copied from that separate Codex review invocation and posted on the GitHub pull request

## Reporting Format

Every implementation or review note should include:

- exact files changed
- tests run
- assumptions
- blockers or ambiguities
- whether the patch stayed inside `allowed_touch_points`

## GitHub and Board Sync

GitHub Issues and board items are projections of local story files, not the authority.

- Sync board state through `tools/spec_board_sync.ts`
- Write sync metadata under `stories/.sync/`
- If board state drifts from the approved story file, fix the story or re-run sync

Do not treat manual board edits as authoritative requirements.
