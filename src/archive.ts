import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { unzipSync } from "fflate";
import tar from "tar-stream";

import { ensureDirectory, readFileBytes } from "#fs";
import { normalizeArchiveEntryPath, safeJoinWithin } from "#paths";

export type ArchiveFormat = "tar.gz" | "zip";

export async function extractArchive(input: {
  filePath: string;
  destinationRoot: string;
  format?: ArchiveFormat | null;
}): Promise<string[]> {
  await ensureDirectory(input.destinationRoot);

  const format = input.format ?? inferArchiveFormat(input.filePath);
  if (format === "tar.gz") {
    await extractTarGz(input.filePath, input.destinationRoot);
  }
  else if (format === "zip") {
    await extractZipArchive(input.filePath, input.destinationRoot);
  }
  else {
    throw new Error("Archive extraction requires format tar.gz or zip.");
  }

  return listFiles(input.destinationRoot);
}

export function inferArchiveFormat(filePathOrUrl: string): ArchiveFormat | null {
  const value = filePathOrUrl.toLowerCase();
  if (value.endsWith(".tar.gz") || value.endsWith(".tgz")) {
    return "tar.gz";
  }
  if (value.endsWith(".zip")) {
    return "zip";
  }
  return null;
}

export async function listFiles(root: string): Promise<string[]> {
  const results: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const nextPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(nextPath);
        continue;
      }

      if (entry.isFile()) {
        results.push(path.relative(root, nextPath));
      }
    }
  }

  return results.sort();
}

async function extractTarGz(filePath: string, destinationRoot: string): Promise<void> {
  const extract = tar.extract();
  const buffer = Buffer.from(await readFileBytes(filePath));

  await new Promise<void>((resolve, reject) => {
    extract.on("entry", (header, stream, next) => {
      handleTarEntry(destinationRoot, String(header.name ?? ""), String(header.type ?? "file"), header.mode ?? 0o644, stream)
        .then(() => next())
        .catch(reject);
    });
    extract.on("finish", () => resolve());
    extract.on("error", reject);
    extract.end(gunzipSync(buffer));
  });
}

async function handleTarEntry(destinationRoot: string, name: string, type: string, mode: number, stream: NodeJS.ReadableStream): Promise<void> {
  const entryPath = normalizeArchiveEntryPath(name);
  const targetPath = safeJoinWithin(destinationRoot, entryPath);

  if (type === "directory") {
    await ensureDirectory(targetPath);
    stream.resume();
    return;
  }

  if (type !== "file") {
    stream.resume();
    throw new Error(`Unsupported archive entry type: ${type}`);
  }

  await ensureDirectory(path.dirname(targetPath));
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  await fs.writeFile(targetPath, Buffer.concat(chunks), {
    mode,
  });
}

async function extractZipArchive(filePath: string, destinationRoot: string): Promise<void> {
  const archive = unzipSync(await readFileBytes(filePath));

  for (const [entryName, bytes] of Object.entries(archive)) {
    const entryPath = normalizeArchiveEntryPath(entryName);
    const targetPath = safeJoinWithin(destinationRoot, entryPath);

    if (entryName.endsWith("/")) {
      await ensureDirectory(targetPath);
      continue;
    }

    await ensureDirectory(path.dirname(targetPath));
    await fs.writeFile(targetPath, Buffer.from(bytes), {
      mode: 0o644,
    });
  }
}
