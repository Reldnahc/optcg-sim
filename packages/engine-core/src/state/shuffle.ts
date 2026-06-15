import type { RngState } from "@optcg/types";

import { advanceRngUint32 } from "./rng.js";

export const shuffleDeterministic = <T>(
  items: readonly T[],
  rng: RngState,
): { readonly items: T[]; readonly rng: RngState } => {
  const shuffled = [...items];
  let nextRng = rng;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const draw = advanceRngUint32(nextRng);
    nextRng = draw.nextRng;
    const swapIndex = draw.value % (index + 1);
    const left = shuffled[index];
    const right = shuffled[swapIndex];
    if (left === undefined || right === undefined) {
      throw new TypeError("Deterministic shuffle index out of bounds.");
    }
    shuffled[index] = right;
    shuffled[swapIndex] = left;
  }
  return { items: shuffled, rng: nextRng };
};
