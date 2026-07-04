import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { gzipSync } from "node:zlib";
import { zipSync } from "fflate";
import tar from "tar-stream";

import { createDetachedSignature } from "#index";
import type { UpdateArtifact, UpdateManifest } from "#types";

export async function createTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
}

export function createSigningPair() {
  return generateKeyPairSync("ed25519");
}

export function createSignedManifest(input: {
  artifact: UpdateArtifact;
  channel?: string | null;
  entity?: string;
  minimumSupportedVersion?: string | null;
  privateKeyPem: string;
  releaseVersion?: string;
}): UpdateManifest {
  const unsigned = {
    version: 1 as const,
    entity: input.entity ?? input.artifact.entity,
    channel: "channel" in input ? input.channel ?? null : "stable",
    releaseVersion: input.releaseVersion ?? "2.0.0",
    recordedAt: "2026-06-30T12:00:00.000Z",
    minimumSupportedVersion: input.minimumSupportedVersion ?? null,
    notes: {
      title: "Release",
    },
    artifacts: [input.artifact],
  };

  return {
    ...unsigned,
    signature: createDetachedSignature(unsigned, input.privateKeyPem),
  };
}

export function createArtifact(input: Partial<UpdateArtifact> = {}): UpdateArtifact {
  return {
    id: input.id ?? "artifact-1",
    entity: input.entity ?? "secondary",
    channel: "channel" in input ? input.channel ?? null : "stable",
    os: input.os ?? process.platform,
    arch: input.arch ?? process.arch,
    installStrategy: input.installStrategy ?? "raw",
    archiveFormat: "archiveFormat" in input ? input.archiveFormat ?? null : null,
    binaryPath: "binaryPath" in input ? input.binaryPath ?? null : null,
    url: input.url ?? "https://updates.example.test/artifact.bin",
    mirrors: "mirrors" in input ? input.mirrors ?? [] : undefined,
    checksum: input.checksum ?? {
      type: "sha256",
      value: "",
    },
    size: "size" in input ? input.size ?? null : null,
    fileName: "fileName" in input ? input.fileName ?? null : null,
  };
}

export async function createTarGzArchive(entries: Record<string, string>): Promise<Buffer> {
  const pack = tar.pack();
  const chunks: Buffer[] = [];
  const completed = new Promise<void>((resolve, reject) => {
    pack.once("end", resolve);
    pack.once("error", reject);
  });

  pack.on("data", (chunk) => {
    chunks.push(Buffer.from(chunk));
  });

  for (const [name, content] of Object.entries(entries)) {
    pack.entry({ name }, content);
  }

  pack.finalize();
  await completed;
  return gzipSync(Buffer.concat(chunks));
}

export function createZipArchive(entries: Record<string, string>): Buffer {
  const archive = Object.fromEntries(
    Object.entries(entries).map(([name, content]) => [name, Buffer.from(content)]),
  );
  return Buffer.from(zipSync(archive));
}

export async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}
