---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "16-typescript-interface-draft"
doc_title: "Typescript Interface Draft"
doc_type: "historical-reference"
status: "historical"
machine_readable: true
---

# TypeScript Interface Draft

<!-- SECTION_REF: 16-typescript-interface-draft.s001 -->

Section Ref: `16-typescript-interface-draft.s001`

## v6 supersession

<!-- SECTION_REF: 16-typescript-interface-draft.s002 -->

Section Ref: `16-typescript-interface-draft.s002`

This file is retained as historical/explanatory context. It is non-normative.
The implementation contract is now [`contracts/canonical-types.ts`](contracts/canonical-types.ts), which resolves the undefined symbols and naming conflicts from this draft and compiles under strict TypeScript. Implementation packages must not use this draft over `contracts/canonical-types.ts` or package source types.

This file shows early design shape only. Types can evolve, but current implementation authority comes from the canonical contract files and package source types, not from snippets in this document.

## Branded IDs

<!-- SECTION_REF: 16-typescript-interface-draft.s003 -->

Section Ref: `16-typescript-interface-draft.s003`

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };

export type CardId = Brand<string, "CardId">; // Poneglyph base card ID
export type VariantId = Brand<string, "VariantId">; // legacy alias; prefer VariantKey generated from Poneglyph variant index
export type LoadoutId = Brand<string, "LoadoutId">;
export type InstanceId = Brand<string, "InstanceId">;
export type PlayerId = Brand<string, "PlayerId">;
export type MatchId = Brand<string, "MatchId">;
export type EffectId = Brand<string, "EffectId">;
export type DecisionId = Brand<string, "DecisionId">;
```

## Card metadata

<!-- SECTION_REF: 16-typescript-interface-draft.s004 -->

Section Ref: `16-typescript-interface-draft.s004`

```ts
export interface CardMetadata {
  cardId: CardId;
  source: "poneglyph" | "poneglyph-fixture";
  name: string;
  category: "leader" | "character" | "event" | "stage" | "don";
  color: Color[];
  cost?: number;
  life?: number;
  power?: number;
  counter?: number;
  types?: string[];
  attribute?: Attribute;
  text: string;
  variants?: CardVariant[]; // prefer ResolvedCardVariant in @optcg/cards
  sourceTextHash?: string;
}

export interface CardVariant {
  variantKey: VariantKey;
  variantIndex: number;
  imageUrl?: string;
  label?: string;
}
```

## Game state

<!-- SECTION_REF: 16-typescript-interface-draft.s005 -->

Section Ref: `16-typescript-interface-draft.s005`

```ts
export interface GameState {
  matchId: MatchId;
  seq: number;
  actionSeq: number;
  rulesVersion: string;
  engineVersion: string;
  cardManifest: MatchCardManifest;
  rng: RngState;
  players: Record<PlayerId, PlayerState>;
  timers: TimerState;
  turn: TurnState;
  battle?: BattleState;
  pendingDecision?: PendingDecision;
  effectQueue: EffectQueueEntry[];
  continuousEffects: ContinuousEffect[];
  eventJournal: EngineEvent[];
  winner?: PlayerId | "draw";
  status: "setup" | "active" | "frozen" | "completed" | "errored";
}

export interface PlayerState {
  playerId: PlayerId;
  deck: CardInstance[];
  donDeck: CardInstance[];
  hand: CardInstance[];
  trash: CardInstance[];
  leader: CardInstance;
  characters: CardInstance[];
  stage?: CardInstance;
  costArea: CardInstance[];
  attachedCards: CardInstance[];
  life: LifeCard[];
  hasMulliganed: boolean;
  turnCount: number;
}

export interface CardInstance {
  instanceId: InstanceId;
  cardId: CardId;
  owner: PlayerId;
  controller: PlayerId;
  zone: ZoneRef;
  state?: "active" | "rested";
  attachedDon?: InstanceId[];
  turnPlayed?: number;
  oncePerTurnUsed?: Record<EffectId, number>;
}

export interface LifeCard {
  card: CardInstance;
  faceUp: boolean;
}
```

## Turn and battle

<!-- SECTION_REF: 16-typescript-interface-draft.s006 -->

Section Ref: `16-typescript-interface-draft.s006`

```ts
export interface TurnState {
  activePlayer: PlayerId;
  nonActivePlayer: PlayerId;
  globalTurnNumber: number;
  phase: "refresh" | "draw" | "don" | "main" | "end";
  firstPlayer: PlayerId;
}

export interface BattleState {
  attacker: InstanceId;
  originalTarget: BattleTarget;
  currentTarget: BattleTarget;
  blocker?: InstanceId;
  step: "attack" | "block" | "counter" | "damage" | "end";
  damageCount: number;
}

type BattleTarget =
  | { type: "leader"; playerId: PlayerId }
  | { type: "character"; instanceId: InstanceId };
```

## Engine events

<!-- SECTION_REF: 16-typescript-interface-draft.s007 -->

Section Ref: `16-typescript-interface-draft.s007`

```ts
export interface EngineEvent {
  id: string;
  stateSeq: number;
  type:
    | "cardMoved"
    | "cardPlayed"
    | "cardKOd"
    | "attackDeclared"
    | "blockerActivated"
    | "counterUsed"
    | "damageDealt"
    | "lifeCardRevealed"
    | "donAttached"
    | "cardDrawn"
    | "effectQueued"
    | "effectResolved"
    | "phaseStarted"
    | "phaseEnded"
    | "ruleProcessing";
  actor?: PlayerId;
  source?: CardRef;
  payload: unknown;
  causedBy?: string;
  visibility: EventVisibility;
}
```

## Actions and decisions

<!-- SECTION_REF: 16-typescript-interface-draft.s008 -->

Section Ref: `16-typescript-interface-draft.s008`

```ts
export type Action =
  | { type: "keepOpeningHand" }
  | { type: "mulligan" }
  | { type: "playCard"; handInstanceId: InstanceId }
  | {
      type: "attachDon";
      donInstanceId: InstanceId;
      targetInstanceId: InstanceId;
    }
  | {
      type: "declareAttack";
      attackerInstanceId: InstanceId;
      target: BattleTarget;
    }
  | { type: "activateEffect"; sourceInstanceId: InstanceId; effectId: EffectId }
  | {
      type: "useCounter";
      handInstanceId: InstanceId;
      targetInstanceId: InstanceId;
      effectId?: EffectId;
    }
  | {
      type: "respondToDecision";
      decisionId: DecisionId;
      response: DecisionResponse;
    }
  | { type: "endMainPhase" }
  | { type: "concede"; playerId: PlayerId };

export type PendingDecision =
  | {
      type: "chooseTriggerOrder";
      id: DecisionId;
      playerId: PlayerId;
      triggerIds: string[];
    }
  | {
      type: "chooseOptionalActivation";
      id: DecisionId;
      playerId: PlayerId;
      effectId: EffectId;
    }
  | {
      type: "payCost";
      id: DecisionId;
      playerId: PlayerId;
      cost: Cost;
      options: PaymentOption[];
    }
  | {
      type: "selectTargets";
      id: DecisionId;
      playerId: PlayerId;
      request: TargetRequest;
    }
  | {
      type: "selectCards";
      id: DecisionId;
      playerId: PlayerId;
      request: CardSelectionRequest;
    }
  | {
      type: "chooseEffectOption";
      id: DecisionId;
      playerId: PlayerId;
      options: EffectOption[];
    }
  | {
      type: "confirmTriggerFromLife";
      id: DecisionId;
      playerId: PlayerId;
      card: CardRef;
    };
```

## Engine result

<!-- SECTION_REF: 16-typescript-interface-draft.s009 -->

Section Ref: `16-typescript-interface-draft.s009`

```ts
export interface EngineResult {
  state: GameState;
  events: EngineEvent[];
  publicEvents: PublicEffectEvent[];
  pendingDecision?: PendingDecision;
  stateHash: string;
}
```

## Hashing rules

<!-- SECTION_REF: 16-typescript-interface-draft.s010 -->

Section Ref: `16-typescript-interface-draft.s010`

State hash input includes canonical `GameState` only:

- Include hidden zones server-side.
- Include RNG state.
- Include pending decision.
- Include effect queue.
- Include card manifest versions.
- Sort object keys.
- Preserve array order.
- Exclude UI-only data, WebSocket connection state, timestamps that do not affect gameplay, and logs not part of canonical state.

## Poneglyph raw and normalized interfaces

<!-- SECTION_REF: 16-typescript-interface-draft.s011 -->

Section Ref: `16-typescript-interface-draft.s011`

The first implementation should include these types in `@optcg/types` or `@optcg/cards` so the adapter, engine manifest, and tests agree on shape.

```ts
export type VariantKey = Brand<string, "VariantKey">; // generated, e.g. OP05-091:v2

export interface PoneglyphCardDetail {
  card_number: string;
  name: string;
  language: string;
  set: string;
  set_name: string;
  released_at: string | null;
  released: boolean;
  card_type: string;
  rarity: string | null;
  color: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  attribute: string[] | null;
  types: string[];
  effect: string | null;
  trigger: string | null;
  block: string | null;
  variants: PoneglyphVariant[];
  legality: Record<string, PoneglyphLegalityRecord>;
  available_languages: string[];
  official_faq: PoneglyphOfficialFaq[];
}

export interface PoneglyphVariant {
  index: number;
  name: string | null;
  label: string | null;
  artist: string | null;
  product: {
    id: string | null;
    slug: string | null;
    name: string | null;
    set_code: string | null;
    released_at: string | null;
  };
  images: {
    stock: { full: string | null; thumb: string | null };
    scan: { display: string | null; full: string | null; thumb: string | null };
  };
  errata: PoneglyphErrata[];
  market: {
    tcgplayer_url: string | null;
    market_price: string | null;
    low_price: string | null;
    mid_price: string | null;
    high_price: string | null;
  };
}

export interface PoneglyphErrata {
  date: string;
  label: string | null;
  before_text: string | null;
  after_text: string | null;
  images?: {
    source?: string | null;
    scan?: {
      display: string | null;
      full: string | null;
      thumb: string | null;
    };
  };
}

export interface PoneglyphLegalityRecord {
  status: string;
  banned_at?: string;
  reason?: string;
  max_copies?: number;
  paired_with?: string[];
}

export interface PoneglyphOfficialFaq {
  question: string;
  answer: string;
  updated_on: string;
}

export interface ResolvedCardVariant {
  variantKey: VariantKey;
  variantIndex: number;
  label?: string;
  artist?: string;
  productId?: string;
  productSlug?: string;
  productName?: string;
  productSetCode?: string;
  stockImageFull?: string;
  stockImageThumb?: string;
  scanImageDisplay?: string;
  scanImageFull?: string;
  scanImageThumb?: string;
}

export interface ResolvedCard {
  cardId: CardId;
  language: string;
  name: string;
  category: CardCategory;
  set: string;
  setName: string;
  block?: string;
  released: boolean;
  releasedAt?: string;
  rarity?: string;
  colors: Color[];
  cost?: number;
  power?: number;
  counter?: number;
  life?: number;
  attributes: Attribute[];
  types: string[];
  effectText?: string;
  triggerText?: string;
  printedKeywords: Keyword[];
  variants: ResolvedCardVariant[];
  legality: Record<string, PoneglyphLegalityRecord>;
  officialFaq: PoneglyphOfficialFaq[];
  sourceTextHash: string;
  behaviorHash: string;
  support: CardImplementationRecord;
}
```

Replace the earlier `CardVariant.variantId` assumption with `variantKey` and `variantIndex`. The supplied Poneglyph examples expose variant indexes, including index `0`, not a distinct variant ID.

## Effect-local transient selections

<!-- SECTION_REF: 16-typescript-interface-draft.s012 -->

Section Ref: `16-typescript-interface-draft.s012`

Cards such as `OP01-060` require temporary revealed-card sets and sequence-local selections.

```ts
export type SelectionSetId = Brand<string, "SelectionSetId">;
export type SelectionId = Brand<string, "SelectionId">;

export interface EffectExecutionContext {
  effectId: EffectId;
  source: CardRef;
  transientSets: Record<SelectionSetId, TransientCardSet>;
  selections: Record<SelectionId, CardRef[]>;
}

export interface TransientCardSet {
  id: SelectionSetId;
  cards: CardRef[];
  origin: ZoneRef | "topOfDeck" | "lifeDamage" | "custom";
  visibility: EventVisibility;
  cleanupPolicy: "returnToOrigin" | "trashAfterResolution" | "none";
}
```

Do not store transient revealed cards as normal hand/deck/trash cards while an effect is resolving. Store them in effect context, emit visibility events, and move them to a real zone only when the effect says to.

## Account-level loadouts

<!-- SECTION_REF: 16-typescript-interface-draft.s013 -->

Section Ref: `16-typescript-interface-draft.s013`

```ts
export interface Loadout {
  loadoutId: LoadoutId;
  ownerPlayerId: PlayerId;
  name: string;
  deck: Array<{ cardId: CardId; quantity: number }>;
  donDeckVariantKey?: VariantKey;
  sleevesId?: string;
  playmatId?: string;
  iconId?: string;
  cardVariants?: Record<CardId, VariantKey>;
}
```

Loadouts are account-level saved preferences. Cosmetics are globally unlocked; availability is gated only by whether the referenced image/API asset exists.
