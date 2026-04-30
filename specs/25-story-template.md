---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "25-story-template"
doc_title: "Story Template"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Approved Story Template

<!-- SECTION_REF: 25-story-template.s001 -->

Section Ref: `25-story-template.s001`

This document provides the standard story template to use after a generated story is accepted into the approved backlog.

The goal of the template is consistency. Stories should not vary widely in format, because inconsistency makes automation and agent assignment harder.

## Usage rules

<!-- SECTION_REF: 25-story-template.s002 -->

Section Ref: `25-story-template.s002`

- Keep the story tightly scoped.
- Model broad gameplay or platform work as an epic, then write one approved story per concern inside that epic.
- Cite the authoritative spec sections.
- State explicit non-scope.
- Declare the story boundary and the allowed touch points up front.
- Require tests in the same story.
- Treat raw diff size as a warning signal only; the primary split rule is concern boundary.
- Use `fail_and_escalate` when ambiguity would affect rules correctness, hidden information, replay integrity, fairness, or account/persistence safety.

## Copy-ready template

<!-- SECTION_REF: 25-story-template.s003 -->

Section Ref: `25-story-template.s003`

```yaml
spec_version: v6
spec_package_name: optcg-md-specs-v6
story_schema_version: 1.0.0
id: AREA-XXX
epic_id: EPIC-XXX
title: <single-sentence story title>
type: <design|implementation|verification|refactor|tooling|ambiguity>
area: <contracts|engine|cards|server|client|replay|database|infra|docs|security>
primary_concern: <contract|rules|view|protocol|persistence|tooling|ui|cli|docs|verification>
priority: <critical|high|medium|low>
status: approved
summary: >
  <brief explanation of why the story exists and what it should accomplish>
story_boundary: >
  <what this story owns and where it must stop>
allowed_touch_points:
  - <package/path/module expected to change>
  - <package/path/module expected to change>
spec_refs:
  - <doc_id.sNNN (Heading)>
  - <doc_id.sNNN (Heading)>
scope:
  - <specific deliverable>
  - <specific deliverable>
non_scope:
  - <explicitly excluded item>
  - <explicitly excluded item>
dependencies:
  - <story id, contract, or prerequisite>
acceptance_criteria:
  - <observable completion condition>
  - <observable completion condition>
required_tests:
  - <unit/integration/contract/replay/visibility test requirement>
  - <unit/integration/contract/replay/visibility test requirement>
repo_rules:
  - must pass pnpm verify
  - must follow package boundary rules
  - must not introduce hidden-information leakage
ambiguity_policy: <fail_and_escalate|implement_if_clearly_implied>
```

## Author guidance

<!-- SECTION_REF: 25-story-template.s004 -->

Section Ref: `25-story-template.s004`

### Title

<!-- SECTION_REF: 25-story-template.s005 -->

Section Ref: `25-story-template.s005`

The title should describe one main behavior change or one main deliverable. Avoid broad titles such as `Implement spectator mode` or `Build game flow`.

### Scope

<!-- SECTION_REF: 25-story-template.s006 -->

Section Ref: `25-story-template.s006`

Scope should be concrete enough that two reviewers would expect roughly the same patch from the same story.

### Non-scope

<!-- SECTION_REF: 25-story-template.s007 -->

Section Ref: `25-story-template.s007`

Non-scope should be explicit whenever a nearby concern exists that an agent might be tempted to include.

### Acceptance criteria

<!-- SECTION_REF: 25-story-template.s008 -->

Section Ref: `25-story-template.s008`

Acceptance criteria should describe behavior, not internal aspirations. Write them so a reviewer or test author can verify them.

### Required tests

<!-- SECTION_REF: 25-story-template.s009 -->

Section Ref: `25-story-template.s009`

The default assumption is that implementation work includes tests. If a story does not require tests, that must be justified explicitly.

## Example approved story

<!-- SECTION_REF: 25-story-template.s010 -->

Section Ref: `25-story-template.s010`

```yaml
id: ENG-012
epic_id: MUL-001
title: Implement mulligan waiting-state clock behavior
type: implementation
area: engine
primary_concern: rules
priority: high
status: approved
summary: >
  Implement mulligan waiting-state progression with no separate mulligan timer.
story_boundary: >
  Own deterministic mulligan waiting-state progression and clock drain rules in engine-core only.
  Do not add reconnect handling, protocol envelopes, or client UX.
allowed_touch_points:
  - packages/engine-core/**
  - tests/engine/**
  - fixtures/replays/**
spec_refs:
  - 07-match-server-protocol.s010 (Timers)
  - 11-testing-quality.s013 (Protocol tests)
  - 18-acceptance-tests.s021 (Milestone 1 - terminal engine)
scope:
  - add mulligan submitted and waiting states to engine flow
  - drain only the blocking player's game clock
  - preserve replayable event output if already defined for this phase
non_scope:
  - reconnect behavior
  - client UX polish
  - new spectator features
dependencies:
  - CON-001
  - ENG-003
acceptance_criteria:
  - no separate mulligan timer exists
  - only the player currently preventing progression loses clock time
  - if neither player is preventing progression, no player clock drains
  - a player loses if their clock reaches zero during this phase
required_tests:
  - unit test for each mulligan state combination
  - integration test for end-to-end mulligan progression
  - replay/event assertion if mulligan events are journaled
repo_rules:
  - must pass pnpm verify
  - engine behavior must remain deterministic
  - no hidden-information leakage is allowed
ambiguity_policy: fail_and_escalate
```

## Boundary guidance

<!-- SECTION_REF: 25-story-template.s011 -->

Section Ref: `25-story-template.s011`

### Epic first, concern second

<!-- SECTION_REF: 25-story-template.s012 -->

Section Ref: `25-story-template.s012`

Use gameplay or platform capabilities as epics. Approved stories inside that epic should usually implement one concern such as contract, rules, view, protocol, persistence, tooling, UI, CLI, docs, or verification.

### Allowed touch points

<!-- SECTION_REF: 25-story-template.s013 -->

Section Ref: `25-story-template.s013`

List the minimum implementation surfaces expected to change. If the touch-point list naturally spans multiple unrelated layers with different reviewer mindsets, split the story unless the coupling is narrow, explicit, and still reviewable as one concern.
