import assert from "node:assert/strict";
import { test } from "vitest";

import {
  canonicalSerializeStateValue,
  hashCanonicalStateValue,
} from "./canonical-state.js";

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
