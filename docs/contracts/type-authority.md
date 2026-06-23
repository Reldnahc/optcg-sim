# Package Type Authority Strategy (`@optcg/types`)

## Canonical Source Of Truth

The canonical source of truth for `@optcg/types` contract shapes is:

- `contracts/canonical-types.ts`
- `contracts/types/*`

Package type projection files are derived artifacts that must remain aligned to these canonical modules.

## Selected Strategy

Selected model: checked-in package type files generated/synced from canonical contract modules.

Under current repository constraints, direct re-export from `contracts/*` into the `@optcg/types` package would require broad package-boundary changes. The package currently declares `src` as its source boundary and publishes type entry points from `src`.

## Current Repo Constraints (Proof)

`packages/types/package.json` currently declares:

- `types`: `./src/index.ts`
- `.` export `types`: `./src/index.ts`

`packages/types/tsconfig.json` currently declares:

- `rootDir`: `src`
- `include`: `["src/**/*.ts"]`

These constraints keep `@optcg/types` centered on `packages/types/src/*` and prevent adopting cross-package direct re-export as a narrow local change.

## Canonical-To-Package Module Mapping

Canonical module to package module mapping is one-to-one by filename:

- `contracts/types/primitives.ts` -> `packages/types/src/primitives.ts`
- `contracts/types/card-metadata.ts` -> `packages/types/src/card-metadata.ts`
- `contracts/types/events.ts` -> `packages/types/src/events.ts`
- `contracts/types/view.ts` -> `packages/types/src/view.ts`
- `contracts/types/game-state.ts` -> `packages/types/src/game-state.ts`
- `contracts/types/effects.ts` -> `packages/types/src/effects.ts`
- `contracts/types/dynamic-number-values.ts` -> `packages/types/src/dynamic-number-values.ts`
- `contracts/types/effect-continuous.ts` -> `packages/types/src/effect-continuous.ts`
- `contracts/types/effect-costs.ts` -> `packages/types/src/effect-costs.ts`
- `contracts/types/effect-definition.ts` -> `packages/types/src/effect-definition.ts`
- `contracts/types/effect-policies.ts` -> `packages/types/src/effect-policies.ts`
- `contracts/types/effect-protection.ts` -> `packages/types/src/effect-protection.ts`
- `contracts/types/effect-triggers.ts` -> `packages/types/src/effect-triggers.ts`
- `contracts/types/decisions.ts` -> `packages/types/src/decisions.ts`
- `contracts/types/runtime.ts` -> `packages/types/src/runtime.ts`
- `contracts/types/effect-presentation.ts` -> `packages/types/src/effect-presentation.ts`
- `contracts/types/support-certification.ts` -> `packages/types/src/support-certification.ts`
- `contracts/canonical-types.ts` -> `packages/types/src/index.ts` export surface alignment

## Generated Output Ownership And Edit Policy

- Only canonical projection modules are generated/synced output in this strategy:
  - `packages/types/src/index.ts`
  - `packages/types/src/primitives.ts`
  - `packages/types/src/card-metadata.ts`
  - `packages/types/src/events.ts`
  - `packages/types/src/view.ts`
  - `packages/types/src/game-state.ts`
  - `packages/types/src/effects.ts`
  - `packages/types/src/dynamic-number-values.ts`
  - `packages/types/src/effect-continuous.ts`
  - `packages/types/src/effect-costs.ts`
  - `packages/types/src/effect-definition.ts`
  - `packages/types/src/effect-policies.ts`
  - `packages/types/src/effect-protection.ts`
  - `packages/types/src/effect-triggers.ts`
  - `packages/types/src/decisions.ts`
  - `packages/types/src/runtime.ts`
  - `packages/types/src/effect-presentation.ts`
  - `packages/types/src/support-certification.ts`
- Tests, manifests, and support files under `packages/types/src` are not generated canonical projections unless a later explicit change includes them (for example `*.test.ts` and `export-ownership.manifest.ts`).
- Manual edits to generated canonical projection files are non-authoritative.
- Later sync verification must overwrite or reject manual-only drift in package outputs.
- Sync write entrypoint: `corepack pnpm run types:sync:write`
- Stale-output check entrypoint: `corepack pnpm run types:sync:check`
- The stale-output check entrypoint is enforced through root `contracts`, which is included by root `verify`.

## Change Authority Rule

Contract shape changes require edits in canonical contract modules under separate approved authority, not one-sided package patches.

## Downstream Disposition Record (TYP-005C)

```json
{
  "storyId": "TYP-005C",
  "dispositions": [
    {
      "field": "Action.respondToDecision.playerId",
      "disposition": "package_drift_or_engine_internal",
      "followUpWork": "TYP-005E",
      "specRefs": [
        "03-game-state-events-decisions.s016",
        "22-v6-implementation-tightening.s006"
      ],
      "canonicalShape": "Canonical Action.respondToDecision includes decisionId and response only.",
      "packageOrDownstreamShape": "Downstream package/consumer assumptions previously expected Action.respondToDecision.playerId.",
      "downstreamConsumerSummary": "Field mismatch blocks projection-aligned downstream action typing and requires consumer migration away from package-only action metadata."
    },
    {
      "field": "PublicCardView.currentPower",
      "disposition": "package_drift_or_engine_internal",
      "followUpWork": "TYP-005E",
      "specRefs": [
        "03-game-state-events-decisions.s003",
        "06-visibility-security.s004"
      ],
      "canonicalShape": "Canonical PublicCardView includes stable public board fields and excludes computed currentPower.",
      "packageOrDownstreamShape": "packages/types/src/view.ts currently includes PublicCardView.currentPower as an optional field.",
      "downstreamConsumerSummary": "Compile blockers arise where downstream view consumers rely on package-only currentPower instead of canonical public DTO shape."
    },
    {
      "field": "BattleState.counterPower",
      "disposition": "package_drift_or_engine_internal",
      "followUpWork": "TYP-005E",
      "specRefs": [
        "03-game-state-events-decisions.s002",
        "06-visibility-security.s004"
      ],
      "canonicalShape": "Canonical runtime BattleState tracks attacker/target/blocker/step/damageCount without counterPower.",
      "packageOrDownstreamShape": "packages/types/src/runtime.ts adds optional BattleState.counterPower.",
      "downstreamConsumerSummary": "Engine-adjacent consumers depending on package-only counterPower fail against canonical runtime types."
    },
    {
      "field": "BattleState.damageProcess",
      "disposition": "package_drift_or_engine_internal",
      "followUpWork": "TYP-005E",
      "specRefs": [
        "03-game-state-events-decisions.s002",
        "03-game-state-events-decisions.s003"
      ],
      "canonicalShape": "Canonical BattleState omits damageProcess and keeps process internals outside the public/runtime battle contract.",
      "packageOrDownstreamShape": "packages/types/src/runtime.ts includes optional BattleState.damageProcess metadata.",
      "downstreamConsumerSummary": "Downstream compile failures occur when package-only damageProcess is treated as canonical battle-state authority."
    },
    {
      "field": "TransientCardSet.ownerId",
      "disposition": "package_drift_or_engine_internal",
      "followUpWork": "TYP-005E",
      "specRefs": [
        "03-game-state-events-decisions.s002",
        "06-visibility-security.s021"
      ],
      "canonicalShape": "Canonical TransientCardSet includes id/cards/origin/visibility/cleanupPolicy and no ownerId.",
      "packageOrDownstreamShape": "packages/types/src/runtime.ts adds TransientCardSet.ownerId.",
      "downstreamConsumerSummary": "Package-only owner metadata causes downstream transient-set typings to diverge from canonical runtime contracts."
    },
    {
      "field": "TransientCardSet.controllerId",
      "disposition": "package_drift_or_engine_internal",
      "followUpWork": "TYP-005E",
      "specRefs": [
        "03-game-state-events-decisions.s002",
        "06-visibility-security.s021"
      ],
      "canonicalShape": "Canonical TransientCardSet does not include controllerId.",
      "packageOrDownstreamShape": "packages/types/src/runtime.ts adds TransientCardSet.controllerId.",
      "downstreamConsumerSummary": "Downstream consumers typed to package-only controller metadata block canonical-package parity for transient sets."
    },
    {
      "field": "ReplacementAppliedEventPayload",
      "disposition": "behavior_ambiguity",
      "followUpWork": "TYP-005C ambiguity record",
      "specRefs": [
        "03-game-state-events-decisions.s002",
        "22-v6-implementation-tightening.s006"
      ],
      "canonicalShape": "Canonical EngineEvent keeps payload typed as unknown and cited authority does not define a stable ReplacementAppliedEventPayload contract.",
      "packageOrDownstreamShape": "packages/types/src/events.ts currently exposes a ReplacementAppliedEventPayload shape used by downstream consumers, but that shape is package-local and not canonically specified by cited sections.",
      "downstreamConsumerSummary": "Promoting this payload shape directly into canonical contracts would invent uncited event-payload semantics; this is recorded as behavior ambiguity and routed to durable ambiguity resolution."
    },
    {
      "field": "PublicDecision.processId",
      "disposition": "behavior_ambiguity",
      "followUpWork": "TYP-005C ambiguity record",
      "specRefs": [
        "06-visibility-security.s004",
        "06-visibility-security.s007"
      ],
      "canonicalShape": "Canonical PublicDecision includes id/type/playerId/prompt/causedBy/timeoutMs and does not authorize processId for player-facing decision views.",
      "packageOrDownstreamShape": "packages/types/src/view.ts currently adds optional PublicDecision.processId for downstream replacement-decision consumers.",
      "downstreamConsumerSummary": "Because process visibility and decision-routing exposure are not explicitly authorized by cited canonical sections, direct canonical promotion would guess hidden-info behavior and must remain an ambiguity."
    },
    {
      "field": "PublicDecision.replacementIds",
      "disposition": "behavior_ambiguity",
      "followUpWork": "TYP-005C ambiguity record",
      "specRefs": [
        "06-visibility-security.s004",
        "06-visibility-security.s007"
      ],
      "canonicalShape": "Canonical PublicDecision does not include replacementIds, and cited canonical text does not specify whether candidate replacement identifiers are public in decision payloads.",
      "packageOrDownstreamShape": "packages/types/src/view.ts currently carries optional PublicDecision.replacementIds relied on by some downstream UI/decision typing paths.",
      "downstreamConsumerSummary": "Adding replacementIds to canonical player-view contracts without explicit authority risks hidden-information leakage and decision-visibility drift; this remains a fail-closed behavior ambiguity."
    },
    {
      "field": "PublicDecision.mandatory",
      "disposition": "behavior_ambiguity",
      "followUpWork": "TYP-005C ambiguity record",
      "specRefs": [
        "06-visibility-security.s004",
        "06-visibility-security.s007"
      ],
      "canonicalShape": "Canonical PublicDecision omits mandatory and cited sections do not define whether mandatory/optional replacement semantics belong in player-visible decision DTOs.",
      "packageOrDownstreamShape": "packages/types/src/view.ts currently adds optional PublicDecision.mandatory consumed by downstream replacement response handling.",
      "downstreamConsumerSummary": "Without explicit canonical authority for mandatory visibility semantics, routing this as a direct canonical omission would overreach; classification stays as behavior ambiguity pending durable follow-up."
    }
  ]
}
```

## TYP-005D No-Op Closure

TYP-005D inspected the TYP-005C downstream disposition record above and found no
`canonical_contract_omission` dispositions. The classified fields are either
`package_drift_or_engine_internal` items routed to TYP-005E or
`behavior_ambiguity` items routed to the recorded ambiguity follow-up.

No canonical contract fields are added by TYP-005D. This preserves
`contracts/canonical-types.ts` and `contracts/types/*` as canonical authority
for the cited spec sections without promoting package drift or unresolved
behavior semantics into shared contracts.

## TYP-005E Engine-Consumer Migration Closure

TYP-005E implemented the required engine-core migration for every TYP-005C
`package_drift_or_engine_internal` disposition before package projection sync.
This section records the checked-in prerequisite evidence for TYP-005F.

Reviewed branch commit:

- `222b4d3` (`TYP-005E migrate engine consumers off package drift`)

The TYP-005E migration removed engine-core reliance on these package-only fields
or moved the data to internal engine-local representations:

- `Action.respondToDecision.playerId`
- `PublicCardView.currentPower`
- `BattleState.counterPower`
- `BattleState.damageProcess`
- `TransientCardSet.ownerId`
- `TransientCardSet.controllerId`

TYP-005E preserved existing gameplay and visibility behavior while aligning
engine consumers with the settled canonical projection boundary. Its reviewed
verification evidence includes:

- canonical projection simulation with `types:sync:write` followed by
  `corepack pnpm exec tsc -p packages/engine-core/tsconfig.json --noEmit`
- focused engine-core regression coverage for decision responses, battle,
  replacement, transient-set, and visibility paths
- `corepack pnpm exec vitest run packages/engine-core/src`
- `corepack pnpm exec vitest run tests/hidden-info`
- `corepack pnpm run typecheck`
- `corepack pnpm verify`

No canonical contract fields were added by TYP-005E. No package projection files
were changed by TYP-005E.
