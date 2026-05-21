import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const canonicalModuleFiles = [
  "types/primitives.ts",
  "types/card-metadata.ts",
  "types/events.ts",
  "types/view.ts",
  "types/game-state.ts",
  "types/effects.ts",
  "types/decisions.ts",
  "types/runtime.ts",
];

async function readCanonicalTypes() {
  const moduleSources = await Promise.all(
    canonicalModuleFiles.map((fileName) =>
      readFile(path.join(repoRoot, "contracts", fileName), "utf8"),
    ),
  );

  return moduleSources.join("\n");
}

test("GameState keeps the once-per-turn ledger in canonical state", async () => {
  const canonicalTypes = await readCanonicalTypes();

  assert.match(
    canonicalTypes,
    /export interface GameState\s*{[\s\S]*?\boncePerTurn:\s*OncePerTurnRecord\[];[\s\S]*?}/m,
  );
});

test("GameState includes the authoritative match card manifest snapshot", async () => {
  const canonicalTypes = await readCanonicalTypes();

  assert.match(
    canonicalTypes,
    /export interface GameState\s*{[\s\S]*?\bcardManifest:\s*MatchCardManifest;[\s\S]*?}/m,
  );
});

test("Action preserves branded IDs for effect activation and decision responses", async () => {
  const canonicalTypes = await readCanonicalTypes();

  assert.match(
    canonicalTypes,
    /type:\s*"activateEffect";[\s\S]*?\beffectId:\s*EffectId;/m,
  );
  assert.match(
    canonicalTypes,
    /type:\s*"respondToDecision";[\s\S]*?\bdecisionId:\s*DecisionId;/m,
  );
});

test("chooseQuantity decision and response contracts are present in canonical decisions", async () => {
  const canonicalTypes = await readCanonicalTypes();

  assert.match(
    canonicalTypes,
    /export type DecisionResponse\s*=\s*[\s\S]*?\|\s*ChooseQuantityResponse;/m,
  );
  assert.match(
    canonicalTypes,
    /export interface ChooseQuantityResponse\s*{[\s\S]*?\btype:\s*"chooseQuantity";[\s\S]*?\bquantity:\s*number;[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export type ChooseQuantityDecision\s*=\s*BaseDecision\s*&\s*Cardinality\s*&\s*\{[\s\S]*?\btype:\s*"chooseQuantity";[\s\S]*?\}/m,
  );
  assert.match(
    canonicalTypes,
    /export type PendingDecision\s*=\s*[\s\S]*?\|\s*ChooseQuantityDecision/m,
  );
});

test("canonical effects include exact and up-to cardinality contracts", async () => {
  const canonicalTypes = await readCanonicalTypes();

  assert.match(
    canonicalTypes,
    /export interface UpToCardinality\s*{[\s\S]*?\bmode:\s*"upTo";[\s\S]*?\bmin:\s*number;[\s\S]*?\bmax:\s*number;[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export type ExactCardinality<[^>]+>\s*=\s*\{\s*mode:\s*"exact";\s*min:\s*N;\s*max:\s*N;\s*\}/m,
  );
  assert.match(
    canonicalTypes,
    /export type Cardinality\s*=\s*ExactCardinality\s*\|\s*UpToCardinality;/m,
  );
});

test("EffectBlock uses branded effect IDs consistently with queue and action contracts", async () => {
  const canonicalTypes = await readCanonicalTypes();

  assert.match(
    canonicalTypes,
    /export interface EffectBlock\s*{[\s\S]*?\bid:\s*EffectId;[\s\S]*?}/m,
  );
});

test("CardImplementationRecord requires behavior hash drift metadata", async () => {
  const canonicalTypes = await readCanonicalTypes();
  const implementationRecordBlockMatch = canonicalTypes.match(
    /export interface CardImplementationRecord\s*{[\s\S]*?}/m,
  );

  assert.ok(
    implementationRecordBlockMatch,
    "missing CardImplementationRecord interface",
  );
  assert.match(implementationRecordBlockMatch[0], /\bbehaviorHash:\s*string;/);
});

test("CardInstance relies on the GameState once-per-turn ledger", async () => {
  const canonicalTypes = await readCanonicalTypes();
  const cardInstanceBlockMatch = canonicalTypes.match(
    /export interface CardInstance\s*{[\s\S]*?}/m,
  );

  assert.ok(cardInstanceBlockMatch, "missing CardInstance interface");
  assert.doesNotMatch(cardInstanceBlockMatch[0], /\boncePerTurnUsed\??:/);
});

test("BattleState keeps the canonical combat damage fields unchanged", async () => {
  const canonicalTypes = await readCanonicalTypes();
  const battleStateBlockMatch = canonicalTypes.match(
    /export interface BattleState\s*{[\s\S]*?}/m,
  );

  assert.ok(battleStateBlockMatch, "missing BattleState interface");
  assert.match(battleStateBlockMatch[0], /\bdamageCount:\s*number;/);
  assert.doesNotMatch(battleStateBlockMatch[0], /\bcounterPower\??:/);
});

test("PoneglyphCardDetail preserves the raw API payload shape", async () => {
  const canonicalTypes = await readCanonicalTypes();
  const rawPoneglyphBlockMatch = canonicalTypes.match(
    /export interface PoneglyphCardDetail\s*{[\s\S]*?}/m,
  );

  assert.ok(rawPoneglyphBlockMatch, "missing PoneglyphCardDetail interface");

  const rawPoneglyphBlock = rawPoneglyphBlockMatch[0];

  assert.match(
    canonicalTypes,
    /export interface PoneglyphOfficialFaq\s*{[\s\S]*?\bupdated_on:\s*string;[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export interface PoneglyphErrata\s*{[\s\S]*?\blabel:\s*string\s*\|\s*null;[\s\S]*?\bbefore_text:\s*string\s*\|\s*null;[\s\S]*?\bafter_text:\s*string\s*\|\s*null;[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export interface PoneglyphVariant\s*{[\s\S]*?\bname:\s*string\s*\|\s*null;[\s\S]*?\blabel:\s*string\s*\|\s*null;[\s\S]*?\bartist:\s*string\s*\|\s*null;[\s\S]*?\bset_code:\s*string\s*\|\s*null;[\s\S]*?\breleased_at:\s*string\s*\|\s*null;[\s\S]*?\btcgplayer_url:\s*string\s*\|\s*null;[\s\S]*?\bmarket_price:\s*string\s*\|\s*null;[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export interface PoneglyphLegalityRecord\s*{[\s\S]*?\bbanned_at\?:\s*string;[\s\S]*?\bmax_copies\?:\s*number;[\s\S]*?\bpaired_with\?:\s*string\[];[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export interface PoneglyphCardDetail\s*{[\s\S]*?\bcard_number:\s*string;[\s\S]*?\bset_name:\s*string;[\s\S]*?\breleased_at:\s*string\s*\|\s*null;[\s\S]*?\bcard_type:\s*string;[\s\S]*?\brarity:\s*string\s*\|\s*null;[\s\S]*?\bcost:\s*number\s*\|\s*null;[\s\S]*?\bpower:\s*number\s*\|\s*null;[\s\S]*?\bcounter:\s*number\s*\|\s*null;[\s\S]*?\blife:\s*number\s*\|\s*null;[\s\S]*?\battribute:\s*string\[]\s*\|\s*null;[\s\S]*?\beffect:\s*string\s*\|\s*null;[\s\S]*?\btrigger:\s*string\s*\|\s*null;[\s\S]*?\bblock:\s*string\s*\|\s*null;[\s\S]*?\bavailable_languages:\s*string\[];[\s\S]*?\bofficial_faq:\s*PoneglyphOfficialFaq\[];[\s\S]*?}/m,
  );
  assert.doesNotMatch(rawPoneglyphBlock, /\bcardNumber:\s*string;/);
  assert.doesNotMatch(rawPoneglyphBlock, /\bsetName:\s*string;/);
  assert.doesNotMatch(rawPoneglyphBlock, /\bavailableLanguages:\s*string\[];/);
  assert.doesNotMatch(
    rawPoneglyphBlock,
    /\bofficialFaq:\s*PoneglyphOfficialFaq\[];/,
  );
});

test("ResolvedCard retains errata in normalized manifests", async () => {
  const canonicalTypes = await readCanonicalTypes();

  assert.match(
    canonicalTypes,
    /export interface NormalizedErrata\s+extends\s+PoneglyphErrata\s*{[\s\S]*?\bvariantIndex:\s*number;[\s\S]*?\bvariantKey:\s*VariantKey;[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export interface ResolvedCard\s*{[\s\S]*?\berrata:\s*NormalizedErrata\[];[\s\S]*?}/m,
  );
});

test("MatchCardManifest includes a string-keyed serializable effect definition registry", async () => {
  const canonicalTypes = await readCanonicalTypes();

  assert.match(
    canonicalTypes,
    /export interface MatchCardManifest\s*{[\s\S]*?\beffectDefinitions\?:\s*Record<string,\s*EffectDefinition>;[\s\S]*?}/m,
  );
});

test("canonical sequence result and saved-reference contracts remain explicit and deterministic", async () => {
  const canonicalTypes = await readCanonicalTypes();

  assert.match(
    canonicalTypes,
    /export interface SequenceSegmentResult\s*{[\s\S]*?\battempted:\s*boolean;[\s\S]*?\bsucceeded:\s*boolean;[\s\S]*?\bchangedState:\s*boolean;[\s\S]*?\bselectedCards:\s*CardRef\[];[\s\S]*?\bselectedTargets:\s*CardRef\[];[\s\S]*?\bpaidCost:\s*boolean;[\s\S]*?\bplayerDeclined:\s*boolean;[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export type SequenceSavedResultReference\s*=\s*[\s\S]*SavedSelectedCardsReference[\s\S]*\|\s*SavedSelectedTargetsReference[\s\S]*\|\s*SavedPaidCostReference[\s\S]*\|\s*SavedProducedObjectsReference/m,
  );
  assert.match(
    canonicalTypes,
    /export type SequenceSavedResultReferenceMap\s*=\s*Record<[\s\S]*SequenceSavedResultReference[\s\S]*>;/m,
  );
  assert.match(
    canonicalTypes,
    /export type SequenceSegmentResultMap\s*=\s*Record<string,\s*SequenceSegmentResult>;/m,
  );
});

test("TYP-009B canonical saved field-object references and exact-card target binding stay explicit", async () => {
  const canonicalTypes = await readCanonicalTypes();

  assert.match(
    canonicalTypes,
    /export type SavedFieldObjectReferenceFamily\s*=\s*[\s\S]*"selectedTargets"[\s\S]*\|\s*"producedObjects";/m,
  );
  assert.match(
    canonicalTypes,
    /export interface SavedFieldObjectTargetBinding\s*{[\s\S]*?\bfamily:\s*SavedFieldObjectReferenceFamily;[\s\S]*?\bsaveResultAs:\s*string;[\s\S]*?\bobjectIndex\?:\s*number;[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export interface SavedFieldObjectTarget\s*{[\s\S]*?\btype:\s*"savedFieldObject";[\s\S]*?\bbinding:\s*SavedFieldObjectTargetBinding;[\s\S]*?\bvisibility:\s*"publicOnly";[\s\S]*?\bonFailure:\s*"failClosed";[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export interface SavedFieldObjectReferenceFailure\s*{[\s\S]*?\breason:\s*SavedFieldObjectReferenceFailureReason;[\s\S]*?\bpublicReason:\s*"savedFieldObjectUnavailable";[\s\S]*?\bvisibility:\s*"privateEffectLog";[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export interface ExactCardTargetSpec\s*{[\s\S]*?\btype:\s*"exactCard";[\s\S]*?\bcard:\s*CardRef;[\s\S]*?\bbinding:\s*SavedFieldObjectTargetBinding;[\s\S]*?\bcreatedAtStateSeq:\s*StateSeq;[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export type TargetSpec\s*=\s*[\s\S]*\|\s*ExactCardTargetSpec[\s\S]*;/m,
  );
});

test("TYP-010 canonical selectedTargets producer contracts stay explicit and non-mutating", async () => {
  const canonicalTypes = await readCanonicalTypes();

  assert.match(
    canonicalTypes,
    /export interface SelectedTargetsRequest\s+extends\s+TargetRequest\s*{[\s\S]*?\bzone:\s*SavedFieldObjectZone;[\s\S]*?\bvisibility:\s*"public";[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export interface SelectTargetsEffect\s*{[\s\S]*?\btype:\s*"selectTargets";[\s\S]*?\brequest:\s*SelectedTargetsRequest;[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export interface SelectTargetsProducerSegment\s+extends\s+SequencedEffect\s*{[\s\S]*?\beffect:\s*SelectTargetsEffect;[\s\S]*?\bsaveResultAs:\s*string;[\s\S]*?}/m,
  );
});

test("canonical optional cost contracts stay distinct from optional activation", async () => {
  const canonicalTypes = await readCanonicalTypes();

  assert.match(
    canonicalTypes,
    /export type OptionalCost\s*=\s*[\s\S]*optional:\s*true[\s\S]*type:\s*"returnDon"/m,
  );
  assert.match(
    canonicalTypes,
    /export type OptionalTrashFromHandCost\s*=\s*{[\s\S]*type:\s*"trashFromHand";[\s\S]*count:\s*number;[\s\S]*filter\?:\s*CardFilter;[\s\S]*chooser:\s*PlayerRef;[\s\S]*optional:\s*true;[\s\S]*};/m,
  );
  assert.match(
    canonicalTypes,
    /export type OptionalChooseOneTrashCost\s*=\s*{[\s\S]*type:\s*"chooseOne";[\s\S]*options:\s*\[[\s\S]*OptionalChooseOneTrashCostAlternative,[\s\S]*\.\.\.OptionalChooseOneTrashCostAlternative\[\],[\s\S]*\];[\s\S]*optional:\s*true;[\s\S]*};/m,
  );
  assert.match(
    canonicalTypes,
    /export type ScopedOptionalFieldTrashCost\s*=\s*{[\s\S]*type:\s*"trashFromField";[\s\S]*count:\s*number;[\s\S]*filter:\s*ScopedOptionalFieldTrashCostFilter;[\s\S]*chooser:\s*"self";[\s\S]*optional:\s*true;[\s\S]*};/m,
  );
  assert.match(
    canonicalTypes,
    /export interface PayCostEffect\s*{[\s\S]*?\btype:\s*"payCost";[\s\S]*?\bcost:\s*OptionalCost;[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export interface PaymentDeclinedResponse\s*{[\s\S]*?\btype:\s*"paymentDeclined";[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export interface OptionalPayCostDecision\s+extends\s+PayCostDecision\s*{[\s\S]*?\bcost:\s*OptionalCost;[\s\S]*?\bdefaultResponse\?:\s*PaymentDeclinedResponse;[\s\S]*?}/m,
  );
  assert.match(
    canonicalTypes,
    /export type OptionalCostSegmentResult\s*=\s*[\s\S]*?\bpaidCost:\s*true;[\s\S]*?\bplayerDeclined:\s*false;[\s\S]*?\bpaidCost:\s*false;[\s\S]*?\bplayerDeclined:\s*true;[\s\S]*?\bpaidCost:\s*false;[\s\S]*?\bplayerDeclined:\s*false;/m,
  );
});
