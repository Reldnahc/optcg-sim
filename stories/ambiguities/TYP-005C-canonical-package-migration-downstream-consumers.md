# TYP-005C Canonical Package Migration Downstream Consumer Blocker

TYP-005C can mechanically sync `packages/types/src/*` to canonical contract
output, but the resulting package surface does not typecheck against current
`packages/engine-core` consumers.

The blocker is not limited to the originally known drift fields. Current
engine-core code and tests still consume package-only DTO/state fields that are
not present in canonical contracts after sync, including:

- `Action.respondToDecision.playerId`
- `PublicCardView.currentPower`
- `BattleState.counterPower`
- `BattleState.damageProcess`
- `TransientCardSet.ownerId`
- `TransientCardSet.controllerId`
- `ReplacementAppliedEventPayload`
- `PublicDecision.processId`
- `PublicDecision.replacementIds`
- `PublicDecision.mandatory`

For `PublicDecision.processId`, `PublicDecision.replacementIds`, and
`PublicDecision.mandatory`, the blocker is behavior/visibility authority, not a
direct canonical omission classification. Cited TYP-005C authority does not
resolve whether replacement-process routing metadata or mandatory/optional
decision semantics are player-visible in canonical `PublicDecision` payloads.
These fields stay fail-closed behind ambiguity resolution until an approved
follow-up story or ambiguity decision provides explicit canonical authority.

TYP-005C explicitly forbids changing canonical contracts and forbids engine,
server, client, replay, UI, database, or gameplay behavior changes. Therefore
the active story cannot satisfy its required `typecheck` and `verify` gates
without crossing its approved boundary.

Resolution needs a reviewed story-path decision before implementation resumes:

- update canonical contracts first if these fields are legitimate contract
  state that canonical authority omitted;
- or add an approved downstream consumer migration story if engine-core should
  stop consuming the package-only fields;
- or replace TYP-005C with a reviewed atomic compatibility migration whose
  allowed touch points explicitly include the required non-package files and
  whose acceptance criteria prohibit gameplay behavior changes.

Do not continue TYP-005C by patching engine-core under the current approved
story.
