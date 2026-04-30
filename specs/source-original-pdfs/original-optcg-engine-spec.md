---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "original-optcg-engine-spec"
doc_title: "Original OPTCG Engine Spec Source Extract"
doc_type: "source-extract"
status: "supporting"
machine_readable: true
---

# Optcg Engine Spec - Source Extract

<!-- SECTION_REF: original-optcg-engine-spec.s001 -->

Section Ref: `original-optcg-engine-spec.s001`

This file preserves the text extracted from the original PDF. It is included so the Markdown spec remains auditable against the original planning documents. Formatting may reflect PDF extraction artifacts; the implementation-ready docs are the canonical rewritten specs.

---

OPTCG Engine — Mechanical Specification
Extracted from the Comprehensive Rules v1.2.0 (Jan 16, 2026). This document translates
the official rules into engine-relevant structures, data types, and logic flows. It is the
reference the @optcg/engine is built against.

1. Win/Loss Conditions
   The engine must check these after every state change (see Rule Processing below):

1. Leader takes damage at 0 Life — If a player has 0 Life cards and their Leader would
   take damage, that player loses. Checked at rule processing time, not instantly.

1. Deck-out — If a player has 0 cards in their deck at any rule processing checkpoint, that
   player loses.

1. Concession — A player may concede at any time. Immediate loss. Cannot be prevented
   or replaced by any card effect.

1. Effect-based win/loss — Some card effects directly cause a win or loss. These resolve
   during effect processing.

1. Double loss — If both players meet defeat conditions simultaneously at the same rule
   processing checkpoint, both lose (draw).

Rule Processing Timing
Rule processing (defeat checks) happens automatically whenever a game event resolves. It
interrupts even mid-resolution — if a player decks out while drawing as part of an effect, the
loss is detected at the next rule processing point. The engine needs a
checkRuleProcessing(state) function that runs after every atomic state change.

2. Zones
   Each player owns one of each zone. The engine tracks cards in each zone plus zone-
   specific metadata.

Zone Secret/Open

---

                                Engine Notes


                                Ordered stack. Neither player sees contents or order. Cards

Deck Secret
drawn from top.

DON!! Ordered stack, but contents are freely viewable (all DON!!
Open
Deck cards are identical, so this is trivial). Cards taken from top.

               Secret (own

Hand player can Unordered set. Owner sees all; opponent sees only count.
see)

                                Ordered stack, face-up. Both players see all contents. Owner

Trash Open
can reorder freely. New cards placed on top.

Leader Exactly 1 card. Cannot be moved by effects or rules. Has
Open
Area active/rested state.

                                0–5 cards, face-up. Each has active/rested state. Playing a

Character
Open 6th card forces trashing one existing character first (this is a
Area
rule process, not an effect — no triggers fire from it).

Stage 0–1 card, face-up. Has active/rested state. Playing a new
Open
Area stage trashes the existing one first.

                                DON!! cards, each with active/rested state. Both players see

Cost Area Open
contents. Owner chooses which to rest when paying costs.

                                Ordered stack, face-down. Neither player sees contents.

Life Area Secret Cards taken from top only. Some effects add cards face-up
(these become open as an exception).

Zone Transition Rules
When a card moves from Character Area or Stage Area to any other zone, it becomes a
new card — all applied effects are stripped. This is critical for the engine: effects must
be tracked per-card-instance, and moving resets the instance.

DON!! cards moving between zones also lose all applied effects.

When multiple cards are placed in a zone simultaneously, the owner chooses the order.

When cards move from an open area to a secret area simultaneously, the opponent
cannot see the order they’re placed in.

---

3. Card Types & Properties

Card Categories

                Where It      Has      Has     Has

Category Can Attack Notes
Lives Power Cost Life

                                               Yes
                Leader                                                  Cannot leave

Leader Yes No (setup Yes
Area Leader Area
only)

                                                         Yes (not on
                Character                                               Played from hand

Character Yes Yes No turn played,
Area by paying cost
unless Rush)

                Nowhere                                                 Activated from

Event (trashed No Yes No No hand → trashed
on use) → effect resolves

                Stage                                                   Played from hand

Stage No Yes No No
Area by paying cost

                Cost Area                                               10 per player,

DON!! / Given to No No No No entered from
cards DON!! Deck

Card Properties the Engine Tracks
For each card instance on the field:

    cardId — reference to the card data (Poneglyph ID)

    instanceId — unique per-game instance (resets when card moves zones)

    zone — current zone

    owner — which player owns this card

    controller — which player controls this card (usually same as owner)

    state — active | rested (only for field zones)

    attachedDon — number of DON!! cards given to this card

    appliedEffects — list of continuous effects currently modifying this card

---

    canAttackThisTurn — false on the turn a character is played (unless Rush)

    hasActivatedOncePerTurn — map of effect IDs that have been used this turn

    turnPlayed — the turn number this card entered play (for summoning sickness

tracking)

DON!! Card Mechanics
Each DON!! given to a Leader or Character grants +1000 power during your turn only.

Giving a DON!!: move 1 active DON!! from cost area → attach to a Leader/Character. Can
be done any number of times during Main Phase.

When a card with attached DON!! leaves the field, all attached DON!! return to cost area
rested.

During Refresh Phase, all attached DON!! return to cost area and are rested, then all
cards are set active.

4. Turn Structure
   A turn consists of 5 phases executed in strict order. The engine must enforce this sequence.

REFRESH PHASE
→ End "until the start of your next turn" effects
→ Activate "at the start of your turn" / "at the start of your opponent's turn" effects
→ Return all attached DON!! to cost area (rested)
→ Set all own cards in Leader/Character/Stage/Cost areas to active

DRAW PHASE
→ Turn player draws 1 card
→ Exception: Player going first skips this on their very first turn

DON!! PHASE
→ Place 2 DON!! from DON!! Deck into cost area (active)
→ Exception: Player going first places only 1 on their very first turn
→ If only 1 DON!! remains in deck, place 1
→ If 0 remain, place none

MAIN PHASE
→ Activate "at the start of the Main Phase" effects
→ Turn player may perform any number of Main Phase Actions in any order:
• Play a card (Character, Stage, or [Main] Event) from hand
• Activate [Main] or [Activate: Main] effects

---

        • Give DON!! cards to Leader/Characters
        • Declare an attack (initiates Battle sequence)
    → Neither player can battle on their very first turn
    → Turn player declares end of Main Phase to proceed

END PHASE
→ Activate [End of Your Turn] effects (turn player chooses order)
→ Activate [End of Your Opponent's Turn] effects (non-turn player chooses order)
→ Process "at the end of this/your turn" continuous effects (turn player first, then non-tu
→ Invalidate "until the end of the turn" / "until the end of the End Phase" effects
→ Invalidate "during this turn" effects (turn player first, then non-turn player)
→ Turn ends. Non-turn player becomes turn player. Proceed to Refresh Phase.

First Turn Restrictions
The engine needs a turnNumber counter per player (or a global turn counter with
first/second player tracking):

Player going first, Turn 1: No draw in Draw Phase. Only 1 DON!! in DON!! Phase.
Cannot attack.

Player going second, Turn 1: Cannot attack.

5. Battle Sequence
   Battles are a sub-sequence within the Main Phase. The engine must track the current battle
   state separately.

ATTACK STEP 1. Turn player rests an active Leader or Character (the "attacker") 2. Turn player selects target: opponent's Leader OR one of opponent's rested Characters 3. [When Attacking] / "when you attack" effects activate (ATTACKER'S perspective — turn pla 4. [On Your Opponent's Attack] effects activate (DEFENDER'S perspective — non-turn player)
These are two distinct timing windows. [When Attacking] is the attacker's trigger.
[On Your Opponent's Attack] is the defender's trigger. They fire in this order. 5. Check: if attacker or target has left their zone → skip to End of Battle

BLOCK STEP 6. Defending player may activate [Blocker] on one of their cards (once per battle)
→ That card rests and becomes the new target 7. [On Block] / "when you block" effects activate 8. Check: if attacker or target has left their zone → skip to End of Battle

COUNTER STEP

---

    9. Defending player may perform any number of counter actions in any order:
        • Trash a Character card with (Symbol) Counter from hand → target gets +power for this
        • Pay cost and trash a [Counter] Event from hand → activate [Counter] effect
    10. Check: if attacker or target has left their zone → skip to End of Battle

DAMAGE STEP 11. Compare attacker power vs target power 12. If attacker power >= target power (attacker wins):
• Target is Leader → deal 1 damage (see Damage Processing below)
• Target is Character → K.O. that character 13. If attacker power < target power: nothing happens

END OF BATTLE 14. "at the end of the/this battle" / "if this ... battles" effects activate 15. Turn player's "during this battle" effects expire 16. Non-turn player's "during this battle" effects expire 17. Return to Main Phase action loop

Damage Processing (within Damage Step)
When a Leader takes damage (default 1, or 2 with Double Attack, etc.):

For each point of damage: 1. If player has 0 Life → defeat condition met (checked at rule processing) 2. If player has 1+ Life → take top card of Life area 3. If that card has [Trigger]:
a. Player may REVEAL it and activate the [Trigger] instead of adding to hand
b. The card is "in no zone" while the trigger resolves
c. After trigger resolves, trash the card (unless trigger says otherwise) 4. If card has no [Trigger], or player declines: add card to hand (hidden)

If damage is 2+ (Double Attack), repeat the above per point of damage. Effects that trigger
during damage processing wait until ALL damage processing completes before resolving
(rule 8-6-2).

6. Playing Cards — Cost Payment Flow
   The engine must enforce this exact sequence when a player plays a card:

1. Reveal the card from hand
1. Determine the cost (base cost ± any modifying effects)
1. Select that many active DON!! cards in cost area
1. Rest those DON!! cards

---

5.  Place the card:
    • Character → Character Area (active, unless otherwise specified)
    • Stage → Stage Area (active). If a stage already exists, trash it first
    • Event → Trash (then resolve effect)
6.  If Character Area is full (5 cards), trash 1 existing character BEFORE playing
    (this trash is a RULE PROCESS — no effects trigger from it)
7.  Trigger [On Play] effects

8.  Effect System Overview
    This section covers the rules-level behavior of effects (categories, resolution order,
    replacement logic). For the implementation design — DSL format, custom handlers, the
    effect runtime, and the card addition pipeline — see optcg-effect-system.md .

Effect Categories
The engine must classify every effect into exactly one of these four types:

Type Description When It Fires Engine Implication

                   Fires automatically
                                            On specific            Engine must detect trigger

Auto when activation
game events events and queue the effect
event occurs

                   Player chooses to        Turn player’s
                                                                   Engine adds to legal actions

Activate activate during Main Phase
during Main Phase
Main Phase only

                   Always active while                             Engine applies as a modifier

Permanent Continuously
the card is in play layer on game state

                                            When the
                   Intercepts and                                  Engine must check for
                                            replaced

Replacement replaces a game replacements before executing
action would
action any replaceable action
occur

Auto Effect Keywords (Activation Timings)
These are the trigger events the engine must listen for:

Keyword Trigger Event

[On Play] This card is played to the field

---

[When Attacking] This card declares an attack

[On Block] This card’s [Blocker] is activated

                               This card is K.O.’d (battle loss or effect). Special: activates on

[On K.O.]
field, resolves from trash

[End of Your Turn] End Phase of your turn

[End of Your
End Phase of opponent’s turn
Opponent's Turn]

[On Your Opponent's Opponent declares an attack (fires after attacker’s [When
Attack] Attacking])

[Trigger] This card is moved from Life to hand during damage processing

                               This card is given DON!! cards such that attached count goes

[DON!! xX]
from <X to >=X

Auto Effect Critical Rules
An auto effect activates once per trigger event. If the same event occurs again, it
triggers again.

If the card that fulfilled a trigger condition moves zones before the effect activates,
the effect does NOT activate (rule 8-1-3-1-3). The engine must check card presence
before queuing.

Auto effects that trigger on zone transitions (like [On K.O.]) only activate if the
destination is an open area (rule 8-4-5).

[Once Per Turn] effects can only activate and resolve once per turn per card instance. If
the card leaves and re-enters the field, it’s a new instance and can activate again.

Effect Resolution Order
This is one of the most complex parts for the engine:

1. When both players’ effects trigger simultaneously, turn player resolves first.

2. If resolving the turn player’s effect A triggers another turn player effect C, the non-turn
   player’s waiting effect B resolves before C (rule 8-6-1).

3. Effects triggered during damage processing wait until all damage processing
   completes before resolving (rule 8-6-2).

---

4. Effects triggered by a card activation or effect activation resolve after the triggering
   effect finishes (rule 8-6-3).

Replacement Effects
Denoted by the word “instead” in card text.

If multiple replacements could apply, priority order: (1) the card generating the replaced
event, (2) turn player’s replacements in their chosen order, (3) non-turn player’s
replacements in their chosen order.

Once a replacement has been applied to a specific process, the same replacement
effect cannot apply again to that process (prevents infinite loops).

If a replacement effect can’t actually perform its replacement, it doesn’t apply.

Permanent Effects Processing Order
When permanent effects interact or modify each other:

1. Turn player processes their permanent effects (in any order they choose)

2. Non-turn player processes theirs

3. If steps 1–2 changed the game state further, repeat until stable

This is essentially a fixed-point calculation. The engine must loop until no further changes
occur.

One-Shot vs Continuous Effects
One-shot: resolves immediately, done. (e.g., “draw 1 card”, “K.O. 1 character”)

Continuous: persists for a duration. The engine must track expiration:

         “during this turn” → expires at end of End Phase

         “during this battle” → expires at End of Battle

         “until the end of the turn” / “until the end of the End Phase” → expires during End
         Phase processing

         “until the start of your next turn” → expires at start of next Refresh Phase

8. Keyword Effects Reference

---

Combat Keywords

Keyword Effect Engine Implementation

                    Character can attack the turn it’s            Set canAttackThisTurn =

[Rush]
played true on play

                    Character can attack opponent’s

[Rush: Allow character-targeting
Characters (not Leader) the turn it’s
Character] attacks on play turn only
played

[Double In damage step, set damage
Deals 2 damage to Leader instead of 1
Attack] count to 2

                                                                  Replace damage processing:
                    Life card is trashed instead of added

[Banish] trash life card, no trigger
to hand on damage
activation

                    Rest this card to redirect an attack to       During Block Step, add to legal

[Blocker]
it actions for defending player

                                                                  During Block Step, skip blocker

[Unblockable] Opponent cannot activate [Blocker]
window entirely

Timing Keywords

Keyword Meaning

[Activate: Main] Activate effect during Main Phase (not during battle)

[Main] Event card usable during Main Phase (not during battle)

[Counter] Event card usable during opponent’s Counter Step

[Once Per Turn] Effect can activate and resolve once per turn per card instance

Condition Keywords

Keyword Condition

[DON!! xX] Card has X or more DON!! attached

[Your Turn] It is currently your turn

---

[Opponent’s Turn] It is currently your opponent’s turn

9. “If” vs “Then” Clauses
   This matters for effect resolution:

   “If A, then B” — If A fails, B also fails. (Linked — both or neither.)

   “A. Then, B” — If A fails, B still resolves. (Independent — B happens regardless.)

The engine must parse these connectors in card effect text to determine dependency
chains.

10. Impossible Actions & Edge Cases

Core Principle
If a player is required to perform an impossible action, it’s simply skipped. If an effect has
multiple actions and some are impossible, perform as many as possible (rule 1-3-2).

Specific Edge Cases
Negative power: Power CAN go negative. A card with negative power is NOT
automatically trashed or removed — it stays on the field (rule 1-3-6-1).

Negative cost: During cost calculations, intermediate values can be negative. The final
cost is treated as 0 if it would be negative (rule 1-3-6-2).

Rest vs Active conflict: If an effect requires both resting and setting active
simultaneously, rest takes precedence (rule 1-3-8).

Simultaneous choices: If both players must choose at the same time, turn player
chooses first, then non-turn player (rule 1-3-4).

“Base” power/cost: Refers to the printed value on the card. If multiple effects set base
power, the highest value wins (rule 4-9-2-1).

“Set Power to 0”: This is a reduction by the card’s current power, not setting to literal 0.
If power is already negative, nothing happens (rule 4-12).

Infinite Loops
The engine must detect infinite loops:

---

1. Neither player can stop it → game is a draw.

2. One player can stop it → that player declares a loop count, execute that many times,
   stop at the point where they can choose to break.

3. Both players can stop it → turn player declares count, non-turn player declares count,
   execute the lesser count, stop at the point where that player can break.

After a loop resolves, neither player can restart the same loop if the game state is identical
to before.

11. State Filtering & Information Visibility
    The server holds the full GameState . No client ever receives it. Instead, the server produces
    a filtered view per recipient. These functions are a security boundary — getting them
    wrong leaks competitive information.

filterStateForPlayer(state, playerId) → PlayerView

Every field in GameState must be explicitly classified as visible, hidden, or partially visible
for each viewer type. If a field isn’t in this spec, it defaults to hidden.

11.1 Player View — Zone Visibility
Each player receives their own view. “Self” = the player receiving the view. “Opponent” = the
other player.

Zone Self’s Zone Opponent’s Zone

Deck Card count only Card count only

DON!!
Card count (all cards identical) Card count
Deck

Hand Full card data for all cards Card count only

Trash Full card data, ordered Full card data, ordered

Leader Full card data + active/rested state + Full card data + active/rested state +
Area attached DON!! count attached DON!! count

Character Full card data + active/rested state + Full card data + active/rested state +
Area attached DON!! count per character attached DON!! count per character

---

Stage Area Full card data + active/rested state Full card data + active/rested state

                  DON!! count + each card’s                  DON!! count + each card’s

Cost Area
active/rested state active/rested state

Life Area Card count only Card count only

Life Area
Card data for face-up cards + Card data for face-up cards +
(face-up
position in stack position in stack
cards)

11.2 Spectator View
Spectators always see full information — both hands, all zones, identical to server state.
The anti-ghosting measure is a turn delay, not information filtering. Spectators see the
game as it was N turns ago, so relaying info to a player is stale. See the main plan doc
(section 11) for delay mode configuration.

11.3 Replay View
Full information, no filtering, no delay. Both hands, deck order, life contents — everything.
The match is over, so no competitive risk.

11.4 Temporary Visibility Events
These are moments where information briefly becomes visible beyond the zone’s default
rules. The server must track these and include them in the filtered view for the correct
recipients.

Event Who Sees Duration

Playing a card from hand From reveal through
Both players
(Character, Stage, Event) placement/resolution

Activating (Symbol) Counter
Both players From reveal through trash
from hand

                                                              Player reveals the life card; visible

[Trigger] activation Both players from reveal until it’s trashed or
otherwise resolved

                                        Neither player

[Trigger] declined (card goes to hand Never visible
unrevealed)

---

Searching deck (effect says Searching player During the search action only;
“look at” / “choose from deck”) only cards return to hidden after

Card moves from secret area Both players
to secret area (e.g., deck → (mandatory reveal During the move action
hand via search) per rule 11-2-1)

                                    The player using

“Look at” effects on Life or
the effect only During effect resolution only
Deck
(rule 11-3-1)

                                    As specified by

Revealing hand/life by effect the effect (usually During effect resolution only
both players)

The filtered view needs a revealedCards array — cards that are temporarily visible to this
recipient beyond normal zone rules:

interface PlayerView {
// ... normal zone data ...
revealedCards: {
cardId: string;
instanceId: string;
sourceZone: Zone;
reason: RevealReason; // 'play' | 'trigger' | 'search' | 'effect' | 'counter'
}[];
}

The server adds entries to revealedCards when a reveal event starts and removes them
when the event ends (effect resolves, card is placed, etc.).

11.5 Battle-Specific Visibility
During a battle, no additional hidden information is revealed beyond what’s already covered
above. The filtered view should include battle context so the client can render the battle UI:

interface BattleContext {
attackerId: string; // instance ID of attacking card
targetId: string; // instance ID of target card
currentStep: 'attack' | 'block' | 'counter' | 'damage' | 'end';
attackerPower: number; // current power including modifiers
targetPower: number; // current power including modifiers
blockerActive: boolean; // whether a blocker has been activated
blockerId?: string; // instance ID of blocker, if any
}

---

Both players see the same BattleContext — all of this is public information.

11.6 Effect Resolution Visibility
What both players see: which card’s effect is activating, choices made in public zones
(targets, selections), results on public zones (cards moved, power changes, K.O.s).

What only the acting player sees: cards revealed by “look at” effects (deck searches, life
peeks), their own hand contents when choosing cards to discard/trash.

What the opponent sees instead: “Opponent is searching their deck” (no card data),
“Opponent chose X cards” (count only, unless the effect specifies reveal), cards becoming
visible on arrival at public zones.

The server should emit effect events alongside state diffs:

interface EffectEvent {
sourceCardId: string;
effectType: string; // 'onPlay' | 'whenAttacking' | 'trigger' | etc.
description: string; // human-readable, for the game log
visibleTo: 'both' | 'self' | 'opponent';
choices?: { // only included if visible to recipient
type: 'target' | 'select' | 'search';
selected: string[]; // card instance IDs
};
}

11.7 Edge Cases
Simultaneous reveals: If an effect reveals multiple cards at once (e.g., “reveal the top 5 of
your deck”), all are added to revealedCards simultaneously and removed simultaneously
when the effect resolves.

Face-up life cards: Some effects add cards to the Life Area face-up. These are visible to
both players for as long as they remain. Other life cards stay hidden. If a face-up life card is
moved, it follows normal visibility rules for the destination zone.

Trash is always public: Cards entering the trash are immediately visible to both players
regardless of origin. A card discarded from hand is hidden until it hits the trash.

Opponent’s choices in secret zones: When an effect forces the opponent to choose cards
from their hand (e.g., “your opponent trashes 1 card”), the choosing player sees their
options but the other player only sees the result (card appearing in trash).

---

DON!! cards are trivial: All DON!! cards are identical. No hidden information in DON!!
identity — only count and state matter.

11.8 filterStateForPlayer — Pseudocode

function filterStateForPlayer(fullState, playerId):
view = new PlayerView()

    self = fullState.players[playerId]
    opponent = fullState.players[getOpponentId(playerId)]


    // Self zones — full visibility
    view.self.hand = self.hand                                // full card data
    view.self.trash = self.trash                              // full card data
    view.self.leaderArea = self.leaderArea                    // full card data + state
    view.self.characterArea = self.characterArea              // full card data + state
    view.self.stageArea = self.stageArea                      // full card data + state
    view.self.costArea = self.costArea                        // full DON!! data + states
    view.self.deckCount = self.deck.length                    // count only
    view.self.donDeckCount = self.donDeck.length              // count only
    view.self.lifeCount = self.life.length                    // count only
    view.self.lifeFaceUp = self.life.filter(c => c.faceUp)         // face-up cards only


    // Opponent zones — restricted
    view.opponent.handCount = opponent.hand.length            // count only
    view.opponent.trash = opponent.trash                      // full card data
    view.opponent.leaderArea = opponent.leaderArea            // full card data + state
    view.opponent.characterArea = opponent.characterArea // full card data + state
    view.opponent.stageArea = opponent.stageArea              // full card data + state
    view.opponent.costArea = opponent.costArea                 // full DON!! data + states
    view.opponent.deckCount = opponent.deck.length             // count only
    view.opponent.donDeckCount = opponent.donDeck.length // count only
    view.opponent.lifeCount = opponent.life.length             // count only
    view.opponent.lifeFaceUp = opponent.life.filter(c => c.faceUp)


    // Temporary reveals
    view.revealedCards = fullState.revealedCards
      .filter(r => r.visibleTo === 'both' || r.visibleTo === playerId)


    // Battle context (public)
    view.battleContext = fullState.activeBattle ?? null


    // Effect events (filtered)
    view.effectEvents = fullState.pendingEffectEvents
      .filter(e => e.visibleTo === 'both' || e.visibleTo === playerId)

---

    // Game metadata (public)
    view.turnNumber = fullState.turnNumber
    view.currentPhase = fullState.currentPhase
    view.turnPlayerId = fullState.turnPlayerId
    view.legalActions = getLegalActions(fullState, playerId)


    return view

11.9 Security Checklist
Before any state leaves the server, verify:

No deck contents or ordering sent to any client

No life card contents sent (except face-up cards)

Opponent’s hand sends count only, never card data

“Look at” effects only reveal to the searching player

Trigger cards only revealed if the player chose to activate (declined triggers stay hidden)

Spectator views include the configured turn delay

    revealedCards entries are cleaned up after the revealing event ends

No server-internal fields (deck order, RNG seeds, effect queue internals) leak into any
view

12. Confirmed Rulings (Judge-Verified)
    These questions were ambiguous from the comprehensive rules alone. Answers confirmed
    by judge-level players.

1. Effect resolution uses a queue model (FIFO). When the turn player has effects A and
   B triggered simultaneously and resolves A first, and A triggers C — B resolves before C.
   New triggers go to the back of the queue, not the top. This matches rule 8-6-1’s
   description.

1. Simultaneous effects — owning player chooses resolution order. When multiple
   characters are K.O.’d simultaneously, multiple [On Play] effects trigger at once, or any
   other scenario where multiple effects share the same timing — the owning player of
   those effects chooses the order they resolve in. This applies consistently across all
   simultaneous trigger scenarios.

---

3. [When Attacking] and [On Your Opponent’s Attack] are distinct timing windows
   from different perspectives. [When Attacking] is the attacker’s trigger (turn player
   perspective). [On Your Opponent’s Attack] is the defender’s trigger (non-turn player
   perspective). They are not the same effect and fire in sequence: attacker’s [When
   Attacking] first, then defender’s [On Your Opponent’s Attack]. There is no overlap or
   ambiguity here — the rules are clear when read from the correct player’s perspective.

4. [Trigger] trash is replaceable. The “unless otherwise specified” clause in rule 10-1-5-
   3 includes replacement effects. If a replacement effect can intercept the trash, it applies
   normally.

5. “At the start of the game” effects can modify the deck before the opening draw.
   These effects resolve in the window after first/second is declared but before hands are
   drawn. The deck is shuffled afterward (rule 5-2-1-5-2), so any deck modifications are
   randomized before the opening hand is drawn. The engine must process this window
   correctly: leader effects → shuffle → draw opening hands → mulligan.

---
