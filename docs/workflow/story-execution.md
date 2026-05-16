# Story Execution Procedure

This document is mandatory workflow guidance linked from `AGENTS.md`. It contains the detailed story, packet, ambiguity, delegation, and lifecycle rules that should not crowd the root operating checklist.

## Context Reset Recovery

Do not maintain a manual handoff or current-status file. Reset recovery must be inferred from authoritative repo and GitHub state so there is no extra mutable truth source.

When starting after a context reset or uncertain session state:

1. Read `AGENTS.md`.
2. Check `git status --short --branch` to identify the local branch and dirty files.
3. Read `agent-packets/active.json` to determine whether an active story exists; if it is missing, malformed, or inconsistent with checked-in packet/story files, stop and surface the recovery inconsistency instead of guessing.
4. Inspect `stories/approved/`, `stories/done/`, `stories/blocked/`, and `stories/ambiguities/` to reconstruct story state.
5. Inspect the current branch name, recent branch commits, and recent `main` commits to identify whether the worktree is on `main`, a child-story branch, or a parent integration branch.
6. Use the native GitHub connector to check open pull requests, recent merged pull requests, unresolved review threads, and failing checks, including PR base/head branches.
7. If an active packet exists, recover by reading the active approved story and packet before doing any implementation or review handoff.
8. If no active packet exists on a parent integration branch, do not infer that the repo is between stories; reconstruct the parent/substory state from branch history, reviewed substory commits, remaining approved stories, packets, and the parent PR trail.
9. If no active packet exists on `main`, no open PR needs action, and story/packet state is consistent, infer that the repo is between stories and propose the next candidate from `stories/approved/` or ask the user to choose when ordering is ambiguous.

Manual chat memory is not authority after reset. If reconstructed state conflicts with chat memory, use the repo and GitHub evidence, then surface the conflict explicitly.

## Story Approval Review Gate

Use the Story Approval Review Gate for generated or normalized story work:

Story Approval Review Gate: before any parent story set is approved, packetized, activated, or handed to implementation, there must be one story-review artifact for the parent story and one story-review artifact for every child story. Parent story-review does not satisfy child story-review. Child story-review does not satisfy sibling story-review. Each required row must have a distinct story-review assignment identity for that row and a distinct durable artifact identity for that row. One story-review assignment, one reviewer run, one matrix, or one durable artifact covering multiple stories satisfies at most one required row. Batch story-review can be supplemental context only and cannot be the approval-gate evidence for multiple rows. If any row is missing, pending, unknown, or not reconstructable from durable evidence: STOP.

Each required row must have a distinct durable artifact identity for that row.
Each required row must have a distinct story-review assignment identity for that row.

- Generated or normalized stories must receive story-review agent review before the parent agent presents them to the human as approval-ready.
- Approval-ready means the parent story and every child story have usable story-review evidence, and material findings for each reviewed story are fixed, explicitly deferred, or recorded.
- A parent with exactly one child is still a valid parent/substory story set.
- Every parent story and every substory must be reviewed. Do not collapse child review into only a parent-level review, and do not infer that one reviewed child covers sibling children.
- Story-review agent model: `gpt-5.4` with `high` reasoning.
- Story-review agents review story authority and decomposition, not implementation patches.
- Story-review findings must be fixed, explicitly deferred, or recorded before the parent agent presents stories as approval-ready.
- If no usable story-review agent run exists, do not present the story as approval-ready; present it as unreviewed and blocked on story review instead.
- Implementation patch review remains a separate gate.

### Parent Story-Set Review Matrix

For parent story sets, require a compact story-set review-status matrix before approval handoff, child activation, packet generation, and parent PR handoff.

Reconstruct this matrix from durable story-review outputs, story files, PR comments, or recorded blockers; do not use chat memory as the source of truth.

The matrix must contain one row for the parent story and one row for every child story in the set. A parent-level row does not satisfy any child-story row. A parent story-review row does not satisfy any child-story row, and a child story-review row does not satisfy the parent row or any sibling child-story row.

Required columns:

- story ID
- parent story ID
- child story ID when the row is a child
- story paths
- review assignment ID
- review status
- review artifact or blocker reference
- disposition summary

`review assignment ID` must be distinct per row. `review artifact or blocker reference` must include a distinct artifact identity per row. One reviewer run, one matrix, or one batch artifact can satisfy at most one required row.

Allowed review types: `parent-story`, `child-story`, `not-applicable`.

Allowed review statuses: `pending`, `approval-ready`, `needs-revision`, `blocked`, `not-applicable`.

Fail closed when the parent-story review is unknown or pending. Fail closed when any child-story review is missing, unknown, or pending. Fail closed when status cannot be reconstructed from durable artifacts, including when any row is not reconstructable from durable evidence.

Lost chat context is not a reason to rerun review blindly; reconstruct first and report uncertainty if reconstruction fails.

This matrix is an orchestration aid and PR/review handoff artifact, not a new mutable current-status file and not a second authority over story files.

Single-child parent story sets are still parent/substory workflows.

## Story Execution Rules

- Read `AGENTS.md` first, then the approved story, then the corresponding packet.
- Implement only one approved story at a time.
- Approved stories may exist without packets until they become active.
- Post-approval role handoffs must include role packet extraction output for the assigned role (`implementation` or `code-review`).
- Manual packet trimming is not the normal handoff path. Use deterministic role packet extraction output for normal handoffs.
- packet-agent, cleanup-sync-agent, and revision-agent are not valid role handoff targets.
- If role packet extraction is unavailable or fails, use temporary manual fallback only for that handoff and record both the extraction failure and the fallback details in the PR trail or implementation trail.
- If role packet extraction fails, ensure the failure and fallback are recorded in the PR or implementation trail.
- `worker-ready` means the parent has read `AGENTS.md`, the approved story, and the current active packet, then successfully run packet generation and `pnpm run packets:verify`.
- Before implementation starts, before a worker or reviewer subagent is assigned, and before PR handoff begins, generate a current checked-in packet for the active story under `agent-packets/`.
- Track active stories in `agent-packets/active.json` and keep the packet current relative to the approved story.
- `agent-packets/active.json` may contain zero active stories or exactly one active story. It must never contain multiple active implementation or review handoff targets.
- Use `pnpm run packets:generate --story <stories/approved/...yaml> --activate` to build or refresh the packet for the story you are activating.
- Use `pnpm run packets:verify` immediately after generating or refreshing the packet, and before worker assignment, reviewer assignment, implementation handoff, or PR handoff, to fail fast on missing or stale active-story packets.
- Run `pnpm run packets:generate --story <stories/approved/...yaml> --activate` and `pnpm run packets:verify` before assigning an implementation worker.
- Use `pnpm run packets:complete --story <stories/approved/...yaml>` after a story is merged to move it to done history, remove its active packet, and clear it from `agent-packets/active.json`.
- Treat `docs/code-standard.md` as mandatory implementation guidance for code quality, separation of concerns, architecture boundaries, testing, story scope, and PR review expectations.
- Stay inside the story's `scope`, `story_boundary`, and `allowed_touch_points`.
- Do not silently absorb adjacent contract, engine, server, client, replay, or UI work just because it is nearby.
- If the needed work crosses concerns, stop and split the story or raise the ambiguity instead of broadening the patch.
- Supporting tests, fixtures, snapshots, and docs for the same concern are allowed in the same story.

## Mandatory Card Fixture Workflow Entry Point

For relevant CARD/card-fixture stories, `docs/workflow/card-fixture-capture.md`
is mandatory workflow guidance. Agents must read it when a story touches fixture
capture, CARD source integrity, generated support, overlays, or real-card
fixture evidence.

The card fixture capture workflow is an entry-point requirement only. It does
not authorize changes to fixture capture implementation, generated support
behavior, or card data semantics outside the approved story boundary.

## Layered Parent Story Sets

Broad composed-effect or card-support initiatives may use layered parent story
sets when one capability crosses contract, runtime, and card-support review
concerns. Layered parent story sets may split the initiative into
contracts/schema, engine/runtime, and cards/parser/generated-support parent sets
while preserving the existing parent/substory workflow and packet lifecycle for
each active story set.

Implementation stories still keep one primary concern and one primary area.
TYP-prefixed contract/schema implementation stories use `area: contracts`, not
`area: types`, even when story validation retains legacy `types` compatibility.
CARD stories may depend on completed TYP and ENG parent series but must not hide
runtime work; reusable engine behavior belongs in ENG stories before
card-specific generated-support or parser linkage work proceeds.

Already-generated downstream TYP, ENG, and CARD implementation story sets must
be revised or regenerated after the layered rules land before approval handoff.

## Role Hierarchy And Story Path Selection

Use this workflow hierarchy:

- Human -> Session Orchestrator -> story-review -> (implementation, code-review)

Human interaction boundary and path-selection policy:

- Only the Session Orchestrator interacts directly with the human for story scope and approval decisions.
- Session Orchestrator owns story-review assignment.
- Session Orchestrator owns child activation, packet freshness, implementation assignment, review assignment, PR evidence, cleanup metadata validation, human-review handoff, merge readiness, and post-merge cleanup confirmation.
- Implementation handoff and code-review handoff each require role packet extraction output for the assigned role.
- Parent/substory execution is the only story workflow path.
- A story with one child still uses the parent/substory workflow.
- Do not document or ask agents to choose a separate single-story path.
- Do not create a new mutable current-status file for selected-path tracking.
- story-author, story-writer, story-orchestrator, pr-gate, packet-agent, cleanup-sync-agent, and revision-agent are not valid assignable roles in this workflow.

## Role Lifecycle Reuse And Closure

- story-review reuse within a story set for low/medium findings is allowed.
- Use a fresh story-review agent after high/critical findings.
- story-review closes after approval-ready or blocked review outcome.
- Use a fresh implementation agent per active child story.
- implementation revision reuse for low/medium code-review findings is allowed.
- Use a fresh implementation agent for high/critical findings.
- Use one code-review agent per PR, reused only for re-review on the same PR.
- code-review closes after PR review closure or replacement.
- A superseded implementation, story-review, or code-review agent must be closed before spawning a required fresh replacement.
- Reviewers may upgrade low/medium findings to fresh-agent-required when they indicate architecture misunderstanding, scope drift, repeated failed fixes, or stale context.
- Approved/completed handoffs close no-longer-needed reviewer and implementation agents once durable review or implementation records exist.
- Session Orchestrator closes no-longer-needed implementation and code-review agents after durable records exist.

## Verification And PR-Gate Authority

- Implementation agents may run tests and verification commands.
- Implementation-agent verification results are evidence, not final release authority.
- Session Orchestrator owns final verification-readiness gate authority for the assigned story set.
- Session Orchestrator owns PR body state.
- Session Orchestrator owns AI review record tracking.
- Session Orchestrator owns revision response tracking.
- Session Orchestrator owns CI/check state tracking.
- Session Orchestrator owns cleanup metadata validation.
- Session Orchestrator owns human-review handoff.
- Session Orchestrator owns post-merge cleanup/sync confirmation.

## Card Manifest Fixture Policy

Real-card and cards-produced fixture coverage is separate integration/card-data coverage. It proves that card-data adapter output, representative manifests, CLI boot paths, hidden-info filtering, and root integration surfaces can consume reviewed local fixtures. It does not replace primitive, unit, regression, synthetic edge-case, fail-closed, hidden-info, event-order, or state-hash coverage for engine behavior.

Engine and rules stories must keep focused synthetic/unit/regression tests for behavior requirements. Use synthetic or purpose-built plain manifest data for exact primitive behavior, edge cases, unsupported shapes, PlayerView visibility, event sequencing, and deterministic state hashes.

- `@optcg/cards` may produce match manifests by resolving Poneglyph data,
  simulator overlays, and implementation metadata.
- `@optcg/engine-core` consumes only plain `MatchCardManifest` data. Engine
  actions must not fetch live Poneglyph data or call `@optcg/cards`.
- Root integration tests may import `@optcg/cards` and `@optcg/engine-core`
  together when the test is explicitly exercising the produced-manifest
  integration boundary.
- Engine package tests may load plain JSON or data fixtures but must not import
  `@optcg/cards`. Loading a cards-produced manifest in an engine test is
  integration coverage, not a substitute for the synthetic behavior tests above.
- CLI tests may load local fixture manifests but must not require live Poneglyph
  or Redis.
- Future engine and effect-runtime stories are not required to add real-card fixtures merely because they implement a primitive, rule, or behavior path.
- Synthetic one-off manifests are allowed for narrow engine behavior tests when
  they make the behavior contract clearer or avoid broadening the story. The
  story or PR should explain any unusual synthetic fixture shape that is not
  obvious from the test.
- Fixture adoption is not gameplay support. Stories and PRs must keep
  unsupported gameplay status honest and must not describe fixture cards as
  implemented unless the story also implements and verifies the cited behavior.
- If an engine or rules story exposes a real-card fixture or cards-produced manifest gap, create a separate CARD/FIXTURE/verification follow-up story instead of widening the engine story.

## CARD Implementation Story Authoring

Approved stories with `area: cards` and `type: implementation` must include two
preflight sections before they are worker-ready:

- `card_source_integrity`
- `engine_capability_preflight`

`card_source_integrity` records the real-card data provenance for each target
card. It must identify the capture command or reviewed checked-in fixture,
list behavior-sensitive printed fields, require fixture/normalization
assertions for those fields, and require manifest regeneration when fixture or
support evidence changes. If the story does not enable or change real-card
gameplay support, the section must say so explicitly and explain why source
integrity is not applicable.

`engine_capability_preflight` records the parsed effect shape and compares it to
current reusable runtime capabilities. It must list required runtime
capabilities, split them into supported and missing groups, and name prerequisite
ENG stories for missing reusable behavior. A CARD implementation story is blocked
until reusable engine gaps are already implemented or explicitly split into
prerequisite ENG stories. If the story is pure card-data infrastructure and does
not implement or enable gameplay behavior, the section must say so explicitly.

CARD stories own real-card fixture provenance, generated support linkage,
support reports, cards-produced manifest updates, and card-specific integration
proof. ENG stories own reusable engine behavior such as costs, targeting,
decision continuations, trigger timing, once-per-turn state, hidden-information
projection, event order, and state hashing. Do not hide reusable engine work
inside a card support story.

## Story Lifecycle Rules

- The parent agent owns story-state transitions and active-packet cleanup.
- Post-merge packet cleanup automation is the normal path after a reviewed story PR or parent PR merges.
- A story merged to `main` must move from `stories/approved/` to `stories/done/` with `status: done` before the next implementation story is handed off, except when an approved parent-story integration branch workflow explicitly defers substory completion until the parent PR lands on `main`.
- Completed stories must not remain in `agent-packets/active.json`.
- Activating a new story replaces the previous active manifest entry instead of accumulating multiple active stories.
- Completing a story must use the packet completion command so story movement, packet removal, and manifest cleanup happen as one verified operation.
- Cleanup metadata is a reviewed request, not standalone authority.
- PR authors must leave exactly one `Post-merge cleanup:` metadata source in the PR body or a durable handoff comment before PR handoff, reviewer handoff, or human review request.
- The cleanup metadata source must use the exact parser shape: `Post-merge cleanup:` followed by indented `mode`, `stories`, and optional `branches`; use no markdown fence and no `cleanup:` wrapper.
- The remote `cleanup-metadata-guard` validates cleanup metadata source and shape from the PR body or durable handoff comments. The remote guard does not by itself prove full reviewed-scope binding.
- Before reviewer handoff, human review request, or ready-for-human-review language, validate cleanup metadata against the actual current PR body or selected durable handoff comment, not a copied example or reconstructed local text.
- When fetched PR metadata and checks are available, use `node --experimental-strip-types tools/post-merge-cleanup.ts -- --validate-cleanup-handoff-json-file <handoff.json> --require-cleanup-guard-status`; the handoff JSON must include the fetched PR body, fetched issue comments, fetched changed files, fetched PR head branch, allowed cleanup branches when parent cleanup lists non-head branches, fetched status checks, and reviewed PR evidence. This full cleanup metadata handoff preflight binds the fetched changed files, fetched PR head branch, fetched status checks, and reviewed PR evidence so metadata is bound to reviewed PR scope, and `cleanup-metadata-guard` must be present and passing before human review is requested.
- The cleanup metadata guard is a required pre-merge check for pull requests targeting the default branch and must run from trusted default-branch or base-branch validation code, not PR-head-modifiable workflow or tooling code.
- Automation must bind cleanup metadata to reviewed PR evidence and trusted checked-in story and packet state before it runs a packet completion command.
- The human-controlled merge to `main` is the cleanup approval signal. The workflow snapshots the PR-body or durable handoff-comment cleanup metadata at merge time; the computed metadata source ref is audit evidence and humans do not paste that ref into approval text.
- If merge actor evidence is unavailable and an equivalent human-review fallback is used, the fallback record must confirm the cleanup metadata source was reviewed before fallback approval.
- Direct cleanup commits are allowed only for exact packet-completion command output after cleanup-scoped lifecycle verification passes.
- A cleanup commit containing only the exact file changes produced by `pnpm run packets:complete --story <stories/approved/...yaml>` or `pnpm run packets:complete-many` with one or more child `--story <stories/approved/...yaml>` arguments does not require a separate reviewer subagent run. For validated parent-mode cleanup, exact packet-completion command output may also include command-owned bound parent story closeout from the cleanup plan. Exact packet-completion cleanup may use cleanup-scoped lifecycle verification instead of full repo verification before the direct cleanup push. Cleanup-scoped lifecycle verification proves metadata binding, packet-completion output, story lifecycle state, active packet state, and committed story metadata.
- Automation-created cleanup pull requests are not created.
- Manual fallback is only for operational failure.
- If cleanup requires any manual edit beyond the packet completion command output, including edits to packet files, `agent-packets/active.json`, tooling, tests, fixtures, specs, workflow docs, or story files, run full verification and a separate reviewer subagent before pushing or merging.
- Manual edits beyond pure packet-completion output still use the normal PR and reviewer path.
- Branch deletion runs only after packet cleanup succeeds and never deletes protected, unrelated, or unmerged branches.
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

Use the complete role routing table:

| Role                 | Default model   | Reasoning | Escalation      |
| -------------------- | --------------- | --------- | --------------- |
| Session Orchestrator | `gpt-5.5`       | `high`    | none            |
| story-review         | `gpt-5.4`       | `high`    | none            |
| implementation       | `gpt-5.3-codex` | `medium`  | none by default |
| code-review          | `gpt-5.4`       | `high`    | none            |

- Parent/orchestrator model: `gpt-5.5`
- Session Orchestrator: `gpt-5.5` with `high` reasoning
- Story-review agent model: `gpt-5.4` with `high` reasoning
- story-review: `gpt-5.4` with `high` reasoning
- Reviewer subagent model: `gpt-5.4` with `high` reasoning
- implementation: default `gpt-5.3-codex` with `medium` reasoning
- Implementation worker model: default to `gpt-5.3-codex` with `medium` reasoning
- code-review: `gpt-5.4` with `high` reasoning
- Code-review agents must not silently default to `gpt-5.5` with `high` reasoning.
- Recorded rationale for any model-routing deviation is required in the PR review trail and implementation note
- Any model-routing deviation must be recorded in the PR review trail and implementation note

Parent-owned direct edits:

- Documentation-only approved stories still require implementation-worker ownership unless the approved story explicitly authorizes parent ownership.
- Parent direct edits are limited to small out-of-band orchestration/metadata/template/reviewer-response corrections outside an approved story implementation body.
- Parent-owned direct edits still require tests when applicable, full verification, and separate reviewer subagent review.
- Pure packet-completion cleanup is the one lifecycle exception: when the patch contains only the exact file changes produced by direct `packets:complete` or `packets:complete-many` output, including command-owned bound parent story closeout when present in the validated cleanup plan, cleanup-scoped lifecycle verification is sufficient and does not require a separate reviewer subagent run.
- Manual edits beyond the packet completion command output, including edits to packet files, `agent-packets/active.json`, tooling, tests, fixtures, specs, workflow docs, or story files, require full verification and separate reviewer subagent review.
- Use worker subagents for implementation code or large bounded documentation rewrites, not small authority-layer corrections.

Parent orchestration rules:

1. the parent agent reads `AGENTS.md`, the approved story, and the packet
2. the parent agent stays mostly in orchestration mode
3. the parent agent must delegate every approved story implementation body to an implementation worker subagent
4. the parent agent may still do tiny orchestration glue such as rebases, tiny integration edits, verification reruns, PR comment posting, branch or merge operations, packet/metadata corrections, and narrowly scoped reviewer-response integration touchups
5. the parent agent remains in charge of the story itself: story selection, scope enforcement, packet authority, ambiguity handling, review handoff, and story-state transitions stay with the parent agent rather than the worker or reviewer subagents
6. the parent agent must not author any approved story implementation body
7. use one worker subagent per active story by default; if a story appears to need multiple concurrent workers for the main implementation body, split the story first unless the write scopes are clearly disjoint and still reviewable

If worker subagent surfaces are unavailable, do not use parent implementation fallback. Escalate, block implementation handoff, and record the blocker in the implementation note.
