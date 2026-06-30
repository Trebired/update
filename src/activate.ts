import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { ensureDirectory, ensureRemoved, pathExists } from "#fs";
import { validateInstalledVersion } from "#verify";
import type {
  ActivateStagedArtifactInput,
  ActivateStagedArtifactResult,
  RollbackActivatedArtifactInput,
} from "#types";

export async function activateStagedArtifact(input: ActivateStagedArtifactInput): Promise<ActivateStagedArtifactResult> {
  const livePath = input.target.livePath;
  const liveDirectory = path.dirname(livePath);
  const sessionId = randomUUID();
  const tempPath = path.join(liveDirectory, `.${path.basename(livePath)}.${sessionId}.next`);
  const backupDirectory = path.join(input.workingDirectory, "rollback", sessionId);
  const backupPath = path.join(backupDirectory, `${path.basename(livePath)}.previous`);
  const hadExistingTarget = await pathExists(livePath);

  await ensureDirectory(liveDirectory);
  await ensureDirectory(backupDirectory);
  await fs.copyFile(input.stage.stagedBinaryPath, tempPath);
  await fs.chmod(tempPath, input.target.fileMode ?? 0o755);

  try {
    if (hadExistingTarget) {
      await fs.rename(livePath, backupPath);
    }

    await fs.rename(tempPath, livePath);

    if (input.restartHook) {
      await input.restartHook({
        artifact: input.artifact,
        mode: "self",
        releaseVersion: input.releaseVersion,
        targetPath: livePath,
      });
    }

    if (input.readInstalledVersion) {
      validateInstalledVersion(await input.readInstalledVersion(), input.releaseVersion);
    }
  }
  catch (error) {
    await restoreActivation(livePath, tempPath, hadExistingTarget ? backupPath : null);
    throw error;
  }

  return {
    activatedAt: new Date().toISOString(),
    artifact: input.artifact,
    rollback: {
      backupPath: hadExistingTarget ? backupPath : null,
      releaseVersion: input.releaseVersion,
      targetPath: livePath,
    },
    targetPath: livePath,
  };
}

export async function rollbackActivatedArtifact(input: RollbackActivatedArtifactInput): Promise<void> {
  const rollback = input.rollback;
  if (rollback.backupPath) {
    await ensureRemoved(rollback.targetPath);
    await fs.rename(rollback.backupPath, rollback.targetPath);
    return;
  }

  await ensureRemoved(rollback.targetPath);
}

async function restoreActivation(livePath: string, tempPath: string, backupPath: string | null): Promise<void> {
  await ensureRemoved(tempPath);
  if (!backupPath) {
    await ensureRemoved(livePath);
    return;
  }

  await ensureRemoved(livePath);
  if (await pathExists(backupPath)) {
    await fs.rename(backupPath, livePath);
  }
}
