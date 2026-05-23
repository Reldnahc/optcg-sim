# ENG-060B Substory Evidence

- Story: `stories/approved/ENG-060B-reusable-queued-entry-point-body-adapters.yaml`
- Active packet: `agent-packets/ENG-060B.md`
- Implementation commits:
  - `1b95e2b` - reusable queued adapter implementation
  - `92ac31f` - sequence adapter review response
  - `ec0e97b` - play-card metadata alignment with queued sequence support
  - `d4f6fea` - playable-hand proof for sequence support tests
- Story authority correction commits:
  - `a774860` - revised ENG-060B/ENG-060C story gates
  - `279190e` - recorded ENG-060 story-review matrix
- Implementation workers:
  - `019e52a4-2df6-7c11-bcfe-bc33763442bf`
  - `019e52d0-f7c3-7930-8303-934f83c05ffe`
- Code review assignments:
  - `code-review-ENG-060B-initial-sequence-adapters`
  - `code-review-ENG-060B-d4f6fea-2026-05-22`
- Code review agents:
  - `019e52b4-2c2e-70f0-8277-d295bef2d52c`
  - `019e52d6-643d-7831-b380-d2bad77494e3`
- Code review verdict: `approved`

Review disposition:

- Initial review found that generic queued sequence support carried a blanket
  saved-reference ban into entry points that should allow reviewed saved
  references, and noted missing Life Trigger no-source-required sequence
  coverage.
- Resolution commit `92ac31f` added sequence support options for saved
  references and positive draw counts, routed Life Trigger through the scoped
  options, and added focused Life Trigger sequence coverage.
- Fresh story review later found ENG-060B needed explicit play-card legal-action
  exposure scope and narrower executable-body language. Resolution commit
  `a774860` revised the approved and generated B/C stories, regenerated the B
  packet, and commit `279190e` recorded the distinct parent/child story-review
  artifacts and matrix.
- Follow-up implementation commits `ec0e97b` and `d4f6fea` routed Character On
  Play and Event Main play-card metadata through
  `isSupportedQueuedAutoSequenceForEntryPoint`, added positive metadata and
  playable-hand assertions, and added fail-closed negatives for unsupported
  sequence connector, source-presence policy, cost, and duplicate same-entrypoint
  shapes.
- Final code review reported no findings and `Ready to proceed: yes`.

Verification evidence for current reviewed B head `d4f6fea`:

- `corepack pnpm --filter @optcg/engine-core exec vitest run --root ../.. packages/engine-core/src/play-card-support.test.ts packages/engine-core/src/play-card-on-play-runtime.test.ts packages/engine-core/src/play-card-event.test.ts`: passed, 3 files / 35 tests.
- `corepack pnpm --filter @optcg/engine-core test`: passed, 114 files / 999 tests.
- `corepack pnpm --filter @optcg/engine-core typecheck`: passed.
- `corepack pnpm run stories:validate`: passed, 563 committed story files.
- `corepack pnpm run packets:verify`: passed, 1 active story packet.
- `corepack pnpm verify`: passed outside the sandbox after the sandbox run hit
  `EPERM` while reading `node_modules/.pnpm/zod...`.

Revision response:

- All material B code-review findings were fixed before this evidence was
  recorded.
- The final B code-review run had no findings, so no additional revision commit
  was required after `d4f6fea`.

Status:

ENG-060B has reviewed commit evidence on the parent integration branch and may
be treated as landed for sequencing ENG-060C activation.
