import type { Comparator } from "@optcg/types";

export const compareComparator = (
  op: Comparator,
  left: number,
  right: number,
): boolean => {
  switch (op) {
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
    default: {
      const exhaustive: never = op;
      return exhaustive;
    }
  }
};

export const isComparator = (value: unknown): value is Comparator => {
  switch (value) {
    case "eq":
    case "neq":
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      return true;
    default:
      return false;
  }
};

export const isNonNegativeSafeInteger = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  Number.isInteger(value) &&
  value >= 0;
