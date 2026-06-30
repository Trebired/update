import path from "node:path";

import { sanitizeFileName } from "#paths";
import type { UpdateArtifact, UpdateManifest, UpdateRuntimeTarget } from "#types";

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
    checksum: normalizeChecksum(readRecord(input, ["checksum", "sha256"], allowAliases)),
    size: readOptionalNumber(input, ["size"], allowAliases),
    fileName: readOptionalString(input, ["fileName", "filename", "name"], allowAliases),
  };
}

export function selectArtifact(manifest: UpdateManifest, runtime: UpdateRuntimeTarget): UpdateArtifact {
  const matches = manifest.artifacts
    .filter((artifact) => artifact.entity === runtime.entity)
    .filter((artifact) => !artifact.channel || artifact.channel === runtime.channel)
    .filter((artifact) => artifact.os === runtime.os)
    .filter((artifact) => artifact.arch === runtime.arch)
    .filter((artifact) => artifact.installStrategy === runtime.installStrategy);

  if (matches.length === 0) {
    throw new Error(`No artifact matched entity ${runtime.entity} for ${runtime.os}/${runtime.arch}/${runtime.installStrategy}.`);
  }

  const sorted = matches.sort((left, right) => scoreArtifact(right, runtime) - scoreArtifact(left, runtime));

  if (sorted.length > 1 && scoreArtifact(sorted[0], runtime) === scoreArtifact(sorted[1], runtime)) {
    throw new Error(`Multiple equally specific artifacts matched entity ${runtime.entity}.`);
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

function scoreArtifact(artifact: UpdateArtifact, runtime: UpdateRuntimeTarget): number {
  let score = 0;

  if (artifact.channel === runtime.channel) {
    score += 10;
  }

  if (artifact.binaryPath) {
    score += 1;
  }

  return score;
}

function readRecord(input: Record<string, unknown>, keys: string[], allowAliases: boolean): Record<string, unknown> {
  const value = readUnknown(input, keys, allowAliases);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected object field ${keys[0]}.`);
  }
  return value as Record<string, unknown>;
}

function normalizeChecksum(input: Record<string, unknown>) {
  if ("type" in input) {
    return {
      type: String(input.type) as "sha256",
      value: String(input.value),
    };
  }

  return {
    type: "sha256" as const,
    value: String(input.value ?? input.sha256),
  };
}

function readString(input: Record<string, unknown>, keys: string[], allowAliases: boolean): string {
  const value = readUnknown(input, keys, allowAliases);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected string field ${keys[0]}.`);
  }
  return value;
}

function readOptionalString(input: Record<string, unknown>, keys: string[], allowAliases: boolean): string | null {
  const value = readUnknown(input, keys, allowAliases, true);
  if (value == null) {
    return null;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected optional string field ${keys[0]}.`);
  }
  return value;
}

function readOptionalNumber(input: Record<string, unknown>, keys: string[], allowAliases: boolean): number | null {
  const value = readUnknown(input, keys, allowAliases, true);
  if (value == null) {
    return null;
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Expected optional number field ${keys[0]}.`);
  }
  return value;
}

function readUnknown(input: Record<string, unknown>, keys: string[], allowAliases: boolean, optional = false): unknown {
  const names = allowAliases ? keys : [keys[0]];

  for (const key of names) {
    if (key in input) {
      return input[key];
    }
  }

  if (optional) {
    return null;
  }

  throw new Error(`Missing required field ${keys[0]}.`);
}
