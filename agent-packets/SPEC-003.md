<!-- agent-packet:story-id SPEC-003 -->
<!-- agent-packet:story-path stories/approved/SPEC-003-authorize-source-repository-publication.yaml -->
<!-- agent-packet:story-sha256 142fd7f1ca7a347546088c644d587593978aae738f7a515b0d63256ee074d401 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: SPEC-003
Epic ID: KICK-001
Title: Authorize source repository publication
Type: specification
Area: docs
Primary Concern: contract

## Why

Add explicit specification authority for licensing this repository's own source code under MIT and making the source repository public without treating that action as a public simulator launch.

## Authoritative Spec References

- 13-content-publication-policy.s002 (Purpose)
- 13-content-publication-policy.s006 (Trademarks and branding)
- 13-content-publication-policy.s008 (Takedown process)
- 13-content-publication-policy.s010 (Launch blockers)
- 13-content-publication-policy.s011 (Practical recommendation)
- 28-machine-readable-conventions.s008 (Stable heading usage)
- 28-machine-readable-conventions.s009 (Section index)
- 28-machine-readable-conventions.s011 (Change-management rules)
- 27-spec-driven-story-generation-workflow.s012 (Minimum viable process)
- 32-codex-agent-integration.s004 (Authority order for Codex tasks)
- 32-codex-agent-integration.s008 (Recommended execution flow)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 13-content-publication-policy.s002 (Purpose)

A public simulator using official card names, text, images, set symbols, and trademarks carries legal and platform risk. This document is not legal advice. It is a product-risk checklist to resolve before public launch.

### 13-content-publication-policy.s006 (Trademarks and branding)

Avoid using official logos or names in a way that implies endorsement.

Checklist:

- App name does not imply official status.
- Landing page says the project is unofficial/fan-made if appropriate.
- No official logos in app branding unless permission is obtained.
- No monetization claim tied to official IP without review.

### 13-content-publication-policy.s008 (Takedown process)

Before public launch, define:

- Contact email.
- Takedown review process.
- How to disable specific images/assets quickly.
- How to run text-only mode if image use is challenged.
- Logging of removed content.

### 13-content-publication-policy.s010 (Launch blockers)

Do not launch public ranked/tournament play until these decisions are made:

- Image handling mode selected.
- Branding reviewed.
- Takedown contact/process exists.
- Text-only fallback works.
- Source-card outage behavior is clear.
- Terms/community rules cover user conduct and content.

### 13-content-publication-policy.s011 (Practical recommendation)

For early development:

1. Build the engine and gameplay without relying on official images.
2. Support generic card rendering from metadata.
3. Keep card-image handling behind a feature flag.
4. Do not monetize.
5. Add text-only/proxy mode before public alpha.

This keeps the engine work unblocked while leaving room to adjust content strategy before public exposure.

### 28-machine-readable-conventions.s008 (Stable heading usage)

Every heading in every Markdown document must be followed immediately by both of the following machine-readable lines:

```text
<!-- SECTION_REF: <doc_id>.sNNN -->
Section Ref: `<doc_id>.sNNN`
```

Where:

- `<doc_id>` is the file-level stable document identifier from YAML front matter
- `sNNN` is the zero-padded section sequence within that document
- the HTML comment is the primary machine-readable marker
- the visible `Section Ref:` line is the human-verifiable marker

Consumers should prefer `section_ref` identifiers over raw heading text whenever available.

Preferred reference formats:

```text
00-project-overview.s004
00-project-overview.s004 (Product scope)
```

Fallback format when a section ref is unavailable should be:

```text
doc_id#Exact Heading Text
```

Do not rely on renderer-specific generated anchor slugs as the sole reference key. In v6, derived story files, issue bodies, board cards, and agent packets should default to `doc_id.sNNN (Heading)` citations.

### 28-machine-readable-conventions.s009 (Section index)

This package includes a generated `section-index.json` file containing the canonical section list for every Markdown document. Consumers that need fast lookup should prefer `section-index.json` over scraping headings at runtime, while still treating the in-document `SECTION_REF` markers as the body-level source of truth.

### 28-machine-readable-conventions.s011 (Change-management rules)

A spec change is machine-significant if it changes any of:

- YAML front matter values
- canonical contract files under `contracts/`
- authority order in `SPEC_VERSION.md`
- acceptance criteria, invariants, or explicit non-goals
- any normative `must` or `must not` statement

When those change, downstream generated stories and packets should be treated as stale and re-generated or re-reviewed.

### 27-spec-driven-story-generation-workflow.s012 (Minimum viable process)

1. use an agent or script to generate candidate epics and concern-sliced stories from spec sections,
2. run the pre-presentation story-review gate,
3. review and approve the decomposition and the stories,
4. export approved stories to GitHub issues or draft issues as needed using `tools/spec_board_sync.ts`,
5. build or refresh the checked-in packet for the active story,
6. assign the active-story packet to agents only after worker-ready checks pass,
7. implement or review the story from the packet,
8. validate the resulting patch against the story and spec,
9. after merge to `main`, run the packet completion command to move the completed story to `stories/done/`, mark it `done`, remove its active packet, and clear or replace the active-story manifest before the next story starts. For an explicitly approved parent-story integration branch workflow, substory PRs may merge into the parent integration branch first; defer completion until the parent PR lands on `main`, then complete all included substories with the multi-story packet completion command.

### 32-codex-agent-integration.s004 (Authority order for Codex tasks)

For Codex execution:

1. cited specification sections,
2. approved story file,
3. generated agent packet,
4. checked-in repo instructions in `AGENTS.md`,
5. linked workflow procedure documents under `docs/workflow/`,
6. local code reality,
7. proposed patch.

If a lower layer conflicts with a higher one, the higher layer wins.

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

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only the canonical spec wording that distinguishes source repository publication from product launch and states the source-code licensing boundary. Do not add the license file, change GitHub visibility, publish packages, change code behavior, or create product/legal policies outside the narrow source repository publication authority.

## Scope

- rename the content policy spec document to a neutral publication-policy name while preserving its substantive policy content
- add a new stable section to `specs/13-content-publication-policy.md` authorizing the repository's own source code, specs, docs, tests, and tooling to be MIT licensed when a root `LICENSE` file is present
- state that the repository may be made public on GitHub after the root license file and README license note land
- state that source repository publication is not a public simulator launch, public alpha, public ranked play, public unranked play, public custom lobbies, package publication, deployment, or production service availability
- state that neither the source license nor making the repository public grants rights to redistribute, add, license, or use third-party card names, card text, images, set symbols, trademarks, logos, or other third-party content
- state that any follow-up license implementation story must use an explicitly human-confirmed copyright holder and year
- add a contract/spec authority test that fails if the source-publication authority wording is removed or weakened

## Out of Scope

- adding `LICENSE`, README license wording, package metadata, or GitHub visibility changes
- choosing the final copyright holder/year
- creating terms of service, privacy policy, takedown process, content moderation policy, branding policy, asset policy, or official legal advice
- changing gameplay, engine, CLI, server, client, replay, database, hidden-info filtering, deployment, CI, branch protection, package publishing, or GitHub repository settings

## Allowed Touch Points

<!-- prettier-ignore -->
- specs/13-legal-content-risk.md
- specs/13-content-publication-policy.md
- specs/section-index.json
- specs/spec-manifest.json
- specs/SPEC_VERSION.md
- specs/source-map.md
- specs/source-coverage-matrix.md
- tests/contracts/spec-authority-gates.test.mjs
- stories/generated/SPEC-003-authorize-source-repository-publication.yaml
- stories/approved/SPEC-003-authorize-source-repository-publication.yaml
- agent-packets/SPEC-003.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate the packet before implementation
- run `corepack pnpm run packets:verify` before implementation and review handoff
- stay within allowed_touch_points
- parent agent may implement this parent-owned authority edit directly
- open the PR before implementation-review
- run the implementation-review gate after the PR is opened
- do not add the MIT license file or change GitHub visibility in this SPEC story
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- update `tests/contracts/spec-authority-gates.test.mjs` to require the source repository publication authority wording
- run `corepack pnpm run specs:generate-metadata`
- run `corepack pnpm run specs:verify-metadata`
- run `corepack pnpm run test:contracts`
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run typecheck`
- run `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- `specs/13-content-publication-policy.md` has a neutral filename/title/doc_id and clearly authorizes MIT licensing for this repository's own source code, specs, docs, tests, and tooling when a root `LICENSE` file is present
- the new spec wording clearly allows making the GitHub source repository public after license/README license artifacts land
- the new spec wording clearly says repository publication is not public simulator launch, public alpha, public gameplay availability, package publication, deployment, or production service availability
- the new spec wording clearly excludes third-party card names, card text, images, set symbols, trademarks, logos, and other third-party content from both the repository source license and repository-publication authority
- the new spec wording requires explicit human confirmation of copyright holder and year for the license implementation story
- contract/spec authority tests pin the key source-publication authority phrases
- generated spec metadata and packet references use the neutral `13-content-publication-policy` identity
- no license file, README license note, GitHub visibility change, runtime code, package metadata, CI setting, or product legal policy is changed

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
