import type {
  CardId,
  InstanceId,
  LoadoutId,
  MatchSource,
  PlayerId,
  VariantKey,
  Zone,
} from "./primitives.js";
import type { EffectDefinition } from "./effects.js";
import type { EffectTextSourceMap } from "./effect-presentation.js";

export type CardCategory = "leader" | "character" | "event" | "stage" | "don";
export type CardColor =
  | "red"
  | "green"
  | "blue"
  | "purple"
  | "black"
  | "yellow";
export type Attribute =
  | "slash"
  | "strike"
  | "ranged"
  | "special"
  | "wisdom"
  | "?";
export type Keyword =
  | "rush"
  | "rushCharacter"
  | "doubleAttack"
  | "banish"
  | "blocker"
  | "unblockable";

export type CardSupportStatus =
  | "vanilla-confirmed"
  | "implemented-dsl"
  | "implemented-custom"
  | "unsupported"
  | "banned-in-simulator";

export interface ZoneRef {
  zone: Zone;
  playerId?: PlayerId;
  index?: number;
  slot?:
    | "leader"
    | "stage"
    | "character"
    | "cost"
    | "life"
    | "hand"
    | "deck"
    | "trash"
    | "donDeck"
    | "temporary";
}

export interface CardRef {
  instanceId: InstanceId;
  cardId: CardId;
  playerId: PlayerId;
  zone?: ZoneRef;
}

export interface CardSnapshot {
  instanceId: InstanceId;
  cardId: CardId;
  ownerId: PlayerId;
  controllerId: PlayerId;
  zone: ZoneRef;
  category: CardCategory;
  colors: CardColor[];
  cost?: number;
  power?: number;
  counter?: number;
  life?: number;
  keywords: Keyword[];
}

export interface CardVariant {
  variantKey: VariantKey;
  variantIndex: number;
  imageUrl?: string;
  label?: string;
}

export interface CardMetadata {
  cardId: CardId;
  source: MatchSource;
  name: string;
  category: CardCategory;
  colors: CardColor[];
  cost?: number;
  life?: number;
  power?: number;
  counter?: number;
  types?: string[];
  attributes?: Attribute[];
  text: string;
  variants?: CardVariant[];
  sourceTextHash?: string;
}

export interface RuntimeVersionSet {
  specVersion: string;
  rulesVersion: string;
  engineVersion: string;
  cardDataVersion: string;
  effectDefinitionsVersion: string;
  customHandlerVersion: string;
  banlistVersion: string;
}

export interface RulingNote {
  source: "official-faq" | "errata" | "simulator-note";
  text: string;
}

export interface CardImplementationRecord {
  cardId: CardId;
  status: CardSupportStatus;
  effectDefinitionId?: string;
  customHandlerIds?: string[];
  tested: boolean;
  rulesVersion: string;
  cardDataVersion: string;
  sourceTextHash: string;
  behaviorHash: string;
  notes?: string;
}

export interface BanlistRecord {
  cardId: CardId;
  format: string;
  status:
    | "legal"
    | "banned"
    | "restricted"
    | "leaderLocked"
    | "simulatorBanned";
  maxCopies?: number;
  reason?: string;
  effectiveFrom: string;
}

export interface ResolvedCardOverlay {
  cardId: CardId;
  support: CardImplementationRecord;
  effectDefinitionId?: string;
  customHandlerIds?: string[];
  rulingNotes?: RulingNote[];
  banlist?: BanlistRecord[];
  simulatorTags?: string[];
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
    scan: {
      display: string | null;
      full: string | null;
      thumb: string | null;
    };
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

export interface NormalizedErrata extends PoneglyphErrata {
  variantIndex: number;
  variantKey: VariantKey;
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
  colors: CardColor[];
  cost?: number;
  power?: number;
  counter?: number;
  life?: number;
  attributes: Attribute[];
  types: string[];
  effectText?: string;
  triggerText?: string;
  effectTextSourceMap?: EffectTextSourceMap;
  triggerTextSourceMap?: EffectTextSourceMap;
  printedKeywords: Keyword[];
  variants: ResolvedCardVariant[];
  legality: Record<string, PoneglyphLegalityRecord>;
  officialFaq: PoneglyphOfficialFaq[];
  errata: NormalizedErrata[];
  sourceTextHash: string;
  behaviorHash: string;
  support: CardImplementationRecord;
}

export interface MatchCardManifest {
  manifestHash: string;
  source: MatchSource;
  cardDataVersion: string;
  effectDefinitionsVersion: string;
  customHandlerVersion: string;
  banlistVersion: string;
  effectDefinitions?: Record<string, EffectDefinition>;
  cards: Record<CardId, ResolvedCard>;
  createdAt: string;
}

export interface DecklistEntry {
  cardId: CardId;
  quantity: number;
  variantKey?: VariantKey;
}

export interface ResolvedDeckCard {
  cardId: CardId;
  quantity: number;
  variants: VariantKey[];
  resolvedCard: ResolvedCard;
}

export interface DeckValidationError {
  code: string;
  message: string;
  cardId?: CardId;
}

export interface DeckValidationWarning {
  code: string;
  message: string;
  cardId?: CardId;
}

export interface DeckValidationResult {
  valid: boolean;
  errors: DeckValidationError[];
  warnings: DeckValidationWarning[];
  resolvedCards: ResolvedDeckCard[];
  versions: {
    cardDataVersion: string;
    effectDefinitionsVersion: string;
    overlayVersion: string;
    banlistVersion: string;
  };
}

export interface Loadout {
  loadoutId: LoadoutId;
  ownerPlayerId: PlayerId;
  name: string;
  deck: DecklistEntry[];
  donDeckVariantKey?: VariantKey;
  sleevesId?: string;
  playmatId?: string;
  iconId?: string;
  cardVariants?: Partial<Record<CardId, VariantKey>>;
}
