# ENG-060B Story Review

- Review type: `child-story`
- Story ID: `ENG-060B`
- Parent story ID: `ENG-060`
- Review assignment ID: `story-review-ENG-060B-reusable-queued-adapters-rereview-2026-05-22`
- Review status: `approval-ready`
- Story paths:
  - `stories/approved/ENG-060B-reusable-queued-entry-point-body-adapters.yaml`
  - `stories/generated/ENG-060B-reusable-queued-entry-point-body-adapters.yaml`
  - `agent-packets/ENG-060B.md`

## Disposition

The prior rereview blockers are fixed. The revised child story now explicitly authorizes the `play-card-support.ts` and `*play-card*.test.ts` touch points needed to keep legal-action exposure aligned with queue support, and it adds matching scope, acceptance, and required-test language for Character On Play and Event Main play-card metadata. The body-primitive scope is also narrowed to already executable queued bodies and now explicitly says this story must not add or claim continuous/search queued runtime support.

Evidence:

- `04-effect-runtime.s005` requires generated support and playability claims to be grounded in reusable primitive-boundary runtime capability evidence, including wrapper or entry point, body, costs, targets, visibility, source-presence policy, and composition, rather than partial or sample-shaped authority (`specs/04-effect-runtime.md:93-101`).
- `04-effect-runtime.s016` says exact wrapper-body allowlists are insufficient and that a supported body under one entry point does not authorize another entry point without separate entry-point adapter evidence plus body/composition evidence (`specs/04-effect-runtime.md:551-553`).
- `05-effect-dsl-reference.s029` distinguishes positive modular adapter/body evidence from negative exact wrapper-body examples, which is the boundary this story now tracks (`specs/05-effect-dsl-reference.md:1059-1071`).
- `09-card-data-and-support-policy.s016` requires primitive-boundary factorization rather than exact wrapper-body authority and keeps partial support fail-closed (`specs/09-card-data-and-support-policy.md:343-359`).
- The approved child story now authorizes `packages/engine-core/src/play-card-support.ts` and `packages/engine-core/src/**/*play-card*.test.ts`, closing the prior legal-action scope gap (`stories/approved/ENG-060B-reusable-queued-entry-point-body-adapters.yaml:20-42`).
- The approved child story now scopes play-card metadata alignment explicitly and narrows body support to already executable queued bodies while forbidding continuous/search claims in this story (`stories/approved/ENG-060B-reusable-queued-entry-point-body-adapters.yaml:61-73`).
- The approved child story now requires acceptance and tests for Character On Play and Event Main play-card metadata through the same adapter/body/composition evidence, with fail-closed negatives (`stories/approved/ENG-060B-reusable-queued-entry-point-body-adapters.yaml:82-104`).
- The generated story and checked-in packet mirror those same corrections, so the child authority layers are aligned rather than drifting (`stories/generated/ENG-060B-reusable-queued-entry-point-body-adapters.yaml:20-42`, `stories/generated/ENG-060B-reusable-queued-entry-point-body-adapters.yaml:61-104`, `agent-packets/ENG-060B.md:491-609`).

## Findings

### High

None.

### Medium

None.

### Low

None.

## Matrix Disposition Summary

| story ID   | parent story ID | child story ID | story paths                                                                                                                                                                          | review assignment ID                                                 | review status    | review artifact or blocker reference           | disposition summary                                                                                          |
| ---------- | --------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ---------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ENG-060B` | `ENG-060`       | `ENG-060B`     | `stories/approved/ENG-060B-reusable-queued-entry-point-body-adapters.yaml`; `stories/generated/ENG-060B-reusable-queued-entry-point-body-adapters.yaml`; `agent-packets/ENG-060B.md` | `story-review-ENG-060B-reusable-queued-adapters-rereview-2026-05-22` | `approval-ready` | `agent-packets/ENG-060B-story-review-child.md` | Prior High and Medium story-authority findings are fixed; ENG-060B is approval-ready for the child row only. |

## Gate Note

This artifact satisfies only the `ENG-060B` child-story review row. Per the Story Approval Review Gate, the `ENG-060` parent row and each sibling child row still require their own distinct assignment and durable artifact identities before the full parent story set can be presented as approval-ready.
