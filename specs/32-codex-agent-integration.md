---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "32-codex-agent-integration"
doc_title: "Codex Agent Integration"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Codex Agent Integration

<!-- SECTION_REF: 32-codex-agent-integration.s001 -->

Section Ref: `32-codex-agent-integration.s001`

This document defines how the spec-driven story system should integrate with Codex and similar code agents.

## Design goal

<!-- SECTION_REF: 32-codex-agent-integration.s002 -->

Section Ref: `32-codex-agent-integration.s002`

Agents should receive just enough authoritative context to complete one constrained story safely, with the specification still serving as the root authority.

## Required repo artifacts

<!-- SECTION_REF: 32-codex-agent-integration.s003 -->

Section Ref: `32-codex-agent-integration.s003`

A repo using this workflow should check in:

- `AGENTS.md` at repo root,
- approved story files validated by [`contracts/story.schema.json`](contracts/story.schema.json),
- agent packets generated from approved stories,
- `agent-packets/active.json` or an equivalent checked-in manifest for active stories when packet enforcement is enabled,
- the board sync tool `tools/spec_board_sync.ts`,
- board sync metadata under `stories/.sync/`,
- optional Codex skills under [`.agents/skills/`](.agents/skills/) for repeatable workflows.

## Authority order for Codex tasks

<!-- SECTION_REF: 32-codex-agent-integration.s004 -->

Section Ref: `32-codex-agent-integration.s004`

For Codex execution:

1. cited specification sections,
2. approved story file,
3. generated agent packet,
4. checked-in repo instructions in `AGENTS.md`,
5. local code reality,
6. proposed patch.

If a lower layer conflicts with a higher one, the higher layer wins.

## Context-minimization rule

<!-- SECTION_REF: 32-codex-agent-integration.s005 -->

Section Ref: `32-codex-agent-integration.s005`

Do not hand the full spec to Codex unless the task genuinely spans many systems. Prefer a minimal packet with exact section refs, exact acceptance criteria, non-scope, and required tests.

## Root AGENTS contract

<!-- SECTION_REF: 32-codex-agent-integration.s006 -->

Section Ref: `32-codex-agent-integration.s006`

`AGENTS.md` should tell Codex:

- where the spec lives,
- how to find approved stories and packets,
- that section refs are the canonical citation keys,
- that gameplay, visibility, replay, fairness, and persistence ambiguity must fail closed,
- what verification commands to run before claiming completion,
- how to format assumptions, blockers, and implementation notes,
- that GitHub issue and board projection should run through `tools/spec_board_sync.ts` and write metadata to `stories/.sync/`.

## Skill usage model

<!-- SECTION_REF: 32-codex-agent-integration.s007 -->

Section Ref: `32-codex-agent-integration.s007`

Use root-level Codex skills for repeatable task classes such as:

- implement one approved story,
- review one patch against a story,
- orchestrate worker and reviewer subagents around one approved story,
- sync approved stories into GitHub issue bodies and board fields,
- raise ambiguity issues when cited sections do not decide behavior.

A skill should accelerate a workflow, not replace the authoritative story or packet.

## Recommended execution flow

<!-- SECTION_REF: 32-codex-agent-integration.s008 -->

Section Ref: `32-codex-agent-integration.s008`

1. Approve a story.
2. Generate or refresh the checked-in packet for the active story.
3. Run `node --experimental-strip-types tools/spec_board_sync.ts --story <path> --dry-run --write-preview`, then perform live sync when ready.
4. Verify that the active story packet is present and current before worker assignment, reviewer assignment, or PR handoff.
5. Have a parent Codex agent read the story, packet, and `AGENTS.md`, stay mostly in orchestration mode, and remain the owner of story authority, scope decisions, ambiguity handling, and review handoff.
6. Spawn a worker subagent for the main implementation body of the story whenever delegation is available.
7. Allow the parent agent to do only small local glue work such as rebases, tiny integration edits, verification reruns, and PR administration.
8. Follow the subagent model routing policy.
9. Require tests and a short assumptions/blockers note.
10. Link the pull request back to the story issue.
11. Spawn a separate reviewer subagent plus human review before merge.
12. After merge, have the parent agent run the packet completion command to move
    the completed story to done history, remove the active packet, and clear or
    replace the active packet manifest before starting the next story.

## Codex packet footer

<!-- SECTION_REF: 32-codex-agent-integration.s009 -->

Section Ref: `32-codex-agent-integration.s009`

Recommended footer for implementation tasks:

```text
Implement only the approved story.
Do not invent uncited behavior.
Keep changes inside the declared scope.
Run or update the required tests.
List any assumptions explicitly.
If the spec is ambiguous, stop at the narrowest safe point and open/append an ambiguity note.
```

## Review flow

<!-- SECTION_REF: 32-codex-agent-integration.s010 -->

Section Ref: `32-codex-agent-integration.s010`

Use a separate reviewer subagent as a fast first-pass reviewer for scope creep, missing tests, and obvious contract drift, but do not treat a passing agent review as authoritative proof of correctness. Human review still owns final acceptance for gameplay correctness and policy-sensitive areas.

## GitHub-connected modes

<!-- SECTION_REF: 32-codex-agent-integration.s011 -->

Section Ref: `32-codex-agent-integration.s011`

Codex may be used in several complementary ways:

- a parent agent orchestrating work against a checked-out repo,
- worker subagents implementing approved stories,
- reviewer subagents reviewing diffs against the PR base branch,
- optional GitHub-connected or cloud task execution when that surface exists.

These modes should share the same story, packet, and `AGENTS.md` guidance so the execution rules do not vary by surface.

## Minimal task prompt

<!-- SECTION_REF: 32-codex-agent-integration.s012 -->

Section Ref: `32-codex-agent-integration.s012`

```text
Implement approved story <STORY-ID> from stories/approved/<PATH>.story.yaml.
Read AGENTS.md first.
Use the corresponding packet under agent-packets/ as the constrained execution packet.
Do not exceed story scope.
Run the required tests and report exact files changed, tests run, and any ambiguity surfaced.
```

For delegated execution, the parent agent should pass this prompt to the worker
subagent together with explicit file ownership and test ownership.

## Merge gate recommendation

<!-- SECTION_REF: 32-codex-agent-integration.s013 -->

Section Ref: `32-codex-agent-integration.s013`

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

## Subagent model routing

<!-- SECTION_REF: 32-codex-agent-integration.s014 -->

Section Ref: `32-codex-agent-integration.s014`

The parent/orchestrator model is gpt-5.5.

Reviewer subagent model is gpt-5.4 with high reasoning.

Implementation worker subagents default to gpt-5.3-codex with medium reasoning.

Complex, risky, or integration-heavy implementation stories should use gpt-5.5 with medium reasoning.

Any model-routing deviation must be recorded in the pull-request review trail and implementation note.

Documentation-only authority edits should be handled by the parent agent directly. Authority edits still require separate reviewer subagent review, tests when applicable, and full verification before PR handoff.
