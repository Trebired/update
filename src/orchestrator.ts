import { randomUUID } from "node:crypto";

import { selectArtifact, selectArtifactForSubject } from "#artifacts";
import { fetchManifestFromSources } from "#manifest";
import {
  createSecondaryUpdateInstruction,
  createUpdateInstruction,
} from "./orchestrator/instructions.js";
import { summarizeRollout } from "./orchestrator/rollout_summary.js";
import {
  evaluateUpdateCandidate,
  verifyInstructionSignature,
} from "#verify";
import type {
  CollectRolloutAcknowledgementsInput,
  CollectRolloutResultsInput,
  CreateRolloutInstructionsInput,
  DeliverRolloutInstructionsInput,
  InstructionValidationInput,
  PlanRolloutInput,
  PlanSecondaryUpdateInput,
  RolloutAcknowledgement,
  RolloutApplyResult,
  RolloutPlan,
  SecondaryUpdatePlan,
  TargetRolloutPlan,
  UpdateInstruction,
  VerifiedInstruction,
} from "./types";

export {
  createSecondaryUpdateInstruction,
  createUpdateInstruction,
  summarizeRollout,
};

export function verifyUpdateInstruction(
  input: InstructionValidationInput,
): VerifiedInstruction {
  verifyInstructionSignature(input.instruction, input.verificationKeys);

  if (
    new Date(input.instruction.expiresAt).getTime() <=
    (input.now ?? new Date()).getTime()
  ) {
    throw new Error(
      `Instruction ${input.instruction.instructionId} is expired.`,
    );
  }

  if (
    input.expectedTargetEntity &&
      input.instruction.targetEntity !== input.expectedTargetEntity
  ) {
    throw new Error(
      `Instruction target entity ${input.instruction.targetEntity} does not match expected ${input.expectedTargetEntity}.`,
    );
  }

  const targetId =
  input.instruction.targetId ?? input.instruction.targetInstanceId;
  if (!targetId) {
    throw new Error(
      `Instruction ${input.instruction.instructionId} is missing target identity.`,
    );
  }

  if (input.expectedTargetId && targetId !== input.expectedTargetId) {
    throw new Error(
      `Instruction target ${targetId} does not match expected ${input.expectedTargetId}.`,
    );
  }

  if (
    input.expectedTargetInstanceId &&
      targetId !== input.expectedTargetInstanceId
  ) {
    throw new Error(
      `Instruction target instance ${targetId} does not match expected ${input.expectedTargetInstanceId}.`,
    );
  }

  return {
    instruction: input.instruction.targetId
    ? input.instruction
    : {
      ...input.instruction,
      targetId,
    },
    targetId,
    verifiedAt: new Date().toISOString(),
  };
}

export function verifySecondaryUpdateInstruction(
  input: InstructionValidationInput,
): VerifiedInstruction {
  return verifyUpdateInstruction(input);
}

export async function planSecondaryUpdate(
  input: PlanSecondaryUpdateInput,
): Promise<SecondaryUpdatePlan> {
  const manifest = await resolvePlanningManifest(input);
  validateSecondaryManifest(input, manifest);

  const evaluation = evaluateUpdateCandidate({
      allowDowngrade: input.allowDowngrade,
      allowSameVersion: input.allowSameVersion,
      currentVersion: input.runtime.currentVersion,
      minimumSupportedVersion: manifest.minimumSupportedVersion,
      releaseVersion: manifest.releaseVersion,
  });

  if (evaluation.reason === "already-current" && !evaluation.shouldUpdate) {
    return {
      artifact: null,
      instruction: null,
      manifest,
      reason: evaluation.reason ?? "already-current",
      shouldUpdate: false,
    };
  }

  evaluation.assertAllowed();
  const artifact = selectArtifact(manifest, input.runtime);
  return createSecondaryPlan(input, manifest, artifact);
}

export async function planRollout(
  input: PlanRolloutInput,
): Promise<RolloutPlan> {
  const manifest = await resolvePlanningManifest(input);
  const targets = input.targets.map((target) =>
    planRolloutTarget(input, manifest, target),
  );

  return {
    manifest,
    rolloutId: input.rolloutId ?? randomUUID(),
    summary: summarizeRolloutTargets(targets),
    targets,
  };
}

export function createRolloutInstructions(
  input: CreateRolloutInstructionsInput,
): UpdateInstruction[] {
  return input.plans
  .filter((plan) => plan.status === "ready" && plan.artifact)
  .map((plan) =>
    createUpdateInstruction({
        artifact: plan.artifact!,
        downloadAuth: input.downloadAuth ?? null,
        expiresAt:
        input.expiresAt ?? new Date(Date.now() + 15 * 60_000).toISOString(),
        manifestSignature: input.manifest.signature,
        releaseVersion: input.releaseVersion ?? input.manifest.releaseVersion,
        signer: input.instructionSigner,
        targetEntity: plan.artifact!.entity,
        targetId: plan.targetId,
        targetInstanceId: plan.targetId,
    }),
  );
}

export async function deliverRolloutInstructions(
  input: DeliverRolloutInstructionsInput,
) {
  return input.delivery.deliver({
      instructions: input.instructions,
      rolloutId: input.rolloutId,
  });
}

export async function collectRolloutAcknowledgements(
  input: CollectRolloutAcknowledgementsInput,
): Promise<RolloutAcknowledgement[]> {
  return input.acknowledgements.collect({
      instructionIds: input.instructions.map(
        (instruction) => instruction.instructionId,
      ),
      rolloutId: input.rolloutId,
  });
}

export async function collectRolloutResults(
  input: CollectRolloutResultsInput,
): Promise<RolloutApplyResult[]> {
  return input.results.collect({
      instructionIds: input.instructions.map(
        (instruction) => instruction.instructionId,
      ),
      rolloutId: input.rolloutId,
  });
}

async function resolvePlanningManifest(
  input: Pick<
  PlanSecondaryUpdateInput | PlanRolloutInput,
  |"fetchImpl"
  |"manifest"
  |"manifestSources"
  |"manifestUrl"
  |"normalization"
  |"verificationKeys"
  >,
) {
  if (input.manifest) {
    return input.manifest;
  }

  const fetched = await fetchManifestFromSources({
      fetchImpl: input.fetchImpl,
      normalization: input.normalization,
      sources: input.manifestSources ?? [input.manifestUrl!],
      verificationKeys: input.verificationKeys,
  });

  return fetched.manifest;
}

function validateSecondaryManifest(
  input: PlanSecondaryUpdateInput,
  manifest: SecondaryUpdatePlan["manifest"],
) {
  if (manifest.entity !== input.runtime.entity) {
    throw new Error(
      `Manifest ${manifest.entity} does not match runtime ${input.runtime.entity}.`,
    );
  }

  if (
    input.runtime.channel &&
      manifest.channel &&
      manifest.channel !== input.runtime.channel
  ) {
    throw new Error(
      `Manifest channel ${manifest.channel} does not match runtime ${input.runtime.channel}.`,
    );
  }
}

function createSecondaryPlan(
  input: PlanSecondaryUpdateInput,
  manifest: SecondaryUpdatePlan["manifest"],
  artifact: NonNullable<SecondaryUpdatePlan["artifact"]>,
): SecondaryUpdatePlan {
  return {
    artifact,
    instruction: input.instructionSigner
    ? createSecondaryUpdateInstruction({
        artifact,
        expiresAt: resolveInstructionExpiry(input),
        manifestSignature: manifest.signature,
        releaseVersion: manifest.releaseVersion,
        signer: input.instructionSigner,
        targetEntity: input.targetEntity,
        targetInstanceId: input.targetInstanceId,
    })
    : null,
    manifest,
    shouldUpdate: true,
  };
}

function resolveInstructionExpiry(input: PlanSecondaryUpdateInput) {
  return (
    input.expiresAt ??
    new Date(
      (input.now?.() ?? new Date()).getTime() + 15 * 60_000,
    ).toISOString()
  );
}

function planRolloutTarget(
  input: PlanRolloutInput,
  manifest: RolloutPlan["manifest"],
  target: PlanRolloutInput["targets"][number],
): TargetRolloutPlan {
  if (target.subject.entity !== manifest.entity) {
    return {
      reason: `Manifest entity ${manifest.entity} does not match target entity ${target.subject.entity}.`,
      status: "blocked",
      targetId: target.targetId,
    };
  }

  try {
    const evaluation = evaluateUpdateCandidate({
        allowDowngrade: input.allowDowngrade,
        allowSameVersion: input.allowSameVersion,
        currentVersion: target.subject.currentVersion,
        minimumSupportedVersion: manifest.minimumSupportedVersion,
        releaseVersion: manifest.releaseVersion,
    });

    if (evaluation.reason === "already-current" && !evaluation.shouldUpdate) {
      return {
        reason: evaluation.reason ?? "already-current",
        status: "no-update",
        targetId: target.targetId,
      };
    }

    evaluation.assertAllowed();
    return {
      artifact: selectArtifactForSubject(manifest, target.subject),
      status: "ready",
      targetId: target.targetId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      reason: message,
      status: /matched entity|equally specific/u.test(message)
      ? "selection-failed"
      : "blocked",
      targetId: target.targetId,
    };
  }
}

function summarizeRolloutTargets(targets: TargetRolloutPlan[]) {
  return {
    blocked: targets.filter((target) => target.status === "blocked").length,
    noUpdate: targets.filter((target) => target.status === "no-update").length,
    ready: targets.filter((target) => target.status === "ready").length,
    selectionFailed: targets.filter(
      (target) => target.status === "selection-failed",
    ).length,
    total: targets.length,
  };
}
