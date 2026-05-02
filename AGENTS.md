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
- Approved stories may exist without packets until they become active.
- Before implementation starts, before a worker or reviewer subagent is assigned, and before PR handoff begins, generate a current checked-in packet for the active story under `agent-packets/`.
- Track active stories in `agent-packets/active.json` and keep the packet current relative to the approved story.
- Use `pnpm run packets:generate --story <stories/approved/...yaml> --activate` to build or refresh the packet for the story you are activating.
- Use `pnpm packets:verify` immediately after generating or refreshing the packet, and before worker assignment, reviewer assignment, implementation handoff, or PR handoff, to fail fast on missing or stale active-story packets.
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

## Delegation Workflow

When subagents are available in the current Codex surface, use a parent-orchestrated
workflow by default:

Model routing policy for this workflow:

- Parent/orchestrator model: `gpt-5.5`
- Reviewer subagent model: `gpt-5.4` with `high` reasoning
- Implementation worker model: `gpt-5.4` with `medium` reasoning or `gpt-5.3-codex` with `medium` reasoning
- Simple mechanical stories should prefer `gpt-5.3-codex` with `medium` reasoning
- Broader, riskier, or integration-heavy stories should prefer `gpt-5.4` with `medium` reasoning
- Any model-routing deviation must be recorded in the PR review trail and implementation note

1. the parent agent reads `AGENTS.md`, the approved story, and the packet
2. the parent agent stays mostly in orchestration mode
3. the parent agent should spawn a worker subagent for the main implementation body of
   the story whenever delegation is available
4. the parent agent may still do small local glue work such as rebases, tiny
   integration edits, verification reruns, PR comment posting, and branch or merge
   operations
5. the parent agent remains in charge of the story itself: story selection, scope
   enforcement, packet authority, ambiguity handling, review handoff, and story-state
   transitions stay with the parent agent rather than the worker or reviewer
   subagents
6. the parent agent should not do the main implementation body when a worker subagent
   is available for that story
7. use one worker subagent per story by default; if a story appears to need multiple
   concurrent workers for the main implementation body, split the story first unless
   the write scopes are clearly disjoint and still reviewable

If subagents are unavailable, follow the same boundaries manually and report that the
delegation surface was unavailable.

## Review Workflow

Code review is required. Use this flow unless a higher-authority story or packet says otherwise:

1. keep the patch inside one approved story
2. run `pnpm verify` and the story's required tests
3. run a separate reviewer subagent for scope creep, missing tests, contract drift, and correctness risk when subagent review is available for the patch
4. give the reviewer-subagent run up to 60 minutes while it is actively running; deterministic failures such as unavailable subagent surface, immediate spawn failure, or immediate runtime failure count as failed immediately and do not require waiting out the timeout budget
5. self-review by the implementation worker or the parent implementation coordinator does not satisfy the reviewer gate
6. if reviewer-subagent output does not already live on the pull request, copy the findings and verdict from that separate reviewer subagent output into an AI review comment before human review is requested
7. if the reviewer subagent surface already posted a durable pull-request artifact, treat that native PR artifact as the AI review record and do not require a duplicate transcription comment
8. if no usable reviewer subagent run remains for the patch after the available reviewer-subagent surfaces were found unavailable, timed out, or failed, record an equivalent human review fallback comment explicitly rather than silently skipping the review gate
9. fix the material findings or post a revision response comment that records the disposition of each unresolved item
10. request human review only after the AI review record or explicit equivalent-human-review fallback record exists, and after the revision response comment is up to date when a separate reviewer subagent run was used
11. require human review before merge for gameplay, policy-sensitive, or architecture-sensitive changes
12. if review finds multi-concern drift, split the story or narrow the patch before merge

The separate reviewer subagent run is a repo-level first-pass gate before human review. It does not replace the merge-gate requirement for a durable review record or equivalent human review step.

Passing AI review does not replace human review.

When a separate reviewer subagent run is used, the PR review record must contain:

- an AI review record: either a native PR artifact from the reviewer subagent surface, or an AI review comment with findings and verdict when the separate review output does not already live on the pull request
- a revision response comment that tracks the follow-up commits and dispositions

When the equivalent human-review fallback is used, the PR review record must contain a fallback review comment based on `.github/review-comments/equivalent-human-review-fallback.md` so the failed or unavailable reviewer-subagent attempts, the fallback human reviewer, the findings, and the merge-gate record are durable on the pull request.

When the AI review record is a copied comment rather than a native reviewer-subagent artifact, that comment must state:

- that the review came from a separate reviewer subagent rather than implementation-agent self-review
- the exact review path and reviewer-subagent identity or mode used
- the 60-minute timeout budget for the reviewer-subagent review step
- the findings and verdict copied from that separate reviewer-subagent run and posted on the GitHub pull request

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
