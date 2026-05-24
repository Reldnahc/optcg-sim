import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface SourceFile {
  readonly path: string;
  readonly contents: string;
}

export async function readCardsPackageSourceFiles(): Promise<SourceFile[]> {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const files = await readSourceFiles(root);

  return files.map((file) => ({
    path: file.path.replaceAll(path.sep, "/"),
    contents: file.contents,
  }));
}

async function readSourceFiles(directory: string): Promise<SourceFile[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry): Promise<readonly SourceFile[]> => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return readSourceFiles(entryPath);
      }

      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) {
        return [];
      }

      return [
        {
          path: entryPath,
          contents: await readFile(entryPath, "utf8"),
        },
      ];
    }),
  );

  return files.flat();
}
