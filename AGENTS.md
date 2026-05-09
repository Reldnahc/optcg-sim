# AGENTS.md

## Purpose

This repository uses a spec-driven delivery workflow. Agents must implement one approved story at a time against the authoritative spec, not against chat memory or issue-body drift.

## Authority Order

For execution in this repo, use this order:

1. cited specification sections under `specs/`
2. approved story file under `stories/approved/`
3. generated story packet under `agent-packets/`
4. this `AGENTS.md`
5. linked workflow procedure docs under `docs/workflow/`
6. local code reality
7. proposed patch

If a lower layer conflicts with a higher layer, the higher layer wins.

## Repo Locations

- Specification bundle: `specs/`
- Epics: `epics/`
- Generated stories: `stories/generated/`
- Approved stories: `stories/approved/`
- Blocked stories: `stories/blocked/`
- Done stories: `stories/done/`
- Ambiguities: `stories/ambiguities/`
- Story sync metadata: `stories/.sync/`
- Agent packets: `agent-packets/`
- Workflow procedures: `docs/workflow/`

Use stable `SECTION_REF` citations from the spec. Do not cite heading anchors or vague file-level references when exact section refs exist.

## Active Story Checklist

For any implementation or review handoff:

1. Read `AGENTS.md`, the approved story, and the active packet.
2. Run `pnpm run packets:generate --story <stories/approved/...yaml> --activate` when activating or refreshing the story packet.
3. Run `pnpm run packets:verify` immediately after packet generation and before worker assignment, reviewer assignment, implementation handoff, or PR handoff.
4. Treat the story as `worker-ready` only after steps 1-3 are complete.
5. Assign implementation workers only after `worker-ready`.
6. Stay inside the story boundary and `allowed_touch_points`.
7. Implement the story with its required tests.
8. Run the story-specific tests and `pnpm verify`.
9. Open the PR before reviewer-subagent review.
10. Post the AI review record or equivalent human-review fallback.
11. Post or update the revision response when reviewer-subagent review was used.
12. Request human review only after review records are current.
13. Merge only after the required human review gate is satisfied.
14. Confirm post-merge packet cleanup automation completed the listed story cleanup after merge to `main`, or run manual packet-completion cleanup only as the operational fallback when automation fails or is unavailable.

## Mandatory Procedures

The procedure docs below are part of this repo's agent contract. Read the one that matches the current phase before acting.

- Story execution, packet, ambiguity, and lifecycle procedure: `docs/workflow/story-execution.md`
- PR review, AI review records, fallback review, and human review procedure: `docs/workflow/review-gate.md`
- Parent integration branch procedure: `docs/workflow/parent-integration-branches.md`
- Reporting and GitHub/board sync procedure: `docs/workflow/reporting-and-github-sync.md`

## Non-Negotiable Rules

- Implement only one approved story at a time.
- Approved stories may exist without packets until they become active.
- `agent-packets/active.json` may contain zero active stories or exactly one active story.
- Do not silently absorb adjacent contract, engine, server, client, replay, or UI work just because it is nearby.
- If the needed work crosses concerns, stop and split the story or raise the ambiguity instead of broadening the patch.
- Use stable `SECTION_REF` citations from `specs/`.
- GitHub Issues and board items are projections of local story files, not the authority.

## Packet Lifecycle Snapshot

Before implementation starts, before a worker or reviewer subagent is assigned, and before PR handoff begins, generate a current checked-in packet for the active story under `agent-packets/`.

Use `pnpm run packets:generate --story <stories/approved/...yaml> --activate` to build or refresh the packet for the story you are activating.

Post-merge packet cleanup automation is the normal path after a reviewed story PR or parent PR merges. Cleanup metadata is a reviewed request, not standalone authority.

Use `pnpm run packets:complete --story <stories/approved/...yaml>` after a story is merged only as the operational fallback when automation fails or is unavailable. For parent cleanup fallback, use `pnpm run packets:complete-many --story <stories/approved/...yaml> --story <stories/approved/...yaml>`. When validated parent-mode cleanup evidence binds a non-packetized parent story, the parent closeout must be produced by the multi-story packet completion command with the bound parent-story evidence from the cleanup plan. Do not run manual packet completion after automation has already completed the listed story cleanup.

A cleanup commit containing only the exact file changes produced by `pnpm run packets:complete --story <stories/approved/...yaml>` or `pnpm run packets:complete-many --story <stories/approved/...yaml> --story <stories/approved/...yaml>` does not require a separate reviewer subagent run. For validated parent-mode cleanup, exact packet-completion command output may also include command-owned bound parent story closeout from the cleanup plan.

Automation-created cleanup pull requests are not created.

If cleanup requires any manual edit beyond the packet completion command output, including edits to packet files, `agent-packets/active.json`, tooling, tests, fixtures, specs, workflow docs, or story files, run full verification and a separate reviewer subagent before pushing or merging.

## Safety Boundaries

Fail closed on ambiguity for gameplay rules, hidden-information behavior, replay behavior, fairness and timer behavior, persistence and account safety, and security-sensitive filtering or projection behavior.

Until stricter tooling is in place, preserve these boundaries:

- `engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients.
- client code must not import server-only modules.
- view/filtering code must not leak hidden state into public or player-facing outputs.
- replay validation code must not depend on client rendering code.
- hidden-state test helpers must not enter production client bundles.

## Code Standards

The repo is intentionally strict. Prefer enforcement over convention.

- TypeScript must remain strict.
- Do not weaken `tsconfig` strictness to make a patch pass.
- Do not introduce `any` without a narrow, documented trust-boundary justification.
- Do not use non-null assertions (`!`) as a routine escape hatch.
- Do not use `@ts-ignore` or `@ts-nocheck` unless explicitly approved for a narrow reason.
- Avoid unchecked type assertions across trust boundaries.
- Prefer named exports. Do not introduce default exports unless the repo later adopts them explicitly.
- Do not use `console` in production packages; use an approved logger abstraction.
- Keep files focused.
- Tests are part of the change, not a follow-up task.
- Prettier formatting and ESLint compliance are required, not optional.

## Verification

Before claiming completion, run the canonical repo commands when they exist:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm coverage`
- `pnpm verify`

If a required command does not exist yet, say so explicitly. Do not claim full verification when the command contract is still missing.

For story-scoped work, also run the story's required tests and report the exact commands used.
