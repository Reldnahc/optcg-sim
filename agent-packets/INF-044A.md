<!-- agent-packet:story-id INF-044A -->
<!-- agent-packet:story-path stories/approved/INF-044A-role-hierarchy-and-human-selected-story-path.yaml -->
<!-- agent-packet:story-sha256 8318584132bd51149ece0e2a0c84d3ea9b4a0205c34adec50a4a6e2ac2e7196c -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-044A
Epic ID: INF-044
Title: Define role hierarchy and human-selected story path
Type: tooling
Area: infra
Primary Concern: docs

## Why

Document the new agent hierarchy and require the Session Orchestrator to present single-story versus parent/substory tradeoffs while the human chooses the story path.

## Authoritative Spec References

- 27-spec-driven-story-generation-workflow.s006 (Story generation prompt contract)
- 27-spec-driven-story-generation-workflow.s007 (Story normalization rules)
- 27-spec-driven-story-generation-workflow.s008 (Approval rules)
- 27-spec-driven-story-generation-workflow.s009 (Agent packet generation)
- 27-spec-driven-story-generation-workflow.s015 (Recommended completion checks for story-driven implementation)
- 32-codex-agent-integration.s008 (Recommended execution flow)
- 32-codex-agent-integration.s013 (Merge gate recommendation)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 27-spec-driven-story-generation-workflow.s006 (Story generation prompt contract)

Use a prompt equivalent to the following when extracting candidate stories from one or more spec sections:

```text
Read the provided OPTCG simulator specification sections and extract implementation-ready backlog items.

Rules:
- The specification is authoritative.
- Do not invent features not supported by the text.
- Generate gameplay or platform capabilities as epics first when the work spans multiple concerns.
- Break work into small, reviewable stories that fit one main implementation unit and one primary concern.
- Do not combine contract, rules, view, protocol, persistence, and UI work in one story unless the specification makes them inseparable.
- Use the canonical story schema.
- Include exact spec references whenever possible.
- Include `epic_id`, `primary_concern`, `story_boundary`, and `allowed_touch_points`.
- Include explicit scope, non-scope, acceptance criteria, required tests, and dependencies.
- If the specification is ambiguous, create an ambiguity story or flag the ambiguity instead of silently assuming behavior.
- Prefer fail_and_escalate for gameplay, hidden-information, replay, fairness, timer, and persistence behavior.
- Output only valid YAML objects matching the schema.
```

### 27-spec-driven-story-generation-workflow.s007 (Story normalization rules)

After candidate generation, normalize stories before approval.

Normalization should:

- split oversized stories,
- split multi-concern stories into dependent sibling stories under one epic,
- merge duplicate stories,
- remove uncited invented behavior,
- align type and area labels,
- ensure required fields are present,
- ensure `epic_id`, `primary_concern`, `story_boundary`, and `allowed_touch_points` are coherent,
- ensure acceptance criteria are behavioral,
- ensure tests are specific,
- treat tests, fixtures, snapshots, and docs for the same concern as supporting work rather than separate end-to-end stories,
- reject stories whose scope reads like an end-to-end milestone instead of one concern-sized delivery unit,
- ensure ambiguity policy is appropriate for risk level.

A story that cannot be normalized cleanly should be converted into an ambiguity story or rejected.

### 27-spec-driven-story-generation-workflow.s008 (Approval rules)

A story may move from `generated` to `approved` only if:

- the pre-presentation story-review gate has run and material findings are fixed, explicitly deferred, or recorded,
- required schema fields are present,
- spec references are valid,
- the epic/story decomposition is coherent,
- scope and non-scope are explicit,
- `primary_concern` is singular,
- `story_boundary` makes the stop point obvious,
- `allowed_touch_points` are narrow enough to review,
- required tests exist,
- dependencies are reasonable,
- ambiguity policy is acceptable for the risk category.

### 27-spec-driven-story-generation-workflow.s009 (Agent packet generation)

Once a story is selected to become active, generate or refresh a checked-in packet using [`26-agent-packet-template.md`](26-agent-packet-template.md).

Packet generation should gather:

- the approved story,
- the approved story's `primary_concern`, `story_boundary`, and `allowed_touch_points`,
- relevant spec excerpts,
- applicable repo rules,
- applicable architecture/code constraints,
- any directly related contract snippets needed for the task.

The packet should be minimal but sufficient. Overloading agents with the full spec is discouraged unless the task genuinely requires it. If packet construction reveals that one assignment still spans multiple concerns, return the story to normalization instead of padding the packet.

Approved stories may remain packetless while they are dormant backlog items. Once a story becomes active for implementation, reviewer assignment, or PR handoff, the repo should require a current checked-in packet and fail verification when that packet is missing or stale relative to the approved story.

For implementation worker handoff, treat a story as worker-ready only after the parent has read `AGENTS.md`, the approved story, and the current active packet, then run `pnpm run packets:generate --story <stories/approved/...yaml> --activate` plus `pnpm run packets:verify` successfully.

The active-story manifest should represent the current implementation or review handoff target only. A manifest with no active story is valid between stories, but a manifest with multiple active stories should fail verification because it makes ownership and review scope ambiguous.

### 27-spec-driven-story-generation-workflow.s015 (Recommended completion checks for story-driven implementation)

A story should not be marked done unless:

- code behavior matches the cited spec,
- required tests are present and pass,
- repo verification passes,
- the patch stays within the approved story boundary and allowed touch points or the story is updated and re-approved first,
- no prohibited scope creep is introduced,
- any new ambiguity is surfaced explicitly.

After a story is marked done, it should not remain under `stories/approved/`, should not retain an active packet, and should not remain listed in `agent-packets/active.json`. The parent agent owns this cleanup because story state and packet authority are orchestration concerns, not worker or reviewer subagent concerns. Repos should provide a single command for normal single-story completion and a multi-story command for parent-story integration cleanup so story movement, packet removal, and manifest cleanup cannot drift independently. Multi-story cleanup tooling must fail closed when manifest or packet evidence for any listed story is missing or stale.

For parent-story integration branches, substories may remain approved after their substory PRs merge into the parent integration branch because the authoritative merge to `main` has not happened yet. This exception is valid only when the user explicitly approved parent-level human review for the decomposed story group, every substory PR has CI and reviewer-subagent review records, and the final parent PR receives full-story integration review plus human review before merge to `main`.

During that parent-branch window, `agent-packets/active.json` remains a single-story handoff pointer for the currently active or most recently active substory packet. It should not be read as the inventory of unfinished substories. Substories merged only into the parent integration branch stay approved and keep their packet files until the parent PR lands on `main`, even when they no longer appear in `active.json`.

Before human review is requested on a parent PR, the PR body or a handoff comment should be updated from future-tense review plans to completed-gate evidence: included substory PRs, full-story AI review record, revision response, CI result, repo verification result, remaining human-review requirement, and the post-merge `packets:complete-many` cleanup plan.

A commit that contains only the exact file changes produced by the packet completion command is a generated lifecycle cleanup and does not need a separate reviewer-subagent pass; exact packet-completion cleanup may use cleanup-scoped lifecycle verification instead of full repo verification before the direct cleanup push. Cleanup-scoped lifecycle verification must prove metadata binding, packet-completion output, story lifecycle state, active packet state, and committed story metadata remain valid; cleanup that includes any manual edit beyond packet-completion output still requires full repo verification and the normal reviewer-subagent path before push or merge. This includes edits to packet files, `agent-packets/active.json`, tooling, tests, fixtures, specs, workflow docs, or story files.

Post-merge cleanup metadata is a reviewed cleanup request, not standalone
authority to mutate story state. Cleanup automation must bind the requested
cleanup to reviewed pull-request evidence, the merge state, trusted checked-in
approved story files, current packet evidence, and, for parent cleanup, included
substory evidence before packet completion runs. It must fail closed when
cleanup metadata is absent, malformed, stale, unbound to reviewed evidence, or
names a story that is not eligible for completion.

The cleanup workflow must check out trusted `main` or default-branch code, not
unreviewed pull-request branch code. A direct cleanup commit may be pushed only
by the dedicated cleanup actor after packet-completion output is proven exact
and cleanup-scoped lifecycle verification passes. Normal main-branch CI remains
the broad post-cleanup safety net after the cleanup commit is pushed. The
automation must not open a cleanup
pull request. Manual fallback is only for operational failure, not the normal
path. Branch deletion may run only after packet lifecycle cleanup succeeds and
only for associated merged, unprotected story or substory branches.

### 32-codex-agent-integration.s008 (Recommended execution flow)

1. Before approving a generated or normalized story, run story-review subagents and resolve, explicitly defer, or record their findings.
1. Approval-ready means the exact candidate story has a usable per-story story-review result.
1. Set-level or decomposition-group story review does not satisfy per-story candidate approval review.
1. Each candidate story needs its own usable story-review result before the parent agent presents that exact story for approval.
1. Approve a story.
1. Generate or refresh the checked-in packet for the active story.
1. Treat the story as worker-ready only after the parent reads `AGENTS.md`, the approved story, and the active packet, then runs `pnpm run packets:generate --story <stories/approved/...yaml> --activate` and `pnpm run packets:verify`.
1. Run `node --experimental-strip-types tools/spec_board_sync.ts --story <path> --dry-run --write-preview`, then perform live sync when ready.
1. Verify that the active story packet is present and current before worker assignment, reviewer assignment, or PR handoff.
1. Have a parent Codex agent read the story, packet, and `AGENTS.md`, stay mostly in orchestration mode, and remain the owner of story authority, scope decisions, ambiguity handling, and review handoff.
1. Spawn a worker subagent for the main implementation body of the story whenever delegation is available.
1. Use one implementation worker subagent per active story by default; if more than one worker is needed, split the story first unless write scopes are explicitly disjoint and still reviewable.
1. Allow the parent agent to do only small local glue work such as rebases, tiny integration edits, verification reruns, and PR administration.
1. Follow the subagent model routing policy.
1. Require tests and a short assumptions/blockers note.
1. Link the pull request back to the story issue.
1. Spawn a separate reviewer subagent plus human review before merge. If the user has explicitly approved a parent-story integration branch workflow for a decomposed story group, substory pull requests may merge into the parent integration branch after CI, packet verification, reviewer-subagent review, AI review records, and revision response records pass; human review is then required on the final parent pull request to `main`.
1. After merge, have the parent agent run the packet completion command to move
   the completed story to done history, remove the active packet, and clear or
   replace the active packet manifest before starting the next story. In a
   parent-story integration branch workflow, defer substory completion until the
   parent pull request lands on `main`, then complete all included substories in
   one verified packet-tool operation.

The parent agent must not present stories as approval-ready until the story-review findings are resolved, explicitly deferred, or recorded.
When worker subagents are unavailable, the parent may implement manually but must record an explicit implementation note that worker delegation was unavailable and parent implementation fallback was used.

### 32-codex-agent-integration.s013 (Merge gate recommendation)

A Codex-authored patch should not be merged unless:

- the linked story is still `approved`,
- the patch satisfies the listed acceptance criteria,
- required tests are present and passing,
- no uncited behavior is introduced,
- the review record includes either a reviewer-subagent artifact or an equivalent human review step.

After merge, the story should no longer remain approved or active. The parent agent
should use the packet completion command to move it to `stories/done/` with
`status: done`, remove the active packet, and ensure `agent-packets/active.json`
contains no completed story.

For an explicitly approved parent-story integration branch workflow, substory
pull requests merge into the parent integration branch before the substory is
marked done. Those substories may remain under `stories/approved/` while the
parent integration branch is open, but they must not be marked done until the
parent pull request has merged to `main`. After the parent merge, the parent
agent must use the multi-story packet completion command to move every included
substory to `stories/done/`, remove their packets, and clear any matching active
manifest entry. The multi-story completion command must reject cleanup when
manifest or packet evidence for any listed substory is missing or stale.

While the parent integration branch is open, `agent-packets/active.json` is a
single-story handoff pointer, not a parent-story progress report. It may point to
the current or most recently active substory even after earlier substories have
merged into the parent branch. Those earlier substories remain approved until the
parent PR lands on `main` and the multi-story completion command runs.

Before requesting human review on the parent PR, the parent agent should update
the PR body or post a handoff comment that records completed gates instead of a
future-tense review plan: included substory PRs, full-story reviewer-subagent
record, revision response, CI result, repo verification result, required human
review, and post-merge multi-story cleanup.

Pure packet-completion cleanup does not require reviewer-subagent review when the
commit contains only the exact file changes produced by the packet completion
command and cleanup-scoped lifecycle verification passes; exact
packet-completion cleanup may use cleanup-scoped lifecycle verification instead
of full repo verification before the direct cleanup push. Cleanup-scoped
lifecycle verification must prove metadata binding, packet-completion output,
story lifecycle state, active packet state, and committed story metadata remain
valid; cleanup that includes any manual edit beyond packet-completion output
still requires full repo verification and the normal reviewer-subagent path
before push or merge; this includes edits to packet files,
`agent-packets/active.json`, tooling, tests, fixtures, specs, workflow docs, or
story files.

Post-merge cleanup metadata is a reviewed cleanup request, not standalone
authority to mutate story state. Cleanup automation must bind the requested
cleanup to reviewed pull-request evidence, the merge state, trusted checked-in
approved story files, current packet evidence, and, for parent cleanup, included
substory evidence before packet completion runs. It must fail closed when
cleanup metadata is absent, malformed, stale, unbound to reviewed evidence, or
names a story that is not eligible for completion.

The cleanup workflow must check out trusted `main` or default-branch code, not
unreviewed pull-request branch code. A direct cleanup commit may be pushed only
by the dedicated cleanup actor after packet-completion output is proven exact
and cleanup-scoped lifecycle verification passes. Normal main-branch CI remains
the broad post-cleanup safety net after the cleanup commit is pushed. The
automation must not open a cleanup
pull request. Manual fallback is only for operational failure, not the normal
path. Branch deletion may run only after packet lifecycle cleanup succeeds and
only for associated merged, unprotected story or substory branches.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only workflow documentation and tests for the role hierarchy and story path selection policy. Do not change packet rendering, packet extraction, implementation code, PR gate tooling, or cleanup automation.

## Scope

- document that the human interacts only with the Session Orchestrator
- document that the Session Orchestrator owns story-author, story-review, and story-orchestrator assignment
- document that the story-orchestrator owns implementation, code-review, and pr-gate agents for its assigned story or story set
- document that there is no implicit single-story default
- require the Session Orchestrator to present tradeoffs and record the human-selected single-story or parent/substory path in the story draft, story review artifact, approval note, or PR/review trail rather than in a new mutable current-status file
- document that story-author and story-review work happens before active packet generation
- document that packet-agent, cleanup-sync-agent, and revision-agent are not roles in this workflow

## Out of Scope

- packet format changes
- packet extraction commands
- model routing policy
- implementation/code-review/pr-gate lifecycle reuse policy
- post-merge cleanup automation changes

## Allowed Touch Points

<!-- prettier-ignore -->
- AGENTS.md
- docs/workflow/story-execution.md
- docs/workflow/parent-integration-branches.md
- docs/workflow/review-gate.md
- tests/github/review-workflow.test.mjs
- stories/generated/INF-044A-role-hierarchy-and-human-selected-story-path.yaml

## Constraints

- keep AGENTS.md concise and link detailed role guidance from docs/workflow
- do not add packet extraction behavior in this story
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

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

- workflow docs test proving the hierarchy and human interaction boundary
- workflow docs test proving no implicit single-story default
- workflow docs test proving human-selected story path after tradeoff presentation
- workflow docs test proving selected path recording uses existing durable artifacts and not a new current-status file
- workflow docs test proving packet-agent, cleanup-sync-agent, and revision-agent are not introduced roles
- run `corepack pnpm run test -- tests/github/review-workflow.test.mjs`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- workflow docs include the hierarchy Human to Session Orchestrator to story-author/story-review/story-orchestrator to implementation/code-review/pr-gate
- workflow docs state that only the Session Orchestrator talks to the human
- workflow docs state that single-story execution is not the default and parent/substory is not the exception
- workflow docs state the human chooses the story path after Session Orchestrator presents tradeoffs
- workflow docs state the selected path is recorded only in existing durable story/review/PR artifacts and not in a new current-status file
- workflow docs state story-author and story-review agents do not receive active packets
- workflow docs state packet-agent, cleanup-sync-agent, and revision-agent are not introduced roles

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
