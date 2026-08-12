import { randomUUID } from "node:crypto";

import { createDetachedSignature } from "#verify";
import type {
  CreateSecondaryInstructionInput,
  CreateUpdateInstructionInput,
  SecondaryUpdateInstruction,
  UpdateInstruction,
  UpdateSigningKeyInput,
} from "#kn5mninc2td8";

type SharedInstructionInput =
Pick<
CreateUpdateInstructionInput,
|"artifact"
|"expiresAt"
|"manifestSignature"
|"releaseVersion"
|"signer"
|"targetEntity"
>
& {
  downloadAuth?: CreateUpdateInstructionInput["downloadAuth"];
  instructionId?: string;
  issuedAt?: string;
  targetId?: string;
  targetInstanceId?: string;
};

type SignedInstructionFactory = typeof createInstructionFromInput;
type UnsignedInstruction =
|Omit<SecondaryUpdateInstruction, "signature">
|Omit<UpdateInstruction, "signature">;

const createUpdateInstruction = createInstructionFromInput as SignedInstructionFactory&(
  (input: CreateUpdateInstructionInput) => UpdateInstruction
);

const createSecondaryUpdateInstruction = createInstructionFromInput as SignedInstructionFactory&(
  (input: CreateSecondaryInstructionInput) => SecondaryUpdateInstruction
);

function createInstructionFromInput(input: CreateUpdateInstructionInput): UpdateInstruction;
function createInstructionFromInput(input: CreateSecondaryInstructionInput): SecondaryUpdateInstruction;
function createInstructionFromInput(input: SharedInstructionInput): SecondaryUpdateInstruction | UpdateInstruction {
  return signInstruction(
    createUnsignedInstruction(input),
    input.signer,
  ) as SecondaryUpdateInstruction | UpdateInstruction;
}

function createUnsignedInstruction(input: SharedInstructionInput): UnsignedInstruction {
  const shared = {
    artifact: input.artifact,
    downloadAuth: input.downloadAuth ?? null,
    expiresAt: input.expiresAt,
    instructionId: input.instructionId ?? randomUUID(),
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    manifestSignature: input.manifestSignature,
    releaseVersion: input.releaseVersion,
    targetEntity: input.targetEntity,
    version: 1 as const,
  };

  if (input.targetId === undefined) {
    return {
      ...shared,
      targetInstanceId: input.targetInstanceId!,
    };
  }

  return input.targetInstanceId === undefined
  ? {
    ...shared,
    targetId: input.targetId,
  }
  : {
    ...shared,
    targetId: input.targetId,
    targetInstanceId: input.targetInstanceId,
  };
}

function signInstruction<T extends UnsignedInstruction>(
  unsigned: T,
  signer: UpdateSigningKeyInput,
): T& { signature: ReturnType<typeof createDetachedSignature> } {
  return {
    ...unsigned,
    signature: createDetachedSignature(unsigned, signer),
  };
}

export {
  createSecondaryUpdateInstruction,
  createUpdateInstruction,
};
