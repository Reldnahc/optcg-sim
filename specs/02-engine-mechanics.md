---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "02-engine-mechanics"
doc_title: "Engine Mechanics"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Engine Mechanics Specification

<!-- SECTION_REF: 02-engine-mechanics.s001 -->

Section Ref: `02-engine-mechanics.s001`

## Purpose

<!-- SECTION_REF: 02-engine-mechanics.s002 -->

Section Ref: `02-engine-mechanics.s002`

This document translates OPTCG gameplay into engine-facing structures and logic flows. It intentionally avoids UI and networking concerns.

The canonical engine loop is:

```ts
applyAction(state, action) -> EngineResult
resumeDecision(state, decisionResponse) -> EngineResult
getLegalActions(state, playerId) -> LegalAction[]
filterStateForPlayer(state, playerId) -> PlayerView
```

Every accepted action creates a new state sequence number and an event journal entry.

## Rule-processing checkpoints

<!-- SECTION_REF: 02-engine-mechanics.s003 -->

Section Ref: `02-engine-mechanics.s003`

Run rule processing after every atomic state change, not only after player actions.

```ts
function afterAtomicMutation(result: EngineStepResult): EngineStepResult {
  const checked = checkRuleProcessing(result.state);
  return { ...result, state: checked };
}
```

Rule processing checks:

- Leader damage when that player has 0 life.
- Deck-out at a rule-processing checkpoint.
- Effect-created win/loss conditions.
- Simultaneous loss resulting in draw.
- Invariant violations in development/test mode.

Concession is immediate and cannot be replaced or prevented.

## Authority and official-rules defaults

<!-- SECTION_REF: 02-engine-mechanics.s004 -->

Section Ref: `02-engine-mechanics.s004`

- Official card wording overrides the comprehensive rules when they conflict.
- Official FAQ/rulings/errata refine behavior when printed text alone is insufficient.
- The simulator must implement that authority through DSL/custom handlers and card-specific tests.
- Simultaneous player choices are ordered turn player first, then non-turn player.
- When both players have triggered effects at the same timing, turn-player effects resolve first under the official timing rules.
- Effects triggered during damage processing wait until damage processing is complete, except for `[Trigger]` handling which follows the official interrupt path.

## Zones

<!-- SECTION_REF: 02-engine-mechanics.s005 -->

Section Ref: `02-engine-mechanics.s005`

Each player owns one of each zone.

| Zone           |                 Visibility |                  Ordering | Notes                                                                                                                                                                                                                                        |
| -------------- | -------------------------: | ------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deck           |                     Secret |                   Ordered | Neither player sees contents or order. Draw from top.                                                                                                                                                                                        |
| DON!! Deck     |                       Open |                   Ordered | Contents are effectively identical for gameplay, but art may vary cosmetically.                                                                                                                                                              |
| Hand           |         Secret to opponent |                 Unordered | Owner sees all; opponent sees count only.                                                                                                                                                                                                    |
| Trash          |                       Open |                   Ordered | Face-up public zone. New cards placed on top unless effect says otherwise.                                                                                                                                                                   |
| Leader Area    |                       Open |               Single slot | Exactly one leader. Cannot leave by normal effects/rules.                                                                                                                                                                                    |
| Character Area |                       Open |               Board slots | 0–5 characters. If a player would play a sixth Character, they reveal the new card, trash 1 Character already in their Character Area, and then play the new Character. This trash is rule processing, not K.O., and cannot trigger effects. |
| Stage Area     |                       Open |               Single slot | 0–1 stage. Playing a new stage trashes the old one first.                                                                                                                                                                                    |
| Cost Area      |                       Open | Multiset/cards with state | DON!! cards with active/rested state.                                                                                                                                                                                                        |
| Life Area      | Secret except face-up life |                   Ordered | Top card is taken for damage. Some cards may be face-up by effect.                                                                                                                                                                           |
| No Zone        |                 Contextual |                       N/A | Temporary location for resolving life triggers or effects.                                                                                                                                                                                   |

## Zone transition rules

<!-- SECTION_REF: 02-engine-mechanics.s006 -->

Section Ref: `02-engine-mechanics.s006`

When a card moves from field to another zone, it becomes a new card instance. Applied effects are stripped. Instance identity must reset when appropriate.

```ts
interface CardInstance {
  instanceId: InstanceId;
  cardId: CardId;
  owner: PlayerId;
  controller: PlayerId;
  zone: ZoneRef;
  state?: "active" | "rested";
  turnPlayed?: number;
  attachedDon?: InstanceId[];
}
```

When multiple cards are placed into a zone simultaneously, the owner chooses their order. If the destination is secret, the opponent must not see the chosen order unless the game rules explicitly reveal it.

When a card with attached DON!! leaves the field, attached DON!! return to the owner's cost area rested.

## Card categories

<!-- SECTION_REF: 02-engine-mechanics.s007 -->

Section Ref: `02-engine-mechanics.s007`

| Category  | Field zone               | Has power | Has cost |   Has life |                             Can attack |
| --------- | ------------------------ | --------: | -------: | ---------: | -------------------------------------: |
| Leader    | Leader Area              |       Yes |       No | Setup only |                                    Yes |
| Character | Character Area           |       Yes |      Yes |         No | Yes, subject to turn-played/Rush rules |
| Event     | None after use           |        No |      Yes |         No |                                     No |
| Stage     | Stage Area               |        No |      Yes |         No |                                     No |
| DON!!     | Cost/attached/DON!! deck |        No |       No |         No |                                     No |

## Setup sequence

<!-- SECTION_REF: 02-engine-mechanics.s008 -->

Section Ref: `02-engine-mechanics.s008`

Use a deterministic setup flow:

```text
1. Validate decks, card support, format, banlist.
2. Determine first/second player.
3. Build initial full GameState.
4. Resolve start-of-game effects that modify setup.
5. Shuffle decks using recorded RNG.
6. Draw opening hands.
7. Handle official mulligan decisions: each player may once either keep or return all 5 to deck, reshuffle, and redraw 5, in first-player-then-second-player order.
8. Place Life from the top of deck equal to Leader life using the canonical orientation algorithm below.
9. Start first player's Refresh Phase.
```

Start-of-game effects that alter decks must happen before final shuffle and opening draw.

### Canonical Life orientation

<!-- SECTION_REF: 02-engine-mechanics.s009 -->

Section Ref: `02-engine-mechanics.s009`

Canonical state convention:

```text
player.deck[0] = top of deck
player.life[0] = top of Life area = next Life card taken for damage
```

Life setup must satisfy the official rule that the card that was on top of the deck becomes the bottom card of the Life area.

Implementation algorithm:

```ts
function setupLifeFromDeck(
  player: PlayerState,
  lifeCount: number,
): PlayerState {
  const takenInDeckOrder = player.deck.slice(0, lifeCount); // [A, B, C], A was top of deck
  const remainingDeck = player.deck.slice(lifeCount);
  const lifeTopFirst = [...takenInDeckOrder]
    .reverse()
    .map((card) => ({ card, faceUp: false }));
  return { ...player, deck: remainingDeck, life: lifeTopFirst };
}
```

Damage always takes `player.life[0]`. Effects that add cards to Life must specify `position: "top" | "bottom"`; if a card text does not specify, use the official ruling for that card and add a card-specific test.

## Turn structure

<!-- SECTION_REF: 02-engine-mechanics.s010 -->

Section Ref: `02-engine-mechanics.s010`

### Refresh Phase

<!-- SECTION_REF: 02-engine-mechanics.s011 -->

Section Ref: `02-engine-mechanics.s011`

1. Expire effects that end at the start of this player's turn.
2. Queue/resolve start-of-turn triggers.
3. Return attached DON!! to cost area rested.
4. Set the turn player's Leader, Characters, Stage, and Cost Area cards active.

### Draw Phase

<!-- SECTION_REF: 02-engine-mechanics.s012 -->

Section Ref: `02-engine-mechanics.s012`

1. Turn player draws one card.
2. First player skips this draw on their first turn.

### DON!! Phase

<!-- SECTION_REF: 02-engine-mechanics.s013 -->

Section Ref: `02-engine-mechanics.s013`

1. Place two DON!! from DON!! Deck into cost area active.
2. First player places only one on their first turn.
3. If fewer DON!! remain, place as many as possible.

### Main Phase

<!-- SECTION_REF: 02-engine-mechanics.s014 -->

Section Ref: `02-engine-mechanics.s014`

Before the turn player receives action priority, emit `phaseStarted(main)`, collect `[Start of Main Phase]` triggers, and resolve required automatic effects. If any pending decision is created, Main Phase action priority does not begin until that decision and the resulting queue are complete.

Turn player may repeatedly:

- Play a Character, Stage, or `[Main]` Event from hand.
- Activate `[Activate: Main]` effects.
- Give active DON!! to Leader or Characters.
- Declare an attack, if legal.
- End the phase.

Neither player can attack on their first turn.

### End Phase

<!-- SECTION_REF: 02-engine-mechanics.s015 -->

Section Ref: `02-engine-mechanics.s015`

1. Resolve `[End of Your Turn]` triggers controlled by the turn player.
2. Resolve `[End of Your Opponent's Turn]` triggers controlled by the non-turn player.
3. Expire end-of-turn effects in the correct order.
4. Swap turn player.
5. Proceed to the next Refresh Phase.

## Playing a card

<!-- SECTION_REF: 02-engine-mechanics.s016 -->

Section Ref: `02-engine-mechanics.s016`

Playing a card from hand is a structured action:

```text
1. Reveal card from hand.
2. Compute total cost from base cost plus continuous cost modifiers.
3. Clamp final negative cost to 0.
4. Select required active DON!! in cost area.
5. Rest selected DON!!.
6. If playing a Character while character area is full, choose and trash one existing Character by rule process; no triggers.
7. If playing a Stage while stage area is full, trash existing Stage.
8. Place card in destination or trash Event before resolving Event effect.
9. Emit cardPlayed/cardMoved events.
10. Detect and queue [On Play] or Event effects as appropriate.
```

Cost payment should be represented as a `PendingDecision` if the player must choose exactly which DON!! or additional cards to pay.

## Battle sequence

<!-- SECTION_REF: 02-engine-mechanics.s017 -->

Section Ref: `02-engine-mechanics.s017`

A battle is a sub-state inside Main Phase.

### Attack Step

<!-- SECTION_REF: 02-engine-mechanics.s018 -->

Section Ref: `02-engine-mechanics.s018`

1. Attacker rests an active Leader or Character.
2. Attacker selects target: opponent Leader or one rested opponent Character.
3. Emit `attackDeclared`.
4. Queue attacker's `[When Attacking]` effects in the attack timing window.
5. Resolve that attack timing window.
6. If attacker or target left its zone or is no longer a legal battle participant, skip to End of Battle.

### Block Step

<!-- SECTION_REF: 02-engine-mechanics.s019 -->

Section Ref: `02-engine-mechanics.s019`

1. Defender may activate one legal `[Blocker]`, unless blocking is prohibited.
2. Blocker rests and becomes the current target.
3. Emit `blockerActivated`.
4. Queue `[On Block]` effects.
5. Resolve the block timing window.
6. If attacker or current target left its zone or is no longer a legal battle participant, skip to End of Battle.

### Counter Step

<!-- SECTION_REF: 02-engine-mechanics.s020 -->

Section Ref: `02-engine-mechanics.s020`

1. Queue defender-side effects that trigger from being attacked or from the opponent's attack timing, such as `[On Your Opponent's Attack]`, before ordinary counter actions.
2. Resolve that timing window.
3. If attacker or current target left its zone or is no longer a legal battle participant, skip to End of Battle.
4. Defender may perform any number of legal counter actions:
   - Trash a Character card with counter value from hand for power.
   - Use a `[Counter]` Event by paying its cost and trashing it.
5. After each counter action and after the defender passes, re-check whether attacker and current target still exist and remain legal battle participants. If not, skip to End of Battle.
6. Proceed to Damage Step only if the attacker and current target are still legal.

The server must avoid timing leaks. If the defender has no legal counter actions and settings allow auto-pass, the window should auto-pass without revealing hidden details.

### Damage Step

<!-- SECTION_REF: 02-engine-mechanics.s021 -->

Section Ref: `02-engine-mechanics.s021`

1. Compute attacker and target power from `ComputedGameView`.
2. If attacker power is lower than target power, no damage/K.O. occurs.
3. If attacker power is equal or greater:
   - Target Leader: deal damage.
   - Target Character: K.O. target.
4. Emit events for damage, life movement, K.O., card movement.
5. Triggered effects during damage wait until damage processing completes.

### End of Battle

<!-- SECTION_REF: 02-engine-mechanics.s022 -->

Section Ref: `02-engine-mechanics.s022`

1. Queue/resolve end-of-battle triggers.
2. Expire battle-duration continuous effects.
3. Clear battle context.
4. Return to Main Phase.

## Damage processing

<!-- SECTION_REF: 02-engine-mechanics.s023 -->

Section Ref: `02-engine-mechanics.s023`

For each point of damage:

1. If player has 0 life, mark defeat condition and run rule processing.
2. Otherwise, take the top life card.
3. If the card has `[Trigger]`, ask whether to reveal and activate it instead of adding it to hand.
4. If trigger is activated, the card is temporarily in no zone while the trigger resolves.
5. After trigger resolution, trash the card unless the trigger or a replacement says otherwise.
6. If trigger is declined or unavailable, add the card to hand hidden.

When damage is greater than 1, repeat this process one point at a time in official order.

`[Banish]` replaces the normal life-to-hand/trigger path by trashing the life card instead.

## Effect categories

<!-- SECTION_REF: 02-engine-mechanics.s024 -->

Section Ref: `02-engine-mechanics.s024`

Every effect is classified as one of:

| Category    | Behavior                                             |
| ----------- | ---------------------------------------------------- |
| Auto        | Queued when an event satisfies its trigger.          |
| Activate    | Player chooses to activate during a legal window.    |
| Permanent   | Contributes modifiers/restrictions to computed view. |
| Replacement | Intercepts a replaceable process before it occurs.   |

## Keyword behavior

<!-- SECTION_REF: 02-engine-mechanics.s025 -->

Section Ref: `02-engine-mechanics.s025`

| Keyword         | Engine behavior                                                      |
| --------------- | -------------------------------------------------------------------- |
| Rush            | Character may attack the turn it was played.                         |
| Rush: Character | Character may attack Characters, not Leader, the turn it was played. |
| Double Attack   | Leader damage count is 2.                                            |
| Banish          | Damaged life card is trashed; no normal trigger/hand path.           |
| Blocker         | During Block Step, can rest to redirect attack.                      |
| Unblockable     | Skips opponent blocker window.                                       |
| Activate: Main  | Legal only during controller's Main Phase outside battle.            |
| Main            | Event usable during controller's Main Phase.                         |
| Counter         | Event usable during opponent's Counter Step.                         |
| Once Per Turn   | Tracked by stable effect ID and card instance per turn.              |
| DON!! xX        | Condition is attached DON!! count greater than or equal to X.        |

## Edge cases

<!-- SECTION_REF: 02-engine-mechanics.s026 -->

Section Ref: `02-engine-mechanics.s026`

### Impossible actions

<!-- SECTION_REF: 02-engine-mechanics.s027 -->

Section Ref: `02-engine-mechanics.s027`

If a required part of an effect is impossible, skip that impossible part unless the effect block says it requires all parts. Default policy is do as much as possible.

### If/then vs. then

<!-- SECTION_REF: 02-engine-mechanics.s028 -->

Section Ref: `02-engine-mechanics.s028`

- `If A, then B`: B depends on A.
- `A. Then, B`: B is independent unless explicitly linked.

Represent this with `FailurePolicy` and sequence semantics in the DSL.

### Negative power

<!-- SECTION_REF: 02-engine-mechanics.s029 -->

Section Ref: `02-engine-mechanics.s029`

Power may be negative. Negative power does not automatically remove a card.

### Negative cost

<!-- SECTION_REF: 02-engine-mechanics.s030 -->

Section Ref: `02-engine-mechanics.s030`

Intermediate cost may be negative. Final payable cost is clamped to 0.

### Rest vs. active conflict

<!-- SECTION_REF: 02-engine-mechanics.s031 -->

Section Ref: `02-engine-mechanics.s031`

If simultaneous effects require both rest and active, rest wins.

### Base power/cost setters

<!-- SECTION_REF: 02-engine-mechanics.s032 -->

Section Ref: `02-engine-mechanics.s032`

If multiple effects set base power/cost, use the rules-defined priority. If the rule says highest value wins for a category, implement that as a layer rule in the computed view.

### Infinite loops

<!-- SECTION_REF: 02-engine-mechanics.s033 -->

Section Ref: `02-engine-mechanics.s033`

The engine must detect repeated state/action/effect signatures.

```ts
interface LoopSignature {
  stateHash: string;
  pendingQueueHash: string;
  decisionHash?: string;
}
```

If neither player can stop the loop, the match is a draw. If one or both can stop it, the relevant player(s) declare a loop count according to rules, the engine executes the selected count, then stops at the break point. A loop may not be restarted from an identical state.

## Source-preserved rule details from the mechanical spec

<!-- SECTION_REF: 02-engine-mechanics.s034 -->

Section Ref: `02-engine-mechanics.s034`

The following details were explicit in the original mechanical specification and are kept here so implementation does not lose them.

### Exact win/loss conditions

<!-- SECTION_REF: 02-engine-mechanics.s035 -->

Section Ref: `02-engine-mechanics.s035`

Run defeat checks at every rule-processing checkpoint:

1. **Leader damage at 0 Life** - if a player has 0 Life cards and their Leader would take damage, that player loses.
2. **Deck-out** - if a player has 0 cards in deck at any rule-processing checkpoint, that player loses.
3. **Concession** - a player may concede at any time; concession is immediate and cannot be prevented or replaced by card effects.
4. **Effect-based win/loss** - card effects may directly cause a win or loss during effect resolution.
5. **Double loss** - if both players meet defeat conditions at the same rule-processing checkpoint, both lose and the match is a draw.

Rule processing happens after atomic state changes, including mid-effect. For example, if a player decks out while drawing during an effect, the loss is detected at the next rule-processing point.

### DON!! card mechanics

<!-- SECTION_REF: 02-engine-mechanics.s036 -->

Section Ref: `02-engine-mechanics.s036`

- Each DON!! attached to a Leader or Character grants +1000 power during the controller's turn only.
- During Main Phase, a player may give any number of active DON!! from cost area to their Leader or Characters.
- An attached DON!! card has `state: "attached"`; it is neither active nor rested while attached.
- When a card with attached DON!! leaves the field, all attached DON!! return to the owner's cost area rested.
- During Refresh Phase, all attached DON!! return to cost area rested, then the player's Leader, Characters, Stage, and DON!! in cost area become active.
- A `DON!! -X` cost may return the paying player's DON!! from cost area, attached to their Leader, or attached to their Characters unless the card text narrows the source. The paying player chooses the DON!! sources. If there are fewer than X eligible DON!! cards, the cost cannot be paid and the activation is illegal or declined before use is consumed.

### First-turn restrictions

<!-- SECTION_REF: 02-engine-mechanics.s037 -->

Section Ref: `02-engine-mechanics.s037`

The engine must track first/second player and each player's first turn.

| Player / turn                   |    Draw Phase |                DON!! Phase |        Attack |
| ------------------------------- | ------------: | -------------------------: | ------------: |
| Player going first, first turn  |       No draw |         Place only 1 DON!! | Cannot attack |
| Player going second, first turn | Draw normally | Place 2 DON!! if available | Cannot attack |

### Rule-process trashing is not effect trashing

<!-- SECTION_REF: 02-engine-mechanics.s038 -->

Section Ref: `02-engine-mechanics.s038`

Two common rule processes do not generate normal K.O./trash triggers:

- Playing a sixth Character requires trashing one existing Character before the new Character is played.
- Playing a new Stage trashes the existing Stage first.

These are rule processes, not card effects. Do not emit ordinary K.O./trash triggers unless official rulings require a specific exception.

### Damage-processing deferral

<!-- SECTION_REF: 02-engine-mechanics.s039 -->

Section Ref: `02-engine-mechanics.s039`

When damage is 2 or more, process each point of damage separately. Effects that trigger during damage processing wait until all damage processing completes before resolving. This matches the original note tied to rule 8-6-2.

### Trigger card zone

<!-- SECTION_REF: 02-engine-mechanics.s040 -->

Section Ref: `02-engine-mechanics.s040`

When a Life card with `[Trigger]` is activated:

1. The card is revealed.
2. It is in no zone while the trigger resolves.
3. After resolution, it is trashed unless the trigger or a replacement says otherwise.

The `[Trigger]` trash is replaceable if a replacement effect specifically applies.

### Auto-effect timing details

<!-- SECTION_REF: 02-engine-mechanics.s041 -->

Section Ref: `02-engine-mechanics.s041`

- `[When Attacking]` and `[On Your Opponent's Attack]` are distinct timing windows.
- The attacker's `[When Attacking]` effects trigger first.
- Defender's `[On Your Opponent's Attack]` effects trigger after that window.
- `[On K.O.]` activates on field but resolves from trash.
- `[DON!! xX]` triggers or becomes active when attached DON!! count goes from below X to at least X, depending on whether the specific effect is auto or permanent.

### Once-per-turn consumption

<!-- SECTION_REF: 02-engine-mechanics.s042 -->

Section Ref: `02-engine-mechanics.s042`

The engine records `[Once Per Turn]` usage in `GameState.oncePerTurn` by `cardInstanceId + effectId + turnNumber`.

Use is consumed only after the activation is legally committed:

1. Conditions required at activation have passed.
2. Required activation targets, if any, have been selected legally.
3. Required costs have been paid successfully.
4. The player has accepted an optional activation, if the effect is optional.

If a player declines an optional effect, cannot pay a cost, or cannot make a required activation-time selection, once-per-turn use is not consumed. If the effect is legally committed and later fizzles, loses its target, or does as much as possible during resolution, the once-per-turn use remains consumed.

For automatic once-per-turn effects, optional decline does not consume use; accepted automatic effects consume use when their queue entry begins resolution.

### Replacement priority

<!-- SECTION_REF: 02-engine-mechanics.s043 -->

Section Ref: `02-engine-mechanics.s043`

When multiple replacement effects apply to the same process:

1. The card generating the replaced event has first priority if applicable.
2. Turn player's replacements apply in that player's chosen order.
3. Non-turn player's replacements apply in that player's chosen order.
4. A replacement effect cannot apply more than once to the same process.
5. If the replacement cannot actually perform its replacement, it does not apply.

### Confirmed rulings carried forward

<!-- SECTION_REF: 02-engine-mechanics.s044 -->

Section Ref: `02-engine-mechanics.s044`

- Effect resolution uses a queue model.
- If turn player effect A and non-turn player effect B are waiting, and resolving A triggers turn player effect C, B resolves before C.
- Simultaneous effects controlled by the same player are ordered by that player.
- Effects triggered during damage processing wait until all damage processing finishes.
- Effects triggered by card/effect activation resolve after the triggering effect finishes.
- Start-of-game effects can modify the deck before opening draw.
