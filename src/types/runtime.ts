import type {
  UpdateActivationTarget,
  UpdateArtifact,
  UpdateAuthConfig,
  UpdateFetch,
  UpdateManifest,
  UpdateManifestSource,
  UpdateNormalizationOptions,
  UpdateRuntimeTarget,
  UpdateVerificationKeyInput,
  UpdateVersionReader,
} from "./core.js";
import type {
  ActivationRollbackState,
  UpdateDownloadCheckpoint,
  UpdateJournalStore,
  UpdateLifecycleHandler,
  UpdateLockStore,
  UpdatePackageInstallResult,
  UpdatePackageInstaller,
  UpdateRestartController,
  UpdateStateSnapshot,
  UpdateStateStore,
} from "./lifecycle.js";
import type { UpdateLogger, UpdateLoggerAdapter, UpdateStatusHandler } from "./logging.js";

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
  restartHook?: import("./core.js").UpdateRestartHook;
  restartController?: UpdateRestartController;
  logger?: UpdateLogger;
  loggerAdapter?: UpdateLoggerAdapter;
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
  restartHook?: import("./core.js").UpdateRestartHook;
  readInstalledVersion?: UpdateVersionReader;
  stage: StageArtifactResult;
  statusHandler?: UpdateStatusHandler;
  target: UpdateActivationTarget;
  workingDirectory: string;
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

export type UpdateCheckInput = UpdateClientConfig & {
  lockKey?: string;
  manifest?: UpdateManifest;
  operationId?: string;
  subject?: import("./core.js").UpdateSubject;
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
  subject: import("./core.js").UpdateSubject;
};

export type PrepareUpdateInput = UpdateClientConfig & {
  artifact?: UpdateArtifact;
  check?: UpdateCheckResult;
  lockKey?: string;
  manifest?: UpdateManifest;
  operationId?: string;
  releaseVersion?: string;
  resumeFrom?: UpdateDownloadCheckpoint | null;
  subject?: import("./core.js").UpdateSubject;
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
  subject?: import("./core.js").UpdateSubject;
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
