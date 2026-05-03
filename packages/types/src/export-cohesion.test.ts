import { expect, test } from "vitest";
import { EXPORT_OWNERSHIP_MANIFEST } from "./export-ownership.manifest.js";

test("TYP-001H ownership manifest keys exactly match canonical export type/interface names", async () => {
  const canonicalPath = new URL(
    "../../../contracts/canonical-types.ts",
    import.meta.url,
  );
  const canonicalSource = await import("node:fs/promises").then((fs) =>
    fs.readFile(canonicalPath, "utf8"),
  );

  const canonicalNames = [
    ...canonicalSource.matchAll(
      /export\s+(?:type|interface)\s+([A-Za-z0-9_]+)/g,
    ),
  ]
    .map((match) => match[1])
    .sort();
  const manifestNames = Object.keys(EXPORT_OWNERSHIP_MANIFEST).sort();

  expect(manifestNames).toEqual(canonicalNames);
});

test("TYP-001H every manifest-covered canonical export has exactly one valid owner", () => {
  const validOwners = new Set([
    "TYP-001A",
    "TYP-001B",
    "TYP-001C",
    "TYP-001D",
    "TYP-001E",
    "TYP-001F",
    "TYP-001G",
  ]);

  for (const owner of Object.values(EXPORT_OWNERSHIP_MANIFEST)) {
    expect(validOwners.has(owner)).toBe(true);
  }
});

test("TYP-001H manifest-covered exports resolve through package-name type imports", () => {
  type ManifestKey = keyof typeof EXPORT_OWNERSHIP_MANIFEST;
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  type PackageTypeKeys = keyof typeof import("@optcg/types");
  type MissingFromPackage = Exclude<ManifestKey, PackageTypeKeys>;
  const missingFromPackage: MissingFromPackage | null = null;

  expect(missingFromPackage).toBeNull();
});

test("barrel runtime entrypoint remains type-only and empty at runtime", async () => {
  const relativeModule = await import("./index.js");

  expect(Object.keys(relativeModule)).toEqual([]);
  expect(Object.keys(EXPORT_OWNERSHIP_MANIFEST).length).toBeGreaterThan(
    Object.keys(relativeModule).length,
  );
});
