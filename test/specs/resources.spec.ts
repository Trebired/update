import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";

import {
  installResourceBundle,
  normalizeResourceManifest,
  readInstalledResourceMeta,
  selectResourceEntry,
} from "#index";
import { createTempDir, createZipArchive, readText } from "#test-helpers";

describe("resource manifests and bundles", () => {
  registerResourceSelectionTest();
  registerResourceChecksumTest();
  registerResourceTraversalTest();
  registerResourceInstallTest();
});

function registerResourceSelectionTest() {
  test("normalizes and selects resource entries", () => {
    const manifest = normalizeResourceManifest({
      entries: [{
        combination: {
          entityA: "1.0.0",
          entityB: "2.0.0",
        },
        resource: "resource-a",
        version: "4.0.0",
        fileName: "resource-a.zip",
        url: "resource:resource-a.zip",
        checksum: {
          type: "sha256",
          value: "abc",
        },
      }],
    });

    expect(selectResourceEntry(manifest, {
      combination: {
        entityB: "2.0.0",
        entityA: "1.0.0",
      },
      resource: "resource-a",
    }).version).toBe("4.0.0");
  });
}

function registerResourceChecksumTest() {
  test("fails hard on checksum mismatch", async () => {
    const workingDirectory = await createTempDir("update-resource-checksum");
    const archive = createZipArchive({
      "bundle/file.txt": "new",
    });

    await expect(installResourceBundle({
      url: "resource:bundle.zip",
      checksum: {
        type: "sha256",
        value: "not-the-checksum",
      },
      fetchImpl: createFetch(archive),
      key: "entityA=1.0.0",
      version: "1.0.0",
      targetDirectory: path.join(workingDirectory, "target"),
      workingDirectory,
    })).rejects.toThrow(/sha-256 mismatch/i);
  });
}

function registerResourceTraversalTest() {
  test("rejects traversal entries during extraction", async () => {
    const workingDirectory = await createTempDir("update-resource-traversal");
    const archive = createZipArchive({
      "../escape.txt": "bad",
    });

    await expect(installResourceBundle({
      url: "resource:bundle.zip",
      checksum: checksum(archive),
      fetchImpl: createFetch(archive),
      key: "entityA=1.0.0",
      version: "1.0.0",
      targetDirectory: path.join(workingDirectory, "target"),
      workingDirectory,
    })).rejects.toThrow(/not allowed/i);
  });
}

function registerResourceInstallTest() {
  test("replaces existing contents and round-trips installed meta", async () => {
    const workingDirectory = await createTempDir("update-resource-install");
    const targetDirectory = path.join(workingDirectory, "target");
    await fs.mkdir(targetDirectory, { recursive: true });
    await fs.writeFile(path.join(targetDirectory, "old.txt"), "old");
    const archive = createZipArchive({
      "new.txt": "new",
    });

    const result = await installResourceBundle({
      url: "resource:bundle.zip",
      checksum: checksum(archive),
      fetchImpl: createFetch(archive),
      key: "entityA=1.0.0",
      version: "3.0.0",
      targetDirectory,
      workingDirectory,
      meta: {
        resource: "resource-a",
      },
    });

    expect(await readText(path.join(targetDirectory, "new.txt"))).toBe("new");
    await expect(fs.access(path.join(targetDirectory, "old.txt"))).rejects.toThrow();
    expect((await readInstalledResourceMeta(targetDirectory))?.version).toBe("3.0.0");
    expect(result.meta.resource).toBe("resource-a");
  });
}

function createFetch(body: Buffer) {
  return async () => new Response(new Uint8Array(body), {
    status: 200,
  });
}

function checksum(body: Buffer) {
  return {
    type: "sha256" as const,
    value: createHash("sha256").update(body).digest("hex"),
  };
}
