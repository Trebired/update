import type { UpdateChecksum, UpdateSignature } from "#types";

export function normalizeSignature(value: Record<string, unknown>): UpdateSignature {
  return {
    type: String(value.type ?? "ed25519") as "ed25519",
    value: String(value.value),
  };
}

export function normalizeChecksum(input: Record<string, unknown>): UpdateChecksum {
  if ("type" in input) {
    return {
      type: String(input.type) as "sha256",
      value: String(input.value),
    };
  }

  return {
    type: "sha256",
    value: String(input.value ?? input.sha256),
  };
}

export function readArray(input: Record<string, unknown>, keys: readonly string[], allowAliases: boolean): Record<string, unknown>[] {
  const value = readUnknown(input, keys, allowAliases);
  if (!Array.isArray(value)) {
    throw new Error(`Expected array field ${keys[0]}.`);
  }
  return value as Record<string, unknown>[];
}

export function readRecord(input: Record<string, unknown>, keys: readonly string[], allowAliases: boolean): Record<string, unknown> {
  const value = readUnknown(input, keys, allowAliases);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected object field ${keys[0]}.`);
  }
  return value as Record<string, unknown>;
}

export function readOptionalRecord(input: Record<string, unknown>, keys: readonly string[], allowAliases: boolean): Record<string, unknown> | null {
  const value = readUnknown(input, keys, allowAliases, true);
  if (value == null) {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected object field ${keys[0]}.`);
  }
  return value as Record<string, unknown>;
}

export function readString(input: Record<string, unknown>, keys: readonly string[], allowAliases: boolean): string {
  const value = readUnknown(input, keys, allowAliases);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected string field ${keys[0]}.`);
  }
  return value;
}

export function readOptionalString(input: Record<string, unknown>, keys: readonly string[], allowAliases: boolean): string | null {
  const value = readUnknown(input, keys, allowAliases, true);
  if (value == null) {
    return null;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected optional string field ${keys[0]}.`);
  }
  return value;
}

export function readOptionalNumber(input: Record<string, unknown>, keys: readonly string[], allowAliases: boolean): number | null {
  const value = readUnknown(input, keys, allowAliases, true);
  if (value == null) {
    return null;
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Expected optional number field ${keys[0]}.`);
  }
  return value;
}

export function readOptionalStringArray(input: Record<string, unknown>, keys: readonly string[], allowAliases: boolean): string[] | null {
  const value = readUnknown(input, keys, allowAliases, true);
  if (value == null) {
    return null;
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`Expected optional string[] field ${keys[0]}.`);
  }
  return value as string[];
}

export function readUnknown(input: Record<string, unknown>, keys: readonly string[], allowAliases: boolean, optional = false): unknown {
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
