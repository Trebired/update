import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";

import {
  applySecondaryUpdate,
  applySelfUpdate,
  createSecondaryUpdateInstruction,
  verifySecondaryUpdateInstruction,
} from "#index";
import {
  createArtifact,
  createSignedManifest,
  createSigningPair,
  createTempDir,
  readText,
} from "#test-helpers";

describe("orchestration and client flows", () => {
  test("rejects expired and wrong-target secondary instructions", () => {
    const { privateKey, publicKey } = createSigningPair();
    const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();
    const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const instruction = createSecondaryUpdateInstruction({
      artifact: createArtifact({
        checksum: {
          type: "sha256",
          value: "abc123",
        },
      }),
      expiresAt: "2026-06-30T11:59:00.000Z",
      manifestSignature: {
        type: "ed25519",
        value: "manifest",
      },
      releaseVersion: "2.0.0",
      signer: privatePem,
      targetEntity: "secondary",
      targetInstanceId: "instance-1",
    });

    expect(() => verifySecondaryUpdateInstruction({
      expectedTargetEntity: "secondary",
      expectedTargetInstanceId: "instance-1",
      instruction,
      now: new Date("2026-06-30T12:00:00.000Z"),
      verificationKeys: [publicPem],
    })).toThrow(/expired/i);

    const wrongTargetInstruction = createSecondaryUpdateInstruction({
      artifact: createArtifact({
        checksum: {
          type: "sha256",
          value: "abc123",
        },
      }),
      expiresAt: "2026-06-30T12:30:00.000Z",
      manifestSignature: {
        type: "ed25519",
        value: "manifest",
      },
      releaseVersion: "2.0.0",
      signer: privatePem,
      targetEntity: "secondary",
      targetInstanceId: "instance-1",
    });

    expect(() => verifySecondaryUpdateInstruction({
      expectedTargetEntity: "secondary",
      expectedTargetInstanceId: "wrong-instance",
      instruction: wrongTargetInstruction,
      now: new Date("2026-06-30T12:00:00.000Z"),
      verificationKeys: [publicPem],
    })).toThrow(/target instance/i);
  });

  test("applies a self update from a signed manifest", async () => {
    const { privateKey, publicKey } = createSigningPair();
    const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();
    const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const workingDirectory = await createTempDir("update-self");
    const livePath = `${workingDirectory}/live.bin`;
    const artifactBytes = Buffer.from("2.0.0");
    const artifact = createArtifact({
      checksum: {
        type: "sha256",
        value: createHash("sha256").update(artifactBytes).digest("hex"),
      },
      entity: "primary",
      size: artifactBytes.length,
      url: "https://updates.example.test/self.bin",
    });
    const manifest = createSignedManifest({
      artifact,
      entity: "primary",
      privateKeyPem: privatePem,
    });
    await Bun.write(livePath, "1.0.0");

    const result = await applySelfUpdate({
      activationTarget: {
        livePath,
      },
      arch: process.arch,
      channel: "stable",
      currentVersion: "1.0.0",
      entity: "primary",
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("manifest.json")) {
          return new Response(JSON.stringify(manifest), { status: 200 });
        }
        if (url.endsWith("self.bin")) {
          return new Response(artifactBytes, { status: 200 });
        }
        return new Response("missing", { status: 404 });
      },
      installStrategy: "raw",
      manifestUrl: "https://updates.example.test/manifest.json",
      os: process.platform,
      readInstalledVersion: async () => readText(livePath),
      verificationKeys: [publicPem],
      workingDirectory,
    });

    expect(result.plan.shouldUpdate).toBe(true);
    expect(await readText(livePath)).toBe("2.0.0");
  });

  test("applies a primary-issued secondary instruction", async () => {
    const { privateKey, publicKey } = createSigningPair();
    const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();
    const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const workingDirectory = await createTempDir("update-secondary");
    const livePath = `${workingDirectory}/secondary.bin`;
    const artifactBytes = Buffer.from("3.0.0");
    const artifact = createArtifact({
      checksum: {
        type: "sha256",
        value: createHash("sha256").update(artifactBytes).digest("hex"),
      },
      size: artifactBytes.length,
      url: "https://updates.example.test/secondary.bin",
    });
    const manifest = createSignedManifest({
      artifact,
      privateKeyPem: privatePem,
      releaseVersion: "3.0.0",
    });
    const instruction = createSecondaryUpdateInstruction({
      artifact,
      expiresAt: "2026-06-30T12:30:00.000Z",
      manifestSignature: manifest.signature,
      releaseVersion: manifest.releaseVersion,
      signer: privatePem,
      targetEntity: "secondary",
      targetInstanceId: "worker-1",
    });
    await Bun.write(livePath, "1.0.0");

    const result = await applySecondaryUpdate({
      fetchImpl: async () => new Response(artifactBytes, { status: 200 }),
      instruction,
      now: new Date("2026-06-30T12:00:00.000Z"),
      readInstalledVersion: async () => readText(livePath),
      target: {
        livePath,
      },
      targetEntity: "secondary",
      targetInstanceId: "worker-1",
      verificationKeys: [publicPem],
      workingDirectory,
    });

    expect(result.instruction.targetInstanceId).toBe("worker-1");
    expect(await readText(livePath)).toBe("3.0.0");
  });
});
