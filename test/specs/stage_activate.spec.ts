import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";

import {
  activateStagedArtifact,
  rollbackActivatedArtifact,
  stageArtifact,
} from "#index";
import {
  createArtifact,
  createTarGzArchive,
  createTempDir,
  createZipArchive,
  readText,
} from "#test-helpers";

describe("staging and activation", () => {
  registerRawStageTest();
  registerTarGzStageTest();
  registerZipStageTest();
  registerTraversalRejectionTest();
  registerActivationRollbackTest();
});

function registerRawStageTest() {
  test("stages raw binaries", async () => {
    const workingDirectory = await createTempDir("update-stage-raw");
    const downloadPath = path.join(workingDirectory, "download.bin");
    await fs.writeFile(downloadPath, "2.0.0");
    const stage = await stageArtifact({
      artifact: createArtifact({
        checksum: {
          type: "sha256",
          value: createHash("sha256").update("2.0.0").digest("hex"),
        },
      }),
      download: createDownloadPayload(createArtifact(), downloadPath, "https://updates.example.test/download.bin", 5),
      workingDirectory,
    });

    expect(await readText(stage.stagedBinaryPath)).toBe("2.0.0");
  });
}

function registerTarGzStageTest() {
  test("extracts tar.gz archives and resolves the binary path", async () => {
    const workingDirectory = await createTempDir("update-stage-targz");
    const archivePath = path.join(workingDirectory, "release.tar.gz");
    await fs.writeFile(archivePath, await createTarGzArchive({
      "bin/app": "2.0.0",
    }));

    const artifact = await createArchiveArtifact("tar.gz", "bin/app", archivePath);
    const stage = await stageArtifact({
      artifact,
      download: createDownloadPayload(artifact, archivePath, "https://updates.example.test/release.tar.gz"),
      workingDirectory,
    });

    expect(await readText(stage.stagedBinaryPath)).toBe("2.0.0");
  });
}

function registerZipStageTest() {
  test("extracts zip archives", async () => {
    const workingDirectory = await createTempDir("update-stage-zip");
    const archivePath = path.join(workingDirectory, "release.zip");
    await fs.writeFile(archivePath, createZipArchive({
      "bin/app": "2.0.0",
    }));

    const artifact = await createArchiveArtifact("zip", "bin/app", archivePath);
    const stage = await stageArtifact({
      artifact,
      download: createDownloadPayload(artifact, archivePath, "https://updates.example.test/release.zip"),
      workingDirectory,
    });

    expect(await readText(stage.stagedBinaryPath)).toBe("2.0.0");
  });
}

function registerTraversalRejectionTest() {
  test("rejects traversal entries during extraction", async () => {
    const workingDirectory = await createTempDir("update-stage-traversal");
    const archivePath = path.join(workingDirectory, "release.zip");
    await fs.writeFile(archivePath, createZipArchive({
      "../escape": "bad",
    }));
    const artifact = await createArchiveArtifact("zip", "bin/app", archivePath);

    await expect(stageArtifact({
      artifact,
      download: createDownloadPayload(artifact, archivePath, "https://updates.example.test/release.zip"),
      workingDirectory,
    })).rejects.toThrow(/not allowed/i);
  });
}

function registerActivationRollbackTest() {
  test("activates and rolls back binaries", async () => {
    const workingDirectory = await createTempDir("update-activate");
    const livePath = path.join(workingDirectory, "live.bin");
    const downloadPath = path.join(workingDirectory, "download.bin");
    await fs.writeFile(livePath, "1.0.0");
    await fs.writeFile(downloadPath, "2.0.0");

    const artifact = createArtifact({
      checksum: {
        type: "sha256",
        value: createHash("sha256").update("2.0.0").digest("hex"),
      },
    });
    const stage = await stageArtifact({
      artifact,
      download: createDownloadPayload(artifact, downloadPath, "https://updates.example.test/download.bin", 5),
      workingDirectory,
    });
    const activation = await activateStagedArtifact({
      artifact,
      readInstalledVersion: async () => readText(livePath),
      releaseVersion: "2.0.0",
      stage,
      target: {
        livePath,
      },
      workingDirectory,
    });

    expect(await readText(livePath)).toBe("2.0.0");
    await rollbackActivatedArtifact({
      rollback: activation.rollback,
    });
    expect(await readText(livePath)).toBe("1.0.0");
  });
}

async function createArchiveArtifact(archiveFormat: "tar.gz" | "zip", binaryPath: string, archivePath: string) {
  const contents = await fs.readFile(archivePath);
  return createArtifact({
    archiveFormat,
    binaryPath,
    checksum: {
      type: "sha256",
      value: createHash("sha256").update(contents).digest("hex"),
    },
    installStrategy: "archive",
  });
}

function createDownloadPayload(artifact: ReturnType<typeof createArtifact>, filePath: string, url: string, bytesWritten = 0) {
  return {
    artifact,
    bytesWritten,
    downloadedAt: new Date().toISOString(),
    filePath,
    mirrorIndex: 0,
    resumed: false,
    sha256: "",
    sourceUrl: url,
    url,
  };
}
