import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";

import {
  applyUpdate,
  checkForUpdate,
  createRolloutInstructions,
  downloadArtifact,
  fetchManifestFromSources,
  planRollout,
  summarizeRollout,
} from "#index";
import type {
  UpdateJournalEntry,
  UpdateJournalStore,
  UpdateLifecycleEvent,
  UpdatePackageInstaller,
  UpdateStateSnapshot,
  UpdateStateStore,
} from "#types";
import {
  createArtifact,
  createSignedManifest,
  createSigningPair,
  createTempDir,
} from "#test-helpers";

describe("runtime flows", () => {
  test("falls back across manifest sources", async () => {
    const { privateKey, publicKey } = createSigningPair();
    const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();
    const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const manifest = createSignedManifest({
      artifact: createArtifact({
        checksum: {
          type: "sha256",
          value: "abc123",
        },
      }),
      privateKeyPem: privatePem,
    });

    const result = await fetchManifestFromSources({
      fetchImpl: async (input) => {
        const url = String(input);
        return url.endsWith("primary.json")
          ? new Response("missing", { status: 500 })
          : new Response(JSON.stringify(manifest), { status: 200 });
      },
      sources: [
        "https://updates.example.test/primary.json",
        "https://updates.example.test/fallback.json",
      ],
      verificationKeys: [publicPem],
    });

    expect(result.sourceIndex).toBe(1);
    expect(result.sourceUrl).toContain("fallback.json");
  });

  test("persists check state and lifecycle events", async () => {
    const { privateKey, publicKey } = createSigningPair();
    const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();
    const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const manifest = createSignedManifest({
      artifact: createArtifact({
        checksum: {
          type: "sha256",
          value: "abc123",
        },
        entity: "primary",
      }),
      entity: "primary",
      privateKeyPem: privatePem,
    });
    const state = createMemoryStateStore();
    const journal = createMemoryJournalStore();
    const events: UpdateLifecycleEvent[] = [];

    const result = await checkForUpdate({
      arch: process.arch,
      currentVersion: "1.0.0",
      entity: "primary",
      fetchImpl: async () => new Response(JSON.stringify(manifest), { status: 200 }),
      installStrategy: "raw",
      lifecycleHandler: async (event) => {
        events.push(event);
      },
      manifestUrl: "https://updates.example.test/manifest.json",
      os: process.platform,
      stateStore: state,
      journalStore: journal,
      verificationKeys: [publicPem],
      workingDirectory: await createTempDir("update-check"),
    });

    expect(result.shouldUpdate).toBe(true);
    expect((await state.load(result.operationId))?.phase).toBe("update-selected");
    expect((await journal.list(result.operationId)).map((entry) => entry.type)).toEqual([
      "check.started",
      "manifest.fetched",
      "update.available",
    ]);
    expect(events.map((event) => event.type)).toEqual([
      "check.started",
      "manifest.fetched",
      "update.available",
    ]);
  });

  test("falls back to artifact mirrors", async () => {
    const workingDirectory = await createTempDir("update-download-mirror");
    const artifactBytes = Buffer.from("release-2.0.0");
    const artifact = createArtifact({
      checksum: {
        type: "sha256",
        value: createHash("sha256").update(artifactBytes).digest("hex"),
      },
      mirrors: ["https://updates.example.test/mirror.bin"],
      url: "https://updates.example.test/main.bin",
    });

    const result = await downloadArtifact({
      artifact,
      fetchImpl: async (input) => {
        const url = String(input);
        return url.endsWith("main.bin")
          ? new Response("missing", { status: 500 })
          : new Response(artifactBytes, { status: 200 });
      },
      workingDirectory,
    });

    expect(result.sourceUrl).toContain("mirror.bin");
    expect(result.mirrorIndex).toBe(1);
  });

  test("resumes artifact downloads from a checkpoint", async () => {
    const workingDirectory = await createTempDir("update-download-resume");
    const bytes = Buffer.from("release-2.0.0");
    const partial = bytes.subarray(0, 5);
    const remaining = bytes.subarray(5);
    const filePath = path.join(workingDirectory, "partial.bin");
    await fs.writeFile(filePath, partial);

    const result = await downloadArtifact({
      artifact: createArtifact({
        checksum: {
          type: "sha256",
          value: createHash("sha256").update(bytes).digest("hex"),
        },
        url: "https://updates.example.test/resume.bin",
      }),
      fetchImpl: async (_input, init) => {
        expect((init?.headers as Record<string, string>).range).toBe("bytes=5-");
        return new Response(remaining, {
          headers: {
            etag: "resume-etag",
          },
          status: 206,
        });
      },
      resumeFrom: {
        bytesWritten: partial.length,
        filePath,
        mirrorIndex: 0,
        url: "https://updates.example.test/resume.bin",
      },
      workingDirectory,
    });

    expect(result.resumed).toBe(true);
    expect(await fs.readFile(filePath, "utf8")).toBe("release-2.0.0");
  });

  test("applies package updates with deferred restart handling", async () => {
    const { privateKey, publicKey } = createSigningPair();
    const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();
    const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const workingDirectory = await createTempDir("update-package-apply");
    const artifactBytes = Buffer.from("fake-deb-package");
    const artifact = createArtifact({
      checksum: {
        type: "sha256",
        value: createHash("sha256").update(artifactBytes).digest("hex"),
      },
      entity: "primary",
      fileName: "primary.deb",
      installStrategy: "deb",
      size: artifactBytes.length,
      url: "https://updates.example.test/primary.deb",
    });
    const manifest = createSignedManifest({
      artifact,
      entity: "primary",
      privateKeyPem: privatePem,
    });
    const lifecycle: string[] = [];
    const packageInstaller: UpdatePackageInstaller = {
      async install() {
        return {
          installedAt: new Date().toISOString(),
          restartRequired: true,
        };
      },
    };

    const result = await applyUpdate({
      arch: process.arch,
      currentVersion: "1.0.0",
      entity: "primary",
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("manifest.json")) {
          return new Response(JSON.stringify(manifest), { status: 200 });
        }
        return new Response(artifactBytes, { status: 200 });
      },
      installStrategy: "deb",
      lifecycleHandler: async (event) => {
        lifecycle.push(event.type);
      },
      manifestUrl: "https://updates.example.test/manifest.json",
      os: process.platform,
      packageInstaller,
      restartController: {
        request: () => "defer",
      },
      verificationKeys: [publicPem],
      workingDirectory,
    });

    expect(result.installation?.restartRequired).toBe(true);
    expect(result.restartPending).toBe(true);
    expect(lifecycle).toContain("restart.required");
    expect(result.snapshot.restartPending).toBe(true);
  });

  test("plans and summarizes batch rollout results", async () => {
    const { privateKey } = createSigningPair();
    const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const manifest = createSignedManifest({
      artifact: createArtifact({
        checksum: {
          type: "sha256",
          value: "abc123",
        },
      }),
      privateKeyPem: privatePem,
      releaseVersion: "2.0.0",
    });

    const plan = await planRollout({
      manifest,
      targets: [
        {
          subject: {
            arch: process.arch,
            currentVersion: "1.0.0",
            entity: "secondary",
            installStrategy: "raw",
            os: process.platform,
          },
          targetId: "worker-1",
        },
        {
          subject: {
            arch: process.arch,
            currentVersion: "2.0.0",
            entity: "secondary",
            installStrategy: "raw",
            os: process.platform,
          },
          targetId: "worker-2",
        },
      ],
      verificationKeys: [],
    });
    const instructions = createRolloutInstructions({
      instructionSigner: privatePem,
      manifest,
      plans: plan.targets,
    });
    const summary = summarizeRollout({
      acknowledgements: [{
        at: new Date().toISOString(),
        instructionId: instructions[0].instructionId,
        status: "acknowledged",
        targetId: "worker-1",
      }],
      deliveries: [{
        delivered: true,
        instructionId: instructions[0].instructionId,
        targetId: "worker-1",
      }],
      instructions,
      plan,
      results: [{
        at: new Date().toISOString(),
        instructionId: instructions[0].instructionId,
        status: "applied",
        targetId: "worker-1",
      }],
    });

    expect(plan.summary.ready).toBe(1);
    expect(plan.summary.noUpdate).toBe(1);
    expect(summary.summary.applied).toBe(1);
    expect(summary.targets.find((target) => target.targetId === "worker-2")?.planningStatus).toBe("no-update");
  });
});

function createMemoryStateStore(): UpdateStateStore {
  const store = new Map<string, UpdateStateSnapshot>();
  return {
    async load(operationId) {
      return store.get(operationId) ?? null;
    },
    async remove(operationId) {
      store.delete(operationId);
    },
    async save(snapshot) {
      store.set(snapshot.operationId, snapshot);
    },
  };
}

function createMemoryJournalStore(): UpdateJournalStore {
  const store = new Map<string, UpdateJournalEntry[]>();
  return {
    async append(entry) {
      store.set(entry.operationId, [...(store.get(entry.operationId) ?? []), entry]);
    },
    async list(operationId) {
      return store.get(operationId) ?? [];
    },
  };
}
