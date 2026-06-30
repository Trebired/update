import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";

import {
  selectArtifact,
  validateVersionTransition,
  verifyDownloadedArtifact,
} from "#index";
import { createArtifact, createTempDir } from "#test-helpers";

describe("artifacts and verification", () => {
  test("selects the most specific matching artifact", () => {
    const selected = selectArtifact({
      version: 1,
      entity: "secondary",
      channel: "stable",
      releaseVersion: "2.0.0",
      recordedAt: "2026-06-30T12:00:00.000Z",
      artifacts: [
        createArtifact({
          channel: null,
          checksum: { type: "sha256", value: "x" },
        }),
        createArtifact({
          id: "preferred",
          checksum: { type: "sha256", value: "y" },
          fileName: "preferred.bin",
        }),
      ],
      signature: {
        type: "ed25519",
        value: "sig",
      },
    }, {
      entity: "secondary",
      channel: "stable",
      currentVersion: "1.0.0",
      os: process.platform,
      arch: process.arch,
      installStrategy: "raw",
    });

    expect(selected.id).toBe("preferred");
  });

  test("verifies sha256 checksums", async () => {
    const workingDirectory = await createTempDir("update-verify");
    const filePath = path.join(workingDirectory, "artifact.bin");
    const content = Buffer.from("release-2.0.0");
    await fs.writeFile(filePath, content);

    const sha256 = createHash("sha256").update(content).digest("hex");
    const result = await verifyDownloadedArtifact({
      artifact: createArtifact({
        checksum: {
          type: "sha256",
          value: sha256,
        },
        size: content.length,
      }),
      filePath,
    });

    expect(result.sha256).toBe(sha256);
    expect(result.bytesRead).toBe(content.length);
  });

  test("rejects versions below the minimum supported floor", () => {
    expect(() => validateVersionTransition({
      currentVersion: "1.0.0",
      minimumSupportedVersion: "1.5.0",
      releaseVersion: "2.0.0",
    })).toThrow(/minimum supported/i);
  });
});
