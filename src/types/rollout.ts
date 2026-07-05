import type {
  UpdateArtifact,
  UpdateAuthConfig,
  UpdateFetch,
  UpdateManifest,
  UpdateManifestSource,
  UpdateNormalizationOptions,
  UpdateRuntimeTarget,
  UpdateSigningKeyInput,
  UpdateSubject,
  UpdateVerificationKeyInput,
} from "./core.js";

type UpdateInstructionCommon = {
  version: 1;
  instructionId: string;
  targetEntity: string;
  releaseVersion: string;
  artifact: UpdateArtifact;
  manifestSignature: import("./core.js").UpdateSignature;
  downloadAuth?: {
    type: "bearer";
    token: string;
  } | {
    type: "headers";
    headers: Record<string, string>;
  } | null;
  issuedAt: string;
  expiresAt: string;
  signature: import("./core.js").UpdateSignature;
};

export type UpdateInstruction = UpdateInstructionCommon & ({
  targetId: string;
  targetInstanceId?: string;
} | {
  targetId?: string;
  targetInstanceId: string;
});

export type SecondaryUpdateInstruction = UpdateInstructionCommon & {
  targetId?: string;
  targetInstanceId: string;
};

export type InstructionValidationInput = {
  expectedTargetEntity?: string;
  expectedTargetId?: string;
  expectedTargetInstanceId?: string;
  instruction: UpdateInstruction;
  now?: Date;
  verificationKeys: UpdateVerificationKeyInput[];
};

export type VerifiedInstruction = {
  instruction: UpdateInstruction;
  targetId: string;
  verifiedAt: string;
};

export type CreateUpdateInstructionInput = {
  artifact: UpdateArtifact;
  downloadAuth?: UpdateInstructionCommon["downloadAuth"];
  expiresAt: string;
  instructionId?: string;
  issuedAt?: string;
  manifestSignature: import("./core.js").UpdateSignature;
  releaseVersion: string;
  signer: UpdateSigningKeyInput;
  targetEntity: string;
  targetId: string;
  targetInstanceId?: string;
};

export type CreateSecondaryInstructionInput = {
  artifact: UpdateArtifact;
  downloadAuth?: {
    type: "bearer";
    token: string;
  } | null;
  expiresAt: string;
  instructionId?: string;
  issuedAt?: string;
  manifestSignature: import("./core.js").UpdateSignature;
  releaseVersion: string;
  signer: UpdateSigningKeyInput;
  targetEntity: string;
  targetInstanceId: string;
};

export type RolloutTarget = {
  targetId: string;
  subject: UpdateSubject;
};

export type TargetRolloutPlan = {
  artifact?: UpdateArtifact;
  reason?: string;
  status: "ready" | "no-update" | "blocked" | "selection-failed";
  targetId: string;
};

export type RolloutPlanSummary = {
  blocked: number;
  noUpdate: number;
  ready: number;
  selectionFailed: number;
  total: number;
};

export type RolloutPlan = {
  manifest: UpdateManifest;
  rolloutId: string;
  summary: RolloutPlanSummary;
  targets: TargetRolloutPlan[];
};

export type RolloutInstructionDelivery = {
  deliver(batch: {
    rolloutId: string;
    instructions: UpdateInstruction[];
  }): Promise<Array<{ instructionId: string; targetId: string; delivered: boolean; detail?: string }>>;
};

export type RolloutAcknowledgement = {
  at: string;
  detail?: string;
  instructionId: string;
  status: "acknowledged" | "rejected" | "expired";
  targetId: string;
};

export type RolloutAcknowledgementSource = {
  collect(input: {
    rolloutId: string;
    instructionIds: string[];
  }): Promise<RolloutAcknowledgement[]>;
};

export type RolloutApplyResult = {
  at: string;
  detail?: string;
  instructionId: string;
  status: "applied" | "failed" | "rolled-back" | "pending";
  targetId: string;
};

export type RolloutResultSource = {
  collect(input: {
    rolloutId: string;
    instructionIds: string[];
  }): Promise<RolloutApplyResult[]>;
};

export type BatchRolloutTargetResult = {
  acknowledgementStatus?: "acknowledged" | "rejected" | "expired" | "missing";
  applyStatus?: "applied" | "failed" | "rolled-back" | "pending";
  deliveryStatus?: "delivered" | "not-delivered";
  instructionId?: string;
  planningStatus: TargetRolloutPlan["status"];
  reason?: string;
  targetId: string;
};

export type BatchRolloutResult = {
  rolloutId: string;
  summary: {
    acknowledged: number;
    applied: number;
    blocked: number;
    delivered: number;
    failed: number;
    noUpdate: number;
    pending: number;
    ready: number;
    rolledBack: number;
    selectionFailed: number;
    total: number;
  };
  targets: BatchRolloutTargetResult[];
};

export type PlanRolloutInput = {
  allowDowngrade?: boolean;
  allowSameVersion?: boolean;
  auth?: UpdateAuthConfig | null;
  fetchImpl?: UpdateFetch;
  manifest?: UpdateManifest;
  manifestSources?: Array<string | UpdateManifestSource>;
  manifestUrl?: string;
  normalization?: UpdateNormalizationOptions;
  rolloutId?: string;
  targets: RolloutTarget[];
  verificationKeys: UpdateVerificationKeyInput[];
};

export type CreateRolloutInstructionsInput = {
  downloadAuth?: CreateUpdateInstructionInput["downloadAuth"];
  expiresAt?: string;
  instructionSigner: UpdateSigningKeyInput;
  manifest: UpdateManifest;
  plans: TargetRolloutPlan[];
  releaseVersion?: string;
  rolloutId?: string;
};

export type DeliverRolloutInstructionsInput = {
  delivery: RolloutInstructionDelivery;
  instructions: UpdateInstruction[];
  rolloutId: string;
};

export type CollectRolloutAcknowledgementsInput = {
  acknowledgements: RolloutAcknowledgementSource;
  instructions: UpdateInstruction[];
  rolloutId: string;
};

export type CollectRolloutResultsInput = {
  instructions: UpdateInstruction[];
  results: RolloutResultSource;
  rolloutId: string;
};

export type SummarizeRolloutInput = {
  acknowledgements?: RolloutAcknowledgement[];
  deliveries?: Array<{ instructionId: string; targetId: string; delivered: boolean; detail?: string }>;
  instructions?: UpdateInstruction[];
  plan: RolloutPlan;
  results?: RolloutApplyResult[];
};

export type PlanSecondaryUpdateInput = {
  allowDowngrade?: boolean;
  allowSameVersion?: boolean;
  auth?: UpdateAuthConfig | null;
  expiresAt?: string;
  fetchImpl?: UpdateFetch;
  instructionSigner?: UpdateSigningKeyInput;
  manifest?: UpdateManifest;
  manifestSources?: Array<string | UpdateManifestSource>;
  manifestUrl?: string;
  normalization?: UpdateNormalizationOptions;
  now?: () => Date;
  runtime: UpdateRuntimeTarget;
  targetEntity: string;
  targetInstanceId: string;
  verificationKeys: UpdateVerificationKeyInput[];
};

export type SecondaryUpdatePlan = {
  artifact: UpdateArtifact | null;
  instruction: SecondaryUpdateInstruction | null;
  manifest: UpdateManifest;
  reason?: string;
  shouldUpdate: boolean;
};
