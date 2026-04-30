---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "original-optcg-effect-system"
doc_title: "Original OPTCG Effect System Source Extract"
doc_type: "source-extract"
status: "supporting"
machine_readable: true
---

# Optcg Effect System - Source Extract

<!-- SECTION_REF: original-optcg-effect-system.s001 -->

Section Ref: `original-optcg-effect-system.s001`

This file preserves the text extracted from the original PDF. It is included so the Markdown spec remains auditable against the original planning documents. Formatting may reflect PDF extraction artifacts; the implementation-ready docs are the canonical rewritten specs.

---

OPTCG Engine — Effect System Design
This document defines how card effects are represented, executed, and authored in the
engine. It is the companion to optcg-engine-spec.md (which covers turn structure, battle
sequence, and game rules) and focuses specifically on the effect layer.

1. Architecture Overview
   The effect system has three layers:

┌─────────────────────────────────────────┐
│ Effect Definitions │
│ DSL (JSON) + Custom Handlers (TS) │
│ "What does this card do?" │
└──────────────────┬──────────────────────┘
│
┌──────────────────▼──────────────────────┐
│ Effect Runtime │
│ Queue, resolution, targeting, choices │
│ "How do effects execute?" │
└──────────────────┬──────────────────────┘
│
┌──────────────────▼──────────────────────┐
│ Engine Core │
│ GameState, applyAction, zones, rules │
│ "What is the game doing?" │
└─────────────────────────────────────────┘

Effect definitions describe what a card does. The effect runtime executes those definitions
against the game state. The engine core provides the state and rules that the runtime
operates on.

2. Representation Strategy

2.1 Three-Phase Approach
Phase 1 — Data-driven DSL (foundation): A structured JSON format that describes

---

effects as compositions of primitives. Covers ~70–80% of cards. This is what the engine
executes.

Phase 2 — Custom handlers (escape hatch): TypeScript functions keyed by card ID for
effects too complex for the DSL. The engine checks for a custom handler first, falls back to
the DSL.

Phase 3 — Automated generation (scale): A pipeline that takes Poneglyph card text and
generates DSL definitions. Initially rule-based parsing, potentially LLM-assisted later.
Human review before merge — never auto-deployed blind.

The engine always executes the same format. Only the authoring method changes over
time.

2.2 Resolution Order
When the engine needs to execute a card’s effect:

1.  Check: does a custom handler exist for this card ID?
    → Yes: execute the custom handler
    → No: continue

2.  Check: does a DSL definition exist for this card ID?
    → Yes: interpret and execute the DSL
    → No: card has no effect (vanilla card, or missing definition — log a warning)

Custom handlers have full access to the GameState and can do anything the engine can do.
They exist for cards that genuinely can’t be expressed in the DSL — not as a shortcut for
cards that are merely complex.

3. The Effect DSL

3.1 Design Principles
Composable: Complex effects are built from simple primitives combined together.

Declarative: Definitions describe what happens, not how. The runtime handles
execution order, targeting prompts, and state mutations.

Serializable: Definitions are plain JSON. They can be stored, diffed, version-controlled,
and generated.

Exhaustive conditions: Every conditional branch must be expressible — “if”, “then”,

---

     “else”, “choose one”, “up to X”.

3.2 Top-Level Structure
Every card’s effect definition is an EffectDefinition :

interface EffectDefinition {
cardId: string; // Poneglyph card ID
effects: EffectBlock[]; // one or more effect blocks on this card
}

interface EffectBlock {
trigger: Trigger; // when does this effect activate?
condition?: Condition; // optional: must this be true to activate?
cost?: Cost; // optional: activation cost
mandatory: boolean; // is this effect mandatory or optional ("you may")?
oncePerTurn: boolean; // [Once Per Turn] keyword
effect: Effect; // what happens when this resolves
}

A card can have multiple EffectBlock entries — one for each distinct effect on the card
(e.g., an [On Play] effect and a [When Attacking] effect on the same character).

3.3 Triggers
Triggers define when an effect activates. These map directly to the keywords from the
comprehensive rules.

type Trigger =
| { type: 'onPlay' }
| { type: 'whenAttacking' }
| { type: 'onOpponentAttack' }
| { type: 'onBlock' }
| { type: 'onKO' }
| { type: 'endOfYourTurn' }
| { type: 'endOfOpponentTurn' }
| { type: 'trigger' } // [Trigger] from life area
| { type: 'donAttach'; count: number } // [DON!! xX]
| { type: 'activateMain' } // [Activate: Main]
| { type: 'main' } // [Main] on events
| { type: 'counter' } // [Counter] on events
| { type: 'permanent' } // always-on effect
| { type: 'startOfYourTurn' }
| { type: 'startOfOpponentTurn' }
| { type: 'startOfMainPhase' }

---

    | { type: 'endOfBattle' }
    | { type: 'custom'; event: string }                   // escape hatch for unusual triggers

3.4 Conditions
Conditions are boolean checks that must be true for the effect to activate or resolve.

type Condition =
| { type: 'donCount'; min: number } // DON!! attached >= X
| { type: 'yourTurn' }
| { type: 'opponentTurn' }
| { type: 'lifeCount'; player: Player; op: Comparator; value: number }
| { type: 'fieldCount'; player: Player; filter?: CardFilter; op: Comparator; value: number
| { type: 'handCount'; player: Player; op: Comparator; value: number }
| { type: 'trashCount'; player: Player; filter?: CardFilter; op: Comparator; value: number
| { type: 'hasCardInZone'; zone: Zone; player: Player; filter: CardFilter }
| { type: 'attackTarget'; targetType: 'leader' | 'character' | 'any' }
| { type: 'cardState'; state: 'active' | 'rested' }
| { type: 'and'; conditions: Condition[] }
| { type: 'or'; conditions: Condition[] }
| { type: 'not'; condition: Condition }
| { type: 'custom'; check: string } // escape hatch

type Comparator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
type Player = 'self' | 'opponent';

3.5 Costs
Costs are actions the player must perform to activate the effect (the part before the : in
card text).

type Cost =
| { type: 'restDon'; count: number } // ①②③ etc.
| { type: 'returnDon'; count: number } // DON!! -X
| { type: 'restSelf' } // rest this card
| { type: 'trashFromHand'; count: number; filter?: CardFilter }
| { type: 'trashSelf' }
| { type: 'trashFromField'; count: number; filter?: CardFilter }
| { type: 'sequence'; costs: Cost[] } // multiple costs in order
| { type: 'custom'; action: string } // escape hatch

3.6 Effects (Actions)
Effects are the actual game actions performed when the effect resolves. This is the core of

---

the DSL.

type Effect =
// Card movement
| { type: 'draw'; count: number; player: Player }
| { type: 'drawUpTo'; count: number; player: Player }
| { type: 'search'; zone: 'deck' | 'trash'; player: Player;
filter: CardFilter; count: number; destination: Zone;
reveal?: boolean; shuffle?: boolean }
| { type: 'bounce'; target: Target; destination: 'hand' | 'deck' | 'deckBottom' }
| { type: 'trash'; target: Target }
| { type: 'ko'; target: Target }
| { type: 'play'; source: Zone; player: Player; filter: CardFilter;
costModifier?: number } // play a card (optionally with reduced c
| { type: 'trashFromHand'; player: Player; count: number;
filter?: CardFilter; chooser?: Player } // chooser: who picks which cards

// Power modification
| { type: 'modifyPower'; target: Target; value: number;
duration: Duration } // +/- power
| { type: 'setPowerToZero'; target: Target; duration: Duration }
| { type: 'setBasePower'; target: Target; value: number; duration: Duration }

// State changes
| { type: 'rest'; target: Target }
| { type: 'activate'; target: Target } // set active
| { type: 'giveKeyword'; target: Target; keyword: Keyword; duration: Duration }
| { type: 'removeKeyword'; target: Target; keyword: Keyword; duration: Duration }

// DON!! manipulation
| { type: 'addDon'; count: number } // add DON!! from DON!! deck to cost area
| { type: 'attachDon'; target: Target; count: number }
| { type: 'returnDon'; count: number } // return DON!! to DON!! deck

// Life manipulation
| { type: 'addLife'; count: number; source: 'deck' } // add cards to life from deck
| { type: 'damage'; target: 'leader'; player: Player; count: number }

// Cost modification
| { type: 'modifyCost'; filter: CardFilter; value: number;
duration: Duration; player: Player } // cards matching filter cost +/- X

// Effect modification
| { type: 'invalidateEffects'; target: Target; duration: Duration }
| { type: 'protectFromKO'; target: Target; duration: Duration }
| { type: 'cannotAttack'; target: Target; duration: Duration }

---

    | { type: 'cannotBlock'; target: Target; duration: Duration }
    | { type: 'cannotBeAttacked'; target: Target; duration: Duration }
    | { type: 'cannotBeBlockedBy'; target: Target; filter: CardFilter; duration: Duration }


    // Reveal / look
    | { type: 'reveal'; zone: Zone; player: Player; count: number }
    | { type: 'lookAt'; zone: Zone; player: Player; count: number }


    // Composites
    | { type: 'sequence'; effects: Effect[] }                // do A, then B, then C
    | { type: 'choice'; options: Effect[]; count?: number }         // choose N of these effects
    | { type: 'conditional'; if: Condition; then: Effect; else?: Effect }
    | { type: 'forEachMatch'; zone: Zone; player: Player; filter: CardFilter;
        effect: Effect }                                     // repeat effect for each matching card
    | { type: 'repeat'; count: number; effect: Effect }


    // Replacement
    | { type: 'replacement'; when: ReplacementTrigger; instead: Effect }


    // Escape hatch
    | { type: 'custom'; handler: string }                    // references a named custom handler

3.7 Targets
Targets define which cards an effect applies to. Some require player choice, others are
automatic.

type Target =
| { type: 'self' } // this card
| { type: 'myLeader' }
| { type: 'opponentLeader' }
| { type: 'choose'; zone: Zone; player: Player; filter: CardFilter;
count: number; upTo?: boolean } // player chooses cards
| { type: 'all'; zone: Zone; player: Player; filter?: CardFilter }
| { type: 'attacker' } // current attacking card (during battle)
| { type: 'attackTarget' } // current attack target (during battle)
| { type: 'blocker' } // card that activated blocker
| { type: 'thisCharacter' } // the character this effect belongs to
| { type: 'triggerCard' } // the card that triggered this effect

3.8 Supporting Types

type CardFilter = {
cardName?: string; // exact name match
cardNameContains?: string; // partial name match ("Straw Hat")

---

      category?: CardCategory[];            // 'character' | 'event' | 'stage' | 'leader'
      color?: Color[];
      type?: string[];                      // card types (Straw Hat Crew, Navy, etc.)
      attribute?: Attribute[];
      costOp?: Comparator;
      costValue?: number;
      powerOp?: Comparator;
      powerValue?: number;
      hasKeyword?: Keyword[];
      excludeSelf?: boolean;                // exclude the card generating this effect

};

type Duration =
| { type: 'thisAction' } // immediate, one-shot
| { type: 'thisBattle' }
| { type: 'thisTurn' }
| { type: 'untilEndOfTurn' }
| { type: 'untilStartOfNextTurn' }
| { type: 'permanent' } // lasts until card leaves field
| { type: 'whileOnField' } // same as permanent, explicit

type Keyword =
| 'rush' | 'doubleAttack' | 'banish' | 'blocker'
| 'unblockable' | 'rushCharacter';

type Zone = 'hand' | 'deck' | 'trash' | 'field' | 'life' | 'costArea'
| 'characterArea' | 'stageArea' | 'leaderArea' | 'donDeck';

type CardCategory = 'leader' | 'character' | 'event' | 'stage' | 'don';

type Color = 'red' | 'green' | 'blue' | 'purple' | 'black' | 'yellow';

type Attribute = 'slash' | 'strike' | 'ranged' | 'special' | 'wisdom';

type ReplacementTrigger =
| { type: 'wouldBeKOd'; target: Target }
| { type: 'wouldTakeDamage'; target: Target }
| { type: 'wouldBetrashed'; target: Target }
| { type: 'wouldDraw'; player: Player }
| { type: 'custom'; event: string }

4. DSL Examples

4.1 Vanilla Character (no effect)

---

{
"cardId": "OP01-006",
"effects": []
}

No definition needed — the engine treats missing definitions as vanilla.

4.2 Simple On Play — Draw 1
Card text: [On Play] Draw 1 card.

{
"cardId": "OP01-015",
"effects": [{
"trigger": { "type": "onPlay" },
"mandatory": true,
"oncePerTurn": false,
"effect": { "type": "draw", "count": 1, "player": "self" }
}]
}

4.3 When Attacking with DON!! Condition
Card text: [DON!! x2] [When Attacking] Draw 1 card, then trash 1 card from your
hand.

{
"cardId": "OP01-020",
"effects": [{
"trigger": { "type": "whenAttacking" },
"condition": { "type": "donCount", "min": 2 },
"mandatory": true,
"oncePerTurn": false,
"effect": {
"type": "sequence",
"effects": [
{ "type": "draw", "count": 1, "player": "self" },
{ "type": "trashFromHand", "player": "self", "count": 1, "chooser": "self" }
]
}
}]
}

---

4.4 Counter Event — Power Boost + Conditional K.O.
Card text: [Counter] Up to 1 of your Leader or Character cards gets +4000 power
during this battle. Then, if your opponent has 5 or more Life cards, K.O. up to 1
of your opponent's Characters with 3000 or less power.

{
"cardId": "OP01-029",
"effects": [{
"trigger": { "type": "counter" },
"mandatory": true,
"oncePerTurn": false,
"effect": {
"type": "sequence",
"effects": [
{
"type": "modifyPower",
"target": {
"type": "choose", "zone": "field", "player": "self",
"filter": { "category": ["leader", "character"] },
"count": 1, "upTo": true
},
"value": 4000,
"duration": { "type": "thisBattle" }
},
{
"type": "conditional",
"if": { "type": "lifeCount", "player": "opponent", "op": "gte", "value": 5 },
"then": {
"type": "ko",
"target": {
"type": "choose", "zone": "characterArea", "player": "opponent",
"filter": { "powerOp": "lte", "powerValue": 3000 },
"count": 1, "upTo": true
}
}
}
]
}
}]
}

4.5 Blocker + On K.O.
Card text: [Blocker] [On K.O.] Draw 1 card.

---

{
"cardId": "OP01-033",
"effects": [
{
"trigger": { "type": "permanent" },
"mandatory": true,
"oncePerTurn": false,
"effect": { "type": "giveKeyword", "target": { "type": "self" },
"keyword": "blocker", "duration": { "type": "whileOnField" } }
},
{
"trigger": { "type": "onKO" },
"mandatory": true,
"oncePerTurn": false,
"effect": { "type": "draw", "count": 1, "player": "self" }
}
]
}

4.6 Activate: Main with Cost
Card text: [Activate: Main] [Once Per Turn] ② Rest this Character: K.O. up to 1 of
your opponent's Characters with a cost of 3 or less.

{
"cardId": "OP01-040",
"effects": [{
"trigger": { "type": "activateMain" },
"mandatory": false,
"oncePerTurn": true,
"cost": {
"type": "sequence",
"costs": [
{ "type": "restDon", "count": 2 },
{ "type": "restSelf" }
]
},
"effect": {
"type": "ko",
"target": {
"type": "choose", "zone": "characterArea", "player": "opponent",
"filter": { "costOp": "lte", "costValue": 3 },
"count": 1, "upTo": true
}
}
}]

---

}

4.7 Leader with Multiple Effects
Card text: [DON!! x1] [Your Turn] All of your {Straw Hat Crew} type Characters gain
+1000 power. [Activate: Main] [Once Per Turn] ④ Draw 2 cards, then trash 1 card
from your hand.

{
"cardId": "OP01-001",
"effects": [
{
"trigger": { "type": "permanent" },
"condition": {
"type": "and",
"conditions": [
{ "type": "donCount", "min": 1 },
{ "type": "yourTurn" }
]
},
"mandatory": true,
"oncePerTurn": false,
"effect": {
"type": "modifyPower",
"target": {
"type": "all", "zone": "characterArea", "player": "self",
"filter": { "type": ["Straw Hat Crew"] }
},
"value": 1000,
"duration": { "type": "whileOnField" }
}
},
{
"trigger": { "type": "activateMain" },
"mandatory": false,
"oncePerTurn": true,
"cost": { "type": "restDon", "count": 4 },
"effect": {
"type": "sequence",
"effects": [
{ "type": "draw", "count": 2, "player": "self" },
{ "type": "trashFromHand", "player": "self", "count": 1, "chooser": "self" }
]
}
}
]

---

}

5. Custom Handlers

5.1 When to Use Custom Handlers
Custom handlers exist for cards that genuinely cannot be expressed in the DSL. Indicators:

     The effect references game state in ways the DSL conditions can’t express (e.g., “if you
     attacked with 3 or more different characters this turn”)

     The effect creates ongoing state tracking that doesn’t fit the standard continuous effect
     model

     The effect modifies the rules themselves (e.g., alternate win conditions)

     The effect has complex branching with nested player choices that would make the DSL
     unreadable

The goal is to minimize custom handlers. If multiple cards need similar custom logic, that’s a
signal to extend the DSL with a new primitive.

5.2 Handler Interface

interface CustomHandler {
cardId: string;

     // Called when the engine would normally execute the DSL for this card.
     // Receives full GameState and must return the new GameState.
     execute(
       state: GameState,
       context: EffectContext
     ): GameState | EffectPause;

}

interface EffectContext {
triggerType: TriggerType; // which trigger fired
sourceCard: CardInstance; // the card whose effect is executing
sourcePlayer: PlayerId;
battleContext?: BattleContext; // present if we're in a battle
choices: Map<string, any>; // player choices already made in this resolution
}

// When the handler needs player input before continuing:

---

interface EffectPause {
type: 'awaitChoice';
choiceId: string;
prompt: ChoicePrompt; // what to ask the player
resume: (choice: any) => GameState | EffectPause;
}

5.3 Registration
Custom handlers are registered in a simple map:

// handlers/index.ts
import { op01_045 } from './OP01-045';
import { op03_099 } from './OP03-099';

export const customHandlers: Map<string, CustomHandler> = new Map([
['OP01-045', op01_045],
['OP03-099', op03_099],
]);

5.4 Testing Custom Handlers
Every custom handler must have its own test file with at least:

     The basic effect working correctly

     Edge cases specific to that card

     Interaction with relevant keywords (blocker, trigger, etc.)

     Confirmation that the handler produces the same result as if the card were DSL-defined
     for the parts that overlap

6. Effect Runtime

6.1 The Effect Queue
The engine maintains a FIFO queue of pending effects. This is the core execution model.

interface EffectQueueEntry {
id: string; // unique ID for this queued effect
sourceCardId: string; // which card generated this effect
sourceCardInstanceId: string; // instance ID (for zone-change tracking)
sourcePlayerId: PlayerId; // who owns the effect

---

     effectBlock: EffectBlock;                  // the full effect definition
     state: 'pending' | 'resolving' | 'resolved' | 'cancelled';

}

6.2 Queue Processing Rules
These rules come directly from the confirmed judge rulings in the engine spec:

1. Turn player’s effects queue first. When both players’ effects trigger simultaneously,
   the turn player’s effects are added to the queue first.

2. Owning player chooses order. When a player has multiple effects triggering at the
   same time, they choose the order those effects are added to the queue.

3. FIFO resolution. Effects resolve from the front of the queue. New effects triggered
   during resolution are added to the back.

4. Zone-change cancellation. Before an effect resolves, the engine checks if the source
   card is still in the zone it was in when the effect was queued. If it’s moved, the effect is
   cancelled (rule 8-1-3-1-3).

5. Damage processing defers. Effects triggered during damage processing are held until
   all damage processing completes, then added to the queue.

6. Effect-triggered effects defer. Effects triggered by a card activation or effect
   resolution wait until the triggering effect finishes, then are added to the queue.

6.3 Queue Processing Loop

function processEffectQueue(state, queue):
while queue is not empty:
entry = queue.dequeue()

       // Zone-change check
       if entry.sourceCard has moved zones since queuing:
          entry.state = 'cancelled'
          continue


       // Condition check
       if entry.effectBlock.condition and not evaluate(entry.effectBlock.condition, state):
          entry.state = 'cancelled'
          continue


       // Cost payment
       if entry.effectBlock.cost:
          if not canPayCost(state, entry.effectBlock.cost, entry.sourcePlayerId):

---

              entry.state = 'cancelled'
              continue
            state = payCost(state, entry.effectBlock.cost, entry.sourcePlayerId)


          // Execute the effect
          entry.state = 'resolving'
          state = executeEffect(state, entry.effectBlock.effect, entry)
          entry.state = 'resolved'


          // Check for newly triggered effects
          newTriggers = detectTriggeredEffects(state, lastAction)
          // Turn player's triggers first, then non-turn player's
          // Each player chooses order of their own triggers
          sortedTriggers = sortByTurnPlayerFirst(newTriggers)
          queue.enqueueAll(sortedTriggers)


          // Rule processing (defeat checks)
          state = checkRuleProcessing(state)
          if state.gameOver:
            return state


     return state

6.4 Player Choices During Resolution
Many effects require player input mid-resolution — choosing targets, selecting cards from a
search, deciding whether to activate an optional effect. The engine handles this by pausing
execution and requesting input.

interface ChoiceRequest {
choiceId: string;
playerId: PlayerId; // who needs to choose
type: 'selectCards' | 'selectTarget' | 'yesNo' | 'selectOption';
prompt: string; // human-readable description
options?: any[]; // available choices
constraints: {
min: number;
max: number;
filter?: CardFilter;
zone?: Zone;
};
timeout?: number; // seconds before auto-pass
}

The match server receives the ChoiceRequest , sends it to the appropriate player’s client,

---

waits for the response, validates the response against the constraints, and feeds it back to
the engine to continue resolution.

6.5 Replacement Effect Interception
Before any replaceable action executes, the engine checks for active replacement effects:

function executeReplaceableAction(state, action):
// Collect applicable replacement effects
replacements = findReplacements(state, action)

    if replacements is empty:
      return executeAction(state, action)


    // Priority: source card's replacement > turn player's > non-turn player's
    sorted = sortByPriority(replacements)


    // Apply the first applicable replacement
    for replacement in sorted:
      if canApply(replacement, state, action):
        // Mark this replacement as used for this action (prevent loops)
        state = markReplacementUsed(state, replacement, action)
        return executeEffect(state, replacement.instead, context)


    // No replacement applied — execute normally
    return executeAction(state, action)

7. Continuous Effects Layer
   Permanent effects and continuous effects (power buffs, keyword grants, restrictions) don’t
   go through the queue — they’re applied as a modifier layer on top of the base game state.

7.1 How Continuous Effects Work
The engine maintains a list of active continuous effects. When any part of the system reads
a card’s power, cost, keywords, or capabilities, it applies all relevant continuous effects on
top of the base values.

interface ContinuousEffect {
id: string;
sourceCardId: string;
sourcePlayerId: PlayerId;
effect: Effect; // the modification being applied

---

     duration: Duration;
     condition?: Condition;                // re-evaluated each time the effect is checked
     appliedAt: number;                    // timestamp for ordering

}

7.2 Recalculation
Continuous effects are recalculated whenever the game state changes — the fixed-point
loop from the engine spec:

function recalculateContinuousEffects(state):
repeat:
previousState = snapshot(state)

       // Turn player's permanent effects first (any order they choose)
       for effect in turnPlayerContinuousEffects:
         state = applyIfConditionMet(state, effect)


       // Non-turn player's permanent effects
       for effect in nonTurnPlayerContinuousEffects:
         state = applyIfConditionMet(state, effect)


     until state === previousState    // fixed point reached


     return state

7.3 Duration Tracking
The engine checks durations at the appropriate timing:

     thisBattle → removed at End of Battle step

     thisTurn / untilEndOfTurn → removed during End Phase processing

     untilStartOfNextTurn → removed at start of Refresh Phase

     whileOnField / permanent → removed when the source card leaves the field

8. Card Addition Pipeline

8.1 Current Flow (Phase 1 — Manual)

1.  New card released → appears in Poneglyph

---

2.  Developer reads the card text
3.  Developer writes DSL definition (JSON) by hand
    → or writes a custom handler for complex cards
4.  Developer writes tests for the card
5.  PR reviewed, merged, deployed
6.  Engine now supports the card

8.2 Target Flow (Phase 3 — Automated)

1.  New card released → appears in Poneglyph
2.  Pipeline fetches card text from Poneglyph
3.  Generator produces a DSL definition from the text
    → Rule-based parser handles common patterns
    → LLM-assisted for complex or ambiguous text
4.  Generated definition is flagged for human review
5.  Reviewer verifies against the actual card
    → Approves, or edits and approves
    → Complex cards get routed to custom handler authoring
6.  Automated tests are generated alongside the definition
7.  PR created, reviewed, merged, deployed

8.3 DSL Coverage Tracking
Maintain a coverage report:

Total cards in Poneglyph: 2,347
DSL definitions: 1,892 (80.6%)
Custom handlers: 73 (3.1%)
Missing / not yet implemented: 382 (16.3%)

Track which DSL primitives are most used to prioritize extensions. Track which cards
needed custom handlers to identify patterns worth promoting to the DSL.

9. Testing Strategy

9.1 Unit Tests Per Card
Every card with an effect definition (DSL or custom) gets a test file:

tests/
cards/
OP01-001.test.ts // leader effect tests

---

      OP01-015.test.ts        // on play draw test
      OP01-029.test.ts        // counter event tests
      ...

Each test constructs a GameState , applies the card’s effect, and asserts the resulting state.

9.2 Interaction Tests
Cross-card interactions that have known rulings:

tests/
interactions/
blocker-plus-unblockable.test.ts
double-attack-plus-banish.test.ts
replacement-on-ko.test.ts
simultaneous-triggers.test.ts
...

9.3 DSL Primitive Tests
Each DSL primitive (draw, ko, search, modifyPower, etc.) has its own test suite validating
that the runtime interprets it correctly, independent of any specific card.

9.4 Regression Tests
When a bug is found with a specific card or interaction, a test is written that reproduces the
bug before the fix. This test stays forever.

10. Example: Full Card Implementation Walk-Through
    Let’s trace the complete lifecycle of adding a card.

Card: OP01-040 — A character with [Activate: Main] [Once Per Turn] ② Rest this
Character: K.O. up to 1 of your opponent's Characters with a cost of 3 or less.

Step 1: Write the DSL definition (shown in section 4.6 above).

Step 2: Write the test:

describe('OP01-040', () => {
it('should K.O. opponent character with cost <= 3', () => {
const state = createGameState({
turnPlayer: 'p1',

---

            p1: {
                 characterArea: [
                      cardInstance('OP01-040', { state: 'active' })
                 ],
                 costArea: donCards(5, { active: 3, rested: 2 })
            },
            p2: {
                 characterArea: [
                      cardInstance('OP01-050', { cost: 2 }),   // valid target
                      cardInstance('OP01-060', { cost: 5 })    // too expensive
                 ]
            }
       });


       const actions = getLegalActions(state, 'p1');
       const activateAction = actions.find(a =>
            a.type === 'activateEffect' && a.cardId === 'OP01-040'
       );
       expect(activateAction).toBeDefined();


       // Simulate: pay cost, choose target, resolve
       let newState = applyAction(state, activateAction);
       // Engine should pause for target selection
       expect(newState.pendingChoice).toMatchObject({
            type: 'selectTarget',
            filter: { costOp: 'lte', costValue: 3 }
       });


       // Player chooses OP01-050
       newState = applyChoice(newState, { selected: ['OP01-050-instance'] });
       expect(newState.p2.characterArea).toHaveLength(1);
       expect(newState.p2.trash).toContainCard('OP01-050');

});

it('should not activate twice per turn', () => { /_ ... _/ });
it('should not activate without enough DON!!', () => { /_ ... _/ });
it('should not activate if already rested', () => { /_ ... _/ });
});

Step 3: Verify it works in a real match scenario against one of the launch competitive
decks.

Step 4: PR, review, merge.

---

11. Open Design Decisions
    These can be deferred until implementation begins, but should be decided before writing
    the runtime:

1. DSL storage format: JSON files in the repo (version controlled, PR-reviewed) vs.
   database entries (editable without deploy). Recommendation: JSON files in the repo for
   Phase 1 — PRs give review, tests, and history. Move to DB later if hot-updating becomes
   important.

1. DSL validation: Should there be a schema validator that catches malformed DSL
   definitions before they hit the runtime? (Yes — a Zod schema for EffectDefinition that
   runs in CI.)

1. Effect logging granularity: How much detail goes into the match action log for replays?
   Every intermediate step of effect resolution, or just the inputs and outputs?
   Recommendation: log the triggering action and all player choices — the deterministic
   engine can reconstruct intermediate states from those.

1. Custom handler sandboxing: Should custom handlers have restricted access to
   GameState (e.g., can’t directly mutate, must return a new state)? (Yes — enforce
   immutability via the type system and runtime checks in dev mode.)

---
