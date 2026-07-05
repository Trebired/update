import { describe, expect, test } from "bun:test";

import { fetchManifest, verifyManifestSignature } from "#index";
import { createArtifact, createSignedManifest, createSigningPair } from "#test-helpers";

describe("manifest", () => {
  registerAliasedManifestTest();
  registerChannelLessManifestTest();
});

function registerAliasedManifestTest() {
  test("normalizes aliased payloads and verifies signatures", async () => {
    const { publicPem, signed } = createSignedManifestFixture();
    const aliasedPayload = createAliasedPayload(signed);
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
}

function registerChannelLessManifestTest() {
  test("accepts channel-less manifests", async () => {
    const { privatePem, publicPem } = createSigningMaterial();
    const manifest = createSignedManifest({
      artifact: createArtifact({
        checksum: {
          type: "sha256",
          value: "abc123",
        },
      }),
      channel: null,
      privateKeyPem: privatePem,
    });

    const result = await fetchManifest({
      fetchImpl: async () => new Response(JSON.stringify(manifest), { status: 200 }),
      manifestUrl: "https://updates.example.test/manifest.json",
      verificationKeys: [publicPem],
    });

    expect(result.manifest.channel).toBeNull();
  });
}

function createSignedManifestFixture() {
  const { privatePem, publicPem } = createSigningMaterial();
  return {
    publicPem,
    signed: createSignedManifest({
      artifact: createArtifact({
        checksum: {
          type: "sha256",
          value: "abc123",
        },
      }),
      privateKeyPem: privatePem,
    }),
  };
}

function createSigningMaterial() {
  const { privateKey, publicKey } = createSigningPair();
  return {
    privatePem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
}

function createAliasedPayload(signed: ReturnType<typeof createSignedManifest>) {
  return {
    createdAt: signed.recordedAt,
    files: signed.artifacts.map((artifact) => ({
      ...artifact,
      architecture: artifact.arch,
      archive: artifact.archiveFormat,
      binary: artifact.binaryPath,
      filename: artifact.fileName,
      platform: artifact.os,
      strategy: artifact.installStrategy,
    })),
    minimumVersion: signed.minimumSupportedVersion,
    name: signed.entity,
    release: signed.releaseVersion,
    releaseNotes: signed.notes,
    sig: signed.signature,
    track: signed.channel,
  };
}
