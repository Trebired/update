import { normalizeArtifact } from "#artifacts";
import { verifyManifestSignature } from "#verify";
import type {
  FetchedManifest,
  UpdateFetch,
  UpdateManifest,
  UpdateNormalizationOptions,
  UpdateVerificationKeyInput,
} from "#types";

const DEFAULT_MANIFEST_ALIASES = {
  artifacts: ["artifacts", "files", "packages"],
  channel: ["channel", "track"],
  entity: ["entity", "name", "targetEntity"],
  minimumSupportedVersion: ["minimumSupportedVersion", "minimumVersion"],
  notes: ["notes", "releaseNotes"],
  recordedAt: ["recordedAt", "publishedAt", "createdAt"],
  releaseVersion: ["releaseVersion", "version", "release"],
  signature: ["signature", "sig"],
} as const;

export async function fetchManifest(input: {
  authHeader?: Record<string, string> | null;
  fetchImpl?: UpdateFetch;
  manifestUrl: string;
  normalization?: UpdateNormalizationOptions;
  verificationKeys?: UpdateVerificationKeyInput[];
}): Promise<FetchedManifest> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl(input.manifestUrl, {
    headers: input.authHeader ?? undefined,
  });

  if (!response.ok) {
    throw new Error(`Manifest request failed with status ${response.status}.`);
  }

  const raw = await response.json();
  const manifest = normalizeManifest(raw, input.normalization);

  if (input.verificationKeys?.length) {
    verifyManifestSignature(manifest, input.verificationKeys);
  }

  return {
    manifest,
    responseHeaders: response.headers,
  };
}

export function normalizeManifest(raw: unknown, options: UpdateNormalizationOptions = {}): UpdateManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Manifest payload must be an object.");
  }

  const record = raw as Record<string, unknown>;
  const allowAliases = options.allowFieldAliases ?? true;
  const aliases = options.fieldAliases?.manifest ?? {};

  const entity = readString(record, aliases.entity ?? DEFAULT_MANIFEST_ALIASES.entity, allowAliases);
  const artifactsRaw = readArray(record, aliases.artifacts ?? DEFAULT_MANIFEST_ALIASES.artifacts, allowAliases);

  return {
    version: 1,
    entity,
    channel: readString(record, aliases.channel ?? DEFAULT_MANIFEST_ALIASES.channel, allowAliases),
    releaseVersion: readString(record, aliases.releaseVersion ?? DEFAULT_MANIFEST_ALIASES.releaseVersion, allowAliases),
    recordedAt: readString(record, aliases.recordedAt ?? DEFAULT_MANIFEST_ALIASES.recordedAt, allowAliases),
    minimumSupportedVersion: readOptionalString(record, aliases.minimumSupportedVersion ?? DEFAULT_MANIFEST_ALIASES.minimumSupportedVersion, allowAliases),
    notes: normalizeNotes(readOptionalRecord(record, aliases.notes ?? DEFAULT_MANIFEST_ALIASES.notes, allowAliases)),
    artifacts: artifactsRaw.map((entry) => normalizeArtifact(entry, entity, allowAliases)),
    signature: normalizeSignature(readRecord(record, aliases.signature ?? DEFAULT_MANIFEST_ALIASES.signature, allowAliases)),
  };
}

function normalizeNotes(value: Record<string, unknown> | null) {
  if (!value) {
    return null;
  }

  return {
    title: typeof value.title === "string" ? value.title : undefined,
    summary: typeof value.summary === "string" ? value.summary : undefined,
    url: typeof value.url === "string" ? value.url : undefined,
  };
}

function normalizeSignature(value: Record<string, unknown>) {
  return {
    type: String(value.type ?? "ed25519") as "ed25519",
    value: String(value.value),
  };
}

function readArray(input: Record<string, unknown>, keys: readonly string[], allowAliases: boolean): Record<string, unknown>[] {
  const value = readUnknown(input, keys, allowAliases);
  if (!Array.isArray(value)) {
    throw new Error(`Expected array field ${keys[0]}.`);
  }
  return value as Record<string, unknown>[];
}

function readRecord(input: Record<string, unknown>, keys: readonly string[], allowAliases: boolean): Record<string, unknown> {
  const value = readUnknown(input, keys, allowAliases);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected object field ${keys[0]}.`);
  }
  return value as Record<string, unknown>;
}

function readOptionalRecord(input: Record<string, unknown>, keys: readonly string[], allowAliases: boolean): Record<string, unknown> | null {
  const value = readUnknown(input, keys, allowAliases, true);
  if (value == null) {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected object field ${keys[0]}.`);
  }
  return value as Record<string, unknown>;
}

function readString(input: Record<string, unknown>, keys: readonly string[], allowAliases: boolean): string {
  const value = readUnknown(input, keys, allowAliases);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected string field ${keys[0]}.`);
  }
  return value;
}

function readOptionalString(input: Record<string, unknown>, keys: readonly string[], allowAliases: boolean): string | null {
  const value = readUnknown(input, keys, allowAliases, true);
  if (value == null) {
    return null;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected optional string field ${keys[0]}.`);
  }
  return value;
}

function readUnknown(input: Record<string, unknown>, keys: readonly string[], allowAliases: boolean, optional = false): unknown {
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
