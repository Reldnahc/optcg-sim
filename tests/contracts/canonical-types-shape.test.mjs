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

async function readCanonicalTypes() {
  return readFile(
    path.join(repoRoot, "contracts", "canonical-types.ts"),
    "utf8",
  );
}

test("GameState keeps the once-per-turn ledger in canonical state", async () => {
  const canonicalTypes = await readCanonicalTypes();

  assert.match(
    canonicalTypes,
    /export interface GameState\s*{[\s\S]*?\boncePerTurn:\s*OncePerTurnRecord\[];[\s\S]*?}/m,
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
