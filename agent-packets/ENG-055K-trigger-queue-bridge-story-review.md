# ENG-055K Trigger Queue Bridge Story Review

Review assignment id: `story-review-ENG-055K-trigger-queue-bridge-update-2026-05-16`

Reviewed story id/path: `ENG-055K` / `stories/approved/ENG-055K-drawupto-play-card-reachability.yaml`

Review type: `child-story authority update review`

Status: `approval-ready`

Artifact identity: `agent-packets/ENG-055K-trigger-queue-bridge-story-review.md`

Reviewed authority:

- `AGENTS.md`
- `docs/workflow/story-execution.md`
- `stories/approved/ENG-055K-drawupto-play-card-reachability.yaml`
- `agent-packets/ENG-055K.md`
- `agent-packets/ENG-055K-story-review-child.md`
- `agent-packets/ENG-055-story-review-matrix.md`

Revision disposition:

- Added the play-card-to-runtime trigger queueing eligibility bridge to the K
  story boundary.
- Added the focused trigger queueing files and tests to K allowed touch points:
  - `packages/engine-core/src/effect-runtime-trigger-queueing-on-play.ts`
  - `packages/engine-core/src/effect-runtime-trigger-queueing-on-play.test.ts`
  - `packages/engine-core/src/effect-runtime-trigger-queueing-main-event.ts`
  - `packages/engine-core/src/effect-runtime-trigger-queueing-main-event.test.ts`
- Kept drawUpTo runtime semantics, parser support, generated support, unrelated
  play-card behavior, and general trigger queueing behavior out of scope.

Final findings:

- No blocking findings.
- The update is a narrow, justified correction needed after implementation
  showed that play-card support gating alone cannot route supported drawUpTo
  definitions into the existing ENG-055H runtime.
- The H/K split remains preserved: ENG-055H owns reusable drawUpTo runtime
  behavior, while ENG-055K owns normal play-card reachability into that runtime.
- The added touch points and tests are appropriate for proving supported
  Character On Play and Main Event definitions reach `chooseQuantity` while
  unsupported, optional, cost-bearing, malformed, or out-of-scope shapes remain
  fail-closed.

Disposition guidance:

- Record ENG-055K as approval-ready for the Story Approval Review Gate using
  this updated authority-review artifact.
