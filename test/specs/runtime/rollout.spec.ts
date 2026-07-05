import { describe, expect, test } from "bun:test";

import {
  createRolloutInstructions,
  planRollout,
  summarizeRollout,
} from "#index";
import { createArtifact, createSignedManifest, createSigningPair } from "#test-helpers";

describe("runtime rollout flows", () => {
  registerRolloutSummaryTest();
});

function registerRolloutSummaryTest() {
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
      targets: createRolloutTargets(),
      verificationKeys: [],
    });
    const instructions = createRolloutInstructions({
      instructionSigner: privatePem,
      manifest,
      plans: plan.targets,
    });
    const summary = createRolloutSummary(plan, instructions);

    expect(plan.summary.ready).toBe(1);
    expect(plan.summary.noUpdate).toBe(1);
    expect(summary.summary.applied).toBe(1);
    expect(summary.targets.find((target) => target.targetId === "worker-2")?.planningStatus).toBe("no-update");
  });
}

function createRolloutSummary(
  plan: Awaited<ReturnType<typeof planRollout>>,
  instructions: ReturnType<typeof createRolloutInstructions>,
) {
  return summarizeRollout({
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
}

function createRolloutTargets() {
  return [
    {
      subject: {
        arch: process.arch,
        currentVersion: "1.0.0",
        entity: "secondary",
        installStrategy: "raw" as const,
        os: process.platform,
      },
      targetId: "worker-1",
    },
    {
      subject: {
        arch: process.arch,
        currentVersion: "2.0.0",
        entity: "secondary",
        installStrategy: "raw" as const,
        os: process.platform,
      },
      targetId: "worker-2",
    },
  ];
}
