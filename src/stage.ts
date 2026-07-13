import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { extractArchive } from "#archive";
import { ensureDirectory } from "#fs";
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

  const extractedFiles = await extractArchive({
    destinationRoot: extractedRoot,
    filePath: input.download.filePath,
    format: input.artifact.archiveFormat,
  });
  const stagedBinaryPath = resolveStagedBinaryPath(input.artifact, extractedRoot, extractedFiles);

  return {
    artifact: input.artifact,
    extractedFiles,
    stageDirectory,
    stagedBinaryPath,
  };
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
