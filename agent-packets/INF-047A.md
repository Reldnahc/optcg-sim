<!-- agent-packet:story-id INF-047A -->
<!-- agent-packet:story-path stories/approved/INF-047A-collapse-agent-workflow-to-parent-substory-only.yaml -->
<!-- agent-packet:story-sha256 7e13cc6c2595a48c2f156bd8a30b81627a4b67b0373d1d0fb6b773eb0c3c53e8 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-047A
Epic ID: INF-047
Title: Collapse agent workflow to parent/substory only
Type: refactor
Area: docs
Primary Concern: docs

## Why

Remove the two-path story execution model and the unused or extra story-author/story-orchestrator/pr-gate roles from canonical workflow authority, repo workflow docs, packet tooling, review-plan tooling, and tests so agents have one execution path: parent/substory integration with Session Orchestrator as the owner.

## Authoritative Spec References

- 24-story-schema.s016 (`spec_refs`)
- 24-story-schema.s025 (Story sizing rules)
- 24-story-schema.s031 (`story_boundary`)
- 24-story-schema.s032 (`allowed_touch_points`)
- 26-agent-packet-template.s001 (Agent Packet Template)
- 26-agent-packet-template.s003 (Packet requirements)
- 26-agent-packet-template.s005 (Packet construction rules)
- 27-spec-driven-story-generation-workflow.s002 (Workflow summary)
- 27-spec-driven-story-generation-workflow.s005 (Story generation outputs)
- 27-spec-driven-story-generation-workflow.s009 (Agent packet generation)
- 27-spec-driven-story-generation-workflow.s012 (Minimum viable process)
- 27-spec-driven-story-generation-workflow.s017 (Pre-presentation story-review gate)
- 27-spec-driven-story-generation-workflow.s015 (Recommended completion checks for story-driven implementation)
- 32-codex-agent-integration.s010 (Review flow)
- 32-codex-agent-integration.s013 (Merge gate recommendation)
- 32-codex-agent-integration.s014 (Subagent model routing)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 24-story-schema.s016 (`spec_refs`)

List of exact spec section references that authorize the story. These references are mandatory. In v6, `spec_refs` should use stable `SECTION_REF` identifiers such as `07-match-server-protocol.s010 (Timers)` instead of renderer-specific heading anchors. The story must not ask the agent to invent uncited behavior.

### 24-story-schema.s025 (Story sizing rules)

Approved stories should usually fit within a single reviewable pull request. The primary sizing rule is concern boundary, not raw diff size. Broad gameplay or platform capabilities should become epics. The approved stories inside an epic should be sliced by one primary concern at a time.

A story is too large if it:

- combines multiple primary concerns such as contract plus rules, rules plus protocol, or protocol plus UI in one assignment,
- changes multiple systems with different review concerns,
- requires the agent to choose architecture rather than implement it,
- cannot state acceptance criteria in a few bullets,
- cannot be validated by a targeted set of tests,
- cannot be reverted independently without backing out unrelated work,
- needs repeated "and also" scope clauses to explain what it does.

Warning signals may still justify a split, but they are secondary to concern boundaries:

- unusually large diffs,
- creation or expansion of large multi-purpose files,
- acceptance criteria that read like an end-to-end milestone instead of one reviewable concern.

Tests, fixtures, snapshots, and docs that directly prove the same concern do not count as a second concern by themselves.

### 24-story-schema.s031 (`story_boundary`)

One or two sentences describing what the story owns and where it must stop. This field exists because `non_scope` alone often becomes a loose list; the boundary statement should make the intended stopping point obvious to authors, implementers, and reviewers.

### 24-story-schema.s032 (`allowed_touch_points`)

List of packages, directories, modules, or other implementation surfaces the story is expected to modify. This is both a review aid and a future automation hook for detecting scope creep between the approved story and the resulting patch.

### 26-agent-packet-template.s001 (Agent Packet Template)

This document defines the standard packet format used to assign one approved story to an implementation, review, or verification agent.

The purpose of a packet is to reduce interpretation overhead. Agents should not be expected to rediscover requirements from the entire specification when a constrained story already exists.

### 26-agent-packet-template.s003 (Packet requirements)

Every packet must include:

1. the approved story identifier and title,
2. the parent epic and the story's primary concern,
3. why the story exists,
4. authoritative spec section references,
5. copied or summarized relevant spec excerpts,
6. the story boundary,
7. scope,
8. non-scope,
9. allowed touch points, constraints, and repo rules,
10. required tests,
11. acceptance criteria,
12. expected output format,
13. ambiguity handling instructions.

### 26-agent-packet-template.s005 (Packet construction rules)

When building a packet from an approved story:

- include only the relevant spec material,
- do not dump the entire spec by default,
- write the packet as a checked-in artifact under `agent-packets/<STORY-ID>.md`,
- include stable metadata for the source story id, story path, and source-story freshness hash so tooling can verify the packet later,
- preserve the `primary_concern`, `story_boundary`, and `allowed_touch_points` exactly,
- preserve exact acceptance criteria from the story,
- preserve non-scope unchanged,
- include the applicable repo rules from [`23-repo-tooling-and-enforcement.md`](23-repo-tooling-and-enforcement.md),
- include code and architecture constraints from the relevant documents,
- include the approved ambiguity policy,
- allow approved stories to sit without packets until they become active, but require a current checked-in packet before implementation assignment, reviewer assignment, or PR handoff,
- keep the active packet manifest to zero or one active story; activating a story replaces the prior active entry rather than accumulating active implementation targets,
- complete stories through one packet-tool operation that moves the story to done history, removes the active packet, and clears the completed story from the active packet manifest,
- treat the exact file changes produced by that completion operation as generated lifecycle cleanup that needs cleanup-scoped lifecycle verification but does not need separate reviewer-subagent review unless any manual edits are added,
- Cleanup-scoped lifecycle verification must prove metadata binding, packet completion output, story lifecycle state, active packet state, and committed story metadata remain valid,
- split the story before packet generation if the packet would otherwise need multiple unrelated concerns to be implemented together.

### 27-spec-driven-story-generation-workflow.s002 (Workflow summary)

The required planning flow is:

1. specification documents,
2. candidate story generation,
3. story normalization,
4. pre-presentation story-review gate,
5. story approval,
6. agent packet construction,
7. implementation or review agent execution,
8. validation against the approved story and cited spec.

The repo may automate some or all of these steps, but it must preserve the same authority order.

### 27-spec-driven-story-generation-workflow.s005 (Story generation outputs)

The generation step should produce:

- one or more epics for broad gameplay or platform capabilities,
- candidate child stories sliced by concern inside those epics,
- candidate stories in the schema defined by [`24-story-schema.md`](24-story-schema.md),
- flagged ambiguities when the spec is not decisive,
- optional dependency suggestions.

Generated stories are not approved automatically unless the project explicitly adopts an automated approval rule. The default assumption is human approval.

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

### 27-spec-driven-story-generation-workflow.s012 (Minimum viable process)

1. use an agent or script to generate candidate epics and concern-sliced stories from spec sections,
2. run the pre-presentation story-review gate using `corepack pnpm run stories:review-plan -- --parent <stories/generated/...yaml>` or `corepack pnpm run stories:review-plan -- --parent <stories/approved/...yaml>`,
3. review and approve the decomposition and the stories,
4. export approved stories to GitHub issues or draft issues as needed using `tools/spec_board_sync.ts`,
5. build or refresh the checked-in packet for the active story,
6. assign the active-story packet to agents only after worker-ready checks pass,
7. implement or review the story from the packet,
8. validate the resulting patch against the story and spec,
9. after merge to `main`, run the packet completion command to move the completed story to `stories/done/`, mark it `done`, remove its active packet, and clear or replace the active-story manifest before the next story starts. For an explicitly approved parent-story integration branch workflow, reviewed substory commits may land on the parent integration branch first; defer completion until the parent PR lands on `main`, then complete all included substories with the multi-story packet completion command.

### 27-spec-driven-story-generation-workflow.s017 (Pre-presentation story-review gate)

Generated or normalized stories must receive story-review agent review before the parent agent presents them to the human as approval-ready.

Required behavior:

- before story-review assignment, run `corepack pnpm run stories:review-plan -- --parent <stories/generated/...yaml>` or `corepack pnpm run stories:review-plan -- --parent <stories/approved/...yaml>`,
- do not manually choose among single-story, set-level, per-story, or parent/substory story-review paths,
- spawn exactly the review assignments returned by the tool,
- approval-ready means the parent story set has a usable tool-selected story-review result,
- a parent with exactly one child is valid and still uses the parent/substory flow,
- use a story-review agent separate from any implementation worker or implementation patch reviewer,
- story-review agent uses gpt-5.5 with high reasoning,
- story-review findings must be fixed, explicitly deferred, or recorded before presentation,
- do not present a story as approval-ready when no usable story-review agent run exists; present it as unreviewed and blocked on story review instead,
- story-review agents evaluate story authority, decomposition, scope, non-scope, dependencies, allowed touch points, acceptance criteria, required tests, and ambiguity policy,
- story-review agents do not review implementation patches; implementation patch review remains a separate gate.

### 27-spec-driven-story-generation-workflow.s015 (Recommended completion checks for story-driven implementation)

A story should not be marked done unless:

- code behavior matches the cited spec,
- required tests are present and pass,
- repo verification passes,
- the patch stays within the approved story boundary and allowed touch points or the story is updated and re-approved first,
- no prohibited scope creep is introduced,
- any new ambiguity is surfaced explicitly.

After a story is marked done, it should not remain under `stories/approved/`, should not retain an active packet, and should not remain listed in `agent-packets/active.json`. The parent agent owns this cleanup because story state and packet authority are orchestration concerns, not worker or reviewer subagent concerns. Repos should provide a single command for normal single-story completion and a multi-story command for parent-story integration cleanup so story movement, packet removal, and manifest cleanup cannot drift independently. Multi-story cleanup tooling must fail closed when manifest or packet evidence for any listed story is missing or stale.

For parent-story integration branches, substories may remain approved after their reviewed substory commits land on the parent integration branch because the authoritative merge to `main` has not happened yet. This exception is valid only when the parent story set uses parent-level human review, every substory commit has CI, reviewer-subagent review evidence, AI review record, revision response record, and verification evidence bound to the exact commit, and the final parent PR receives full-story integration review plus human review before merge to `main`.

During that parent-branch window, `agent-packets/active.json` remains a single-story handoff pointer for the currently active or most recently active substory packet. It should not be read as the inventory of unfinished substories. Substories merged only into the parent integration branch stay approved and keep their packet files until the parent PR lands on `main`, even when they no longer appear in `active.json`.

Before human review is requested on a parent PR, the PR body or a handoff comment should be updated from future-tense review plans to completed-gate evidence: included substory story path + commit SHA + AI review record + revision response + verification evidence, full-story AI review record, revision response, CI result, repo verification result, remaining human-review requirement, and the post-merge `packets:complete-many` cleanup plan.

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

### 32-codex-agent-integration.s010 (Review flow)

Use a separate reviewer subagent as a fast first-pass reviewer for scope creep, missing tests, and obvious contract drift, but do not treat a passing agent review as authoritative proof of correctness. Human review still owns final acceptance for gameplay correctness and policy-sensitive areas.

Story-review agents are separate from implementation reviewer subagents. Story-review agents review generated or normalized story authority, decomposition, scope, non-scope, dependencies, allowed touch points, acceptance criteria, required tests, and ambiguity policy before human story approval. Implementation reviewer subagents review patches after implementation.

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
future-tense review plan: included substory story path + commit SHA + AI review record + revision response + verification evidence, full-story reviewer-subagent
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

| Role                 | Default model   | Reasoning | Escalation      |
| -------------------- | --------------- | --------- | --------------- |
| Session Orchestrator | `gpt-5.5`       | `high`    | none            |
| story-review         | `gpt-5.5`       | `high`    | none            |
| implementation       | `gpt-5.3-codex` | `medium`  | none by default |
| code-review          | `gpt-5.4`       | `high`    | none            |

Code-review agents must not silently default to `gpt-5.5` with `high` reasoning.

The parent/orchestrator model is gpt-5.5.
Story-review agent model is gpt-5.5 with high reasoning.
Reviewer subagent model is gpt-5.4 with high reasoning.
Implementation worker subagents default to gpt-5.3-codex with medium reasoning.

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

Own only workflow authority, packet role extraction/rendering, a deterministic story-review planning tool, package scripts, and tests needed to make the parent/substory-only execution model internally consistent. Do not change story content for unrelated epics or alter product/runtime behavior.

## Scope

- update canonical workflow specs so every executable story is a child story under a parent, including one-child parents
- remove standalone or single-story execution as a separate approved workflow path
- remove `story-author`, `story-orchestrator`, and `pr-gate` from assignable role lists, role hierarchy text, lifecycle guidance, role routing tables, packet extraction options, and generated packet role sections
- move former story-author, story-orchestrator, and pr-gate responsibilities to Session Orchestrator in workflow docs and packet/tooling guidance
- add a deterministic `stories:review-plan` script backed by `tools/story-review-plan.ts`
- make the review-plan tool read a parent story path and its declared child stories, then output the required story-review assignments and required coverage for the parent set
- update `AGENTS.md` so it explicitly requires agents to use the review-plan tool for story-review path selection and removes prose instructions for choosing between competing review paths
- update the pull request template so it no longer asks for removed role handoffs and instead follows Session Orchestrator ownership
- require workflow docs to tell agents to run the review-plan tool before spawning story-review agents instead of deciding review count from prose
- keep implementation and code-review as assignable post-approval child-story roles
- update review-gate wording so Session Orchestrator owns PR body state, review records, revision responses, checks, cleanup metadata validation, human-review handoff, and post-merge cleanup confirmation
- update tests that assert workflow role hierarchy, role extraction, packet rendering, and cleanup/handoff wording
- add or update tests that fail if `story-orchestrator`, `pr-gate`, or standalone story execution remain as active workflow roles or path choices

## Out of Scope

- changing gameplay, engine, card, server, client, replay, persistence, security, or UI behavior
- changing the story schema fields unless the existing schema cannot express one-child parents
- changing cleanup metadata parser syntax
- bypassing reviewer-subagent review, cleanup metadata guard, human review, or merge gates
- rewriting completed story history or unrelated generated backlog stories
- changing GitHub board sync semantics outside terminology needed by this workflow rewrite

## Allowed Touch Points

<!-- prettier-ignore -->
- AGENTS.md
- docs/workflow/story-execution.md
- docs/workflow/parent-integration-branches.md
- docs/workflow/review-gate.md
- docs/code-standard.md
- specs/26-agent-packet-template.md
- specs/27-spec-driven-story-generation-workflow.md
- specs/32-codex-agent-integration.md
- specs/spec-manifest.json
- specs/section-index.json
- .github/pull_request_template.md
- tools/agent-packet-parser.ts
- tools/agent-packet-renderer.ts
- tools/build-agent-packet.ts
- tools/story-review-plan.ts
- tools/tsconfig.json
- package.json
- tests/contracts/agent-packet-extraction-contract.test.mjs
- tests/contracts/agent-packet-rendering-contract.test.mjs
- tests/contracts/story-review-plan-contract.test.mjs
- tests/github/review-workflow.test.mjs
- tests/contracts/spec-authority-gates.test.mjs
- stories/generated/INF-047A-collapse-agent-workflow-to-parent-substory-only.yaml
- stories/approved/INF-047A-collapse-agent-workflow-to-parent-substory-only.yaml
- agent-packets/INF-047A.md
- agent-packets/active.json

## Constraints

- update every authority layer touched by the removed workflow roles in the same change
- keep the rewrite terminology consistent; do not leave transitional aliases for `story-author`, `story-orchestrator`, or `pr-gate`
- do not remove reviewer-subagent review, cleanup metadata validation, human review, or post-merge cleanup requirements
- do not broaden into product behavior or unrelated workflow features
- use `corepack pnpm`, not plain `pnpm`, when running repo commands in this environment
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

- one combined bootstrap story-review for INF-047 parent and INF-047A child before approval because this story adds the review-plan tool
- focused contract tests for `tools/story-review-plan.ts` covering one-child and multi-child parent stories
- focused workflow contract tests proving removed role names are rejected by packet extraction
- focused packet rendering tests proving generated packets include only implementation and code-review post-approval role sections
- focused workflow documentation tests proving parent/substory-only execution, review-plan tool usage, and Session Orchestrator ownership
- run `corepack pnpm exec vitest run tests/contracts/story-review-plan-contract.test.mjs tests/contracts/agent-packet-extraction-contract.test.mjs tests/contracts/agent-packet-rendering-contract.test.mjs tests/contracts/spec-authority-gates.test.mjs tests/github/review-workflow.test.mjs`
- run `corepack pnpm run stories:validate`
- full `corepack pnpm verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- canonical specs, `AGENTS.md`, workflow docs, packet tooling, and workflow tests agree that parent/substory integration is the only story execution path
- a parent with exactly one child is explicitly valid and is the way to represent work that does not need decomposition
- `story-author`, `story-orchestrator`, and `pr-gate` are not accepted by packet extraction and do not appear as assignable workflow roles
- `AGENTS.md` directs agents to the review-plan tool for story-review path selection and contains no competing instructions for choosing story-review topology
- the repo provides a `corepack pnpm run stories:review-plan -- --parent <path>` command that prints the story-review assignments for the parent and declared child stories
- story-review docs require agents to follow review-plan tool output instead of choosing between prose-defined review paths
- Session Orchestrator duties explicitly include child activation, packet freshness, implementation assignment, review assignment, PR evidence, cleanup metadata validation, human-review handoff, merge readiness, and post-merge cleanup confirmation
- implementation and code-review role extraction still work for active child packets
- tests prove workflow authority no longer exposes two execution paths or the removed roles

## Post-Approval Role Sections

### implementation

Responsibilities
- implement only the approved story using packet authority order
- follow strict TypeScript, lint, and verification requirements
- report ambiguity instead of inventing uncited behavior

Forbidden Actions
- do not broaden scope beyond the approved story boundary or allowed_touch_points
- do not add packet extraction behavior unless the approved story explicitly owns it
- do not implement story-author/story-review handoff mechanics

Required Inputs
- active packet content with authoritative spec references
- approved story scope, non-scope, and acceptance criteria
- allowed_touch_points and required test list

Required Outputs
- scoped code and test changes within approved touch points
- verification command results with pass/fail status
- assumptions and blockers note

Verification Checklist
- confirm required inputs are present and current
- confirm forbidden actions are not introduced
- confirm required outputs are produced for handoff

### code-review

Responsibilities
- review correctness, scope fit, and required-test coverage
- verify no forbidden role sections or lifecycle changes were introduced
- confirm canonical packet behavior remains enforceable

Forbidden Actions
- do not author new feature scope outside the reviewed patch
- do not bypass required tests, packet verification, or CI gate evidence
- do not approve scope drift that violates story boundary

Required Inputs
- proposed patch limited to approved touch points
- active packet, approved story, and cited spec references
- verification and test evidence for required commands

Required Outputs
- review findings prioritized by correctness and scope compliance
- clear disposition for findings (fix/defer/block) with rationale
- review closure recommendation for Session Orchestrator handoff

Verification Checklist
- confirm required inputs are present and current
- confirm forbidden actions are not introduced
- confirm required outputs are produced for handoff

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

<!-- prettier-ignore-end -->
