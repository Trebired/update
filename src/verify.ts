import fs from "node:fs";
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { pipeline } from "node:stream/promises";
import semver from "semver";

import { canonicalizeSignedPayload, stripSignatureField } from "#canonical";
import type {
  EvaluateUpdateCandidateInput,
  EvaluateUpdateCandidateResult,
  UpdateManifest,
  UpdateInstruction,
  UpdateSignature,
  UpdateSigningKeyInput,
  UpdateVerificationKeyInput,
  VerifyDownloadedArtifactInput,
  VerifyDownloadedArtifactResult,
} from "#types";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export async function verifyDownloadedArtifact(input: VerifyDownloadedArtifactInput): Promise<VerifyDownloadedArtifactResult> {
  const sha256 = await hashFileSha256(input.filePath);
  const bytesRead = fs.statSync(input.filePath).size;

  if (sha256 !== input.artifact.checksum.value.toLowerCase()) {
    throw new Error(`SHA-256 mismatch for artifact ${input.artifact.id}.`);
  }

  if (typeof input.artifact.size === "number" && input.artifact.size !== bytesRead) {
    throw new Error(`Downloaded artifact size mismatch for ${input.artifact.id}.`);
  }

  return {
    artifact: input.artifact,
    bytesRead,
    filePath: input.filePath,
    sha256,
  };
}

export async function hashFileSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest("hex");
}

export function verifyManifestSignature(manifest: UpdateManifest, verificationKeys: UpdateVerificationKeyInput[]): void {
  verifyDetachedSignature({
    payload: stripSignatureField(manifest),
    signature: manifest.signature,
    verificationKeys,
  });
}

export function verifyInstructionSignature(instruction: UpdateInstruction, verificationKeys: UpdateVerificationKeyInput[]): void {
  verifyDetachedSignature({
    payload: stripSignatureField(instruction),
    signature: instruction.signature,
    verificationKeys,
  });
}

export function createDetachedSignature(payload: unknown, signer: UpdateSigningKeyInput): UpdateSignature {
  const privateKey = toPrivateKey(signer);
  const signature = sign(null, canonicalizeSignedPayload(payload), privateKey);
  return {
    type: "ed25519",
    value: signature.toString("base64"),
  };
}

export function verifyDetachedSignature(input: {
  payload: unknown;
  signature: UpdateSignature;
  verificationKeys: UpdateVerificationKeyInput[];
}): void {
  if (input.signature.type !== "ed25519") {
    throw new Error(`Unsupported signature type: ${input.signature.type}`);
  }

  const payload = canonicalizeSignedPayload(input.payload);
  const signature = Buffer.from(input.signature.value, "base64");

  for (const key of input.verificationKeys) {
    const publicKey = toPublicKey(key);

    if (verify(null, payload, publicKey, signature)) {
      return;
    }
  }

  throw new Error("Signature verification failed.");
}

export function evaluateUpdateCandidate(input: EvaluateUpdateCandidateInput): EvaluateUpdateCandidateResult {
  const minimumComparison = input.minimumSupportedVersion
    ? compareVersions(input.currentVersion, input.minimumSupportedVersion)
    : 0;
  const comparison = compareVersions(input.currentVersion, input.releaseVersion);

  return {
    comparison,
    currentVersion: input.currentVersion,
    minimumSupportedVersion: input.minimumSupportedVersion,
    reason: comparison === 0
      ? "already-current"
      : comparison > 0 && !input.allowDowngrade
        ? "downgrade-disallowed"
        : undefined,
    releaseVersion: input.releaseVersion,
    shouldUpdate: comparison < 0 || (comparison === 0 && Boolean(input.allowSameVersion)) || (comparison > 0 && Boolean(input.allowDowngrade)),
    assertAllowed() {
      if (input.minimumSupportedVersion && minimumComparison < 0) {
        throw new Error(`Current version ${input.currentVersion} is below minimum supported ${input.minimumSupportedVersion}.`);
      }

      if (comparison === 0 && !input.allowSameVersion) {
        throw new Error(`Release version ${input.releaseVersion} matches the current version.`);
      }

      if (comparison > 0 && !input.allowDowngrade) {
        throw new Error(`Release version ${input.releaseVersion} is older than current version ${input.currentVersion}.`);
      }
    },
  };
}

export function validateVersionTransition(input: EvaluateUpdateCandidateInput): void {
  evaluateUpdateCandidate(input).assertAllowed();
}

export function validateInstalledVersion(actualVersion: string, expectedVersion: string): void {
  if (actualVersion !== expectedVersion) {
    throw new Error(`Installed version ${actualVersion} does not match expected ${expectedVersion}.`);
  }
}

export function compareVersions(left: string, right: string): number {
  const normalizedLeft = semver.valid(semver.coerce(left));
  const normalizedRight = semver.valid(semver.coerce(right));

  if (normalizedLeft && normalizedRight) {
    return semver.compare(normalizedLeft, normalizedRight);
  }

  return left.localeCompare(right);
}

function toPublicKey(input: UpdateVerificationKeyInput) {
  if (typeof input === "string") {
    return createKeyFromString(input, "pem");
  }

  if (input instanceof Uint8Array || Buffer.isBuffer(input)) {
    return createPublicKey({
      format: "der",
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(input)]),
      type: "spki",
    });
  }

  if ("type" in input && typeof input.type === "string") {
    return input;
  }

  const keyInput = input as Exclude<UpdateVerificationKeyInput, string | Uint8Array | Buffer | ReturnType<typeof createPublicKey>>;
  const format = keyInput.format ?? "pem";
  return createKeyFromString(keyInput.key, format);
}

function toPrivateKey(input: UpdateSigningKeyInput) {
  if (typeof input === "string" || input instanceof Uint8Array || Buffer.isBuffer(input) || ("type" in input && typeof input.type === "string")) {
    return createPrivateKey(input as Parameters<typeof createPrivateKey>[0]);
  }

  const keyInput = input as Exclude<UpdateSigningKeyInput, string | Uint8Array | Buffer | ReturnType<typeof createPrivateKey>>;
  const format = keyInput.format ?? "pem";

  if (format === "pkcs8-der") {
    return createPrivateKey({
      format: "der",
      key: Buffer.from(keyInput.key as Uint8Array),
      type: "pkcs8",
    });
  }

  return createPrivateKey(keyInput.key as Parameters<typeof createPrivateKey>[0]);
}

function createKeyFromString(input: string | Uint8Array | Buffer | ReturnType<typeof createPublicKey>, format: string) {
  if (typeof input !== "string" && !(input instanceof Uint8Array) && !Buffer.isBuffer(input)) {
    return input;
  }

  if (format === "raw" || format === "raw-base64") {
    const bytes = format === "raw-base64" ? Buffer.from(String(input), "base64") : Buffer.from(input as Uint8Array);
    return createPublicKey({
      format: "der",
      key: Buffer.concat([ED25519_SPKI_PREFIX, bytes]),
      type: "spki",
    });
  }

  if (format === "base64" || format === "base64url") {
    const encoding = format === "base64url" ? "base64url" : "base64";
    return createPublicKey(Buffer.from(String(input), encoding));
  }

  return createPublicKey(input as Parameters<typeof createPublicKey>[0]);
}
