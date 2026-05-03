import type { RngState } from "@optcg/types";

const U64_MASK = 0xffff_ffff_ffff_ffffn;
const U32_MASK = 0xffff_ffffn;
const PCG32_MULTIPLIER = 6364136223846793005n;
const PCG32_INCREMENT = 1442695040888963407n;
const FLOAT_DIVISOR = 2 ** 32;

const splitMix64 = (input: bigint): bigint => {
  let z = (input + 0x9e3779b97f4a7c15n) & U64_MASK;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & U64_MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & U64_MASK;
  return (z ^ (z >> 31n)) & U64_MASK;
};

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

const parseXoshiroState = (
  encodedState: string,
): [bigint, bigint, bigint, bigint] => {
  const parts = encodedState.split(":");
  if (parts.length !== 4) {
    throw new TypeError("xoshiro256ss internalState must contain 4 segments.");
  }
  const [a, b, c, d] = parts;
  if (
    a === undefined ||
    b === undefined ||
    c === undefined ||
    d === undefined
  ) {
    throw new TypeError("xoshiro256ss internalState is incomplete.");
  }

  return [parseU64(a), parseU64(b), parseU64(c), parseU64(d)];
};

const rotl = (x: bigint, shift: bigint): bigint =>
  ((x << shift) | (x >> (64n - shift))) & U64_MASK;

const nextPcg32 = (state: bigint): { nextState: bigint; value: number } => {
  const nextState = (state * PCG32_MULTIPLIER + PCG32_INCREMENT) & U64_MASK;
  const xorshifted = Number((((state >> 18n) ^ state) >> 27n) & U32_MASK);
  const rot = Number((state >> 59n) & 31n);
  const value =
    ((xorshifted >>> rot) | (xorshifted << ((32 - rot) & 31))) >>> 0;
  return { nextState, value };
};

const nextXoshiro256ss = (
  current: [bigint, bigint, bigint, bigint],
): { nextState: [bigint, bigint, bigint, bigint]; value: number } => {
  let [s0, s1, s2, s3] = current;

  const result = (rotl((s1 * 5n) & U64_MASK, 7n) * 9n) & U64_MASK;
  const output = Number((result >> 32n) & U32_MASK);

  const t = (s1 << 17n) & U64_MASK;

  s2 ^= s0;
  s3 ^= s1;
  s1 ^= s2;
  s0 ^= s3;
  s2 ^= t;
  s3 = rotl(s3, 45n);

  return { nextState: [s0, s1, s2, s3], value: output >>> 0 };
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

  if (algorithm === "xoshiro256ss") {
    const s0 = splitMix64(normalizedSeed);
    const s1 = splitMix64(s0);
    const s2 = splitMix64(s1);
    const s3 = splitMix64(s2);
    return {
      algorithm,
      internalState: `${s0.toString()}:${s1.toString()}:${s2.toString()}:${s3.toString()}`,
      callCount: 0,
    };
  }

  return {
    algorithm,
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
  if (rng.algorithm === "xoshiro256ss") {
    const current = parseXoshiroState(rng.internalState);
    const { nextState, value } = nextXoshiro256ss(current);
    return {
      value,
      nextRng: withOptionalSeedCommitment(
        {
          algorithm: rng.algorithm,
          internalState: `${nextState[0].toString()}:${nextState[1].toString()}:${nextState[2].toString()}:${nextState[3].toString()}`,
          callCount: rng.callCount + 1,
        },
        rng.seedCommitment,
      ),
    };
  }

  if (rng.algorithm === "test-fixed") {
    return {
      value: 0,
      nextRng: withOptionalSeedCommitment(
        {
          algorithm: rng.algorithm,
          internalState: rng.internalState,
          callCount: rng.callCount + 1,
        },
        rng.seedCommitment,
      ),
    };
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
