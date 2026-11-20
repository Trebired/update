import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { ensureDirectory, ensureRemoved, pathExists } from "#fs";
import { normalizeArchiveEntryPath, safeJoinWithin } from "#paths";
import { validateInstalledVersion } from "#verify";
import type {
  ActivateStagedArtifactInput,
  ActivateStagedArtifactResult,
  RollbackActivatedArtifactInput,
  UpdateActivationTarget,
} from "./types";

type ActivationPaths = {
  backupPath: string;
  livePath: string;
  nextPath: string;
};

export async function activateStagedArtifact(input: ActivateStagedArtifactInput): Promise<ActivateStagedArtifactResult> {
  const paths = activationPaths(input.target.livePath);
  const hadExistingTarget = await pathExists(paths.livePath);

  await ensureDirectory(path.dirname(paths.livePath));
  await removePreviousBackups(paths.livePath);
  await writeNextVersion(input, paths);

  try {
    if (hadExistingTarget) {
      await fs.rename(paths.livePath, paths.backupPath);
    }
    await fs.rename(paths.nextPath, paths.livePath);
    await afterActivation(input, paths.livePath);
  }
  catch (error) {
    await restoreActivation(paths, hadExistingTarget);
    throw error;
  }

  return {
    activatedAt: new Date().toISOString(),
    artifact: input.artifact,
    rollback: {
      backupPath: hadExistingTarget ? paths.backupPath : null,
      releaseVersion: input.releaseVersion,
      targetPath: paths.livePath,
    },
    targetPath: paths.livePath,
  };
}

export async function rollbackActivatedArtifact(input: RollbackActivatedArtifactInput): Promise<void> {
  const rollback = input.rollback;
  await ensureRemoved(rollback.targetPath);
  if (rollback.backupPath) {
    await fs.rename(rollback.backupPath, rollback.targetPath);
  }
}

function activationPaths(livePath: string): ActivationPaths {
  const sessionId = randomUUID();
  const directory = path.dirname(livePath);
  const name = path.basename(livePath);
  return {
    backupPath: path.join(directory, `.${name}.${sessionId}.previous`),
    livePath,
    nextPath: path.join(directory, `.${name}.${sessionId}.next`),
  };
}

async function removePreviousBackups(livePath: string): Promise<void> {
  const directory = path.dirname(livePath);
  const prefix = `.${path.basename(livePath)}.`;
  const entries = await fs.readdir(directory).catch (() => [] as string[]);
  for (const entry of entries) {
    if (entry.startsWith(prefix) && entry.endsWith(".previous")) {
      await ensureRemoved(path.join(directory, entry));
    }
  }
}

async function writeNextVersion(input: ActivateStagedArtifactInput, paths: ActivationPaths): Promise<void> {
  if (input.target.kind === "directory") {
    await fs.cp(stagedDirectory(input), paths.nextPath, { recursive: true, verbatimSymlinks: true });
    if (input.target.preserveOwner) {
      await copyOwner(paths.livePath, paths.nextPath);
    }
    return;
  }
  if (!input.stage.stagedBinaryPath) {
    throw new Error(`Artifact ${input.artifact.id} has no single file to activate; set binaryPath or activate it as a directory.`);
  }
  await fs.copyFile(input.stage.stagedBinaryPath, paths.nextPath);
  await fs.chmod(paths.nextPath, input.target.fileMode ?? 0o755);
}

function stagedDirectory(input: ActivateStagedArtifactInput): string {
  if (!input.stage.payloadRoot) {
    throw new Error(`Artifact ${input.artifact.id} is not an archive; only archives activate as a directory.`);
  }
  const root = directoryRoot(input.target);
  return root ? safeJoinWithin(input.stage.payloadRoot, root) : input.stage.payloadRoot;
}

function directoryRoot(target: UpdateActivationTarget): string {
  const root = String(target.archiveRoot ?? "").trim();
  return root ? normalizeArchiveEntryPath(root) : "";
}

async function copyOwner(fromPath: string, toPath: string): Promise<void> {
  if (!(await pathExists(fromPath))) return;
  const owner = await fs.stat(fromPath);
  await chownTree(toPath, owner.uid, owner.gid);
}

async function chownTree(target: string, uid: number, gid: number): Promise<void> {
  await fs.lchown(target, uid, gid);
  const stat = await fs.lstat(target);
  if (!stat.isDirectory()) return;
  for (const entry of await fs.readdir(target)) {
    await chownTree(path.join(target, entry), uid, gid);
  }
}

async function afterActivation(input: ActivateStagedArtifactInput, livePath: string): Promise<void> {
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

async function restoreActivation(paths: ActivationPaths, hadExistingTarget: boolean): Promise<void> {
  await ensureRemoved(paths.nextPath);
  if (hadExistingTarget && await pathExists(paths.backupPath)) {
    await ensureRemoved(paths.livePath);
    await fs.rename(paths.backupPath, paths.livePath);
    return;
  }
  if (!hadExistingTarget) {
    await ensureRemoved(paths.livePath);
  }
}
