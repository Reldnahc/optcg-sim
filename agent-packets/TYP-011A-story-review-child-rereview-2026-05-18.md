# TYP-011A Child Story Re-Review

Assignment ID: `story-review-TYP-011A-child-rereview-fail-closed-engine-touch-2026-05-18`

Reviewed story path: `stories/approved/TYP-011A-leader-metadata-condition-contract-authority.yaml`

Status: `needs-revision`

Findings by severity:

- Critical: none.
- High: none.
- Medium: The revised story now authorizes a production engine edit in `packages/engine-core/src/effect-runtime-conditions.ts` and requires fail-closed unsupported handling for `leaderColorCount`, but it does not authorize a matching engine-core test file or require a focused engine regression command. Under `11-testing-quality.s004`, `11-testing-quality.s008`, and `AGENTS.md`, tests remain part of the change. As written, implementation must either touch an unapproved engine test file to verify the fail-closed branch or leave the new engine-path maintenance untested.
- Low: none.

Review notes:

- The added engine touch remains narrowly bounded enough for a contract story because the story text limits it to explicit unsupported-branch maintenance in the existing exhaustive condition switch and separately forbids positive runtime evaluation or support.
- That narrow engine allowance does not conflict with the parent boundary in `stories/approved/TYP-011-leader-metadata-condition-contracts-parent.yaml`, which still forbids runtime-feature implementation and delegates only this child story's shared authority work.
- The contract/schema scope remains aligned with `04-effect-runtime.s004`, `04-effect-runtime.s005`, `05-effect-dsl-reference.s006`, `05-effect-dsl-reference.s009`, `06-visibility-security.s003`, and `09-card-data-and-support-policy.s003`: public Leader metadata authority is allowed, while runtime support stays fail-closed until a later ENG story.

Required fixes:

- Add a narrowly scoped engine-core test touch point for the fail-closed maintenance path, preferably an existing runtime test file that already exercises unsupported queued-condition handling.
- Add a required test entry for a focused engine regression proving `leaderColorCount` remains unsupported and fail-closed without positive runtime evaluation until the later ENG runtime story lands.

Explicit row statement:

- This review artifact satisfies only the `TYP-011A` child-story re-review row.
- It does not satisfy the `TYP-011` parent-story review row or any sibling row.
