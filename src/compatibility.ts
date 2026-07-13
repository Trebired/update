import { stripSignatureField } from "#canonical";
import { normalizeChecksum, normalizeSignature, readArray, readOptionalRecord, readOptionalString, readRecord, readString } from "#normalization";
import { verifyDetachedSignature } from "#verify";
import type {
  CompatibilityCombination,
  CompatibilityResourceDescriptor,
  CompatibilitySet,
  GenericManifestNormalizationOptions,
  UpdateVerificationKeyInput,
} from "#types";

const DEFAULT_COMPATIBILITY_SET_ALIASES = {
  combinations: ["combinations", "releases", "entries"],
  recordedAt: ["recordedAt", "publishedAt", "createdAt"],
  signature: ["signature", "sig"],
} as const;

const DEFAULT_COMBINATION_ALIASES = {
  resources: ["resources", "bundles"],
  versions: ["versions", "entities", "subjects"],
} as const;

const DEFAULT_RESOURCE_ALIASES = {
  checksum: ["checksum", "sha256"],
  fileName: ["fileName", "filename", "name"],
  version: ["version", "releaseVersion"],
} as const;

export function compatibilityKey(combination: CompatibilityCombination | Record<string, string>): string {
  const versions = readCombinationVersions(combination);
  return Object.entries(versions)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([entity, version]) => `${encodeKeyPart(entity)}=${encodeKeyPart(version)}`)
    .join("~");
}

export function parseCompatibilityKey(key: string): Record<string, string> {
  if (key.length === 0) {
    return {};
  }

  return Object.fromEntries(key.split("~").map((segment) => {
    const separatorIndex = segment.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(`Invalid compatibility key segment: ${segment}`);
    }

    return [
      decodeURIComponent(segment.slice(0, separatorIndex)),
      decodeURIComponent(segment.slice(separatorIndex + 1)),
    ];
  }));
}

export function normalizeCompatibilitySet(
  raw: unknown,
  options: GenericManifestNormalizationOptions & { verificationKeys?: UpdateVerificationKeyInput[] } = {},
): CompatibilitySet {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Compatibility set payload must be an object.");
  }

  const record = raw as Record<string, unknown>;
  const allowAliases = options.allowFieldAliases ?? true;
  const setAliases = options.fieldAliases?.compatibilitySet ?? {};
  const combinationAliases = options.fieldAliases?.combination ?? {};
  const combinations = readArray(record, setAliases.combinations ?? DEFAULT_COMPATIBILITY_SET_ALIASES.combinations, allowAliases)
    .map((entry) => normalizeCombination(entry, combinationAliases, options, allowAliases));
  const signature = readOptionalRecord(record, setAliases.signature ?? DEFAULT_COMPATIBILITY_SET_ALIASES.signature, allowAliases);

  const normalized: CompatibilitySet = {
    version: 1,
    combinations,
    recordedAt: readOptionalString(record, setAliases.recordedAt ?? DEFAULT_COMPATIBILITY_SET_ALIASES.recordedAt, allowAliases),
    signature: signature ? normalizeSignature(signature) : undefined,
  };

  if (options.verificationKeys?.length) {
    verifySignedCompatibilitySet(normalized, options.verificationKeys);
  }

  return normalized;
}

export function findCombination(set: CompatibilitySet, criteria: Record<string, string>): CompatibilityCombination | null {
  const matches = set.combinations.filter((combination) => Object.entries(criteria)
    .every(([entity, version]) => combination.versions[entity] === version));

  if (matches.length === 0) {
    return null;
  }

  if (matches.length > 1) {
    throw new Error("Multiple compatibility combinations matched the criteria.");
  }

  return matches[0];
}

export function isCombinationReleased(set: CompatibilitySet, combination: CompatibilityCombination | Record<string, string>): boolean {
  const wanted = compatibilityKey(combination);
  return set.combinations.some((entry) => compatibilityKey(entry) === wanted);
}

function normalizeCombination(
  input: Record<string, unknown>,
  aliases: NonNullable<GenericManifestNormalizationOptions["fieldAliases"]>["combination"],
  options: GenericManifestNormalizationOptions,
  allowAliases: boolean,
): CompatibilityCombination {
  const versionsRaw = readOptionalRecord(input, aliases?.versions ?? DEFAULT_COMBINATION_ALIASES.versions, allowAliases);
  const resourcesRaw = readOptionalRecord(input, aliases?.resources ?? DEFAULT_COMBINATION_ALIASES.resources, allowAliases);
  const versions = versionsRaw
    ? normalizeVersionMap(versionsRaw)
    : normalizeVersionMap(Object.fromEntries(Object.entries(input).filter(([key, value]) => key !== "resources" && typeof value === "string")));

  return {
    versions,
    resources: resourcesRaw ? normalizeResources(resourcesRaw, options, allowAliases) : undefined,
  };
}

function normalizeVersionMap(input: Record<string, unknown>): Record<string, string> {
  const versions = Object.fromEntries(Object.entries(input)
    .filter(([, value]) => typeof value === "string" && value.length > 0)
    .map(([entity, version]) => [entity, String(version)]));

  if (Object.keys(versions).length === 0) {
    throw new Error("Compatibility combination requires at least one entity version.");
  }

  return versions;
}

function normalizeResources(input: Record<string, unknown>, options: GenericManifestNormalizationOptions, allowAliases: boolean): Record<string, CompatibilityResourceDescriptor> {
  return Object.fromEntries(Object.entries(input).map(([resourceName, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Expected resource descriptor object for ${resourceName}.`);
    }

    const aliases = options.fieldAliases?.resource ?? {};
    const record = value as Record<string, unknown>;
    return [resourceName, {
      version: readString(record, aliases.version ?? DEFAULT_RESOURCE_ALIASES.version, allowAliases),
      fileName: readString(record, aliases.fileName ?? DEFAULT_RESOURCE_ALIASES.fileName, allowAliases),
      checksum: normalizeChecksum(readRecord(record, aliases.checksum ?? DEFAULT_RESOURCE_ALIASES.checksum, allowAliases)),
    }];
  }));
}

function verifySignedCompatibilitySet(set: CompatibilitySet, verificationKeys: UpdateVerificationKeyInput[]): void {
  if (!set.signature) {
    throw new Error("Compatibility set is missing signature.");
  }

  verifyDetachedSignature({
    payload: stripSignatureField(set as unknown as Record<string, unknown>),
    signature: set.signature,
    verificationKeys,
  });
}

function readCombinationVersions(combination: CompatibilityCombination | Record<string, string>): Record<string, string> {
  if ("versions" in combination && combination.versions && typeof combination.versions === "object") {
    return combination.versions;
  }

  return combination as Record<string, string>;
}

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*~]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}
