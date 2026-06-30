import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { unzipSync } from "fflate";
import tar from "tar-stream";

import { ensureDirectory, readFileBytes } from "#fs";
import { normalizeArchiveEntryPath, safeJoinWithin, sanitizeFileName } from "#paths";
import type { StageArtifactInput, StageArtifactResult, UpdateArtifact } from "#types";

export async function stageArtifact(input: StageArtifactInput): Promise<StageArtifactResult> {
  const stageDirectory = path.join(input.workingDirectory, "stage", randomUUID());
  await ensureDirectory(stageDirectory);

  if (input.artifact.installStrategy === "raw") {
    return stageRawArtifact(stageDirectory, input);
  }

  if (input.artifact.installStrategy === "archive") {
    return stageArchiveArtifact(stageDirectory, input);
  }

  throw new Error(`Unsupported install strategy for staging: ${input.artifact.installStrategy}`);
}

async function stageRawArtifact(stageDirectory: string, input: StageArtifactInput): Promise<StageArtifactResult> {
  const fileName = sanitizeFileName(input.artifact.fileName ?? `${input.artifact.id}.bin`);
  const stagedBinaryPath = path.join(stageDirectory, fileName);
  await fs.copyFile(input.download.filePath, stagedBinaryPath);
  await fs.chmod(stagedBinaryPath, 0o755);

  return {
    artifact: input.artifact,
    extractedFiles: [fileName],
    stageDirectory,
    stagedBinaryPath,
  };
}

async function stageArchiveArtifact(stageDirectory: string, input: StageArtifactInput): Promise<StageArtifactResult> {
  const extractedRoot = path.join(stageDirectory, "payload");
  await ensureDirectory(extractedRoot);

  if (input.artifact.archiveFormat === "tar.gz") {
    await extractTarGz(input.download.filePath, extractedRoot);
  }
  else if (input.artifact.archiveFormat === "zip") {
    await extractZipArchive(input.download.filePath, extractedRoot);
  }
  else {
    throw new Error("Archive artifacts require archiveFormat tar.gz or zip.");
  }

  const extractedFiles = await listFiles(extractedRoot);
  const stagedBinaryPath = resolveStagedBinaryPath(input.artifact, extractedRoot, extractedFiles);

  return {
    artifact: input.artifact,
    extractedFiles,
    stageDirectory,
    stagedBinaryPath,
  };
}

async function extractTarGz(filePath: string, destinationRoot: string): Promise<void> {
  const extract = tar.extract();
  const buffer = Buffer.from(await readFileBytes(filePath));

  await new Promise<void>((resolve, reject) => {
    extract.on("entry", (header, stream, next) => {
      handleTarEntry(destinationRoot, String(header.name ?? ""), String(header.type ?? "file"), header.mode ?? 0o755, stream)
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
      mode: 0o755,
    });
  }
}

async function listFiles(root: string): Promise<string[]> {
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

function resolveStagedBinaryPath(artifact: UpdateArtifact, extractedRoot: string, extractedFiles: string[]): string {
  if (artifact.binaryPath) {
    return safeJoinWithin(extractedRoot, normalizeArchiveEntryPath(artifact.binaryPath));
  }

  if (extractedFiles.length === 1) {
    return safeJoinWithin(extractedRoot, extractedFiles[0]);
  }

  throw new Error(`Archive artifact ${artifact.id} requires binaryPath when multiple files are present.`);
}
