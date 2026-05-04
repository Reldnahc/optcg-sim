import { existsSync } from "node:fs";

export const resolve = (specifier, context, nextResolve) => {
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    specifier.endsWith(".js")
  ) {
    const tsSpecifier = `${specifier.slice(0, -3)}.ts`;
    const tsUrl = new URL(tsSpecifier, context.parentURL);
    if (existsSync(tsUrl)) {
      return nextResolve(tsSpecifier, context);
    }
  }

  return nextResolve(specifier, context);
};
