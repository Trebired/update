import type { KeyObject } from "node:crypto";

export type UpdateRole = "primary" | "secondary";
export type UpdateInstallStrategy = "raw" | "archive" | "deb" | "rpm";
export type UpdateArchiveFormat = "tar.gz" | "zip";
export type UpdateStatusLevel = "debug" | "info" | "warn" | "error";
export type UpdateSignature = {
  type: "ed25519";
  value: string;
};
export type UpdateChecksum = {
  type: "sha256";
  value: string;
};

export type UpdateReleaseNotes = {
  title?: string;
  summary?: string;
  url?: string;
} | null;

export type UpdateArtifact = {
  id: string;
  entity: string;
  channel?: string | null;
  os: string;
  arch: string;
  installStrategy: UpdateInstallStrategy;
  archiveFormat?: UpdateArchiveFormat | null;
  binaryPath?: string | null;
  url: string;
  checksum: UpdateChecksum;
  size?: number | null;
  fileName?: string | null;
};

export type UpdateManifest = {
  version: 1;
  entity: string;
  channel: string;
  releaseVersion: string;
  recordedAt: string;
  minimumSupportedVersion?: string | null;
  notes?: UpdateReleaseNotes;
  artifacts: UpdateArtifact[];
  signature: UpdateSignature;
};

export type SecondaryUpdateInstruction = {
  version: 1;
  instructionId: string;
  targetEntity: string;
  targetInstanceId: string;
  releaseVersion: string;
  artifact: UpdateArtifact;
  manifestSignature: UpdateSignature;
  downloadAuth?: {
    type: "bearer";
    token: string;
  } | null;
  issuedAt: string;
  expiresAt: string;
  signature: UpdateSignature;
};

export type UpdateRuntimeTarget = {
  entity: string;
  channel: string;
  currentVersion: string;
  os: string;
  arch: string;
  installStrategy: UpdateInstallStrategy;
};

export type UpdateManifestFieldAliases = {
  manifest?: Partial<Record<"entity" | "channel" | "releaseVersion" | "recordedAt" | "minimumSupportedVersion" | "notes" | "artifacts" | "signature", string[]>>;
  artifact?: Partial<Record<"id" | "entity" | "channel" | "os" | "arch" | "installStrategy" | "archiveFormat" | "binaryPath" | "url" | "checksum" | "size" | "fileName", string[]>>;
};

export type UpdateNormalizationOptions = {
  allowFieldAliases?: boolean;
  fieldAliases?: UpdateManifestFieldAliases;
};

export type UpdateVerificationKeyInput =
  | string
  | Uint8Array
  | Buffer
  | KeyObject
  | {
    key: string | Uint8Array | Buffer | KeyObject;
    format?: "pem" | "raw" | "raw-base64" | "base64" | "base64url";
    keyId?: string;
  };

export type UpdateSigningKeyInput =
  | string
  | Uint8Array
  | Buffer
  | KeyObject
  | {
    key: string | Uint8Array | Buffer | KeyObject;
    format?: "pem" | "pkcs8-pem" | "pkcs8-der";
    keyId?: string;
  };

export type UpdateHeaderResolverContext = {
  artifactId?: string | null;
  purpose: "manifest" | "artifact";
  url: string;
};

export type UpdateAuthConfig =
  | {
    type: "bearer";
    token: string;
  }
  | {
    type: "headers";
    headers: Record<string, string>;
  }
  | {
    type: "callback";
    getHeaders: (context: UpdateHeaderResolverContext) => Promise<Record<string, string> | null | undefined> | Record<string, string> | null | undefined;
  };

export type UpdateStatusEvent = {
  code: string;
  level: UpdateStatusLevel;
  message: string;
  context?: Record<string, unknown>;
};

export type UpdateStatusHandler = (event: UpdateStatusEvent) => void | Promise<void>;
export type UpdateFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type UpdateActivationTarget = {
  livePath: string;
  fileMode?: number;
};

export type UpdateRestartHookContext = {
  artifact: UpdateArtifact;
  mode: "self" | "secondary";
  releaseVersion: string;
  targetPath: string;
};

export type UpdateRestartHook = (context: UpdateRestartHookContext) => void | Promise<void>;
export type UpdateVersionReader = () => string | Promise<string>;

export type UpdateClientConfig = UpdateRuntimeTarget & {
  manifestUrl: string;
  workingDirectory: string;
  verificationKeys: UpdateVerificationKeyInput[];
  auth?: UpdateAuthConfig | null;
  fetchImpl?: UpdateFetch;
  normalization?: UpdateNormalizationOptions;
  activationTarget?: UpdateActivationTarget;
  readInstalledVersion?: UpdateVersionReader;
  restartHook?: UpdateRestartHook;
  statusHandler?: UpdateStatusHandler;
  allowDowngrade?: boolean;
  allowSameVersion?: boolean;
  now?: () => Date;
};

export type FetchedManifest = {
  manifest: UpdateManifest;
  responseHeaders: Headers;
};

export type DownloadArtifactInput = {
  artifact: UpdateArtifact;
  auth?: UpdateAuthConfig | null;
  fetchImpl?: UpdateFetch;
  statusHandler?: UpdateStatusHandler;
  workingDirectory: string;
};

export type DownloadArtifactResult = {
  artifact: UpdateArtifact;
  bytesWritten: number;
  downloadedAt: string;
  filePath: string;
  sha256: string;
};

export type VerifyDownloadedArtifactInput = {
  artifact: UpdateArtifact;
  filePath: string;
};

export type VerifyDownloadedArtifactResult = {
  artifact: UpdateArtifact;
  bytesRead: number;
  filePath: string;
  sha256: string;
};

export type StageArtifactInput = {
  artifact: UpdateArtifact;
  download: DownloadArtifactResult | VerifyDownloadedArtifactResult;
  statusHandler?: UpdateStatusHandler;
  workingDirectory: string;
};

export type StageArtifactResult = {
  artifact: UpdateArtifact;
  extractedFiles: string[];
  stageDirectory: string;
  stagedBinaryPath: string;
};

export type ActivateStagedArtifactInput = {
  artifact: UpdateArtifact;
  releaseVersion: string;
  restartHook?: UpdateRestartHook;
  readInstalledVersion?: UpdateVersionReader;
  stage: StageArtifactResult;
  statusHandler?: UpdateStatusHandler;
  target: UpdateActivationTarget;
  workingDirectory: string;
};

export type ActivationRollbackState = {
  backupPath: string | null;
  releaseVersion: string;
  targetPath: string;
};

export type ActivateStagedArtifactResult = {
  activatedAt: string;
  artifact: UpdateArtifact;
  rollback: ActivationRollbackState;
  targetPath: string;
};

export type RollbackActivatedArtifactInput = {
  rollback: ActivationRollbackState;
  statusHandler?: UpdateStatusHandler;
};

export type InstructionValidationInput = {
  expectedTargetEntity?: string;
  expectedTargetInstanceId?: string;
  instruction: SecondaryUpdateInstruction;
  now?: Date;
  verificationKeys: UpdateVerificationKeyInput[];
};

export type VerifiedInstruction = {
  instruction: SecondaryUpdateInstruction;
  verifiedAt: string;
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
  manifestSignature: UpdateSignature;
  releaseVersion: string;
  signer: UpdateSigningKeyInput;
  targetEntity: string;
  targetInstanceId: string;
};

export type PlanSelfUpdateInput = UpdateClientConfig & {
  manifest?: UpdateManifest;
};

export type SelfUpdatePlan = {
  artifact: UpdateArtifact | null;
  manifest: UpdateManifest;
  reason?: string;
  shouldUpdate: boolean;
};

export type PlanSecondaryUpdateInput = {
  auth?: UpdateAuthConfig | null;
  fetchImpl?: UpdateFetch;
  instructionSigner?: UpdateSigningKeyInput;
  manifest?: UpdateManifest;
  manifestUrl?: string;
  normalization?: UpdateNormalizationOptions;
  runtime: UpdateRuntimeTarget;
  targetEntity: string;
  targetInstanceId: string;
  verificationKeys: UpdateVerificationKeyInput[];
  now?: () => Date;
  expiresAt?: string;
};

export type SecondaryUpdatePlan = {
  artifact: UpdateArtifact | null;
  instruction: SecondaryUpdateInstruction | null;
  manifest: UpdateManifest;
  reason?: string;
  shouldUpdate: boolean;
};

export type ApplySelfUpdateInput = PlanSelfUpdateInput;

export type ApplySelfUpdateResult = {
  activation: ActivateStagedArtifactResult;
  download: DownloadArtifactResult;
  plan: SelfUpdatePlan;
  stage: StageArtifactResult;
  verification: VerifyDownloadedArtifactResult;
};

export type ApplySecondaryUpdateInput = {
  instruction: SecondaryUpdateInstruction;
  mode?: "secondary";
  now?: Date;
  readInstalledVersion?: UpdateVersionReader;
  restartHook?: UpdateRestartHook;
  statusHandler?: UpdateStatusHandler;
  target: UpdateActivationTarget;
  targetEntity: string;
  targetInstanceId: string;
  verificationKeys: UpdateVerificationKeyInput[];
  workingDirectory: string;
  fetchImpl?: UpdateFetch;
};

export type ApplySecondaryUpdateResult = {
  activation: ActivateStagedArtifactResult;
  download: DownloadArtifactResult;
  instruction: SecondaryUpdateInstruction;
  stage: StageArtifactResult;
  verification: VerifyDownloadedArtifactResult;
};

export type UpdateClient = {
  applySelfUpdate: (input?: Partial<PlanSelfUpdateInput>) => Promise<ApplySelfUpdateResult>;
  applySecondaryUpdate: (input: Omit<ApplySecondaryUpdateInput, "mode">) => Promise<ApplySecondaryUpdateResult>;
  fetchManifest: () => Promise<FetchedManifest>;
  planSecondaryUpdate: (input: Omit<PlanSecondaryUpdateInput, "runtime" | "verificationKeys"> & {
    runtime?: UpdateRuntimeTarget;
    verificationKeys?: UpdateVerificationKeyInput[];
  }) => Promise<SecondaryUpdatePlan>;
  planSelfUpdate: (input?: Partial<PlanSelfUpdateInput>) => Promise<SelfUpdatePlan>;
};
