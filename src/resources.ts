import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { extractArchive, inferArchiveFormat } from "#archive";
import { stripSignatureField } from "#canonical";
import { compatibilityKey } from "#compatibility";
import { downloadArtifact } from "#download";
import { ensureDirectory, ensureRemoved, pathExists } from "#fs";
import { fetchJsonManifest } from "#fetch-json";
import { normalizeChecksum, normalizeSignature, readArray, readOptionalRecord, readOptionalString, readRecord, readString } from "#normalization";
import { sanitizeFileName } from "#paths";
import { verifyDetachedSignature, verifyDownloadedArtifact } from "#verify";
import type {
  FetchResourceManifestOptions,
  FetchedJsonManifest,
  GenericManifestNormalizationOptions,
  InstalledResourceMeta,
  InstallResourceBundleInput,
  InstallResourceBundleResult,
  ResourceManifest,
  ResourceManifestEntry,
  SelectResourceCriteria,
  UpdateArtifact,
  UpdateVerificationKeyInput,
} from "#types";

const RESOURCE_META_FILE = ".update-resource-meta.json";

const DEFAULT_RESOURCE_MANIFEST_ALIASES = {
  entries: ["entries", "resources", "bundles"],
  recordedAt: ["recordedAt", "publishedAt", "createdAt"],
  signature: ["signature", "sig"],
} as const;

const DEFAULT_RESOURCE_ENTRY_ALIASES = {
  checksum: ["checksum", "sha256"],
  combination: ["combination", "versions", "entities"],
  fileName: ["fileName", "filename", "name"],
  key: ["key", "compatibilityKey"],
  resource: ["resource", "resourceName", "name"],
  url: ["url", "downloadUrl"],
  version: ["version", "releaseVersion"],
} as const;

export async function fetchResourceManifest(url: string, options: FetchResourceManifestOptions = {}): Promise<FetchedJsonManifest<ResourceManifest>> {
  return fetchJsonManifest(url, {
    auth: options.auth,
    authHeader: options.authHeader,
    fetchImpl: options.fetchImpl,
    normalization: (raw) => normalizeResourceManifest(raw, options.normalization),
    verificationKeys: options.verificationKeys,
  });
}

export function normalizeResourceManifest(
  raw: unknown,
  options: GenericManifestNormalizationOptions & { verificationKeys?: UpdateVerificationKeyInput[] } = {},
): ResourceManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Resource manifest payload must be an object.");
  }

  const record = raw as Record<string, unknown>;
  const allowAliases = options.allowFieldAliases ?? true;
  const manifestAliases = options.fieldAliases?.resourceManifest ?? {};
  const signature = readOptionalRecord(record, manifestAliases.signature ?? DEFAULT_RESOURCE_MANIFEST_ALIASES.signature, allowAliases);

  const normalized: ResourceManifest = {
    version: 1,
    entries: readArray(record, manifestAliases.entries ?? DEFAULT_RESOURCE_MANIFEST_ALIASES.entries, allowAliases)
      .map((entry) => normalizeResourceEntry(entry, options, allowAliases)),
    recordedAt: readOptionalString(record, manifestAliases.recordedAt ?? DEFAULT_RESOURCE_MANIFEST_ALIASES.recordedAt, allowAliases),
    signature: signature ? normalizeSignature(signature) : undefined,
  };

  if (options.verificationKeys?.length) {
    verifySignedResourceManifest(normalized, options.verificationKeys);
  }

  return normalized;
}

export function selectResourceEntry(entries: ResourceManifest | ResourceManifestEntry[], criteria: SelectResourceCriteria): ResourceManifestEntry {
  const list = Array.isArray(entries) ? entries : entries.entries;
  const wantedKey = criteria.key ?? (criteria.combination ? compatibilityKey(criteria.combination) : null);
  const matches = list
    .filter((entry) => entry.resource === criteria.resource)
    .filter((entry) => !wantedKey || entry.key === wantedKey);

  if (matches.length === 0) {
    throw new Error(`No resource entry matched ${criteria.resource}.`);
  }

  if (matches.length > 1) {
    throw new Error(`Multiple resource entries matched ${criteria.resource}.`);
  }

  return matches[0];
}

export async function installResourceBundle(input: InstallResourceBundleInput): Promise<InstallResourceBundleResult> {
  const artifact = createResourceArtifact(input);
  const download = await downloadArtifact({
    artifact,
    fetchImpl: input.fetchImpl,
    workingDirectory: input.workingDirectory,
  });

  try {
    await verifyDownloadedArtifact({ artifact, filePath: download.filePath });
    return await installVerifiedResourceBundle(input, artifact, download.filePath);
  }
  finally {
    await ensureRemoved(download.filePath);
  }
}

export async function readInstalledResourceMeta(targetDirectory: string): Promise<InstalledResourceMeta | null> {
  const metaPath = path.join(targetDirectory, RESOURCE_META_FILE);
  if (!(await pathExists(metaPath))) {
    return null;
  }

  const parsed = JSON.parse(await fs.readFile(metaPath, "utf8")) as InstalledResourceMeta;
  return parsed && typeof parsed === "object" ? parsed : null;
}

function normalizeResourceEntry(input: Record<string, unknown>, options: GenericManifestNormalizationOptions, allowAliases: boolean): ResourceManifestEntry {
  const aliases = options.fieldAliases?.resourceEntry ?? {};
  const combination = normalizeCombination(readRecord(input, aliases.combination ?? DEFAULT_RESOURCE_ENTRY_ALIASES.combination, allowAliases));

  return {
    key: readOptionalString(input, aliases.key ?? DEFAULT_RESOURCE_ENTRY_ALIASES.key, allowAliases) ?? compatibilityKey(combination),
    combination,
    resource: readString(input, aliases.resource ?? DEFAULT_RESOURCE_ENTRY_ALIASES.resource, allowAliases),
    version: readString(input, aliases.version ?? DEFAULT_RESOURCE_ENTRY_ALIASES.version, allowAliases),
    fileName: readString(input, aliases.fileName ?? DEFAULT_RESOURCE_ENTRY_ALIASES.fileName, allowAliases),
    url: readString(input, aliases.url ?? DEFAULT_RESOURCE_ENTRY_ALIASES.url, allowAliases),
    checksum: normalizeChecksum(readRecord(input, aliases.checksum ?? DEFAULT_RESOURCE_ENTRY_ALIASES.checksum, allowAliases)),
  };
}

async function installVerifiedResourceBundle(input: InstallResourceBundleInput, artifact: UpdateArtifact, archivePath: string): Promise<InstallResourceBundleResult> {
  const locations = await createResourceInstallLocations(input.targetDirectory);

  try {
    await extractResourceBundle(input, artifact, archivePath, locations.stagingDir);
    await input.validate?.(locations.stagingDir);
    const meta = await writeInstalledResourceMeta(locations.stagingDir, input);
    await replaceDirectory(locations.stagingDir, input.targetDirectory, locations.backupDir);

    return {
      meta,
      targetDirectory: input.targetDirectory,
    };
  }
  catch (error) {
    await ensureRemoved(locations.stagingDir);
    throw error;
  }
  finally {
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

async function extractResourceBundle(input: InstallResourceBundleInput, artifact: UpdateArtifact, archivePath: string, stagingDir: string): Promise<void> {
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
    format: inferArchiveFormat(input.url) ?? inferArchiveFormat(artifact.fileName ?? ""),
  });
}

async function writeInstalledResourceMeta(stagingDir: string, input: InstallResourceBundleInput): Promise<InstalledResourceMeta> {
  const meta: InstalledResourceMeta = {
    ...(input.meta ?? {}),
    version: input.version,
    key: input.key,
    installedAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(stagingDir, RESOURCE_META_FILE), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  return meta;
}

function normalizeCombination(input: Record<string, unknown>): Record<string, string> {
  const combination = Object.fromEntries(Object.entries(input)
    .filter(([, value]) => typeof value === "string" && value.length > 0)
    .map(([entity, version]) => [entity, String(version)]));

  if (Object.keys(combination).length === 0) {
    throw new Error("Resource entry combination requires at least one entity version.");
  }

  return combination;
}

function verifySignedResourceManifest(manifest: ResourceManifest, verificationKeys: UpdateVerificationKeyInput[]): void {
  if (!manifest.signature) {
    throw new Error("Resource manifest is missing signature.");
  }

  verifyDetachedSignature({
    payload: stripSignatureField(manifest as unknown as Record<string, unknown>),
    signature: manifest.signature,
    verificationKeys,
  });
}

function createResourceArtifact(input: InstallResourceBundleInput): UpdateArtifact {
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

async function replaceDirectory(stagingDir: string, targetDirectory: string, backupDir: string): Promise<void> {
  const hadExistingTarget = await pathExists(targetDirectory);
  if (hadExistingTarget) {
    await fs.rename(targetDirectory, backupDir);
  }

  try {
    await fs.rename(stagingDir, targetDirectory);
  }
  catch (error) {
    if (hadExistingTarget && await pathExists(backupDir)) {
      await fs.rename(backupDir, targetDirectory);
    }
    throw error;
  }
}
