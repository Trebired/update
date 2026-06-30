import { randomUUID } from "node:crypto";

import { fetchManifest } from "#manifest";
import { selectArtifact } from "#artifacts";
import { resolveAuthHeaders } from "#download";
import { createDetachedSignature, validateVersionTransition, verifyInstructionSignature } from "#verify";
import type {
  CreateSecondaryInstructionInput,
  InstructionValidationInput,
  PlanSecondaryUpdateInput,
  SecondaryUpdateInstruction,
  SecondaryUpdatePlan,
  VerifiedInstruction,
} from "#types";

export function createSecondaryUpdateInstruction(input: CreateSecondaryInstructionInput): SecondaryUpdateInstruction {
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const unsigned = {
    version: 1 as const,
    instructionId: input.instructionId ?? randomUUID(),
    targetEntity: input.targetEntity,
    targetInstanceId: input.targetInstanceId,
    releaseVersion: input.releaseVersion,
    artifact: input.artifact,
    manifestSignature: input.manifestSignature,
    downloadAuth: input.downloadAuth ?? null,
    issuedAt,
    expiresAt: input.expiresAt,
  };

  return {
    ...unsigned,
    signature: createDetachedSignature(unsigned, input.signer),
  };
}

export function verifySecondaryUpdateInstruction(input: InstructionValidationInput): VerifiedInstruction {
  verifyInstructionSignature(input.instruction, input.verificationKeys);

  if (new Date(input.instruction.expiresAt).getTime() <= (input.now ?? new Date()).getTime()) {
    throw new Error(`Instruction ${input.instruction.instructionId} is expired.`);
  }

  if (input.expectedTargetEntity && input.instruction.targetEntity !== input.expectedTargetEntity) {
    throw new Error(`Instruction target entity ${input.instruction.targetEntity} does not match expected ${input.expectedTargetEntity}.`);
  }

  if (input.expectedTargetInstanceId && input.instruction.targetInstanceId !== input.expectedTargetInstanceId) {
    throw new Error(`Instruction target instance ${input.instruction.targetInstanceId} does not match expected ${input.expectedTargetInstanceId}.`);
  }

  return {
    instruction: input.instruction,
    verifiedAt: new Date().toISOString(),
  };
}

export async function planSecondaryUpdate(input: PlanSecondaryUpdateInput): Promise<SecondaryUpdatePlan> {
  const manifest = input.manifest ?? (await fetchManifest({
    authHeader: await resolveAuthHeaders(input.auth, {
      purpose: "manifest",
      url: input.manifestUrl!,
    }),
    fetchImpl: input.fetchImpl,
    manifestUrl: input.manifestUrl!,
    normalization: input.normalization,
    verificationKeys: input.verificationKeys,
  })).manifest;

  if (manifest.entity !== input.runtime.entity || manifest.channel !== input.runtime.channel) {
    throw new Error(`Manifest ${manifest.entity}/${manifest.channel} does not match runtime ${input.runtime.entity}/${input.runtime.channel}.`);
  }

  if (input.runtime.currentVersion === manifest.releaseVersion) {
    return {
      artifact: null,
      instruction: null,
      manifest,
      reason: "already-current",
      shouldUpdate: false,
    };
  }

  validateVersionTransition({
    currentVersion: input.runtime.currentVersion,
    minimumSupportedVersion: manifest.minimumSupportedVersion,
    releaseVersion: manifest.releaseVersion,
  });

  const artifact = selectArtifact(manifest, input.runtime);

  return {
    artifact,
    instruction: input.instructionSigner
      ? createSecondaryUpdateInstruction({
        artifact,
        expiresAt: input.expiresAt ?? new Date((input.now?.() ?? new Date()).getTime() + 15 * 60_000).toISOString(),
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
