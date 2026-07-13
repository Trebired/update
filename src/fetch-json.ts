import { stripSignatureField } from "#canonical";
import { resolveAuthHeaders } from "#download";
import { verifyDetachedSignature } from "#verify";
import type { FetchedJsonManifest, FetchJsonManifestOptions, UpdateAuthConfig } from "#types";

export async function fetchJsonManifest<T = unknown>(url: string, options: FetchJsonManifestOptions<T> = {}): Promise<FetchedJsonManifest<T>> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl(url, {
    headers: await buildHeaders(url, options),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`JSON manifest request failed with status ${response.status}.`);
  }

  const raw = await response.json();
  const manifest = options.normalization ? options.normalization(raw) : raw as T;

  if (options.verificationKeys?.length) {
    verifySignedObject(manifest, options.verificationKeys);
  }

  return {
    manifest,
    responseHeaders: response.headers,
  };
}

async function buildHeaders<T>(url: string, options: FetchJsonManifestOptions<T>) {
  const auth: UpdateAuthConfig | null | undefined = options.auth ?? (options.authHeader
    ? { type: "headers", headers: options.authHeader }
    : null);
  return {
    ...(await resolveAuthHeaders(auth, {
      purpose: "manifest",
      url,
    }) ?? {}),
    ...(options.headers ?? {}),
  };
}

function verifySignedObject(value: unknown, verificationKeys: NonNullable<FetchJsonManifestOptions<unknown>["verificationKeys"]>): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Signed JSON manifest must be an object.");
  }

  const signed = value as Record<string, unknown>;
  const signature = signed.signature;
  if (!signature || typeof signature !== "object" || Array.isArray(signature)) {
    throw new Error("Signed JSON manifest is missing signature.");
  }

  verifyDetachedSignature({
    payload: stripSignatureField(signed),
    signature: {
      type: String((signature as Record<string, unknown>).type ?? "ed25519") as "ed25519",
      value: String((signature as Record<string, unknown>).value),
    },
    verificationKeys,
  });
}
