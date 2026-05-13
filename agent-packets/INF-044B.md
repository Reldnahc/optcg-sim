<!-- agent-packet:story-id INF-044B -->
<!-- agent-packet:story-path stories/approved/INF-044B-role-lifecycle-and-model-routing-policy.yaml -->
<!-- agent-packet:story-sha256 01f37828d97bd36edc7a483feb39e87b03544849f98a45a8d084ec6d39ebfd15 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-044B
Epic ID: INF-044
Title: Define agent lifecycle reuse and model routing
Type: tooling
Area: infra
Primary Concern: docs

## Why

Document role-specific agent reuse, closure, revision, verification authority, and model routing policy for the role-based workflow.

## Authoritative Spec References

- 27-spec-driven-story-generation-workflow.s006 (Story generation prompt contract)
- 27-spec-driven-story-generation-workflow.s007 (Story normalization rules)
- 27-spec-driven-story-generation-workflow.s008 (Approval rules)
- 27-spec-driven-story-generation-workflow.s009 (Agent packet generation)
- 27-spec-driven-story-generation-workflow.s015 (Recommended completion checks for story-driven implementation)
- 27-spec-driven-story-generation-workflow.s017 (Pre-presentation story-review gate)
- 32-codex-agent-integration.s008 (Recommended execution flow)
- 32-codex-agent-integration.s013 (Merge gate recommendation)
- 32-codex-agent-integration.s014 (Subagent model routing)
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

### 27-spec-driven-story-generation-workflow.s017 (Pre-presentation story-review gate)

Generated or normalized stories must receive story-review agent review before the parent agent presents them to the human as approval-ready.

Required behavior:

- approval-ready means the exact candidate story has a usable per-story story-review result,
- set-level or decomposition-group story review does not satisfy per-story candidate approval review,
- each candidate story needs its own usable story-review result before that exact story is presented for approval,
- run a set-level story review before a decomposed story group is presented for human approval,
- run per-story review before each candidate story is presented for approval,
- use a story-review agent separate from any implementation worker or implementation patch reviewer,
- story-review agent uses gpt-5.5 with high reasoning,
- story-review findings must be fixed, explicitly deferred, or recorded before presentation,
- do not present a story as approval-ready when no usable story-review agent run exists; present it as unreviewed and blocked on story review instead,
- story-review agents evaluate story authority, decomposition, scope, non-scope, dependencies, allowed touch points, acceptance criteria, required tests, and ambiguity policy,
- story-review agents do not review implementation patches; implementation patch review remains a separate gate.

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

### 32-codex-agent-integration.s014 (Subagent model routing)

Use the complete role routing table:

| Role                 | Default model   | Reasoning | Escalation                                          |
| -------------------- | --------------- | --------- | --------------------------------------------------- |
| Session Orchestrator | `gpt-5.5`       | `high`    | none                                                |
| story-author         | `gpt-5.5`       | `high`    | none                                                |
| story-review         | `gpt-5.5`       | `high`    | none                                                |
| story-orchestrator   | `gpt-5.4`       | `medium`  | use `high` for parent series or complex state       |
| implementation       | `gpt-5.3-codex` | `medium`  | none by default                                     |
| code-review          | `gpt-5.4`       | `high`    | none                                                |
| pr-gate              | `gpt-5.4`       | `medium`  | use `high` for parent PRs or cleanup/check failures |

story-orchestrator uses gpt-5.4 medium by default and high for parent series or complex state.
pr-gate uses gpt-5.4 medium by default and high for parent PRs or cleanup/check failures.

Code-review agents must not silently default to `gpt-5.5` with `high` reasoning.

The parent/orchestrator model is gpt-5.5.
Story-review agent model is gpt-5.5 with high reasoning.
Reviewer subagent model is gpt-5.4 with high reasoning.
Implementation worker subagents default to gpt-5.3-codex with medium reasoning.
Complex, risky, or integration-heavy implementation stories should use gpt-5.5 with medium reasoning.

Recorded rationale for any model-routing deviation is required in the pull-request review trail and implementation note.
Any model-routing deviation must be recorded in the pull-request review trail and implementation note.

Documentation-only authority edits should be handled by the parent agent directly. Authority edits still require separate reviewer subagent review, tests when applicable, and full verification before PR handoff.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only workflow documentation, matching spec authority text and metadata, and tests for lifecycle, reuse, closure, and model routing. Do not change packet rendering, packet extraction tooling, implementation behavior, PR gate tooling, or cleanup automation.

## Scope

- define fresh story-author agent per new standalone story or new parent/substory set, reused only within that story or set
- define story-review reuse within a story set, reuse for low/medium findings, and fresh story-review agent after high/critical findings
- define one story-orchestrator agent per approved standalone story or approved parent/substory series
- define fresh implementation agent per standalone story or substory
- define implementation revision reuse for low/medium code-review findings and fresh implementation agent for high/critical findings
- define that a superseded implementation, story-review, or code-review agent must be closed before spawning the required fresh replacement for high/critical findings or upgraded fresh-agent-required findings
- define guardrails allowing upgrade of low/medium findings to fresh-agent-required when they reveal architecture misunderstanding, scope drift, repeated failed fixes, or stale context
- define one code-review agent per PR, reused for re-review on the same PR only
- define one pr-gate agent per PR, closed after merge/sync or blocked/closed outcome
- define closure conditions for every role: story-author after story approval, story set approval, or abandonment; story-review after approval-ready or blocked review outcome; story-orchestrator after story or parent PR merge, story/series completion, or blocked/abandoned outcome; implementation after accepted implementation or replacement; code-review after PR review closure or replacement; and pr-gate after merge/sync or blocked/closed outcome
- define that approved/completed handoffs close no-longer-needed reviewer and implementation agents once their review or implementation result is durably recorded
- define that closing a story-orchestrator after merge, completion, blocked, or abandoned outcome also closes all implementation, code-review, and pr-gate child agents it owns
- define pr-gate ownership of PR body state, AI review records, revision response tracking, CI/check state, cleanup metadata validation, human-review handoff, and post-merge cleanup/sync confirmation for the assigned PR
- define that pr-gate agents cannot implement feature code, broaden scope, bypass human review, or change cleanup automation semantics
- define that implementation agents may run tests and verification commands but final readiness remains owned by the story-orchestrator
- replace the existing spec and workflow model-routing text with a complete role table: Session Orchestrator remains the current/default parent model as needed, story-author gpt-5.5 high, story-review gpt-5.5 high, story-orchestrator gpt-5.4 medium by default and high for parent series or complex state, implementation gpt-5.3-codex medium by default, code-review gpt-5.4 high, pr-gate gpt-5.4 medium by default and high for parent PRs or cleanup/check failures
- require recorded rationale for model-routing deviations

## Out of Scope

- role packet format
- packet extraction commands
- changing actual subagent tool implementation
- changing PR review record tooling
- changing cleanup automation semantics

## Allowed Touch Points

<!-- prettier-ignore -->
- AGENTS.md
- docs/workflow/story-execution.md
- docs/workflow/review-gate.md
- docs/workflow/parent-integration-branches.md
- docs/workflow/reporting-and-github-sync.md
- specs/32-codex-agent-integration.md
- specs/spec-manifest.json
- specs/section-index.json
- tests/github/review-workflow.test.mjs
- stories/generated/INF-044B-role-lifecycle-and-model-routing-policy.yaml

## Constraints

- do not modify packet tooling in this story
- keep role guidance in docs/workflow rather than bloating AGENTS.md
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

- workflow docs test proving story-author lifecycle and reuse rules
- workflow docs test proving story-review lifecycle and severity-based fresh-reviewer rules
- workflow docs test proving story-orchestrator lifecycle and closure rules
- workflow docs test proving implementation lifecycle and severity-based revision rules
- workflow docs test proving code-review and pr-gate are per PR and include closure rules
- workflow docs test proving superseded agents are closed before fresh replacement agents are spawned
- workflow docs test proving approved reviewer and accepted implementation agents are closed after durable records are written
- workflow docs test proving story-author and story-review agents close after story approval
- workflow docs test proving story-orchestrator closure closes implementation, code-review, and pr-gate child agents after merge/completion/blocked/abandoned outcome
- workflow docs test proving implementation verification authority and story-orchestrator final gate authority
- workflow docs test proving model routing table and deviation rationale
- workflow docs or contract test proving specs/32-codex-agent-integration.md and workflow docs contain the same complete role model-routing table and deviation-rationale rule
- workflow docs test proving pr-gate owns PR records, checks, cleanup metadata validation, human-review handoff, and post-merge sync for its assigned PR
- run `corepack pnpm run specs:verify-metadata`
- run `corepack pnpm run test -- tests/github/review-workflow.test.mjs`
- run full `corepack pnpm verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- workflow docs define lifecycle and reuse rules for every role
- workflow docs define severity-based reuse rules for story-review and implementation revisions
- workflow docs define when every role must be closed
- workflow docs define close-before-replace behavior for high/critical or upgraded fresh-agent-required findings
- workflow docs define that reviewer and implementation agents are closed after approved/completed handoffs are durably recorded
- workflow docs define that story-author and story-review agents are closed once their story or story set is approved
- workflow docs define that story-orchestrator closure after merge/completion/blocked/abandoned outcome closes all child agents it owns
- workflow docs state implementation-agent verification is evidence and story-orchestrator owns final verification
- specs and workflow docs include the same complete model routing table and deviation-rationale requirement
- workflow docs state code-review agents do not silently use gpt-5.5 high
- workflow docs define pr-gate ownership and forbidden actions for its assigned PR

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
