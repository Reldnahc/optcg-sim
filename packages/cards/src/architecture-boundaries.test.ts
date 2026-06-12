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
      forbidden: ["/entry-points/", "/connectors/", "/conditions/"],
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

  it("keeps cards production source independent from engine runtime and deck-hash probing", async () => {
    const files = await readCardsPackageSourceFiles();
    const forbiddenRuntimeImports =
      /from\s+["'](?:@optcg\/engine-core|optcg-deck-hash)(?:\/[^"']*)?["']/;

    for (const file of files) {
      expect(file.contents, file.path).not.toMatch(forbiddenRuntimeImports);
    }
  });

  it("keeps parser support certification primitive-evidence driven", async () => {
    const files = await readCardsPackageSourceFiles();
    const certificateFile = files.find((file) =>
      file.path.endsWith("/materialization/support-certificate.ts"),
    );

    expect(certificateFile).toBeDefined();
    expect(certificateFile?.contents).not.toMatch(
      /\b(?:cardId|parserRuleId|shapeId|componentEvidenceId|runtimeCapability|supportAllowlist|supportInventory)\b/u,
    );
    expect(certificateFile?.contents).not.toMatch(
      /\b(?:parserRule|shape|component|capability)[A-Za-z0-9_]*To[A-Za-z0-9_]*(?:Support|Certification)\b/u,
    );
  });

  it("routes implicit event reactions through one shared registry parser", async () => {
    const files = await readCardsPackageSourceFiles();
    const registryFile = files.find((file) =>
      file.path.endsWith("/card-effect-line-parser/expression-registry.ts"),
    );

    expect(registryFile).toBeDefined();
    expect(registryFile?.contents).toMatch(
      /implicitEventReactionExpressionParser/u,
    );
    expect(registryFile?.contents).not.toMatch(
      /\b(?:lifeRemovedReactionExpressionParser|handTrashedByEffectReactionExpressionParser|opponentEventOrBlockerActivatedExpressionParser)\b/u,
    );
  });

  it("keeps body parsers on semantic duration groups", async () => {
    const files = await readCardsPackageSourceFiles();
    const bodyFiles = files.filter(
      (file) =>
        file.path.includes("/instructions/") ||
        file.path.includes("/segments/"),
    );

    for (const file of bodyFiles) {
      expect(file.contents, file.path).not.toMatch(
        /parse(?:ThisTurn|ThisBattle|SelfNextTurnStart|OpponentNextEndPhase|OpponentNextRefreshPhase)Duration/u,
      );
      expect(file.contents, file.path).not.toMatch(
        /parseExplicitFieldEffectDuration/u,
      );
    }
  });

  it("keeps body parsers on semantic target groups", async () => {
    const files = await readCardsPackageSourceFiles();
    const bodyFiles = files.filter(
      (file) =>
        file.path.includes("/instructions/") ||
        file.path.includes("/segments/"),
    );
    const targetParserName =
      "parse(?:AllField|CompoundYourCharacters|ThisCharacter|Your(?:Characters|DonCardsCost|Leader|LeaderOrCharacterCards|NamedCards)|Opponent[A-Za-z0-9]+)Target";
    const directTargetChainPattern = new RegExp(
      `(?:${targetParserName}\\([^)]*\\)\\s*\\?\\?|\\?\\?\\s*${targetParserName}\\()`,
      "u",
    );

    for (const file of bodyFiles) {
      expect(file.contents, file.path).not.toMatch(directTargetChainPattern);
    }
  });

  it("keeps body parsers on semantic modifier groups", async () => {
    const files = await readCardsPackageSourceFiles();
    const bodyFiles = files.filter(
      (file) =>
        file.path.includes("/instructions/") ||
        file.path.includes("/segments/"),
    );
    const modifierParserName =
      "parse(?:Positive|Negative)(?:Power|Cost)Modifier";
    const directModifierChainPattern = new RegExp(
      `(?:${modifierParserName}\\([^)]*\\)\\s*\\?\\?|\\?\\?\\s*${modifierParserName}\\()`,
      "u",
    );

    for (const file of bodyFiles) {
      expect(file.contents, file.path).not.toMatch(directModifierChainPattern);
    }
  });

  it("keeps body parsers on semantic cost groups", async () => {
    const files = await readCardsPackageSourceFiles();
    const bodyFiles = files.filter(
      (file) =>
        file.path.includes("/instructions/") ||
        file.path.includes("/segments/"),
    );
    const directCostChainPattern =
      /(?:parse[A-Za-z0-9]+Cost\([^)]*\)\s*\?\?|\?\?\s*parse[A-Za-z0-9]+Cost\()/u;

    for (const file of bodyFiles) {
      expect(file.contents, file.path).not.toMatch(directCostChainPattern);
    }
  });

  it("keeps replacement parsers on semantic instead-effect groups", async () => {
    const files = await readCardsPackageSourceFiles();
    const replacementFiles = files.filter((file) =>
      file.path.includes("/segments/replacement-effect/"),
    );
    const directInsteadChainPattern =
      /(?:parse[A-Za-z0-9]+Instead\([^)]*\)\s*\?\?|\?\?\s*parse[A-Za-z0-9]+Instead\()/u;

    for (const file of replacementFiles) {
      expect(file.contents, file.path).not.toMatch(directInsteadChainPattern);
    }
  });
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
