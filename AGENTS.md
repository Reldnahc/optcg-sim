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
- `agent-packets/active.json` may contain zero active stories or exactly one active story. It must never contain multiple active implementation or review handoff targets.
- Use `pnpm run packets:generate --story <stories/approved/...yaml> --activate` to build or refresh the packet for the story you are activating.
- Use `pnpm packets:verify` immediately after generating or refreshing the packet, and before worker assignment, reviewer assignment, implementation handoff, or PR handoff, to fail fast on missing or stale active-story packets.
- Use `pnpm run packets:complete --story <stories/approved/...yaml>` after a story is merged to move it to done history, remove its active packet, and clear it from `agent-packets/active.json`.
- Stay inside the story's `scope`, `story_boundary`, and `allowed_touch_points`.
- Do not silently absorb adjacent contract, engine, server, client, replay, or UI work just because it is nearby.
- If the needed work crosses concerns, stop and split the story or raise the ambiguity instead of broadening the patch.
- Supporting tests, fixtures, snapshots, and docs for the same concern are allowed in the same story.

## Story Lifecycle Rules

- The parent agent owns story-state transitions and active-packet cleanup.
- A merged story must move from `stories/approved/` to `stories/done/` with `status: done` before the next implementation story is handed off.
- Completed stories must not remain in `agent-packets/active.json`.
- Activating a new story replaces the previous active manifest entry instead of accumulating multiple active stories.
- Completing a story must use the packet completion command so story movement, active-packet removal, and manifest cleanup happen as one verified operation.
- A cleanup commit containing only the exact file changes produced by `pnpm run packets:complete --story <stories/approved/...yaml>` does not require a separate reviewer subagent run. Run `pnpm verify` before pushing it.
- If cleanup requires any manual edit beyond the packet completion command output, including edits to packet files, `agent-packets/active.json`, tooling, tests, fixtures, specs, workflow docs, or story files, run full verification and a separate reviewer subagent before pushing or merging.
- Dormant approved backlog stories do not require checked-in packets until they are activated.

## Parent Story Integration Branches

Use this workflow when a parent story has been decomposed into approved substories and the user has approved parent-level human review instead of per-substory human review:

- Create a parent integration branch from `main` for the full story or decomposed story group, for example `story/typ-001`.
- Create each substory implementation branch from the parent integration branch, not from `main`.
- Open each substory PR against the parent integration branch.
- Keep one active substory packet at a time. A substory PR may include only its active substory packet, implementation, tests, and parent-owned story activation files.
- Substory PRs still require CI, `pnpm verify`, reviewer-subagent review, AI review records, and revision response comments.
- After a substory PR passes CI and AI review, the parent agent may merge it into the parent integration branch without human review if the user explicitly approved this parent-story workflow for the group.
- Do not run `pnpm run packets:complete` for a substory when it merges only into the parent integration branch. The substory is not done until the parent integration branch lands on `main`.
- After all substories for the parent story land on the parent integration branch, open one parent PR from the integration branch to `main`.
- The parent PR must receive a full-story integration review that checks the parent story, all included substory PRs, packet history, cross-story consistency, CI, tests, scope boundaries, and unresolved PR comments.
- Human review is required on the parent PR before it merges to `main`.
- After the parent PR merges to `main`, complete each included substory with `pnpm run packets:complete --story <stories/approved/...yaml>` unless tooling has a verified parent-completion command.
- Substory PR comments remain the durable historical record for AI review and revisions even when human review happens only on the parent PR.

## Story Review Gate

Use a pre-presentation story-review gate for generated or normalized story work:

- Generated or normalized stories must receive story-review agent review before the parent agent presents them to the human as approval-ready.
- Story-review agent model: `gpt-5.5` with `high` reasoning.
- Run a set-level story review before presenting a decomposed story group.
- Run per-story review before presenting each candidate story for approval.
- Story-review agents review story authority and decomposition, not implementation patches.
- Story-review findings must be fixed, explicitly deferred, or recorded before the parent agent presents stories as approval-ready.
- If no usable story-review agent run exists, do not present the story as approval-ready; present it as unreviewed and blocked on story review.
- Implementation patch review remains a separate gate and continues to follow the Review Workflow below.

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
- Story-review agent model: `gpt-5.5` with `high` reasoning
- Reviewer subagent model: `gpt-5.4` with `high` reasoning
- Implementation worker model: default to `gpt-5.3-codex` with `medium` reasoning
- Complex, risky, or integration-heavy implementation stories should use `gpt-5.5` with `medium` reasoning
- Any model-routing deviation must be recorded in the PR review trail and implementation note

Parent-owned authority edits:

- Parent-owned authority edits: documentation-only changes to `AGENTS.md`, `specs/`, story files, packets, and workflow templates should be handled by the parent agent directly
- Parent-owned authority edits still require tests when applicable, full verification, and separate reviewer subagent review
- Pure packet-completion cleanup is the one lifecycle exception: when the patch contains only the exact file changes produced by direct `packets:complete` output, `pnpm verify` is sufficient and a separate reviewer subagent run is not required
- Manual edits beyond the packet completion command output, including edits to packet files, `agent-packets/active.json`, tooling, tests, fixtures, specs, workflow docs, or story files, require full verification and separate reviewer subagent review
- Use worker subagents for implementation code or large bounded documentation rewrites, not small authority-layer corrections

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
3. push the story branch and open the pull request before the first reviewer-subagent run; do not wait until all AI review is complete to create the PR
4. prefer the native GitHub connector for PR creation, PR reads, comments, review threads, and merge operations; use `gh` CLI only as a fallback when the native connector is unavailable or fails, and record the fallback reason in the PR trail
5. before assigning a reviewer subagent, fetch the current PR description, changed files, issue comments, review comments, review threads, and check status, then include the relevant unresolved PR context in the reviewer handoff
6. run a separate reviewer subagent for scope creep, missing tests, contract drift, and correctness risk when subagent review is available for the patch
7. give the reviewer-subagent run up to 60 minutes while it is actively running; deterministic failures such as unavailable subagent surface, immediate spawn failure, or immediate runtime failure count as failed immediately and do not require waiting out the timeout budget
8. self-review by the implementation worker or the parent implementation coordinator does not satisfy the reviewer gate
9. post each reviewer-subagent result to the pull request as soon as that review run completes; do not batch AI review findings only at final handoff
10. if reviewer-subagent output does not already live on the pull request, copy the findings and verdict from that separate reviewer subagent output into an AI review comment immediately after the run
11. if the reviewer subagent surface already posted a durable pull-request artifact, treat that native PR artifact as the AI review record and do not require a duplicate transcription comment
12. before assigning any revision worker or re-reviewer, fetch the current PR comments, review comments, review threads, and checks, then include unresolved findings and prior dispositions in the handoff
13. if no usable reviewer subagent run remains for the patch after the available reviewer-subagent surfaces were found unavailable, timed out, or failed, record an equivalent human review fallback comment explicitly rather than silently skipping the review gate
14. fix the material findings or post a revision response comment that records the disposition of each unresolved item
15. request human review only after the AI review record or explicit equivalent-human-review fallback record exists, and after the revision response comment is up to date when a separate reviewer subagent run was used
16. require human review before merge for gameplay, policy-sensitive, or architecture-sensitive changes unless the PR is a substory PR targeting an approved parent integration branch; in that case, human review is deferred to the parent PR
17. if review finds multi-concern drift, split the story or narrow the patch before merge

The separate reviewer subagent run is a repo-level first-pass gate before human review. It does not replace the merge-gate requirement for a durable review record or equivalent human review step.

Passing AI review does not replace human review.

For parent-story integration branch work, passing AI review permits the parent agent to merge a substory PR into the parent integration branch only after CI, packet verification, AI review records, and revision response records are complete. It does not permit merging the parent integration branch to `main` without human review.

When a separate reviewer subagent run is used, the PR review record must contain:

- an AI review record: either a native PR artifact from the reviewer subagent surface, or an AI review comment with findings and verdict when the separate review output does not already live on the pull request
- a revision response comment that tracks the follow-up commits and dispositions

The PR review record is also the durable coordination surface for agents. Parent agents must keep it current during the work, not reconstruct it only at final handoff. Worker and reviewer subagents are not assumed to see PR comments automatically; the parent agent must fetch and pass the relevant unresolved PR context into their prompts.

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

- Use the native GitHub connector as the default GitHub integration surface for repository reads, pull requests, comments, review threads, status checks, labels, and merges.
- Use `gh` CLI only as a fallback when the native GitHub connector is unavailable, missing access, or returns an operational failure that blocks progress.
- When falling back to `gh` CLI, record the reason in the implementation note or PR trail so the workflow failure is visible.
- Sync board state through `tools/spec_board_sync.ts`
- Write sync metadata under `stories/.sync/`
- If board state drifts from the approved story file, fix the story or re-run sync

Do not treat manual board edits as authoritative requirements.
