# Story Execution Procedure

This document is mandatory workflow guidance linked from `AGENTS.md`. It contains the detailed story, packet, ambiguity, delegation, and lifecycle rules that should not crowd the root operating checklist.

## Context Reset Recovery

Do not maintain a manual handoff or current-status file. Reset recovery must be inferred from authoritative repo and GitHub state so there is no extra mutable truth source.

When starting after a context reset or uncertain session state:

1. Read `AGENTS.md`.
2. Check `git status --short --branch` to identify the local branch and dirty files.
3. Read `agent-packets/active.json` to determine whether an active story exists; if it is missing, malformed, or inconsistent with checked-in packet/story files, stop and surface the recovery inconsistency instead of guessing.
4. Inspect `stories/approved/`, `stories/done/`, `stories/blocked/`, and `stories/ambiguities/` to reconstruct story state.
5. Inspect the current branch name, recent branch commits, and recent `main` commits to identify whether the worktree is on `main`, a single-story branch, a substory branch, or a parent integration branch.
6. Use the native GitHub connector to check open pull requests, recent merged pull requests, unresolved review threads, and failing checks, including PR base/head branches.
7. If an active packet exists, recover by reading the active approved story and packet before doing any implementation or review handoff.
8. If no active packet exists on a parent integration branch, do not infer that the repo is between stories; reconstruct the parent/substory state from branch history, merged substory PRs, remaining approved stories, packets, and the parent PR trail.
9. If no active packet exists on `main`, no open PR needs action, and story/packet state is consistent, infer that the repo is between stories and propose the next candidate from `stories/approved/` or ask the user to choose when ordering is ambiguous.

Manual chat memory is not authority after reset. If reconstructed state conflicts with chat memory, use the repo and GitHub evidence, then surface the conflict explicitly.

## Story Review Gate

Use a pre-presentation story-review gate for generated or normalized story work:

- Generated or normalized stories must receive story-review agent review before the parent agent presents them to the human as approval-ready.
- Approval-ready means the exact candidate story has a usable per-story story-review result, and material findings for that story are fixed, explicitly deferred, or recorded.
- Set-level or decomposition-group story review does not satisfy per-story candidate approval review.
- Each candidate story needs its own usable story-review result before the parent agent presents that exact story for approval.
- Story-review agent model: `gpt-5.5` with `high` reasoning.
- Run a set-level story review before presenting a decomposed story group.
- Run per-story review before presenting each candidate story for approval.
- Story-review agents review story authority and decomposition, not implementation patches.
- Story-review findings must be fixed, explicitly deferred, or recorded before the parent agent presents stories as approval-ready.
- If no usable story-review agent run exists, do not present the story as approval-ready; present it as unreviewed and blocked on story review instead.
- Implementation patch review remains a separate gate.

## Story Execution Rules

- Read `AGENTS.md` first, then the approved story, then the corresponding packet.
- Implement only one approved story at a time.
- Approved stories may exist without packets until they become active.
- Before implementation starts, before a worker or reviewer subagent is assigned, and before PR handoff begins, generate a current checked-in packet for the active story under `agent-packets/`.
- Track active stories in `agent-packets/active.json` and keep the packet current relative to the approved story.
- `agent-packets/active.json` may contain zero active stories or exactly one active story. It must never contain multiple active implementation or review handoff targets.
- Use `pnpm run packets:generate --story <stories/approved/...yaml> --activate` to build or refresh the packet for the story you are activating.
- Use `pnpm run packets:verify` immediately after generating or refreshing the packet, and before worker assignment, reviewer assignment, implementation handoff, or PR handoff, to fail fast on missing or stale active-story packets.
- Use `pnpm run packets:complete --story <stories/approved/...yaml>` after a story is merged to move it to done history, remove its active packet, and clear it from `agent-packets/active.json`.
- Stay inside the story's `scope`, `story_boundary`, and `allowed_touch_points`.
- Do not silently absorb adjacent contract, engine, server, client, replay, or UI work just because it is nearby.
- If the needed work crosses concerns, stop and split the story or raise the ambiguity instead of broadening the patch.
- Supporting tests, fixtures, snapshots, and docs for the same concern are allowed in the same story.

## Story Lifecycle Rules

- The parent agent owns story-state transitions and active-packet cleanup.
- A story merged to `main` must move from `stories/approved/` to `stories/done/` with `status: done` before the next implementation story is handed off, except when an approved parent-story integration branch workflow explicitly defers substory completion until the parent PR lands on `main`.
- Completed stories must not remain in `agent-packets/active.json`.
- Activating a new story replaces the previous active manifest entry instead of accumulating multiple active stories.
- Completing a story must use the packet completion command so story movement, packet removal, and manifest cleanup happen as one verified operation.
- A cleanup commit containing only the exact file changes produced by `pnpm run packets:complete --story <stories/approved/...yaml>` or `pnpm run packets:complete-many --story <stories/approved/...yaml> --story <stories/approved/...yaml>` does not require a separate reviewer subagent run. Run `pnpm verify` before pushing it.
- If cleanup requires any manual edit beyond the packet completion command output, including edits to packet files, `agent-packets/active.json`, tooling, tests, fixtures, specs, workflow docs, or story files, run full verification and a separate reviewer subagent before pushing or merging.
- Dormant approved backlog stories do not require checked-in packets until they are activated.

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

## Delegation Workflow

When subagents are available in the current Codex surface, use a parent-orchestrated workflow by default.

Model routing policy for this workflow:

- Parent/orchestrator model: `gpt-5.5`
- Story-review agent model: `gpt-5.5` with `high` reasoning
- Reviewer subagent model: `gpt-5.4` with `high` reasoning
- Implementation worker model: default to `gpt-5.3-codex` with `medium` reasoning
- Complex, risky, or integration-heavy implementation stories should use `gpt-5.5` with `medium` reasoning
- Any model-routing deviation must be recorded in the PR review trail and implementation note

Parent-owned authority edits:

- Parent-owned authority edits: documentation-only changes to `AGENTS.md`, `specs/`, story files, packets, and workflow templates should be handled by the parent agent directly.
- Parent-owned authority edits still require tests when applicable, full verification, and separate reviewer subagent review.
- Pure packet-completion cleanup is the one lifecycle exception: when the patch contains only the exact file changes produced by direct `packets:complete` or `packets:complete-many` output, `pnpm verify` is sufficient and does not require a separate reviewer subagent run.
- Manual edits beyond the packet completion command output, including edits to packet files, `agent-packets/active.json`, tooling, tests, fixtures, specs, workflow docs, or story files, require full verification and separate reviewer subagent review.
- Use worker subagents for implementation code or large bounded documentation rewrites, not small authority-layer corrections.

Parent orchestration rules:

1. the parent agent reads `AGENTS.md`, the approved story, and the packet
2. the parent agent stays mostly in orchestration mode
3. the parent agent should spawn a worker subagent for the main implementation body of the story whenever delegation is available
4. the parent agent may still do small local glue work such as rebases, tiny integration edits, verification reruns, PR comment posting, and branch or merge operations
5. the parent agent remains in charge of the story itself: story selection, scope enforcement, packet authority, ambiguity handling, review handoff, and story-state transitions stay with the parent agent rather than the worker or reviewer subagents
6. the parent agent should not do the main implementation body when a worker subagent is available for that story
7. use one worker subagent per story by default; if a story appears to need multiple concurrent workers for the main implementation body, split the story first unless the write scopes are clearly disjoint and still reviewable

If subagents are unavailable, follow the same boundaries manually and report that the delegation surface was unavailable.
