import type {
  UpdateActivationTarget,
  UpdateFetch,
  UpdateRuntimeTarget,
  UpdateVerificationKeyInput,
  UpdateVersionReader,
} from "./core.js";
import type {
  ActivateStagedArtifactResult,
  AppliedUpdateResult,
  ApplyUpdateInput,
  DownloadArtifactResult,
  FetchedManifest,
  PrepareUpdateInput,
  StageArtifactResult,
  UpdateCheckInput,
  UpdateCheckResult,
  UpdateClientConfig,
  UpdateScheduler,
  UpdateSchedulerConfig,
  VerifyDownloadedArtifactResult,
} from "./runtime-compat.js";
import type {
  UpdateJournalStore,
  UpdateLifecycleHandler,
  UpdateLockStore,
  UpdatePackageInstallResult,
  UpdatePackageInstaller,
  UpdateRestartController,
  UpdateStateStore,
} from "./lifecycle.js";
import type { UpdateStatusHandler } from "./logging.js";
import type {
  PlanRolloutInput,
  PlanSecondaryUpdateInput,
  RolloutPlan,
  SecondaryUpdateInstruction,
  SecondaryUpdatePlan,
} from "./rollout.js";

export type SelfUpdatePlan = {
  artifact: import("./core.js").UpdateArtifact | null;
  manifest: import("./core.js").UpdateManifest;
  reason?: string;
  shouldUpdate: boolean;
};

export type PlanSelfUpdateInput = UpdateCheckInput;

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
  restartHook?: import("./core.js").UpdateRestartHook;
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
