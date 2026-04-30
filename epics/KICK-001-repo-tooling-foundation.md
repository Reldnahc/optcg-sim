---
epic_id: "KICK-001"
title: "Repository tooling foundation"
status: "generated"
summary: >
  Establish the local and CI enforcement baseline required before multi-package feature
  implementation begins.
spec_refs:
  - 15-implementation-kickoff.s010 (Required repo tooling before feature expansion)
  - 15-implementation-kickoff.s015 (Spec-driven backlog and agent delivery)
  - 22-v6-implementation-tightening.s018 (Repository tooling is now required)
  - 23-repo-tooling-and-enforcement.s022 (Required implementation sequence for tooling)
  - 23-repo-tooling-and-enforcement.s023 (Definition of done for repo tooling)
---

# KICK-001 Repository Tooling Foundation

## Goal

Create the mechanical quality baseline the spec requires before broad engine, server, or client work begins.

## Why this is first

The spec explicitly says the kickoff phase is not complete until the workspace can automatically reject type-quality failures, boundary violations, contract drift, and hidden-information regressions. This epic exists to prevent the repo from scaling implementation on reviewer memory alone.

## In scope

- root `AGENTS.md` execution contract
- root workspace bootstrap files and task names
- strict TypeScript base config
- Prettier formatting baseline
- ESLint quality and package-boundary enforcement
- Vitest baseline and root verification command
- local git hooks
- contract/schema validation lane
- hidden-information regression lane scaffolding
- CI workflows mirroring the local verification flow

## Out of scope

- gameplay rules implementation
- match server behavior
- browser UI
- card fixtures beyond what verification lanes need
- story sync tooling beyond local file generation

## Required bootstrap artifact

`AGENTS.md` should be checked in at repo root early, because it tells implementation agents where the spec and stories live, how to handle ambiguity, and which verification commands define completion.

## Child stories

- `INF-001` Add root workspace bootstrap and strict TypeScript base config
- `INF-002` Add Prettier formatting baseline and root format checks
- `INF-003` Add ESLint quality and package-boundary enforcement
- `INF-004` Add Vitest baseline and root verification orchestration
- `INF-005` Add Husky and lint-staged local hooks
- `INF-006` Add contract and schema validation lane
- `SEC-001` Add hidden-information regression lane scaffolding
- `INF-007` Add CI workflows mirroring local verification

## Dependency order

1. `INF-001`
2. `INF-002`, `INF-003`
3. `INF-004`
4. `INF-005`, `INF-006`, `SEC-001`
5. `INF-007`

## Delivery rule

No child story in this epic should absorb unrelated gameplay, server, or client work. If a proposed patch needs more than one reviewer mindset, split the story again before approval.
