import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { extractArchive, inferArchiveFormat } from "#archive";
import { downloadArtifact } from "#download";
import { ensureDirectory, ensureRemoved, pathExists } from "#fs";
import { sanitizeFileName } from "#paths";
import { verifyDownloadedArtifact } from "#verify";
import type {
  InstalledResourceMeta,
  InstallResourceBundleInput,
  InstallResourceBundleResult,
  UpdateArtifact,
} from "#kn5mninc2td8";

const RESOURCE_META_FILE = ".update-resource-meta.json";

async function installResourceBundle(
  input: InstallResourceBundleInput,
): Promise<InstallResourceBundleResult> {
  const artifact = createResourceArtifact(input);
  const download = await downloadArtifact({
      artifact,
      fetchImpl: input.fetchImpl,
      workingDirectory: input.workingDirectory,
  });

  try {
    await verifyDownloadedArtifact({ artifact, filePath: download.filePath });
    return await installVerifiedResourceBundle(
      input,
      artifact,
      download.filePath,
    );
  } finally {
    await ensureRemoved(download.filePath);
  }
}

async function readInstalledResourceMeta(
  targetDirectory: string,
): Promise<InstalledResourceMeta|null> {
  const metaPath = path.join(targetDirectory, RESOURCE_META_FILE);
  if (!(await pathExists(metaPath))) {
    return null;
  }

  const parsed = JSON.parse(
    await fs.readFile(metaPath, "utf8"),
  ) as InstalledResourceMeta;
  return parsed && typeof parsed === "object" ? parsed : null;
}

async function installVerifiedResourceBundle(
  input: InstallResourceBundleInput,
  artifact: UpdateArtifact,
  archivePath: string,
): Promise<InstallResourceBundleResult> {
  const locations = await createResourceInstallLocations(input.targetDirectory);

  try {
    await extractResourceBundle(
      input,
      artifact,
      archivePath,
      locations.stagingDir,
    );
    await input.validate?.(locations.stagingDir);
    const meta = await writeInstalledResourceMeta(locations.stagingDir, input);
    await replaceDirectory(
      locations.stagingDir,
      input.targetDirectory,
      locations.backupDir,
    );

    return {
      meta,
      targetDirectory: input.targetDirectory,
    };
  } catch (error) {
    await ensureRemoved(locations.stagingDir);
    throw error;
  } finally {
    await ensureRemoved(locations.backupDir);
  }
}

async function createResourceInstallLocations(targetDirectory: string) {
  const targetParent = path.dirname(targetDirectory);
  await ensureDirectory(targetParent);

  return {
    backupDir: path.join(targetParent, `.resource-backup-${randomUUID()}`),
    stagingDir: path.join(targetParent, `.resource-staging-${randomUUID()}`),
  };
}

async function extractResourceBundle(
  input: InstallResourceBundleInput,
  artifact: UpdateArtifact,
  archivePath: string,
  stagingDir: string,
): Promise<void> {
  await ensureDirectory(stagingDir);

  if (input.extract) {
    await input.extract({
        archivePath,
        stagingDir,
    });
    return;
  }

  await extractArchive({
      destinationRoot: stagingDir,
      filePath: archivePath,
      format:
      inferArchiveFormat(input.url) ??
      inferArchiveFormat(artifact.fileName ?? ""),
  });
}

async function writeInstalledResourceMeta(
  stagingDir: string,
  input: InstallResourceBundleInput,
): Promise<InstalledResourceMeta> {
  const meta: InstalledResourceMeta = {
    ...(input.meta ?? {}),
    version: input.version,
    key: input.key,
    installedAt: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(stagingDir, RESOURCE_META_FILE),
    `${JSON.stringify(meta, null, 2)}\n`,
    "utf8",
  );
  return meta;
}

function createResourceArtifact(
  input: InstallResourceBundleInput,
): UpdateArtifact {
  return {
    id: input.key,
    entity: input.key,
    os: "any",
    arch: "any",
    installStrategy: "raw",
    archiveFormat: null,
    binaryPath: null,
    url: input.url,
    checksum: input.checksum,
    fileName: sanitizeFileName(path.basename(input.url), "resource-bundle"),
  };
}

async function replaceDirectory(
  stagingDir: string,
  targetDirectory: string,
  backupDir: string,
): Promise<void> {
  const hadExistingTarget = await pathExists(targetDirectory);
  if (hadExistingTarget) {
    await fs.rename(targetDirectory, backupDir);
  }

  try {
    await fs.rename(stagingDir, targetDirectory);
  } catch (error) {
    if (hadExistingTarget && (await pathExists(backupDir))) {
      await fs.rename(backupDir, targetDirectory);
    }
    throw error;
  }
}

export { installResourceBundle, readInstalledResourceMeta };
