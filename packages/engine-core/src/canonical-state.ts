import { createHash } from "node:crypto";

const isPlainObject = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
};

const compareCodeUnitOrder = (left: string, right: string): number => {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
};

const unsupportedValueError = (path: string, reason: string): TypeError =>
  new TypeError(`Unsupported canonical state value at ${path}: ${reason}.`);

const hasArrayIndexOnlyPropertyNames = (value: readonly unknown[]): boolean => {
  const indexes = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    indexes.add(String(index));
  }

  return Object.getOwnPropertyNames(value).every(
    (key) => key === "length" || indexes.has(key),
  );
};

const readEnumerableDataProperty = (
  owner: object,
  key: string,
  path: string,
): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(owner, key);
  if (descriptor === undefined) {
    throw unsupportedValueError(path, "missing property descriptor");
  }

  if (!descriptor.enumerable) {
    throw unsupportedValueError(path, "non-enumerable property");
  }

  if (!("value" in descriptor)) {
    throw unsupportedValueError(path, "accessor property");
  }

  return descriptor.value;
};

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
      const symbolKeys = Object.getOwnPropertySymbols(value);
      if (symbolKeys.length > 0) {
        throw unsupportedValueError(path, "array symbol key");
      }

      if (!hasArrayIndexOnlyPropertyNames(value)) {
        throw unsupportedValueError(path, "array non-index property");
      }

      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw unsupportedValueError(
            `${path}[${String(index)}]`,
            "sparse array slot",
          );
        }

        items.push(
          canonicalizeValue(
            readEnumerableDataProperty(
              value,
              String(index),
              `${path}[${String(index)}]`,
            ),
            `${path}[${String(index)}]`,
            seen,
          ),
        );
      }

      return `[${items.join(",")}]`;
    }

    if (!isPlainObject(value)) {
      throw unsupportedValueError(path, "non-plain object");
    }

    const symbolKeys = Object.getOwnPropertySymbols(value);
    if (symbolKeys.length > 0) {
      throw unsupportedValueError(path, "symbol key");
    }

    const objectValue = value as Record<string, unknown>;
    const keys =
      Object.getOwnPropertyNames(objectValue).sort(compareCodeUnitOrder);
    const pairs = keys.map((key) => {
      const childPath = `${path}.${key}`;
      return `${JSON.stringify(key)}:${canonicalizeValue(
        readEnumerableDataProperty(objectValue, key, childPath),
        childPath,
        seen,
      )}`;
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
