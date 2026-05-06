import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const REQUIRED_FRONT_MATTER_FIELDS = [
  "spec_version",
  "spec_package_name",
  "doc_id",
  "doc_title",
  "doc_type",
  "status",
  "machine_readable",
];

type FrontMatter = {
  spec_version: string;
  spec_package_name: string;
  doc_id: string;
  doc_title: string;
  doc_type: string;
  status: string;
  machine_readable: boolean;
};

type ParsedDoc = {
  absolutePath: string;
  relativePath: string;
  frontMatter: FrontMatter;
  body: string;
};

type SectionEntry = {
  section_ref: string;
  doc_id: string;
  doc_path: string;
  heading: string;
  heading_level: number;
  marker_line: number;
  visible_line: string;
};

type HeadingLocation = {
  heading: string;
  headingLevel: number;
  lineIndex: number;
};

function normalizePathForJson(inputPath: string): string {
  return inputPath.split(path.sep).join("/");
}

function fail(message: string): never {
  throw new Error(message);
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontMatter(source: string, relativePath: string): FrontMatter {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    fail(`specs/${relativePath}: missing YAML front matter`);
  }
  const frontMatterBlock = match[1];
  if (frontMatterBlock === undefined) {
    fail(`specs/${relativePath}: unable to parse YAML front matter`);
  }

  const entries = new Map<string, string>();
  for (const line of frontMatterBlock.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    entries.set(key, value);
  }

  for (const field of REQUIRED_FRONT_MATTER_FIELDS) {
    if (!entries.has(field)) {
      fail(
        `specs/${relativePath}: missing required front matter field ${field}`,
      );
    }
  }

  const docId = stripQuotes(entries.get("doc_id") ?? "");
  const baseName = path.basename(relativePath, ".md");
  if (
    docId !== baseName &&
    !(docId === "SPEC_VERSION" && baseName === "SPEC_VERSION")
  ) {
    fail(
      `specs/${relativePath}: front matter doc_id ${docId} does not match filename ${baseName}`,
    );
  }

  return {
    spec_version: stripQuotes(entries.get("spec_version") ?? ""),
    spec_package_name: stripQuotes(entries.get("spec_package_name") ?? ""),
    doc_id: docId,
    doc_title: stripQuotes(entries.get("doc_title") ?? ""),
    doc_type: stripQuotes(entries.get("doc_type") ?? ""),
    status: stripQuotes(entries.get("status") ?? ""),
    machine_readable:
      stripQuotes(entries.get("machine_readable") ?? "") === "true",
  };
}

async function parseMarkdownDoc(
  absolutePath: string,
  relativePath: string,
): Promise<ParsedDoc> {
  const source = await readFile(absolutePath, "utf8");
  const frontMatter = parseFrontMatter(source, relativePath);
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  return { absolutePath, relativePath, frontMatter, body };
}

async function listMarkdownFilesRecursive(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const filePaths: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      filePaths.push(...(await listMarkdownFilesRecursive(entryPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      filePaths.push(entryPath);
    }
  }

  return filePaths.sort((left, right) => left.localeCompare(right));
}

function parseCanonicalDocOrderFromSpecVersion(
  specVersionBody: string,
): string[] {
  const sectionStartToken = "Section Ref: `SPEC_VERSION.s005`";
  const sectionStart = specVersionBody.indexOf(sectionStartToken);
  if (sectionStart < 0) {
    fail("specs/SPEC_VERSION.md: missing Section Ref `SPEC_VERSION.s005`");
  }

  const afterStart = specVersionBody.slice(
    sectionStart + sectionStartToken.length,
  );
  const nextSection = afterStart.search(/\n##\s+/);
  const section =
    nextSection >= 0 ? afterStart.slice(0, nextSection) : afterStart;
  const lines = section.split(/\r?\n/);
  const docPaths: string[] = [];

  for (const line of lines) {
    const numbered = line.match(/^\s*\d+\.\s+`([^`]+)`\s*$/);
    const docPath = numbered?.[1];
    if (docPath !== undefined) {
      docPaths.push(docPath);
    }
  }

  if (docPaths.length === 0) {
    fail("specs/SPEC_VERSION.md: canonical document order list is empty");
  }
  return docPaths;
}

function parseIdentityYamlBlock(
  specVersionBody: string,
): Record<string, unknown> {
  const sectionStartToken = "Section Ref: `SPEC_VERSION.s002`";
  const sectionStart = specVersionBody.indexOf(sectionStartToken);
  if (sectionStart < 0) {
    fail("specs/SPEC_VERSION.md: missing Section Ref `SPEC_VERSION.s002`");
  }

  const afterStart = specVersionBody.slice(
    sectionStart + sectionStartToken.length,
  );
  const codeBlockMatch = afterStart.match(/```yaml\r?\n([\s\S]*?)\r?\n```/);
  if (!codeBlockMatch) {
    fail(
      "specs/SPEC_VERSION.md: missing identity yaml block under SPEC_VERSION.s002",
    );
  }
  const codeBlock = codeBlockMatch[1];
  if (codeBlock === undefined) {
    fail(
      "specs/SPEC_VERSION.md: unable to parse identity yaml block under SPEC_VERSION.s002",
    );
  }

  const identity: Record<string, unknown> = {};
  let activeArrayKey: string | null = null;
  for (const rawLine of codeBlock.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      continue;
    }
    const arrayItemMatch = line.match(/^\s*-\s+(.+)$/);
    const arrayItemValue = arrayItemMatch?.[1];
    if (arrayItemValue !== undefined && activeArrayKey !== null) {
      const current = identity[activeArrayKey];
      if (Array.isArray(current)) {
        current.push(stripQuotes(arrayItemValue));
      }
      continue;
    }

    const keyValueMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!keyValueMatch) {
      continue;
    }
    const key = keyValueMatch[1];
    const rawValue = keyValueMatch[2];
    if (key === undefined || rawValue === undefined) {
      continue;
    }
    if (rawValue === "") {
      identity[key] = [];
      activeArrayKey = key;
      continue;
    }
    activeArrayKey = null;
    identity[key] = stripQuotes(rawValue);
  }
  return identity;
}

function parseSectionEntries(doc: ParsedDoc): SectionEntry[] {
  const lines = doc.body.split(/\r?\n/);
  const sections: SectionEntry[] = [];
  const seenInFile = new Set<string>();
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) {
      fail(`specs/${doc.relativePath}: unexpected missing line`);
    }
    if (isCodeFenceLine(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) {
      continue;
    }

    const marker = line.match(
      /^<!--\s*SECTION_REF:\s*([A-Za-z0-9_.-]+)\s*-->\s*$/,
    );
    if (!marker) {
      continue;
    }

    const heading = findHeadingImmediatelyBefore(lines, i);
    if (heading === null) {
      fail(
        `specs/${doc.relativePath}: SECTION_REF marker on line ${String(i + 1)} must immediately follow a heading`,
      );
    }

    const visibleLineIndex = nextNonBlankLineIndex(lines, i + 1);
    const visibleLine =
      visibleLineIndex === null ? undefined : lines[visibleLineIndex];
    if (visibleLine === undefined) {
      fail(
        `specs/${doc.relativePath}: heading "${heading.heading}" is missing visible Section Ref line`,
      );
    }

    const visibleMatch = visibleLine.match(/^Section Ref:\s*`([^`]+)`\s*$/);
    if (!visibleMatch) {
      fail(
        `specs/${doc.relativePath}: heading "${heading.heading}" must have visible Section Ref companion line`,
      );
    }

    const sectionRef = marker[1];
    const visibleLineValue = visibleMatch[1];
    if (sectionRef === undefined || visibleLineValue === undefined) {
      fail(
        `specs/${doc.relativePath}: unable to parse SECTION_REF metadata for heading "${heading.heading}"`,
      );
    }
    if (!/^[A-Za-z0-9_.-]+\.s\d{3}$/.test(sectionRef)) {
      fail(
        `specs/${doc.relativePath}: malformed SECTION_REF ${sectionRef}; expected <doc_id>.sNNN`,
      );
    }

    const sectionRefDocId = sectionRef.split(".s")[0];
    if (sectionRefDocId === undefined) {
      fail(`specs/${doc.relativePath}: unable to parse SECTION_REF doc prefix`);
    }
    if (sectionRefDocId !== doc.frontMatter.doc_id) {
      fail(
        `specs/${doc.relativePath}: SECTION_REF ${sectionRef} doc prefix ${sectionRefDocId} does not match front matter doc_id ${doc.frontMatter.doc_id}`,
      );
    }
    if (visibleLineValue !== sectionRef) {
      fail(
        `specs/${doc.relativePath}: Section Ref companion mismatch for ${sectionRef}; found ${visibleLineValue}`,
      );
    }
    if (seenInFile.has(sectionRef)) {
      fail(`specs/${doc.relativePath}: duplicate SECTION_REF ${sectionRef}`);
    }
    seenInFile.add(sectionRef);

    sections.push({
      section_ref: sectionRef,
      doc_id: doc.frontMatter.doc_id,
      doc_path: doc.relativePath,
      heading: heading.heading,
      heading_level: heading.headingLevel,
      marker_line: i + 1,
      visible_line: `Section Ref: \`${sectionRef}\``,
    });
  }

  return sections;
}

function parseHeading(line: string, lineIndex: number): HeadingLocation | null {
  const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
  const headingMarkers = heading?.[1];
  const headingText = heading?.[2];
  if (headingMarkers === undefined || headingText === undefined) {
    return null;
  }
  return {
    heading: headingText,
    headingLevel: headingMarkers.length,
    lineIndex,
  };
}

function findHeadingImmediatelyBefore(
  lines: string[],
  markerIndex: number,
): HeadingLocation | null {
  const headingIndex = previousNonBlankLineIndex(lines, markerIndex - 1);
  if (headingIndex === null) {
    return null;
  }
  const headingLine = lines[headingIndex];
  if (headingLine === undefined) {
    return null;
  }
  return parseHeading(headingLine, headingIndex);
}

function nextNonBlankLineIndex(lines: string[], startIndex: number) {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      continue;
    }
    if (line.trim() !== "") {
      return index;
    }
  }
  return null;
}

function previousNonBlankLineIndex(lines: string[], startIndex: number) {
  for (let index = startIndex; index >= 0; index -= 1) {
    const line = lines[index];
    if (line === undefined) {
      continue;
    }
    if (line.trim() !== "") {
      return index;
    }
  }
  return null;
}

function isCodeFenceLine(line: string) {
  return /^\s*(```|~~~)/.test(line);
}

function renderCanonicalJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2).replace(
    /\[\n\s+"((?:[^"\\]|\\.)*)"\n\s+\]/g,
    '["$1"]',
  )}\n`;
}

async function generateMetadata(repoRoot: string): Promise<{
  manifest: string;
  sectionIndex: string;
}> {
  const specsRoot = path.join(repoRoot, "specs");
  const specVersionPath = path.join(specsRoot, "SPEC_VERSION.md");
  const specVersionDoc = await parseMarkdownDoc(
    specVersionPath,
    "SPEC_VERSION.md",
  );
  const canonicalOrder = parseCanonicalDocOrderFromSpecVersion(
    specVersionDoc.body,
  );
  const identity = parseIdentityYamlBlock(specVersionDoc.body);

  const canonicalMarkdownDocPaths = canonicalOrder.filter((docPath) =>
    docPath.endsWith(".md"),
  );
  const discoveredMarkdownDocPaths = (
    await listMarkdownFilesRecursive(specsRoot)
  ).map((absolutePath) =>
    normalizePathForJson(path.relative(specsRoot, absolutePath)),
  );
  const canonicalSet = new Set(canonicalMarkdownDocPaths);
  const additionalMarkdownDocPaths = discoveredMarkdownDocPaths.filter(
    (docPath) => !canonicalSet.has(docPath),
  );
  const discoveredMarkdownDocPathSet = new Set(discoveredMarkdownDocPaths);
  const missingMarkdownDocPaths = canonicalMarkdownDocPaths.filter(
    (docPath) => !discoveredMarkdownDocPathSet.has(docPath),
  );
  if (missingMarkdownDocPaths.length > 0) {
    fail(
      `specs/SPEC_VERSION.md: canonical document order references missing Markdown document(s): ${missingMarkdownDocPaths.join(", ")}`,
    );
  }
  const markdownDocPaths = [
    ...canonicalMarkdownDocPaths,
    ...additionalMarkdownDocPaths,
  ];
  const docs: ParsedDoc[] = [];
  for (const relativePath of markdownDocPaths) {
    const absolutePath = path.join(specsRoot, relativePath);
    docs.push(await parseMarkdownDoc(absolutePath, relativePath));
  }

  const firstDoc = docs[0];
  if (firstDoc === undefined) {
    fail("specs/SPEC_VERSION.md: no Markdown documents found");
  }
  const packageSpecVersion = firstDoc.frontMatter.spec_version;
  const packageSpecName = firstDoc.frontMatter.spec_package_name;

  for (const doc of docs) {
    if (doc.frontMatter.spec_version !== packageSpecVersion) {
      fail(
        `specs/${doc.relativePath}: spec_version ${doc.frontMatter.spec_version} does not match package ${packageSpecVersion}`,
      );
    }
    if (doc.frontMatter.spec_package_name !== packageSpecName) {
      fail(
        `specs/${doc.relativePath}: spec_package_name ${doc.frontMatter.spec_package_name} does not match package ${packageSpecName}`,
      );
    }
  }

  const allSections = docs.flatMap((doc) => parseSectionEntries(doc));
  const sectionRefsSeen = new Map<string, string>();
  for (const section of allSections) {
    const ref = section.section_ref;
    const existing = sectionRefsSeen.get(ref);
    const location = `specs/${section.doc_path}`;
    if (existing) {
      fail(`duplicate SECTION_REF ${ref}: ${existing} and ${location}`);
    }
    sectionRefsSeen.set(ref, location);
  }

  const manifest = renderCanonicalJson({
    spec_version: packageSpecVersion,
    spec_package_name: packageSpecName,
    package_identity: identity,
    canonical_document_order: canonicalOrder,
    documents: docs.map((doc) => ({
      path: normalizePathForJson(doc.relativePath),
      doc_id: doc.frontMatter.doc_id,
      doc_title: doc.frontMatter.doc_title,
      doc_type: doc.frontMatter.doc_type,
      status: doc.frontMatter.status,
      machine_readable: doc.frontMatter.machine_readable,
    })),
  });

  const sectionIndex = renderCanonicalJson({
    spec_version: packageSpecVersion,
    spec_package_name: packageSpecName,
    sections: allSections.map((section) => ({
      ...section,
      doc_path: normalizePathForJson(section.doc_path),
    })),
  });

  return { manifest, sectionIndex };
}

async function writeGeneratedArtifacts(repoRoot: string): Promise<void> {
  const { manifest, sectionIndex } = await generateMetadata(repoRoot);
  await writeFile(
    path.join(repoRoot, "specs", "spec-manifest.json"),
    manifest,
    "utf8",
  );
  await writeFile(
    path.join(repoRoot, "specs", "section-index.json"),
    sectionIndex,
    "utf8",
  );
}

async function verifyGeneratedArtifacts(repoRoot: string): Promise<void> {
  const { manifest, sectionIndex } = await generateMetadata(repoRoot);
  const checks = [
    { relativePath: "specs/spec-manifest.json", expected: manifest },
    { relativePath: "specs/section-index.json", expected: sectionIndex },
  ];

  const diagnostics: string[] = [];
  for (const check of checks) {
    const artifactPath = path.join(repoRoot, check.relativePath);
    let actual = "";
    try {
      actual = await readFile(artifactPath, "utf8");
    } catch {
      diagnostics.push(
        `stale generated artifact: ${check.relativePath} is missing`,
      );
      continue;
    }
    if (actual !== check.expected) {
      diagnostics.push(
        `stale generated artifact: ${check.relativePath} does not match generator output`,
      );
    }
  }

  if (diagnostics.length > 0) {
    fail(diagnostics.join("\n"));
  }
}

async function main() {
  const command = process.argv[2] ?? "";
  const repoRoot = process.cwd();
  if (command === "generate") {
    await writeGeneratedArtifacts(repoRoot);
    return;
  }
  if (command === "verify") {
    await verifyGeneratedArtifacts(repoRoot);
    return;
  }
  fail(
    "Usage: node --experimental-strip-types tools/spec-metadata.ts <generate|verify>",
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
