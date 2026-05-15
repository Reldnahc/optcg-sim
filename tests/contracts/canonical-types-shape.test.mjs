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
