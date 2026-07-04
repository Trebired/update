import type { KeyObject } from "node:crypto";

export type UpdateRole = "primary" | "secondary";
export type UpdateInstallStrategy = "raw" | "archive" | "deb" | "rpm";
export type UpdateArchiveFormat = "tar.gz" | "zip";
export type UpdateStatusLevel = "debug" | "info" | "warn" | "error";
export type UpdateOperationMode = "self" | "secondary";
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
  mirrors?: string[];
  checksum: UpdateChecksum;
  size?: number | null;
  fileName?: string | null;
};

export type UpdateManifest = {
  version: 1;
  entity: string;
  channel?: string | null;
  releaseVersion: string;
  recordedAt: string;
  minimumSupportedVersion?: string | null;
  notes?: UpdateReleaseNotes;
  artifacts: UpdateArtifact[];
  signature: UpdateSignature;
};

type UpdateInstructionCommon = {
  version: 1;
  instructionId: string;
  targetEntity: string;
  releaseVersion: string;
  artifact: UpdateArtifact;
  manifestSignature: UpdateSignature;
  downloadAuth?: {
    type: "bearer";
    token: string;
  } | {
    type: "headers";
    headers: Record<string, string>;
  } | null;
  issuedAt: string;
  expiresAt: string;
  signature: UpdateSignature;
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

export type UpdateSubject = {
  entity: string;
  currentVersion: string;
  os: string;
  arch: string;
  installStrategy: UpdateInstallStrategy;
};

export type UpdateRuntimeTarget = UpdateSubject & {
  channel?: string | null;
};

export type UpdateManifestFieldAliases = {
  manifest?: Partial<Record<"entity" | "channel" | "releaseVersion" | "recordedAt" | "minimumSupportedVersion" | "notes" | "artifacts" | "signature", string[]>>;
  artifact?: Partial<Record<"id" | "entity" | "channel" | "os" | "arch" | "installStrategy" | "archiveFormat" | "binaryPath" | "url" | "mirrors" | "checksum" | "size" | "fileName", string[]>>;
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

export type UpdateManifestSource = {
  url: string;
  auth?: UpdateAuthConfig | null;
};

export type UpdateDownloadSource = {
  url: string;
  auth?: UpdateAuthConfig | null;
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
  mode: UpdateOperationMode;
  releaseVersion: string;
  targetPath: string;
};

export type UpdateRestartHook = (context: UpdateRestartHookContext) => void | Promise<void>;
export type UpdateVersionReader = () => string | Promise<string>;

export type UpdateLifecycleEvent =
  | { type: "check.started"; operationId: string; subject: UpdateSubject }
  | { type: "manifest.fetched"; operationId: string; manifest: UpdateManifest; sourceUrl: string }
  | { type: "update.available"; operationId: string; manifest: UpdateManifest; artifact: UpdateArtifact }
  | { type: "no.update"; operationId: string; manifest: UpdateManifest; reason: string }
  | { type: "apply.started"; operationId: string; artifact: UpdateArtifact; releaseVersion: string }
  | { type: "stage.started" | "stage.succeeded" | "stage.failed"; operationId: string; artifact: UpdateArtifact; error?: Error }
  | { type: "activate.started" | "activate.succeeded" | "activate.failed"; operationId: string; artifact: UpdateArtifact; error?: Error }
  | { type: "rollback.started" | "rollback.succeeded" | "rollback.failed"; operationId: string; rollback?: ActivationRollbackState; error?: Error }
  | { type: "cleanup.started" | "cleanup.succeeded" | "cleanup.failed"; operationId: string; artifact?: UpdateArtifact; error?: Error }
  | { type: "restart.required"; operationId: string; artifact: UpdateArtifact; releaseVersion: string }
  | { type: "apply.succeeded" | "apply.failed"; operationId: string; artifact: UpdateArtifact; error?: Error };

export type UpdateLifecycleHandler = (event: UpdateLifecycleEvent) => void | Promise<void>;

export type UpdateDownloadCheckpoint = {
  url: string;
  mirrorIndex: number;
  filePath: string;
  bytesWritten: number;
  etag?: string | null;
  lastModified?: string | null;
};

export type UpdateStateSnapshot = {
  version: 1;
  operationId: string;
  flow: "check" | "apply" | "rollout";
  phase:
    | "planned"
    | "manifest-fetched"
    | "update-selected"
    | "downloaded"
    | "verified"
    | "staged"
    | "installed"
    | "activated"
    | "rollback-complete"
    | "cleanup-complete"
    | "failed";
  subject?: UpdateSubject;
  manifest?: UpdateManifest;
  artifact?: UpdateArtifact | null;
  releaseVersion?: string;
  download?: UpdateDownloadCheckpoint;
  rollback?: ActivationRollbackState | null;
  restartPending?: boolean;
  error?: { message: string; code?: string };
  updatedAt: string;
};

export type UpdateStateStore = {
  load(operationId: string): Promise<UpdateStateSnapshot | null>;
  save(snapshot: UpdateStateSnapshot): Promise<void>;
  remove(operationId: string): Promise<void>;
};

export type UpdateJournalEntry = UpdateLifecycleEvent & {
  at: string;
};

export type UpdateJournalStore = {
  append(entry: UpdateJournalEntry): Promise<void>;
  list(operationId: string): Promise<UpdateJournalEntry[]>;
};

export type UpdateLockStore = {
  acquire(key: string): Promise<{ release(): Promise<void> }>;
};

export type UpdateRestartDecision = "restart-now" | "defer";

export type UpdateRestartController = {
  request(context: {
    operationId: string;
    artifact: UpdateArtifact;
    releaseVersion: string;
    targetPath?: string;
  }): Promise<UpdateRestartDecision> | UpdateRestartDecision;
  perform?(context: {
    operationId: string;
    artifact: UpdateArtifact;
    releaseVersion: string;
    targetPath?: string;
  }): Promise<void> | void;
};

export type UpdatePackageInstallResult = {
  installedAt: string;
  restartRequired?: boolean;
  details?: Record<string, unknown>;
};

export type UpdatePackageInstaller = {
  install(input: {
    artifact: UpdateArtifact;
    filePath: string;
    workingDirectory: string;
    lifecycle?: UpdateLifecycleHandler;
  }): Promise<UpdatePackageInstallResult>;
};

export type UpdateClientConfig = UpdateRuntimeTarget & {
  manifestUrl: string;
  manifestSources?: Array<string | UpdateManifestSource>;
  workingDirectory: string;
  verificationKeys: UpdateVerificationKeyInput[];
  auth?: UpdateAuthConfig | null;
  fetchImpl?: UpdateFetch;
  normalization?: UpdateNormalizationOptions;
  activationTarget?: UpdateActivationTarget;
  readInstalledVersion?: UpdateVersionReader;
  restartHook?: UpdateRestartHook;
  restartController?: UpdateRestartController;
  statusHandler?: UpdateStatusHandler;
  lifecycleHandler?: UpdateLifecycleHandler;
  stateStore?: UpdateStateStore;
  journalStore?: UpdateJournalStore;
  lockStore?: UpdateLockStore;
  packageInstaller?: UpdatePackageInstaller;
  allowDowngrade?: boolean;
  allowSameVersion?: boolean;
  now?: () => Date;
};

export type FetchedManifest = {
  manifest: UpdateManifest;
  responseHeaders: Headers;
};

export type FetchedManifestSource = FetchedManifest & {
  sourceIndex: number;
  sourceUrl: string;
};

export type FetchManifestFromSourcesInput = {
  fetchImpl?: UpdateFetch;
  normalization?: UpdateNormalizationOptions;
  verificationKeys?: UpdateVerificationKeyInput[];
  sources: Array<string | UpdateManifestSource>;
};

export type DownloadArtifactInput = {
  artifact: UpdateArtifact;
  auth?: UpdateAuthConfig | null;
  fetchImpl?: UpdateFetch;
  lifecycleHandler?: UpdateLifecycleHandler;
  mirrors?: string[];
  resumeFrom?: UpdateDownloadCheckpoint | null;
  statusHandler?: UpdateStatusHandler;
  workingDirectory: string;
};

export type DownloadArtifactResult = UpdateDownloadCheckpoint & {
  artifact: UpdateArtifact;
  downloadedAt: string;
  sha256: string;
  sourceUrl: string;
  resumed: boolean;
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

export type SelectArtifactOptions = {
  channel?: string | null;
  legacyChannelMatch?: boolean;
};

export type EvaluateUpdateCandidateInput = {
  allowDowngrade?: boolean;
  allowSameVersion?: boolean;
  currentVersion: string;
  minimumSupportedVersion?: string | null;
  releaseVersion: string;
};

export type EvaluateUpdateCandidateResult = {
  comparison: number;
  currentVersion: string;
  minimumSupportedVersion?: string | null;
  reason?: "already-current" | "downgrade-disallowed";
  releaseVersion: string;
  shouldUpdate: boolean;
  assertAllowed(): void;
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
  downloadAuth?: {
    type: "bearer";
    token: string;
  } | {
    type: "headers";
    headers: Record<string, string>;
  } | null;
  expiresAt: string;
  instructionId?: string;
  issuedAt?: string;
  manifestSignature: UpdateSignature;
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
  manifestSignature: UpdateSignature;
  releaseVersion: string;
  signer: UpdateSigningKeyInput;
  targetEntity: string;
  targetInstanceId: string;
};

export type UpdateCheckInput = UpdateClientConfig & {
  lockKey?: string;
  manifest?: UpdateManifest;
  operationId?: string;
  subject?: UpdateSubject;
};

export type UpdateCheckResult = {
  artifact: UpdateArtifact | null;
  manifest: UpdateManifest;
  operationId: string;
  reason?: string;
  shouldUpdate: boolean;
  snapshot: UpdateStateSnapshot;
  sourceIndex: number;
  sourceUrl: string;
  subject: UpdateSubject;
};

export type PrepareUpdateInput = UpdateClientConfig & {
  artifact?: UpdateArtifact;
  check?: UpdateCheckResult;
  lockKey?: string;
  manifest?: UpdateManifest;
  operationId?: string;
  releaseVersion?: string;
  resumeFrom?: UpdateDownloadCheckpoint | null;
  subject?: UpdateSubject;
};

export type PreparedUpdate = {
  artifact: UpdateArtifact;
  check: UpdateCheckResult;
  download: DownloadArtifactResult;
  kind: "package" | "staged";
  manifest: UpdateManifest;
  operationId: string;
  packageFilePath?: string;
  releaseVersion: string;
  snapshot: UpdateStateSnapshot;
  stage?: StageArtifactResult;
  verification: VerifyDownloadedArtifactResult;
};

export type ApplyPreparedUpdateInput = UpdateClientConfig & {
  lockKey?: string;
  operationId?: string;
  prepared: PreparedUpdate;
  target?: UpdateActivationTarget;
};

export type AppliedUpdateResult = {
  activation?: ActivateStagedArtifactResult;
  artifact: UpdateArtifact;
  check: UpdateCheckResult;
  download: DownloadArtifactResult;
  installation?: UpdatePackageInstallResult;
  manifest: UpdateManifest;
  operationId: string;
  prepared: PreparedUpdate;
  restartPending: boolean;
  snapshot: UpdateStateSnapshot;
  stage?: StageArtifactResult;
  verification: VerifyDownloadedArtifactResult;
};

export type ApplyUpdateInput = UpdateClientConfig & {
  lockKey?: string;
  manifest?: UpdateManifest;
  operationId?: string;
  subject?: UpdateSubject;
};

export type ResumeUpdateInput = UpdateClientConfig & {
  lockKey?: string;
  operationId: string;
};

export type UpdateSchedulerState = {
  running: boolean;
  lastError?: Error;
  lastFinishedAt?: string;
  lastResult?: AppliedUpdateResult | UpdateCheckResult;
  lastStartedAt?: string;
};

export type UpdateSchedulerMode = "apply" | "check";

export type UpdateSchedulerConfig = UpdateClientConfig & {
  intervalMs: number;
  lockKey?: string;
  mode?: UpdateSchedulerMode;
  operationIdFactory?: () => string;
};

export type UpdateScheduler = {
  getState(): UpdateSchedulerState;
  start(): void;
  stop(): void;
  triggerNow(): Promise<AppliedUpdateResult | UpdateCheckResult>;
};

export type UpdateFileStoreConfig = {
  directory: string;
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

export type PlanSelfUpdateInput = UpdateCheckInput;

export type SelfUpdatePlan = {
  artifact: UpdateArtifact | null;
  manifest: UpdateManifest;
  reason?: string;
  shouldUpdate: boolean;
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

export type ApplySelfUpdateInput = ApplyUpdateInput;

export type ApplySelfUpdateResult = {
  activation?: ActivateStagedArtifactResult;
  download: DownloadArtifactResult;
  installation?: UpdatePackageInstallResult;
  plan: SelfUpdatePlan;
  stage?: StageArtifactResult;
  verification: VerifyDownloadedArtifactResult;
};

export type ApplySecondaryUpdateInput = {
  fetchImpl?: UpdateFetch;
  instruction: SecondaryUpdateInstruction;
  mode?: "secondary";
  now?: Date;
  packageInstaller?: UpdatePackageInstaller;
  readInstalledVersion?: UpdateVersionReader;
  restartController?: UpdateRestartController;
  restartHook?: UpdateRestartHook;
  stateStore?: UpdateStateStore;
  journalStore?: UpdateJournalStore;
  lifecycleHandler?: UpdateLifecycleHandler;
  lockStore?: UpdateLockStore;
  statusHandler?: UpdateStatusHandler;
  target: UpdateActivationTarget;
  targetEntity: string;
  targetInstanceId: string;
  verificationKeys: UpdateVerificationKeyInput[];
  workingDirectory: string;
};

export type ApplySecondaryUpdateResult = {
  activation?: ActivateStagedArtifactResult;
  download: DownloadArtifactResult;
  installation?: UpdatePackageInstallResult;
  instruction: SecondaryUpdateInstruction;
  stage?: StageArtifactResult;
  verification: VerifyDownloadedArtifactResult;
};

export type UpdateClient = {
  applySecondaryUpdate: (input: Omit<ApplySecondaryUpdateInput, "mode">) => Promise<ApplySecondaryUpdateResult>;
  applySelfUpdate: (input?: Partial<PlanSelfUpdateInput>) => Promise<ApplySelfUpdateResult>;
  applyUpdate: (input?: Partial<ApplyUpdateInput>) => Promise<AppliedUpdateResult>;
  checkForUpdate: (input?: Partial<UpdateCheckInput>) => Promise<UpdateCheckResult>;
  createUpdateScheduler: (input: Omit<UpdateSchedulerConfig, keyof UpdateClientConfig>) => UpdateScheduler;
  fetchManifest: () => Promise<FetchedManifest>;
  planRollout: (input: Omit<PlanRolloutInput, "verificationKeys"> & {
    verificationKeys?: UpdateVerificationKeyInput[];
  }) => Promise<RolloutPlan>;
  planSecondaryUpdate: (input: Omit<PlanSecondaryUpdateInput, "runtime" | "verificationKeys"> & {
    runtime?: UpdateRuntimeTarget;
    verificationKeys?: UpdateVerificationKeyInput[];
  }) => Promise<SecondaryUpdatePlan>;
  planSelfUpdate: (input?: Partial<PlanSelfUpdateInput>) => Promise<SelfUpdatePlan>;
};
