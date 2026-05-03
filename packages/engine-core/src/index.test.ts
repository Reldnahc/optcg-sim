import assert from "node:assert/strict";
import { test } from "vitest";

import * as engineCorePackage from "@optcg/engine-core";
import {
  advanceRngFloat01,
  advanceRngUint32,
  canonicalSerializeStateValue,
  hashCanonicalStateValue,
  initializeRng,
} from "./index.js";

test("package runtime boundary exposes engine-core helpers", () => {
  assert.deepEqual(Object.keys(engineCorePackage).sort(), [
    "advanceRngFloat01",
    "advanceRngUint32",
    "canonicalSerializeStateValue",
    "hashCanonicalStateValue",
    "initializeRng",
  ]);
  assert.equal(engineCorePackage.initializeRng, initializeRng);
  assert.equal(
    engineCorePackage.canonicalSerializeStateValue,
    canonicalSerializeStateValue,
  );
});

test("same seed produces the same uint32 sequence", () => {
  let a = initializeRng(12345);
  let b = initializeRng(12345);

  const seqA: number[] = [];
  const seqB: number[] = [];

  for (let i = 0; i < 8; i += 1) {
    const drawA = advanceRngUint32(a);
    const drawB = advanceRngUint32(b);
    seqA.push(drawA.value);
    seqB.push(drawB.value);
    a = drawA.nextRng;
    b = drawB.nextRng;
  }

  assert.deepEqual(seqA, seqB);
});

test("different seeds produce different early sequence", () => {
  let a = initializeRng(1);
  let b = initializeRng(2);

  const seqA: number[] = [];
  const seqB: number[] = [];

  for (let i = 0; i < 4; i += 1) {
    const drawA = advanceRngUint32(a);
    const drawB = advanceRngUint32(b);
    seqA.push(drawA.value);
    seqB.push(drawB.value);
    a = drawA.nextRng;
    b = drawB.nextRng;
  }

  assert.notDeepEqual(seqA, seqB);
});

test("helpers do not mutate input RNG state", () => {
  const initial = initializeRng(99);
  const snapshot = structuredClone(initial);

  void advanceRngUint32(initial);
  void advanceRngFloat01(initial);

  assert.deepEqual(initial, snapshot);
});

test("initialized and advanced state are JSON-serializable", () => {
  const initial = initializeRng("seed-value");
  const draw = advanceRngUint32(initial);

  const initialJson = JSON.stringify(initial);
  const advancedJson = JSON.stringify(draw.nextRng);

  assert.equal(typeof initialJson, "string");
  assert.equal(typeof advancedJson, "string");
  assert.deepEqual(JSON.parse(initialJson), initial);
  assert.deepEqual(JSON.parse(advancedJson), draw.nextRng);
});

test("callCount starts at 0 and increments once per advance", () => {
  const initial = initializeRng(42);
  assert.equal(initial.callCount, 0);

  const draw1 = advanceRngUint32(initial);
  assert.equal(draw1.nextRng.callCount, 1);

  const draw2 = advanceRngFloat01(draw1.nextRng);
  assert.equal(draw2.nextRng.callCount, 2);
});

test("fails closed for RNG algorithms without cited ENG-001B behavior", () => {
  assert.throws(
    () => initializeRng(42, "xoshiro256ss"),
    /Unsupported RNG algorithm/,
  );
  assert.throws(() => initializeRng(42, "test-fixed"), /Unsupported RNG/);

  assert.throws(
    () =>
      advanceRngUint32({
        algorithm: "xoshiro256ss",
        internalState: "1:2:3:4",
        callCount: 0,
      }),
    /Unsupported RNG algorithm/,
  );
  assert.throws(
    () =>
      advanceRngUint32({
        algorithm: "test-fixed",
        internalState: "0",
        callCount: 0,
      }),
    /Unsupported RNG algorithm/,
  );
});

test("canonical hash is stable across repeated runs for identical input", () => {
  const input = {
    players: [
      { id: "p1", life: 5 },
      { id: "p2", life: 3 },
    ],
    turn: { phase: "main", count: 2 },
  };

  const hashes = Array.from({ length: 5 }, () =>
    hashCanonicalStateValue(input),
  );

  assert.ok(hashes.every((hash) => hash === hashes[0]));
});

test("canonical serialization normalizes object key insertion order", () => {
  const a = { b: 2, a: 1 };
  const b = { a: 1, b: 2 };

  assert.equal(
    canonicalSerializeStateValue(a),
    canonicalSerializeStateValue(b),
  );
  assert.equal(hashCanonicalStateValue(a), hashCanonicalStateValue(b));
});

test("canonical serialization uses locale-independent code unit key order", () => {
  assert.equal(canonicalSerializeStateValue({ b: 1, A: 2 }), '{"A":2,"b":1}');
});

test("canonical serialization normalizes nested object key insertion order", () => {
  const a = {
    z: { y: 2, x: 1 },
    a: [{ d: 4, c: 3 }],
  };
  const b = {
    a: [{ c: 3, d: 4 }],
    z: { x: 1, y: 2 },
  };

  assert.equal(
    canonicalSerializeStateValue(a),
    canonicalSerializeStateValue(b),
  );
  assert.equal(hashCanonicalStateValue(a), hashCanonicalStateValue(b));
});

test("canonical hash preserves array order significance", () => {
  const a = { items: [1, 2, 3] };
  const b = { items: [3, 2, 1] };

  assert.notEqual(
    canonicalSerializeStateValue(a),
    canonicalSerializeStateValue(b),
  );
  assert.notEqual(hashCanonicalStateValue(a), hashCanonicalStateValue(b));
});

test("known fixture produces fixed lowercase sha-256 digest", () => {
  const fixture = {
    a: 1,
    b: [true, false, null, "x"],
    c: { d: "z", e: 0 },
  };

  assert.equal(
    hashCanonicalStateValue(fixture),
    "b99b631ce30127854fb73f55454f26f58e8673d5a14bcba14b29c75aafb37077",
  );
});

test("unsupported values and cyclic structures fail closed", () => {
  assert.throws(
    () => canonicalSerializeStateValue({ a: undefined }),
    /Unsupported/,
  );
  assert.throws(
    () => canonicalSerializeStateValue({ fn: () => "x" }),
    /Unsupported/,
  );
  assert.throws(
    () => canonicalSerializeStateValue({ sym: Symbol("x") }),
    /Unsupported/,
  );
  assert.throws(() => canonicalSerializeStateValue({ n: 1n }), /Unsupported/);
  assert.throws(
    () => canonicalSerializeStateValue({ n: Number.NaN }),
    /Unsupported/,
  );
  assert.throws(
    () => canonicalSerializeStateValue({ n: Number.POSITIVE_INFINITY }),
    /Unsupported/,
  );
  assert.throws(
    () => canonicalSerializeStateValue(Object.assign([], { 1: "hole" })),
    /sparse array slot/,
  );
  assert.throws(
    () => canonicalSerializeStateValue(Object.assign([1], { extra: 2 })),
    /array non-index property/,
  );
  const arrayWithNonEnumerableProperty = [1];
  Object.defineProperty(arrayWithNonEnumerableProperty, "extra", { value: 2 });
  assert.throws(
    () => canonicalSerializeStateValue(arrayWithNonEnumerableProperty),
    /array non-index property/,
  );
  const arrayWithSymbolKey = [1] as unknown[] & { [key: symbol]: unknown };
  arrayWithSymbolKey[Symbol("hidden")] = 2;
  assert.throws(
    () => canonicalSerializeStateValue(arrayWithSymbolKey),
    /array symbol key/,
  );
  const objectWithNonEnumerableProperty = { a: 1 };
  Object.defineProperty(objectWithNonEnumerableProperty, "hidden", {
    value: 2,
  });
  assert.throws(
    () => canonicalSerializeStateValue(objectWithNonEnumerableProperty),
    /non-enumerable property/,
  );
  const objectWithAccessorProperty = { a: 1 };
  Object.defineProperty(objectWithAccessorProperty, "hidden", {
    enumerable: true,
    get: () => 2,
  });
  assert.throws(
    () => canonicalSerializeStateValue(objectWithAccessorProperty),
    /accessor property/,
  );
  assert.throws(
    () => canonicalSerializeStateValue({ [Symbol("hidden")]: "x" }),
    /symbol key/,
  );

  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalSerializeStateValue(cyclic), /cyclic/i);
});
