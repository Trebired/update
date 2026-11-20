import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { unzipSync } from "fflate";
import tar from "tar-stream";

import { ensureDirectory, readFileBytes } from "#fs";
import { normalizeArchiveEntryPath, safeJoinWithin } from "#paths";

export type ArchiveFormat = "tar.gz" | "zip";

type TarEntryStream = AsyncIterable<unknown>& { resume: () => unknown };

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
  extract.on("entry", (header, stream, next) => {
      handleTarEntry(destinationRoot, {
          linkname: String(header.linkname ?? ""),
          mode: header.mode ?? 0o644,
          name: String(header.name ?? ""),
          type: String(header.type ??"file"),
        }, stream)
      .then(() => next())
      .catch ((error) => extract.destroy(error));
  });
  await pipeline(createReadStream(filePath), createGunzip(), extract);
}

type TarEntryHeader = {
  linkname: string;
  mode: number;
  name: string;
  type: string;
};

async function handleTarEntry(destinationRoot: string, header: TarEntryHeader, stream: TarEntryStream): Promise<void> {
  const targetPath = safeJoinWithin(destinationRoot, normalizeArchiveEntryPath(header.name));

  if (header.type === "directory") {
    await ensureDirectory(targetPath);
    stream.resume();
    return;
  }

  if (header.type === "symlink" || header.type === "link") {
    stream.resume();
    await ensureDirectory(path.dirname(targetPath));
    await (header.type === "symlink"
      ? writeSymlink(destinationRoot, targetPath, header.linkname)
      : writeHardLink(destinationRoot, targetPath, header.linkname));
    return;
  }

  if (header.type !== "file") {
    stream.resume();
    throw new Error(`Unsupported archive entry type: ${header.type}`);
  }

  await ensureDirectory(path.dirname(targetPath));
  await pipeline(stream, createWriteStream(targetPath, { mode: header.mode }));
}

async function writeSymlink(destinationRoot: string, linkPath: string, linkTarget: string): Promise<void> {
  if (!linkTarget || path.isAbsolute(linkTarget)) {
    throw new Error(`Archive symlink ${path.relative(destinationRoot, linkPath)} must point to a relative path.`);
  }
  const resolved = path.resolve(path.dirname(linkPath), linkTarget);
  safeJoinWithin(destinationRoot, path.relative(destinationRoot, resolved));
  await fs.symlink(linkTarget, linkPath);
}

async function writeHardLink(destinationRoot: string, linkPath: string, linkTarget: string): Promise<void> {
  const sourcePath = safeJoinWithin(destinationRoot, normalizeArchiveEntryPath(linkTarget));
  await fs.copyFile(sourcePath, linkPath);
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
