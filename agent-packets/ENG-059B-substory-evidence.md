# ENG-059B Substory Evidence

- Story: `stories/approved/ENG-059B-conditional-continuous-keyword-grants.yaml`
- Active packet: `agent-packets/ENG-059B.md`
- Implementation commit: `8982382da943a1449a34d857287c4871f25d38f4`
- Implementation worker: `019e4197-7fdf-7e02-952a-169ac56a8beb`
- Revision worker: `019e41ae-7662-7151-824f-2df532a1d4e1`
- Code review assignment: `ENG-059B-code-review-2026-05-19`
- Code review agent: `019e41aa-c142-7d50-9b13-c1f88fd62b01`
- Code review verdict: `approved`

Review disposition:

- Initial finding: legal-action projection exposed Double Attack leader attacks when the defender had computed, not printed, Blocker.
- Initial finding: inactive `whileSourceOnField` keyword grants could evaluate source-dependent conditions and fail closed instead of disappearing.
- Resolution: legal projection now filters computed Blocker + Double Attack consistently with action application; inactive supported `whileSourceOnField` keyword grants skip condition evaluation and disappear.
- Re-review: approved on branch HEAD `8982382da943a1449a34d857287c4871f25d38f4`.

Verification evidence for `8982382da943a1449a34d857287c4871f25d38f4`:

- `corepack pnpm exec vitest run packages/engine-core/src/battle-declare-attack-rush.test.ts packages/engine-core/src/continuous-keyword-grants.test.ts`: passed, 2 files / 19 tests.
- `corepack pnpm run verify`: passed when run outside the sandbox after sandbox `EPERM` dependency-read failures in Vitest.

Status:

ENG-059B has reviewed commit evidence on the parent integration branch and may be treated as landed for sequencing ENG-059D activation after ENG-059C also lands.
