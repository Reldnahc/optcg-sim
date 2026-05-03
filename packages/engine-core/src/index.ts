import type { RngState } from "@optcg/types";
import { createHash } from "node:crypto";

const U64_MASK = 0xffff_ffff_ffff_ffffn;
const U32_MASK = 0xffff_ffffn;
const PCG32_MULTIPLIER = 6364136223846793005n;
const PCG32_INCREMENT = 1442695040888963407n;
const FLOAT_DIVISOR = 2 ** 32;

const seedToBigInt = (seed: number | bigint | string): bigint => {
  if (typeof seed === "bigint") {
    return seed & U64_MASK;
  }

  if (typeof seed === "number") {
    if (!Number.isFinite(seed)) {
      throw new TypeError("Seed number must be finite.");
    }

    return BigInt(Math.trunc(seed)) & U64_MASK;
  }

  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= BigInt(seed.charCodeAt(i));
    hash = (hash * prime) & U64_MASK;
  }

  return hash;
};

const parseU64 = (input: string): bigint => {
  const parsed = BigInt(input);
  return parsed & U64_MASK;
};

const nextPcg32 = (state: bigint): { nextState: bigint; value: number } => {
  const nextState = (state * PCG32_MULTIPLIER + PCG32_INCREMENT) & U64_MASK;
  const xorshifted = Number((((state >> 18n) ^ state) >> 27n) & U32_MASK);
  const rot = Number((state >> 59n) & 31n);
  const value =
    ((xorshifted >>> rot) | (xorshifted << ((32 - rot) & 31))) >>> 0;
  return { nextState, value };
};

const withOptionalSeedCommitment = (
  rng: Pick<RngState, "algorithm" | "internalState" | "callCount">,
  seedCommitment: string | undefined,
): RngState => {
  if (seedCommitment === undefined) {
    return {
      algorithm: rng.algorithm,
      internalState: rng.internalState,
      callCount: rng.callCount,
    };
  }

  return {
    algorithm: rng.algorithm,
    seedCommitment,
    internalState: rng.internalState,
    callCount: rng.callCount,
  };
};

export const initializeRng = (
  seed: number | bigint | string,
  algorithm: RngState["algorithm"] = "pcg32",
): RngState => {
  const normalizedSeed = seedToBigInt(seed);

  if (algorithm !== "pcg32") {
    throw new TypeError(
      `Unsupported RNG algorithm for ENG-001B deterministic primitive: ${algorithm}.`,
    );
  }

  return {
    algorithm: "pcg32",
    internalState: normalizedSeed.toString(),
    callCount: 0,
  };
};

export const advanceRngUint32 = (
  rng: RngState,
): {
  value: number;
  nextRng: RngState;
} => {
  if (rng.algorithm !== "pcg32") {
    throw new TypeError(
      `Unsupported RNG algorithm for ENG-001B deterministic primitive: ${rng.algorithm}.`,
    );
  }

  const currentState = parseU64(rng.internalState);
  const { nextState, value } = nextPcg32(currentState);

  return {
    value,
    nextRng: withOptionalSeedCommitment(
      {
        algorithm: rng.algorithm,
        internalState: nextState.toString(),
        callCount: rng.callCount + 1,
      },
      rng.seedCommitment,
    ),
  };
};

export const advanceRngFloat01 = (
  rng: RngState,
): {
  value: number;
  nextRng: RngState;
} => {
  const { value, nextRng } = advanceRngUint32(rng);
  return {
    value: value / FLOAT_DIVISOR,
    nextRng,
  };
};

const isPlainObject = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
};

const unsupportedValueError = (path: string, reason: string): TypeError =>
  new TypeError(`Unsupported canonical state value at ${path}: ${reason}.`);

const canonicalizeValue = (
  value: unknown,
  path: string,
  seen: Set<object>,
): string => {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw unsupportedValueError(path, "non-finite number");
    }

    return JSON.stringify(value);
  }

  if (typeof value === "bigint") {
    throw unsupportedValueError(path, "bigint");
  }

  if (typeof value === "undefined") {
    throw unsupportedValueError(path, "undefined");
  }

  if (typeof value === "function") {
    throw unsupportedValueError(path, "function");
  }

  if (typeof value === "symbol") {
    throw unsupportedValueError(path, "symbol");
  }

  if (typeof value !== "object") {
    throw unsupportedValueError(path, `unsupported type ${typeof value}`);
  }

  if (seen.has(value)) {
    throw new TypeError(
      `Unsupported canonical state value at ${path}: cyclic.`,
    );
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value.map((item, index) =>
        canonicalizeValue(item, `${path}[${String(index)}]`, seen),
      );
      return `[${items.join(",")}]`;
    }

    if (!isPlainObject(value)) {
      throw unsupportedValueError(path, "non-plain object");
    }

    const objectValue = value as Record<string, unknown>;
    const keys = Object.keys(objectValue).sort((a, b) => a.localeCompare(b));
    const pairs = keys.map((key) => {
      const childPath = `${path}.${key}`;
      return `${JSON.stringify(key)}:${canonicalizeValue(objectValue[key], childPath, seen)}`;
    });

    return `{${pairs.join(",")}}`;
  } finally {
    seen.delete(value);
  }
};

export const canonicalSerializeStateValue = (value: unknown): string =>
  canonicalizeValue(value, "$", new Set<object>());

export const hashCanonicalStateValue = (value: unknown): string =>
  createHash("sha256")
    .update(canonicalSerializeStateValue(value), "utf8")
    .digest("hex");
