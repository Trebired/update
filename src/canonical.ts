const encoder = new TextEncoder();

export function canonicalizeSignedPayload(value: unknown): Uint8Array {
  return encoder.encode(stableJsonStringify(value));
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function stripSignatureField<T extends Record<string, unknown>>(value: T): Omit<T, "signature"> {
  const clone = { ...value };
  delete clone.signature;
  return clone;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortValue(nested)]),
  );
}
