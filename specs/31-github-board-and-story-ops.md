---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "31-github-board-and-story-ops"
doc_title: "GitHub Board And Story Operations"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# GitHub Board and Story Operations

<!-- SECTION_REF: 31-github-board-and-story-ops.s001 -->

Section Ref: `31-github-board-and-story-ops.s001`

This document defines the canonical mapping from approved spec-derived stories into GitHub Issues, Projects, and board workflows.

The goal is to let teams turn spec sections into online-board work items without re-inventing structure by hand.

## Core rule

<!-- SECTION_REF: 31-github-board-and-story-ops.s002 -->

Section Ref: `31-github-board-and-story-ops.s002`

The approved story file remains the authoritative delivery artifact below the specification. A GitHub issue or project card is a synchronized projection of that story, not a replacement authority.

The reference repo workflow uses `tools/spec_board_sync.ts` to produce or update that projection and stores sync metadata under `stories/.sync/`.

If the board card, issue body, labels, or project fields drift from the approved story file, the approved story file wins and the board item must be corrected by rerunning sync or editing the story first.

## Canonical projection model

<!-- SECTION_REF: 31-github-board-and-story-ops.s003 -->

Section Ref: `31-github-board-and-story-ops.s003`

Recommended mapping:

- epic -> parent issue representing one gameplay or platform capability,
- concern-sliced approved story -> issue,
- optional implementation subtasks -> sub-issues,
- blocking relationships -> GitHub issue dependencies,
- current planning view -> GitHub Project board/table/roadmap views,
- implementation packet -> markdown artifact linked from the issue body or comments.

## Story-to-GitHub field mapping

<!-- SECTION_REF: 31-github-board-and-story-ops.s004 -->

Section Ref: `31-github-board-and-story-ops.s004`

| Story field            | GitHub destination                             | Notes                                                                |
| ---------------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| `id`                   | issue title prefix and `Story ID` field        | Example: `[ENG-012] Implement mulligan waiting-state clock behavior` |
| `epic_id`              | parent issue link and optional `Epic ID` field | Use the same value across all stories in one capability thread       |
| `title`                | issue title/body                               | Keep title identical to story                                        |
| `summary`              | issue body                                     | Keep first paragraph short                                           |
| `type`                 | label and optional `Type` field                | Example labels: `type:implementation`, `type:ambiguity`              |
| `area`                 | label and optional `Area` field                | Example labels: `area:engine`, `area:server`                         |
| `primary_concern`      | label and optional `Primary Concern` field     | Example labels: `concern:rules`, `concern:protocol`                  |
| `priority`             | single-select project field or label           | Prefer a project field when available                                |
| `status`               | project `Status` field                         | Source-of-truth for execution state on board                         |
| `story_boundary`       | dedicated issue section                        | Keep the stopping point visible to implementers and reviewers        |
| `spec_refs`            | dedicated issue section                        | Preserve stable `SECTION_REF` citations                              |
| `allowed_touch_points` | dedicated issue section and sync metadata      | Future automation hook for story-to-PR drift detection               |
| `dependencies`         | issue dependencies and/or body section         | Prefer native issue dependencies where available                     |
| `acceptance_criteria`  | markdown checklist                             | Keep each criterion individually reviewable                          |
| `required_tests`       | body section and review checklist              | Required for implementation stories                                  |
| `ambiguity_policy`     | body section and agent packet                  | Must survive export unchanged                                        |

## Recommended issue labels

<!-- SECTION_REF: 31-github-board-and-story-ops.s005 -->

Section Ref: `31-github-board-and-story-ops.s005`

Recommended label families:

- `type:*`
- `area:*`
- `concern:*`
- `priority:*`
- `status:*` only if your project board does not already own status
- `risk:hidden-info`, `risk:determinism`, `risk:replay`, `risk:security` where relevant
- `needs:clarification` for ambiguity stories

Keep labels low-cardinality and stable. Do not encode large freeform payloads in labels.

## Recommended project fields

<!-- SECTION_REF: 31-github-board-and-story-ops.s006 -->

Section Ref: `31-github-board-and-story-ops.s006`

Recommended GitHub Project fields for a public or mixed-visibility setup:

- `Status` (single select)
- `Priority` (single select)
- `Area` (single select)
- `Type` (single select)
- `Primary Concern` (single select)
- `Estimate` (number or single select)
- `Spec Version` (text)
- `Epic ID` (text)
- `Story ID` (text)
- `Iteration` (iteration)
- `Target Date` (date)
- `Blocked` (single select or derived from dependencies)

For public projects, prefer project custom fields plus labels. Do not make your workflow depend on organization issue fields unless you know you are operating in private projects that support them.

## Parent/child and dependency rules

<!-- SECTION_REF: 31-github-board-and-story-ops.s007 -->

Section Ref: `31-github-board-and-story-ops.s007`

Use parent issues for epics and native sub-issues only when the child work is genuinely part of the same top-level outcome. The parent should describe the gameplay or platform capability. The child stories should each own one primary concern inside that capability. Use issue dependencies for blocking relationships that are not parent/child in nature.

Examples:

- `MUL-001 mulligan flow` -> parent issue
- `CON-001 mulligan state and event contract` -> child/sub-issue of that epic
- `ENG-012 mulligan waiting-state clock behavior` -> child/sub-issue of that epic
- `CLI-002 mulligan prompt handling in terminal runner` -> child/sub-issue of that epic
- `ENG-012` blocked by `CON-001` -> issue dependency

Do not create a single child story that mixes contract, engine, server, and client work only because they all support the same epic.

## Canonical issue body shape

<!-- SECTION_REF: 31-github-board-and-story-ops.s008 -->

Section Ref: `31-github-board-and-story-ops.s008`

Every exported issue should contain these sections in this order:

1. Epic / Concern
2. Summary
3. Authoritative Spec References
4. Story Boundary
5. Scope
6. Out of Scope
7. Allowed Touch Points
8. Dependencies
9. Acceptance Criteria
10. Required Tests
11. Repo Rules
12. Ambiguity Policy
13. Packet / implementation links

## Example issue body

<!-- SECTION_REF: 31-github-board-and-story-ops.s009 -->

Section Ref: `31-github-board-and-story-ops.s009`

```md
## Epic / Concern

- Epic ID: MUL-001
- Area: engine
- Primary Concern: rules

## Summary

Implement mulligan waiting-state progression with no separate mulligan timer.

## Authoritative Spec References

- 07-match-server-protocol.s010 (Timers)
- 11-testing-quality.s013 (Protocol tests)
- 18-acceptance-tests.s021 (Milestone 1 - terminal engine)

## Story Boundary

Own deterministic mulligan waiting-state progression and clock drain rules in engine-core only.
Do not add reconnect handling, protocol envelopes, or client UX.

## Scope

- add mulligan submitted and waiting states to engine flow
- drain only the blocking player's game clock
- preserve replayable event output if already defined for this phase

## Out of Scope

- reconnect behavior
- client UX polish
- new spectator features

## Allowed Touch Points

- packages/engine-core/\*\*
- tests/engine/\*\*
- fixtures/replays/\*\*

## Dependencies

- CON-001
- ENG-003

## Acceptance Criteria

- [ ] no separate mulligan timer exists
- [ ] only the player currently preventing progression loses clock time
- [ ] if neither player is preventing progression, no player clock drains
- [ ] a player loses if their clock reaches zero during this phase

## Required Tests

- unit test for each mulligan state combination
- integration test for end-to-end mulligan progression
- replay/event assertion if mulligan events are journaled

## Repo Rules

- must pass pnpm verify
- engine behavior must remain deterministic
- no hidden-information leakage is allowed

## Ambiguity Policy

fail_and_escalate

## Packet / implementation links

- packet: agent-packets/ENG-012.md
```

## Automation contract

<!-- SECTION_REF: 31-github-board-and-story-ops.s010 -->

Section Ref: `31-github-board-and-story-ops.s010`

Before creating or updating a GitHub issue from a story file, automation should:

1. validate the story against [`contracts/story.schema.json`](contracts/story.schema.json),
2. verify that every cited `spec_ref` exists in `section-index.json`,
3. verify that `epic_id`, `primary_concern`, `story_boundary`, and `allowed_touch_points` are present,
4. render the canonical issue body shape,
5. create or update dependencies,
6. add the issue to the target project,
7. set project fields and labels,
8. persist the created issue URL or issue number back onto the story file or adjacent metadata.

The checked-in reference implementation for this contract is `node --experimental-strip-types tools/spec_board_sync.ts`. It reads approved stories, resolves `spec_refs`, renders the canonical issue body, syncs issues and project fields through GitHub CLI/GraphQL when configured, and writes per-story metadata to `stories/.sync/<STORY_ID>.github.json`.

## Human approval boundary

<!-- SECTION_REF: 31-github-board-and-story-ops.s011 -->

Section Ref: `31-github-board-and-story-ops.s011`

Default recommendation: use `--dry-run --write-preview` first when changing templates or field mappings, then perform live issue sync. Generate draft issues automatically if desired, but require human approval before they are marked `approved` or assigned to an implementation agent.

If the sync preview shows one child story absorbing multiple concerns, treat that as a story-decomposition failure and fix the story files before live sync.

## Project templates and reuse

<!-- SECTION_REF: 31-github-board-and-story-ops.s012 -->

Section Ref: `31-github-board-and-story-ops.s012`

When multiple repos or seasons use the same workflow, create a reusable GitHub Project template with the same views, fields, and workflows so the board setup itself is standardized alongside the story schema.
