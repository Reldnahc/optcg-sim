import * as ts from "typescript";

import type { BehaviorProbeReport } from "./behavior-probe.js";
import type { Effect, EffectBlock, PayCostEffect } from "@optcg/types";

export interface EnginePrimitiveSourceFile {
  readonly fileName: string;
  readonly text: string;
}

export interface ExtractEngineEffectPrimitiveTypesRequest {
  readonly sourceFiles: readonly EnginePrimitiveSourceFile[];
  readonly rootTypeName: string;
}

export interface CreateEnginePrimitiveInventoryReportRequest extends ExtractEngineEffectPrimitiveTypesRequest {
  readonly coveredPrimitiveTypes: readonly string[];
}

export const extractEngineEffectPrimitiveTypes = (
  request: ExtractEngineEffectPrimitiveTypesRequest,
): readonly string[] => {
  const sourceFiles = request.sourceFiles.map((sourceFile) =>
    ts.createSourceFile(
      sourceFile.fileName,
      sourceFile.text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    ),
  );
  const declarations = collectNamedDeclarations(sourceFiles);
  const root = declarations.get(request.rootTypeName);
  if (root === undefined) {
    return [];
  }

  const primitives = new Set<string>();
  collectPrimitiveTypesFromDeclaration(
    root,
    declarations,
    primitives,
    new Set(),
  );
  return [...primitives].sort((left, right) => left.localeCompare(right));
};

export const createEnginePrimitiveInventoryReport = (
  request: CreateEnginePrimitiveInventoryReportRequest,
): BehaviorProbeReport => {
  const primitives = extractEngineEffectPrimitiveTypes(request);
  const covered = new Set(request.coveredPrimitiveTypes);
  const coveredPrimitives = primitives.filter((primitive) =>
    covered.has(primitive),
  );
  const missingPrimitives = primitives.filter(
    (primitive) => !covered.has(primitive),
  );

  return {
    exitCode: 0,
    lines: [
      `Engine primitive inventory: ${String(primitives.length)}`,
      `Behavior probe primitive coverage: ${String(coveredPrimitives.length)}/${String(primitives.length)}`,
      ...coveredPrimitives.map(
        (primitive) => `Behavior probe covered primitive: ${primitive}`,
      ),
      ...missingPrimitives.map(
        (primitive) => `Behavior probe missing primitive: ${primitive}`,
      ),
    ],
    errors: [],
  };
};

export const collectEffectBlockPrimitiveTypes = (
  effectBlocks: readonly EffectBlock[],
): readonly string[] => {
  const primitives = new Set<string>();
  for (const effectBlock of effectBlocks) {
    collectEffectPrimitiveTypes(effectBlock.effect, primitives);
  }
  return [...primitives].sort((left, right) => left.localeCompare(right));
};

const collectNamedDeclarations = (
  sourceFiles: readonly ts.SourceFile[],
): ReadonlyMap<string, ts.TypeAliasDeclaration | ts.InterfaceDeclaration> => {
  const declarations = new Map<
    string,
    ts.TypeAliasDeclaration | ts.InterfaceDeclaration
  >();
  for (const sourceFile of sourceFiles) {
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) {
        declarations.set(node.name.text, node);
      }
    });
  }
  return declarations;
};

const collectPrimitiveTypesFromDeclaration = (
  declaration: ts.TypeAliasDeclaration | ts.InterfaceDeclaration,
  declarations: ReadonlyMap<
    string,
    ts.TypeAliasDeclaration | ts.InterfaceDeclaration
  >,
  primitives: Set<string>,
  visitedDeclarations: Set<string>,
): void => {
  const declarationName = declaration.name.text;
  if (visitedDeclarations.has(declarationName)) {
    return;
  }
  visitedDeclarations.add(declarationName);

  if (ts.isTypeAliasDeclaration(declaration)) {
    collectPrimitiveTypesFromTypeNode(
      declaration.type,
      declarations,
      primitives,
      visitedDeclarations,
    );
    return;
  }

  collectPrimitiveTypesFromMembers(declaration.members, primitives);
};

const collectPrimitiveTypesFromTypeNode = (
  typeNode: ts.TypeNode,
  declarations: ReadonlyMap<
    string,
    ts.TypeAliasDeclaration | ts.InterfaceDeclaration
  >,
  primitives: Set<string>,
  visitedDeclarations: Set<string>,
): void => {
  if (ts.isUnionTypeNode(typeNode)) {
    for (const member of typeNode.types) {
      collectPrimitiveTypesFromTypeNode(
        member,
        declarations,
        primitives,
        visitedDeclarations,
      );
    }
    return;
  }

  if (ts.isIntersectionTypeNode(typeNode)) {
    for (const member of typeNode.types) {
      collectPrimitiveTypesFromTypeNode(
        member,
        declarations,
        primitives,
        visitedDeclarations,
      );
    }
    return;
  }

  if (ts.isParenthesizedTypeNode(typeNode)) {
    collectPrimitiveTypesFromTypeNode(
      typeNode.type,
      declarations,
      primitives,
      visitedDeclarations,
    );
    return;
  }

  if (ts.isTypeLiteralNode(typeNode)) {
    collectPrimitiveTypesFromMembers(typeNode.members, primitives);
    return;
  }

  if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
    const referenced = declarations.get(typeNode.typeName.text);
    if (referenced !== undefined) {
      collectPrimitiveTypesFromDeclaration(
        referenced,
        declarations,
        primitives,
        visitedDeclarations,
      );
    }
  }
};

const collectPrimitiveTypesFromMembers = (
  members: ts.NodeArray<ts.TypeElement>,
  primitives: Set<string>,
): void => {
  for (const member of members) {
    if (!ts.isPropertySignature(member)) {
      continue;
    }
    if (!isTypeProperty(member.name)) {
      continue;
    }
    const typeNode = member.type;
    if (typeNode === undefined) {
      continue;
    }
    for (const primitive of literalStringsFromTypeNode(typeNode)) {
      primitives.add(primitive);
    }
  }
};

const isTypeProperty = (name: ts.PropertyName): boolean => {
  if (ts.isIdentifier(name)) {
    return name.text === "type";
  }
  if (ts.isStringLiteral(name)) {
    return name.text === "type";
  }
  return false;
};

const literalStringsFromTypeNode = (
  typeNode: ts.TypeNode,
): readonly string[] => {
  if (ts.isLiteralTypeNode(typeNode) && ts.isStringLiteral(typeNode.literal)) {
    return [typeNode.literal.text];
  }
  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.flatMap((member) =>
      literalStringsFromTypeNode(member),
    );
  }
  return [];
};

const collectEffectPrimitiveTypes = (
  effect: Effect | PayCostEffect,
  primitives: Set<string>,
): void => {
  primitives.add(effect.type);

  if (effect.type === "sequence") {
    for (const segment of effect.effects) {
      collectEffectPrimitiveTypes(segment.effect, primitives);
    }
    return;
  }

  if (effect.type === "choice") {
    for (const option of effect.options) {
      collectEffectPrimitiveTypes(option.effect, primitives);
    }
    return;
  }

  if (effect.type === "conditional") {
    collectEffectPrimitiveTypes(effect.then, primitives);
    if (effect.else !== undefined) {
      collectEffectPrimitiveTypes(effect.else, primitives);
    }
    return;
  }

  if (effect.type === "forEachMatch") {
    collectEffectPrimitiveTypes(effect.effect, primitives);
    return;
  }

  if (effect.type === "forEachSavedTarget") {
    collectEffectPrimitiveTypes(effect.effect, primitives);
    return;
  }

  if (effect.type === "repeat") {
    collectEffectPrimitiveTypes(effect.effect, primitives);
    return;
  }

  if (effect.type === "replacement") {
    collectEffectPrimitiveTypes(effect.instead, primitives);
    return;
  }

  if (effect.type === "grantReplacement") {
    collectEffectPrimitiveTypes(effect.replacement, primitives);
    return;
  }

  if (effect.type === "delayed") {
    collectEffectPrimitiveTypes(effect.effect, primitives);
  }
};
