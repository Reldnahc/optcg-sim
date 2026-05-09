---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "27-spec-driven-story-generation-workflow"
doc_title: "Spec Driven Story Generation Workflow"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Spec-Driven Story Generation Workflow

<!-- SECTION_REF: 27-spec-driven-story-generation-workflow.s001 -->

Section Ref: `27-spec-driven-story-generation-workflow.s001`

This document defines how the specification should be converted into epics, stories, and agent-ready packets.

The goal is to make the delivery workflow spec-driven instead of manager-memory-driven.

## Workflow summary

<!-- SECTION_REF: 27-spec-driven-story-generation-workflow.s002 -->

Section Ref: `27-spec-driven-story-generation-workflow.s002`

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

## Authority order

<!-- SECTION_REF: 27-spec-driven-story-generation-workflow.s003 -->

Section Ref: `27-spec-driven-story-generation-workflow.s003`

For planning and execution:

1. specification documents,
2. approved story,
3. agent packet,
4. implementation patch,
5. generated summaries or reports.

If a lower layer conflicts with a higher layer, the higher layer wins.

## Story generation inputs

<!-- SECTION_REF: 27-spec-driven-story-generation-workflow.s004 -->

Section Ref: `27-spec-driven-story-generation-workflow.s004`

At minimum, story generation should read:

- relevant spec markdown files,
- implementation-tightening notes,
- repo tooling requirements,
- code standards and architecture constraints,
- any contract files required by the section being converted.
- for platform and competitive stories, the game-type and format policy docs (`29-...` and `30-...`).

Story generation should prefer exact section references instead of vague file-level citations whenever practical.

## Story generation outputs

<!-- SECTION_REF: 27-spec-driven-story-generation-workflow.s005 -->

Section Ref: `27-spec-driven-story-generation-workflow.s005`

The generation step should produce:

- one or more epics for broad gameplay or platform capabilities,
- candidate child stories sliced by concern inside those epics,
- candidate stories in the schema defined by [`24-story-schema.md`](24-story-schema.md),
- flagged ambiguities when the spec is not decisive,
- optional dependency suggestions.

Generated stories are not approved automatically unless the project explicitly adopts an automated approval rule. The default assumption is human approval.

## Story generation prompt contract

<!-- SECTION_REF: 27-spec-driven-story-generation-workflow.s006 -->

Section Ref: `27-spec-driven-story-generation-workflow.s006`

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

## Story normalization rules

<!-- SECTION_REF: 27-spec-driven-story-generation-workflow.s007 -->

Section Ref: `27-spec-driven-story-generation-workflow.s007`

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

## Pre-presentation story-review gate

<!-- SECTION_REF: 27-spec-driven-story-generation-workflow.s017 -->

Section Ref: `27-spec-driven-story-generation-workflow.s017`

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

## Approval rules

<!-- SECTION_REF: 27-spec-driven-story-generation-workflow.s008 -->

Section Ref: `27-spec-driven-story-generation-workflow.s008`

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

## Agent packet generation

<!-- SECTION_REF: 27-spec-driven-story-generation-workflow.s009 -->

Section Ref: `27-spec-driven-story-generation-workflow.s009`

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

## Suggested repo layout

<!-- SECTION_REF: 27-spec-driven-story-generation-workflow.s010 -->

Section Ref: `27-spec-driven-story-generation-workflow.s010`

A recommended structure is:

```text
/spec/
/epics/
/stories/generated/
/stories/approved/
/stories/blocked/
/stories/done/
/stories/ambiguities/
/agent-packets/
/.github/ISSUE_TEMPLATE/
/.agents/skills/
/AGENTS.md
/tools/generate-stories.ts
/tools/normalize-stories.ts
/tools/build-agent-packet.ts
/tools/spec_board_sync.ts
/tools/github-board.config.example.json
/tools/trace-spec-impact.ts
```

The exact paths may differ, but the concepts should remain recognizable.

## Recommended automation layers

<!-- SECTION_REF: 27-spec-driven-story-generation-workflow.s011 -->

Section Ref: `27-spec-driven-story-generation-workflow.s011`

### Minimum viable process

<!-- SECTION_REF: 27-spec-driven-story-generation-workflow.s012 -->

Section Ref: `27-spec-driven-story-generation-workflow.s012`

1. use an agent or script to generate candidate epics and concern-sliced stories from spec sections,
2. run the pre-presentation story-review gate,
3. review and approve the decomposition and the stories,
4. export approved stories to GitHub issues or draft issues as needed using `tools/spec_board_sync.ts`,
5. build or refresh the checked-in packet for the active story,
6. assign the active-story packet to agents only after worker-ready checks pass,
7. implement or review the story from the packet,
8. validate the resulting patch against the story and spec,
9. after merge to `main`, run the packet completion command to move the completed story to `stories/done/`, mark it `done`, remove its active packet, and clear or replace the active-story manifest before the next story starts. For an explicitly approved parent-story integration branch workflow, substory PRs may merge into the parent integration branch first; defer completion until the parent PR lands on `main`, then complete all included substories with the multi-story packet completion command.

### Stronger process

<!-- SECTION_REF: 27-spec-driven-story-generation-workflow.s013 -->

Section Ref: `27-spec-driven-story-generation-workflow.s013`

Add:

- dependency graphing,
- impacted-story detection when spec files change,
- schema validation for story files,
- required pre-presentation story-review agents for generated and normalized stories,
- review-agent checks for scope creep, cross-concern drift, and uncited behavior,
- story-to-PR boundary checks using `allowed_touch_points`,
- automatic movement between `generated`, `approved`, `blocked`, and `done` states,
- metadata writeback for synced GitHub issues and project items under `stories/.sync/`.

## Spec change impact tracing

<!-- SECTION_REF: 27-spec-driven-story-generation-workflow.s014 -->

Section Ref: `27-spec-driven-story-generation-workflow.s014`

Because stories cite spec sections, a later tooling step should be able to detect which approved or completed stories may be stale when a cited spec section changes.

Required principle:

- if a spec section changes materially, stories that cite it should be reviewed for drift.

## Recommended completion checks for story-driven implementation

<!-- SECTION_REF: 27-spec-driven-story-generation-workflow.s015 -->

Section Ref: `27-spec-driven-story-generation-workflow.s015`

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

A commit that contains only the exact file changes produced by the packet completion command is a generated lifecycle cleanup and does not need a separate reviewer-subagent pass. Run the repo verification command before pushing that cleanup. If cleanup requires any manual edit beyond the command output, including edits to packet files, `agent-packets/active.json`, tooling, tests, fixtures, specs, workflow docs, or story files, it is no longer pure generated cleanup and should receive the normal reviewer-subagent pass before push or merge.

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
and repo-approved verification passes. The automation must not open a cleanup
pull request. Manual fallback is only for operational failure, not the normal
path. Branch deletion may run only after packet lifecycle cleanup succeeds and
only for associated merged, unprotected story or substory branches.

## First practical adoption step

<!-- SECTION_REF: 27-spec-driven-story-generation-workflow.s016 -->

Section Ref: `27-spec-driven-story-generation-workflow.s016`

Before broad agent assignment begins, generate the first approved backlog from:

- `15-implementation-kickoff.md`,
- `22-v6-implementation-tightening.md`,
- `23-repo-tooling-and-enforcement.md`,
- `29-game-types-queues-and-lobbies.md`,
- `30-formats-and-ranked-competition.md`,
- the core engine, visibility, replay, and server sections.

That initial backlog should cover tooling, contracts, engine state, visibility safety, replay contracts, protocol foundation, and the platform/competitive scaffolding for queues, lobbies, formats, ladders, and disconnect discipline before large-scale feature work is assigned.
