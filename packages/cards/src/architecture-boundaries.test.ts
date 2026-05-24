import { describe, expect, it } from "vitest";

import { readCardsPackageSourceFiles } from "./architecture-source-scan.js";

describe("cards package architecture boundaries", () => {
  it("keeps legacy wrapper parsing independent from body/request parsing", async () => {
    const files = await readCardsPackageSourceFiles();
    const wrapperFiles = files.filter((file) =>
      file.path.includes("/wrappers/"),
    );

    expect(wrapperFiles.length).toBeGreaterThan(0);
    for (const file of wrapperFiles) {
      expect(file.contents).not.toMatch(/from\s+["']\.\.\/bodies\//);
      expect(file.contents).not.toMatch(/from\s+["']\.\.\/requests\//);
      expect(file.contents).not.toMatch(/from\s+["'].*body.*["']/i);
      expect(file.contents).not.toMatch(/from\s+["'].*request.*["']/i);
    }
  });

  it("keeps legacy body/request parsing independent from wrapper parsing", async () => {
    const files = await readCardsPackageSourceFiles();
    const primitiveFiles = files.filter(
      (file) =>
        file.path.includes("/bodies/") || file.path.includes("/requests/"),
    );

    expect(primitiveFiles.length).toBeGreaterThan(0);
    for (const file of primitiveFiles) {
      expect(file.contents).not.toMatch(/from\s+["']\.\.\/wrappers\//);
      expect(file.contents).not.toMatch(/from\s+["'].*wrapper.*["']/i);
    }
  });

  it.each([
    {
      layer: "/entry-points/",
      forbidden: [
        "/connectors/",
        "/segments/",
        "/instructions/",
        "/conditions/",
        "/markers/",
        "/targets/",
        "/durations/",
        "/references/",
      ],
    },
    {
      layer: "/connectors/",
      forbidden: [
        "/entry-points/",
        "/markers/",
        "/instructions/",
        "/conditions/",
        "/targets/",
        "/durations/",
        "/references/",
      ],
    },
    {
      layer: "/segments/",
      forbidden: ["/entry-points/"],
    },
    {
      layer: "/markers/",
      forbidden: [
        "/entry-points/",
        "/connectors/",
        "/segments/",
        "/instructions/",
        "/conditions/",
        "/targets/",
        "/durations/",
        "/references/",
      ],
    },
    {
      layer: "/instructions/",
      forbidden: [
        "/entry-points/",
        "/connectors/",
        "/conditions/",
        "/durations/",
        "/references/",
      ],
    },
    {
      layer: "/conditions/",
      forbidden: [
        "/entry-points/",
        "/connectors/",
        "/segments/",
        "/instructions/",
      ],
    },
    {
      layer: "/targets/",
      forbidden: [
        "/entry-points/",
        "/connectors/",
        "/segments/",
        "/instructions/",
      ],
    },
    {
      layer: "/durations/",
      forbidden: [
        "/entry-points/",
        "/connectors/",
        "/segments/",
        "/instructions/",
      ],
    },
    {
      layer: "/references/",
      forbidden: [
        "/entry-points/",
        "/connectors/",
        "/segments/",
        "/instructions/",
      ],
    },
  ])(
    "keeps $layer imports inside its parser responsibility",
    async ({ layer, forbidden }) => {
      const files = await readCardsPackageSourceFiles();
      const layerFiles = files.filter((file) => file.path.includes(layer));

      expect(layerFiles.length).toBeGreaterThan(0);
      for (const file of layerFiles) {
        for (const forbiddenLayer of forbidden) {
          const forbiddenImport = new RegExp(
            `from\\s+["'][^"']*${escapeRegex(forbiddenLayer)}`,
          );
          expect(
            file.contents,
            `${file.path} -> ${forbiddenLayer}`,
          ).not.toMatch(forbiddenImport);
        }
      }
    },
  );

  it("does not define exact wrapper-body support identifiers", async () => {
    const files = await readCardsPackageSourceFiles();
    const exactWrapperBodyPattern =
      /\b(?:on-play|on-ko|when-attacking|activate-main|trigger)[-:](?:draw|trash|search|ko|rest|play|modify|set)/i;

    for (const file of files) {
      expect(file.contents, file.path).not.toMatch(exactWrapperBodyPattern);
    }
  });

  it("keeps wrapper parsers free of body/request wording", async () => {
    const files = await readCardsPackageSourceFiles();
    const wrapperFiles = files.filter((file) =>
      file.path.includes("/wrappers/"),
    );
    const bodyWordingPattern =
      /\b(?:Draw|Trash|Look at|reveal|add .* to your hand|K\.O\.|power|search|rest|play up to)\b/;

    expect(wrapperFiles.length).toBeGreaterThan(0);
    for (const file of wrapperFiles) {
      expect(file.contents, file.path).not.toMatch(bodyWordingPattern);
    }
  });

  it("keeps body/request parsers free of wrapper literals", async () => {
    const files = await readCardsPackageSourceFiles();
    const primitiveFiles = files.filter(
      (file) =>
        file.path.includes("/bodies/") || file.path.includes("/requests/"),
    );
    const wrapperLiteralPattern =
      /\[(?:On Play|On K\.O\.|When Attacking|Activate: Main|Trigger)\]/;

    expect(primitiveFiles.length).toBeGreaterThan(0);
    for (const file of primitiveFiles) {
      expect(file.contents, file.path).not.toMatch(wrapperLiteralPattern);
    }
  });

  it("rejects production full-line parser literals that combine wrapper and body text", async () => {
    const files = await readCardsPackageSourceFiles();
    const fullLineParserPattern =
      /\[(?:On Play|On K\.O\.|When Attacking|Activate: Main|Trigger)\][^"`']*(?:Draw|Trash|Look at|reveal|add .* to your hand|K\.O\.|power|search|rest|play up to)/;

    for (const file of files) {
      expect(file.contents, file.path).not.toMatch(fullLineParserPattern);
    }
  });
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
