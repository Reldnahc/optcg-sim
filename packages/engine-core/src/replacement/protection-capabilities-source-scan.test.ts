import { readFile } from "node:fs/promises";
import { test } from "vitest";

test("protection support classification has one production owner", async ({
  expect,
}) => {
  const derivedModifier = await readFile(
    new URL("../runtime/continuous/derived-modifier.ts", import.meta.url),
    "utf8",
  );
  const fieldRemovalProtection = await readFile(
    new URL("field-removal-protection.ts", import.meta.url),
    "utf8",
  );

  expect(derivedModifier).not.toContain(
    "../../replacement/field-removal-protection-shape.js",
  );
  expect(fieldRemovalProtection).not.toContain(
    "isSupportedFieldRemovalProtection(effect.modifier.operation.protection) ||",
  );
  expect(fieldRemovalProtection).not.toContain("const isSupportedKoProtection");
});
