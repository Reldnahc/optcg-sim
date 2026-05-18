<!-- agent-packet:story-id INF-056B -->
<!-- agent-packet:story-path stories/approved/INF-056B-separate-tooling-contracts-from-default-test-lane.yaml -->
<!-- agent-packet:story-sha256 85fd97215761828a28e266e40120b281c1e56be2bd4708c74cc84f92c0de5603 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-056B
Epic ID: INF-056
Title: Separate tooling contracts from default test lane
Type: tooling
Area: infra
Primary Concern: verification

## Why

Move broad tooling-heavy contract suites out of the default root test lane so `pnpm test` stays focused on product/package behavior and fast smoke coverage, while canonical `contracts`, `verify`, and CI continue to enforce the full contract suite.

## Authoritative Spec References

- 11-testing-quality.s003 (Test pyramid)
- 11-testing-quality.s022 (Required repo enforcement linkage)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s010 (Test tooling requirements)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s023 (Definition of done for repo tooling)
- 27-spec-driven-story-generation-workflow.s015 (Recommended completion checks for story-driven implementation)
- 27-spec-driven-story-generation-workflow.s017 (Story Approval Review Gate)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

## Relevant Spec Excerpts

### 11-testing-quality.s003 (Test pyramid)

```text
              manual playtests
          end-to-end browser tests
       match-server integration tests
    golden replay + hidden-info tests
  engine interaction + card tests
DSL primitive + invariant + fuzz tests
```

### 11-testing-quality.s022 (Required repo enforcement linkage)

The test strategy in this file is not complete unless it is wired into repository enforcement. The canonical repo-tooling requirements live in [`23-repo-tooling-and-enforcement.md`](23-repo-tooling-and-enforcement.md).

At minimum, CI must run linting, strict typechecking, package tests, contract/schema validation, and formatting checks before merge. Replay determinism and hidden-information regression lanes must be added before public alpha or ranked play.

A test expectation that is described in Markdown but not executable through local commands and CI is not considered fully implemented.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Each package must expose consistent task names where applicable:

- `build`
- `typecheck`
- `lint`
- `test`
- `test:watch`
- `coverage`

Integration-heavy packages may additionally expose:

- `test:integration`
- `test:replay`
- `test:contracts`
- `test:hidden-info`

At the root, the workspace must provide:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm coverage
pnpm verify
```

`pnpm verify` is the canonical local pre-push command and must run the same core checks as the main merge CI pipeline.

### 23-repo-tooling-and-enforcement.s010 (Test tooling requirements)

The repo must support the following test lanes:

1. package unit tests,
2. engine interaction tests,
3. invariant/property or fuzz-style tests where applicable,
4. replay determinism tests,
5. hidden-information leakage tests,
6. contract/schema validation tests,
7. smoke integration tests for server protocol behavior.

At minimum, the root verification pipeline must include:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:contracts   # if defined at root via recursive filtering
```

Before public alpha or ranked play, CI must also include replay and hidden-information test lanes.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

A pull request must not merge unless the main CI pipeline passes.

Minimum required merge gates:

1. install dependencies with locked versions,
2. build/typecheck workspace,
3. lint workspace,
4. run tests,
5. validate contracts and schemas,
6. validate formatting,
7. publish coverage artifact,
8. fail if generated artifacts or snapshots are stale when the repo defines them.

Recommended CI jobs:

- `quality` -> lint, typecheck, format check
- `engine` -> engine unit, interaction, invariant, replay tests
- `contracts` -> canonical types, DSL schema, fixture normalization, SQL/schema validation
- `client-server-smoke` -> protocol smoke tests and filtered-view checks

For protected branches, require at least one human review plus passing CI.

Ordinary protected-branch changes still require a pull request, at least one
human review, and passing required checks. The only allowed packet-lifecycle
exception is a dedicated GitHub App actor `optcg-packet-cleanup[bot]` running
workflow `.github/workflows/post-merge-packet-cleanup.yml` with token
`POST_MERGE_PACKET_CLEANUP_TOKEN`, and that exception exists only to push exact
packet-completion command output to `main` after a reviewed pull request has
merged. The cleanup actor and token must not be available to arbitrary GitHub
Actions workflows, human users, broad admin roles, implementation changes, docs
changes, tooling changes, or ordinary development pushes.

Exact packet-completion cleanup may use cleanup-scoped lifecycle verification
instead of full repo verification before the direct cleanup push. Cleanup-scoped
lifecycle verification must prove metadata binding, packet-completion output,
story lifecycle state, active packet state, and committed story metadata remain
valid. Normal main-branch CI remains the broad post-cleanup safety net after
the cleanup commit is pushed. Cleanup that includes any manual edit beyond
packet-completion output still requires full repo verification and the normal
reviewer-subagent path before push or merge.

### 23-repo-tooling-and-enforcement.s023 (Definition of done for repo tooling)

Repo tooling is considered defined and implementation-ready when all of the following are true:

- a contributor can clone the repo and run one documented bootstrap command successfully,
- `pnpm verify` exists and fails on real quality violations,
- package boundaries are mechanically enforced,
- contract/schema validation is automated,
- CI and local checks are materially aligned,
- hidden-information regression checks exist,
- merge protection depends on passing CI rather than reviewer memory.

At that point the repo is not just documented; it is enforceable.

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

Before human review is requested on a parent PR, the PR body or a handoff comment should be updated from future-tense review language to completed-gate evidence: included substory story path + commit SHA + AI review record + revision response + verification evidence, full-story AI review record, revision response, CI result, repo verification result, remaining human-review requirement, and the post-merge `packets:complete-many` cleanup plan.

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

### 27-spec-driven-story-generation-workflow.s017 (Story Approval Review Gate)

Generated or normalized stories must receive story-review agent review before the parent agent presents them to the human as approval-ready.

Story Approval Review Gate: before any parent story set is approved, packetized, activated, or handed to implementation, there must be one story-review artifact for the parent story and one story-review artifact for every child story. Parent story-review does not satisfy child story-review. Child story-review does not satisfy sibling story-review. Each required row must have a distinct story-review assignment identity and a distinct durable artifact identity for that row. One story-review assignment, one reviewer run, one matrix, or one durable artifact covering multiple stories satisfies at most one required row. Batch story-review can be supplemental context only and cannot be the approval-gate evidence for multiple rows. If any row is missing, pending, unknown, or not reconstructable from durable evidence: STOP.

Required behavior:

- approval-ready means the parent story and every child story have usable story-review evidence,
- a parent with exactly one child is valid and still uses the parent/substory flow,
- every parent story and every substory must be reviewed; parent-level review does not satisfy child-story review, and one child-story review does not satisfy any sibling child,
- use a story-review agent separate from any implementation worker or implementation patch reviewer,
- story-review agent uses gpt-5.4 with high reasoning,
- story-review findings must be fixed, explicitly deferred, or recorded before presentation,
- do not present a story as approval-ready when no usable story-review agent run exists; present it as unreviewed and blocked on story review instead,
- story-review agents evaluate story authority, decomposition, scope, non-scope, dependencies, allowed touch points, acceptance criteria, required tests, and ambiguity policy,
- story-review agents do not review implementation patches; implementation patch review remains a separate gate.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only root package scripts, test-lane discovery or filters, CI/script contract assertions, and workflow documentation needed to separate default package tests from contract/tooling verification. Do not change contract semantics, cleanup behavior, story lifecycle behavior, packet behavior, or product/runtime behavior.

## Scope

- move broad `tests/contracts/**/*.test.mjs` tooling-heavy suites out of the default root `pnpm test` lane
- keep contract suites enforced by canonical `corepack pnpm run contracts`
- keep `corepack pnpm run verify` authoritative by continuing to invoke `contracts`
- preserve CI enforcement by keeping the contracts job wired to `pnpm contracts`
- leave `pnpm coverage` as full direct Vitest coverage unless a later story intentionally designs a separate coverage split
- keep fast non-contract smoke lanes in default `pnpm test` where they are not under `tests/contracts/**`
- update script/CI contract tests so future changes cannot silently move contract suites out of all gates
- update script/CI contract tests so `pnpm test` excludes the contract directory and `pnpm contracts` remains the owning gate
- preserve INF-056A cleanup-specific lane behavior and its explicit cleanup contract command

## Out of Scope

- deleting contract tests because they are slow
- marking contract tests skipped, todo, flaky-allowed, or non-failing
- weakening contract/schema/story/packet/spec/type-sync validation behavior
- changing cleanup metadata syntax, cleanup guard behavior, packet completion behavior, or post-merge cleanup semantics
- changing gameplay, engine, card, server, client, replay, persistence, security, or UI behavior
- changing `coverage` to inherit the narrowed default test lane
- broad CI redesign unrelated to test-lane ownership

## Allowed Touch Points

<!-- prettier-ignore -->
- package.json
- .github/workflows/ci.yml
- tests/contracts/root-contracts-lane.test.mjs
- tests/ci/github-workflows.test.mjs
- tests/vitest/vitest-baseline.test.mjs
- docs/workflow/story-execution.md
- docs/workflow/review-gate.md
- docs/workflow/parent-integration-branches.md
- stories/approved/INF-056B-separate-tooling-contracts-from-default-test-lane.yaml
- agent-packets/INF-056B.md
- agent-packets/active.json

## Constraints

- the Story Approval Review Gate must pass for the revised INF-056 parent, INF-056A child, and INF-056B child with distinct assignment and artifact identity per row before packet activation or implementation
- do not weaken contract coverage; move it to the right lane and prove it still runs
- keep `pnpm verify` authoritative and make it run contract suites through `contracts`
- do not broaden this story into cleanup behavior, packet lifecycle behavior, product behavior, or coverage-lane redesign
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

- script contract test proving default `pnpm test` excludes `tests/contracts/**/*.test.mjs`
- script contract test proving `test:contracts` includes non-cleanup `tests/contracts` suites and excludes cleanup-heavy suites already owned by `test:cleanup-contracts`
- script contract test proving `test:cleanup-contracts` still includes INF-056A cleanup-heavy suites
- script contract test proving `contracts` invokes both `test:contracts` and `test:cleanup-contracts`
- script or CI contract test proving `verify` still invokes `contracts`
- CI workflow test proving the contracts job still runs `pnpm contracts`
- coverage script test proving `coverage` remains direct Vitest coverage and does not call `pnpm run test`
- run `corepack pnpm exec vitest run tests/contracts/root-contracts-lane.test.mjs tests/ci/github-workflows.test.mjs tests/vitest/vitest-baseline.test.mjs`
- run `corepack pnpm run test`
- run `corepack pnpm run contracts`
- run `corepack pnpm run stories:validate`
- full `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- default `pnpm test` does not discover or run `tests/contracts/**/*.test.mjs`
- `corepack pnpm run test:contracts` remains the explicit owner for non-cleanup contract suites
- `corepack pnpm run test:cleanup-contracts` remains the explicit owner for cleanup-heavy contract suites from INF-056A
- `corepack pnpm run contracts` invokes both contract test lanes and remains reachable from `verify`
- CI still runs `pnpm contracts` in a blocking job
- `pnpm coverage` remains full direct Vitest coverage and does not inherit the narrowed default `pnpm test` lane
- script contract tests prove moved contract suites are not silently dropped from all gates
- no contract test is skipped, loosened, or deleted to satisfy this story
- unrelated package, gameplay, card, engine, server, client, replay, and UI behavior remains unchanged

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
