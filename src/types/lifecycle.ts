import type { UpdateArtifact, UpdateManifest, UpdateSubject } from "./core.js";

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

export type ActivationRollbackState = {
  backupPath: string | null;
  releaseVersion: string;
  targetPath: string;
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
