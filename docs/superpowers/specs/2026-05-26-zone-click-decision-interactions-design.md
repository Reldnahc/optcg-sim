# Zone-Click Decision Interactions

## Goal

Pending decisions that ask the player to choose visible cards on the board or in hand should be resolved by clicking those cards in place, not by opening a card-list modal. This is presentation logic only: the server remains the authority for legal responses.

## Interaction Modes

The client control layer classifies each pending decision into one of three modes:

- `modal`: choices require a dedicated view, such as hidden/private search results, reveal/add selections, ordering, or generic option lists.
- `global`: flow-control decisions that are better exposed as global controls, such as ending the counter phase.
- `zoneClick`: card choices where every legal candidate is already visible and clickable in normal hand or board zones.

## Zone-Click Eligibility

`zoneClick` is allowed only when the pending decision is a card/target selection and every legal candidate maps to a visible card instance already present in the player's current snapshot zones.

The initial visible zones are:

- the player's hand
- both players' leader, character, stage, life, deck, DON, and trash zones only when the card is already public and represented by a visible client card model

Search/reveal/order decisions stay modal even if they contain card candidates, because they are not normal board/hand picking interactions.

## Behavior

When a decision is classified as `zoneClick`:

- legal candidate cards render with pending-choice styling
- clicking a legal card toggles it into the active decision draft
- if `max === 1`, clicking a legal card submits immediately
- if multiple cards can be selected, the draft is held in client state and submitted with a small confirm action
- if `min === 0`, the player has a visible non-modal action to choose no cards or no targets
- illegal cards continue to use their normal click behavior or no-op behavior

## Boundaries

The engine and match server do not change for this feature. They continue to validate every submitted `respondToDecision` action.

The React components render the mode and call control-layer callbacks. They do not decide eligibility directly.

The existing modal remains the fallback for any decision that is not confidently eligible for `zoneClick`.

## Tests

Implementation should include tests for:

- mode classifier sends counter-pass decisions to `global`
- mode classifier sends search/order/private collection decisions to `modal`
- mode classifier sends visible board/hand target decisions to `zoneClick`
- mode classifier fails closed to `modal` if any candidate is not visible in the snapshot
- clicking a single-target zone candidate submits the decision response
- zero-target selection is available outside the modal for `min === 0`
