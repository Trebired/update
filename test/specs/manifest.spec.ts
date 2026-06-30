import { describe, expect, test } from "bun:test";

import { fetchManifest, verifyManifestSignature } from "#index";
import { createArtifact, createSignedManifest, createSigningPair } from "#test-helpers";

describe("manifest", () => {
  test("normalizes aliased payloads and verifies signatures", async () => {
    const { privateKey, publicKey } = createSigningPair();
    const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();
    const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const signed = createSignedManifest({
      artifact: createArtifact({
        checksum: {
          type: "sha256",
          value: "abc123",
        },
      }),
      privateKeyPem: privatePem,
    });
    const aliasedPayload = {
      name: signed.entity,
      track: signed.channel,
      release: signed.releaseVersion,
      createdAt: signed.recordedAt,
      minimumVersion: signed.minimumSupportedVersion,
      releaseNotes: signed.notes,
      files: signed.artifacts.map((artifact) => ({
        ...artifact,
        platform: artifact.os,
        architecture: artifact.arch,
        strategy: artifact.installStrategy,
        archive: artifact.archiveFormat,
        binary: artifact.binaryPath,
        filename: artifact.fileName,
      })),
      sig: signed.signature,
    };
    const result = await fetchManifest({
      fetchImpl: async () => new Response(JSON.stringify(aliasedPayload), {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      }),
      manifestUrl: "https://updates.example.test/manifest.json",
      verificationKeys: [publicPem],
    });

    expect(result.manifest.entity).toBe(signed.entity);
    expect(result.manifest.releaseVersion).toBe("2.0.0");
    expect(result.manifest.artifacts[0].os).toBe(process.platform);
    verifyManifestSignature(result.manifest, [publicPem]);
  });
});
