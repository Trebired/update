import path from "node:path";

import {
  normalizeChecksum,
  readOptionalNumber,
  readOptionalString,
  readOptionalStringArray,
  readRecord,
  readString,
  readUnknown,
} from "#normalization";
import { sanitizeFileName } from "#paths";
import type {
  SelectArtifactOptions,
  UpdateArtifact,
  UpdateManifest,
  UpdateRuntimeTarget,
  UpdateSubject,
} from "#types";

export function normalizeArtifact(input: Record<string, unknown>, fallbackEntity: string, allowAliases = true): UpdateArtifact {
  const installStrategy = readString(input, ["installStrategy", "strategy", "kind"], allowAliases);
  const archiveFormat = readOptionalString(input, ["archiveFormat", "archive"], allowAliases);
  const entity = readUnknown(input, ["entity", "targetEntity"], allowAliases, true);

  return {
    id: readString(input, ["id"], allowAliases),
    entity: typeof entity === "string" && entity.length > 0 ? entity : fallbackEntity,
    channel: readOptionalString(input, ["channel", "track"], allowAliases),
    os: readString(input, ["os", "platform"], allowAliases),
    arch: readString(input, ["arch", "architecture"], allowAliases),
    installStrategy: installStrategy as UpdateArtifact["installStrategy"],
    archiveFormat: archiveFormat as UpdateArtifact["archiveFormat"],
    binaryPath: readOptionalString(input, ["binaryPath", "binary"], allowAliases),
    url: readString(input, ["url", "downloadUrl"], allowAliases),
    mirrors: readOptionalStringArray(input, ["mirrors", "mirrorUrls"], allowAliases) ?? undefined,
    checksum: normalizeChecksum(readRecord(input, ["checksum", "sha256"], allowAliases)),
    size: readOptionalNumber(input, ["size"], allowAliases),
    fileName: readOptionalString(input, ["fileName", "filename", "name"], allowAliases),
  };
}

export function selectArtifact(manifest: UpdateManifest, runtime: UpdateRuntimeTarget): UpdateArtifact {
  return selectArtifactForSubject(manifest, runtime, {
    channel: runtime.channel,
    legacyChannelMatch: true,
  });
}

export function selectArtifactForSubject(manifest: UpdateManifest, subject: UpdateSubject, options: SelectArtifactOptions = {}): UpdateArtifact {
  const matches = manifest.artifacts
    .filter((artifact) => artifact.entity === subject.entity)
    .filter((artifact) => !options.legacyChannelMatch || !artifact.channel || artifact.channel === (options.channel ?? null))
    .filter((artifact) => artifact.os === subject.os)
    .filter((artifact) => artifact.arch === subject.arch)
    .filter((artifact) => artifact.installStrategy === subject.installStrategy);

  if (matches.length === 0) {
    throw new Error(`No artifact matched entity ${subject.entity} for ${subject.os}/${subject.arch}/${subject.installStrategy}.`);
  }

  const sorted = matches.sort((left, right) => scoreArtifact(right, options) - scoreArtifact(left, options));

  if (sorted.length > 1 && scoreArtifact(sorted[0], options) === scoreArtifact(sorted[1], options)) {
    throw new Error(`Multiple equally specific artifacts matched entity ${subject.entity}.`);
  }

  return sorted[0];
}

export function inferArtifactFileName(artifact: UpdateArtifact): string {
  if (artifact.fileName) {
    return sanitizeFileName(artifact.fileName);
  }

  try {
    const pathname = new URL(artifact.url).pathname;
    const fileName = path.basename(pathname);
    if (fileName) {
      return sanitizeFileName(fileName);
    }
  }
  catch {
    // ignore and fall back
  }

  const extension = artifact.archiveFormat === "tar.gz"
    ? ".tar.gz"
    : artifact.archiveFormat === "zip"
      ? ".zip"
      : ".bin";

  return sanitizeFileName(`${artifact.entity}-${artifact.os}-${artifact.arch}-${artifact.id}${extension}`);
}

function scoreArtifact(artifact: UpdateArtifact, options: SelectArtifactOptions): number {
  let score = 0;

  if (options.legacyChannelMatch && artifact.channel && artifact.channel === (options.channel ?? null)) {
    score += 10;
  }

  if (artifact.binaryPath) {
    score += 1;
  }

  return score;
}
