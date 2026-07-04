import { randomUUID } from "node:crypto";

import { activateStagedArtifact, rollbackActivatedArtifact } from "#activate";
import { selectArtifactForSubject } from "#artifacts";
import { downloadArtifact } from "#download";
import { ensureRemoved } from "#fs";
import { fetchManifestFromSources } from "#manifest";
import { executePackageInstall } from "#package-install";
import { stageArtifact } from "#stage";
import { withUpdateLock } from "#stores";
import { evaluateUpdateCandidate, verifyDownloadedArtifact } from "#verify";
import type {
  AppliedUpdateResult,
  ApplyPreparedUpdateInput,
  ApplyUpdateInput,
  PreparedUpdate,
  PrepareUpdateInput,
  UpdateCheckInput,
  UpdateCheckResult,
  UpdateClientConfig,
  UpdateInstruction,
  UpdateLifecycleEvent,
  UpdateLifecycleHandler,
  UpdateManifest,
  UpdateRestartController,
  UpdateStateSnapshot,
  UpdateSubject,
  ResumeUpdateInput,
} from "#types";

export async function checkForUpdate(input: UpdateCheckInput): Promise<UpdateCheckResult> {
  const subject = resolveSubject(input);
  const operationId = input.operationId ?? randomUUID();
  const lockKey = input.lockKey ?? createFlowLockKey("check", subject);

  return withUpdateLock({
    key: lockKey,
    lockStore: input.lockStore,
  }, async () => {
    await emitLifecycle(input, {
      operationId,
      subject,
      type: "check.started",
    });

    const fetched = input.manifest
      ? {
        manifest: input.manifest,
        sourceIndex: 0,
        sourceUrl: input.manifestSources?.[0] && typeof input.manifestSources[0] !== "string"
          ? input.manifestSources[0].url
          : input.manifestUrl,
      }
      : await fetchManifestFromSources({
        fetchImpl: input.fetchImpl,
        normalization: input.normalization,
        sources: resolveManifestSources(input),
        verificationKeys: input.verificationKeys,
      });

    if (fetched.manifest.entity !== subject.entity) {
      throw new Error(`Manifest ${fetched.manifest.entity} does not match runtime ${subject.entity}.`);
    }

    await emitLifecycle(input, {
      manifest: fetched.manifest,
      operationId,
      sourceUrl: fetched.sourceUrl,
      type: "manifest.fetched",
    });

    const artifact = selectArtifactForSubject(fetched.manifest, subject);
    const evaluation = evaluateUpdateCandidate({
      allowDowngrade: input.allowDowngrade,
      allowSameVersion: input.allowSameVersion,
      currentVersion: subject.currentVersion,
      minimumSupportedVersion: fetched.manifest.minimumSupportedVersion,
      releaseVersion: fetched.manifest.releaseVersion,
    });

    if (evaluation.reason === "already-current" && !evaluation.shouldUpdate) {
      const snapshot = createSnapshot({
        artifact: null,
        flow: "check",
        manifest: fetched.manifest,
        operationId,
        phase: "manifest-fetched",
        releaseVersion: fetched.manifest.releaseVersion,
        subject,
      });
      await saveSnapshot(input, snapshot);
      await emitLifecycle(input, {
        manifest: fetched.manifest,
        operationId,
        reason: evaluation.reason ?? "already-current",
        type: "no.update",
      });

      return {
        artifact: null,
        manifest: fetched.manifest,
        operationId,
        reason: evaluation.reason ?? "already-current",
        shouldUpdate: false,
        snapshot,
        sourceIndex: fetched.sourceIndex,
        sourceUrl: fetched.sourceUrl,
        subject,
      };
    }

    evaluation.assertAllowed();

    const snapshot = createSnapshot({
      artifact,
      flow: "check",
      manifest: fetched.manifest,
      operationId,
      phase: "update-selected",
      releaseVersion: fetched.manifest.releaseVersion,
      subject,
    });
    await saveSnapshot(input, snapshot);
    await emitLifecycle(input, {
      artifact,
      manifest: fetched.manifest,
      operationId,
      type: "update.available",
    });

    return {
      artifact,
      manifest: fetched.manifest,
      operationId,
      shouldUpdate: true,
      snapshot,
      sourceIndex: fetched.sourceIndex,
      sourceUrl: fetched.sourceUrl,
      subject,
    };
  });
}

export async function prepareUpdate(input: PrepareUpdateInput): Promise<PreparedUpdate> {
  const check = input.check ?? await checkForUpdate({
    ...input,
    operationId: input.operationId,
    subject: input.subject,
  });

  if (!check.shouldUpdate || !check.artifact) {
    throw new Error("No update is available.");
  }
  const artifact = check.artifact;

  const operationId = input.operationId ?? check.operationId;
  const lockKey = input.lockKey ?? createFlowLockKey("apply", check.subject);

  return withUpdateLock({
    key: lockKey,
    lockStore: input.lockStore,
  }, async () => {
    const download = await downloadArtifact({
      artifact,
      auth: input.auth,
      fetchImpl: input.fetchImpl,
      lifecycleHandler: input.lifecycleHandler,
      mirrors: artifact.mirrors,
      resumeFrom: input.resumeFrom ?? check.snapshot.download ?? null,
      statusHandler: input.statusHandler,
      workingDirectory: input.workingDirectory,
    });
    await saveSnapshot(input, createSnapshot({
      artifact,
      download,
      flow: "apply",
      manifest: check.manifest,
      operationId,
      phase: "downloaded",
      releaseVersion: check.manifest.releaseVersion,
      subject: check.subject,
    }));

    const verification = await verifyDownloadedArtifact({
      artifact,
      filePath: download.filePath,
    });
    await saveSnapshot(input, createSnapshot({
      artifact,
      download,
      flow: "apply",
      manifest: check.manifest,
      operationId,
      phase: "verified",
      releaseVersion: check.manifest.releaseVersion,
      subject: check.subject,
    }));

    if (artifact.installStrategy === "deb" || artifact.installStrategy === "rpm") {
      const snapshot = createSnapshot({
        artifact,
        download,
        flow: "apply",
        manifest: check.manifest,
        operationId,
        phase: "verified",
        releaseVersion: check.manifest.releaseVersion,
        subject: check.subject,
      });
      return {
        artifact,
        check,
        download,
        kind: "package",
        manifest: check.manifest,
        operationId,
        packageFilePath: download.filePath,
        releaseVersion: check.manifest.releaseVersion,
        snapshot,
        verification,
      };
    }

    await emitLifecycle(input, {
      artifact,
      operationId,
      type: "stage.started",
    });

    try {
      const stage = await stageArtifact({
        artifact,
        download,
        statusHandler: input.statusHandler,
        workingDirectory: input.workingDirectory,
      });
      const snapshot = createSnapshot({
        artifact,
        download,
        flow: "apply",
        manifest: check.manifest,
        operationId,
        phase: "staged",
        releaseVersion: check.manifest.releaseVersion,
        subject: check.subject,
      });
      await saveSnapshot(input, snapshot);
      await emitLifecycle(input, {
        artifact,
        operationId,
        type: "stage.succeeded",
      });

      return {
        artifact,
        check,
        download,
        kind: "staged",
        manifest: check.manifest,
        operationId,
        releaseVersion: check.manifest.releaseVersion,
        snapshot,
        stage,
        verification,
      };
    }
    catch (error) {
      await emitLifecycle(input, {
        artifact,
        error: toError(error),
        operationId,
        type: "stage.failed",
      });
      throw error;
    }
  });
}

export async function applyPreparedUpdate(input: ApplyPreparedUpdateInput): Promise<AppliedUpdateResult> {
  const operationId = input.operationId ?? input.prepared.operationId;
  const lockKey = input.lockKey ?? createFlowLockKey("apply", input.prepared.check.subject);

  return withUpdateLock({
    key: lockKey,
    lockStore: input.lockStore,
  }, async () => {
    await emitLifecycle(input, {
      artifact: input.prepared.artifact,
      operationId,
      releaseVersion: input.prepared.releaseVersion,
      type: "apply.started",
    });

    let restartPending = false;
    let activation: AppliedUpdateResult["activation"];
    let installation: AppliedUpdateResult["installation"];

    try {
      if (input.prepared.kind === "package") {
        installation = await executePackageInstall({
          artifact: input.prepared.artifact,
          filePath: input.prepared.packageFilePath!,
          installer: input.packageInstaller,
          lifecycleHandler: input.lifecycleHandler,
          workingDirectory: input.workingDirectory,
        });
        const installedSnapshot = createSnapshot({
          artifact: input.prepared.artifact,
          download: input.prepared.download,
          flow: "apply",
          manifest: input.prepared.manifest,
          operationId,
          phase: "installed",
          releaseVersion: input.prepared.releaseVersion,
          subject: input.prepared.check.subject,
        });
        await saveSnapshot(input, installedSnapshot);
        restartPending = await handleRestartIfNeeded(input, {
          artifact: input.prepared.artifact,
          operationId,
          releaseVersion: input.prepared.releaseVersion,
          restartRequired: installation.restartRequired ?? true,
        });
      }
      else {
        await emitLifecycle(input, {
          artifact: input.prepared.artifact,
          operationId,
          type: "activate.started",
        });

        try {
          activation = await activateStagedArtifact({
            artifact: input.prepared.artifact,
            readInstalledVersion: input.readInstalledVersion,
            releaseVersion: input.prepared.releaseVersion,
            stage: input.prepared.stage!,
            statusHandler: input.statusHandler,
            target: input.target ?? input.activationTarget ?? requiredActivationTarget(input),
            workingDirectory: input.workingDirectory,
          });
          await emitLifecycle(input, {
            artifact: input.prepared.artifact,
            operationId,
            type: "activate.succeeded",
          });
        }
        catch (error) {
          await emitLifecycle(input, {
            artifact: input.prepared.artifact,
            error: toError(error),
            operationId,
            type: "activate.failed",
          });
          throw error;
        }

        const activatedSnapshot = createSnapshot({
          artifact: input.prepared.artifact,
          download: input.prepared.download,
          flow: "apply",
          manifest: input.prepared.manifest,
          operationId,
          phase: "activated",
          releaseVersion: input.prepared.releaseVersion,
          rollback: activation.rollback,
          subject: input.prepared.check.subject,
        });
        await saveSnapshot(input, activatedSnapshot);

        try {
          restartPending = await handleRestartIfNeeded(input, {
            artifact: input.prepared.artifact,
            operationId,
            releaseVersion: input.prepared.releaseVersion,
            restartRequired: true,
            targetPath: activation.targetPath,
          });
        }
        catch (error) {
          await rollbackAfterFailure(input, operationId, input.prepared.artifact, activation.rollback);
          throw error;
        }
      }

      await emitLifecycle(input, {
        artifact: input.prepared.artifact,
        operationId,
        type: "cleanup.started",
      });
      await cleanupPreparedArtifacts(input.prepared);
      const snapshot = createSnapshot({
        artifact: input.prepared.artifact,
        flow: "apply",
        manifest: input.prepared.manifest,
        operationId,
        phase: "cleanup-complete",
        releaseVersion: input.prepared.releaseVersion,
        restartPending,
        rollback: activation?.rollback ?? null,
        subject: input.prepared.check.subject,
      });
      await saveSnapshot(input, snapshot);
      await emitLifecycle(input, {
        artifact: input.prepared.artifact,
        operationId,
        type: "cleanup.succeeded",
      });
      await emitLifecycle(input, {
        artifact: input.prepared.artifact,
        operationId,
        type: "apply.succeeded",
      });

      return {
        activation,
        artifact: input.prepared.artifact,
        check: input.prepared.check,
        download: input.prepared.download,
        installation,
        manifest: input.prepared.manifest,
        operationId,
        prepared: input.prepared,
        restartPending,
        snapshot,
        stage: input.prepared.stage,
        verification: input.prepared.verification,
      };
    }
    catch (error) {
      await emitLifecycle(input, {
        artifact: input.prepared.artifact,
        error: toError(error),
        operationId,
        type: "apply.failed",
      });
      await saveSnapshot(input, createSnapshot({
        artifact: input.prepared.artifact,
        download: input.prepared.download,
        error: {
          message: toError(error).message,
        },
        flow: "apply",
        manifest: input.prepared.manifest,
        operationId,
        phase: "failed",
        releaseVersion: input.prepared.releaseVersion,
        rollback: activation?.rollback ?? null,
        subject: input.prepared.check.subject,
      }));
      throw error;
    }
  });
}

export async function applyUpdate(input: ApplyUpdateInput): Promise<AppliedUpdateResult> {
  const check = await checkForUpdate(input);
  const prepared = await prepareUpdate({
    ...input,
    check,
    operationId: check.operationId,
  });

  return applyPreparedUpdate({
    ...input,
    operationId: check.operationId,
    prepared,
  });
}

export async function resumeUpdate(input: ResumeUpdateInput): Promise<AppliedUpdateResult | PreparedUpdate | UpdateCheckResult> {
  const snapshot = await input.stateStore?.load(input.operationId);
  if (!snapshot) {
    throw new Error(`No update state exists for operation ${input.operationId}.`);
  }

  if (snapshot.phase === "cleanup-complete") {
    return checkForUpdate({
      ...input,
      operationId: input.operationId,
      subject: snapshot.subject,
    });
  }

  if (snapshot.phase === "staged" || snapshot.phase === "verified" || snapshot.phase === "downloaded" || snapshot.phase === "update-selected" || snapshot.phase === "manifest-fetched") {
    return prepareUpdate({
      ...input,
      artifact: snapshot.artifact ?? undefined,
      check: snapshot.manifest && snapshot.subject
        ? fromSnapshotCheck(snapshot)
        : undefined,
      manifest: snapshot.manifest,
      operationId: input.operationId,
      releaseVersion: snapshot.releaseVersion,
      resumeFrom: snapshot.download ?? null,
      subject: snapshot.subject,
    });
  }

  return applyUpdate({
    ...input,
    manifest: snapshot.manifest,
    operationId: input.operationId,
    subject: snapshot.subject,
  });
}

function createSnapshot(input: {
  artifact?: UpdateCheckResult["artifact"];
  download?: UpdateStateSnapshot["download"];
  error?: UpdateStateSnapshot["error"];
  flow: UpdateStateSnapshot["flow"];
  manifest?: UpdateManifest;
  operationId: string;
  phase: UpdateStateSnapshot["phase"];
  releaseVersion?: string;
  restartPending?: boolean;
  rollback?: UpdateStateSnapshot["rollback"];
  subject?: UpdateSubject;
}): UpdateStateSnapshot {
  return {
    artifact: input.artifact,
    download: input.download,
    error: input.error,
    flow: input.flow,
    manifest: input.manifest,
    operationId: input.operationId,
    phase: input.phase,
    releaseVersion: input.releaseVersion,
    restartPending: input.restartPending,
    rollback: input.rollback,
    subject: input.subject,
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}

async function saveSnapshot(input: Pick<UpdateClientConfig, "stateStore">, snapshot: UpdateStateSnapshot): Promise<void> {
  await input.stateStore?.save(snapshot);
}

async function emitLifecycle(
  input: Pick<UpdateClientConfig, "journalStore" | "lifecycleHandler" | "statusHandler">,
  event: UpdateLifecycleEvent,
): Promise<void> {
  const at = new Date().toISOString();
  await input.journalStore?.append({
    ...event,
    at,
  });
  await input.lifecycleHandler?.(event);

  if (input.statusHandler) {
    await input.statusHandler(toStatusEvent(event));
  }
}

function resolveManifestSources(input: Pick<UpdateClientConfig, "auth" | "manifestSources" | "manifestUrl">) {
  if (input.manifestSources?.length) {
    return input.manifestSources;
  }

  return [{
    auth: input.auth,
    url: input.manifestUrl,
  }];
}

function resolveSubject(input: Pick<UpdateCheckInput, "arch" | "currentVersion" | "entity" | "installStrategy" | "os" | "subject">): UpdateSubject {
  return input.subject ?? {
    arch: input.arch,
    currentVersion: input.currentVersion,
    entity: input.entity,
    installStrategy: input.installStrategy,
    os: input.os,
  };
}

function createFlowLockKey(flow: "apply" | "check", subject: UpdateSubject): string {
  return `${flow}:${subject.entity}:${subject.os}:${subject.arch}:${subject.installStrategy}`;
}

function fromSnapshotCheck(snapshot: UpdateStateSnapshot): UpdateCheckResult {
  if (!snapshot.manifest || !snapshot.subject) {
    throw new Error(`Snapshot ${snapshot.operationId} is missing manifest or subject state.`);
  }

  return {
    artifact: snapshot.artifact ?? null,
    manifest: snapshot.manifest,
    operationId: snapshot.operationId,
    reason: snapshot.artifact ? undefined : "already-current",
    shouldUpdate: Boolean(snapshot.artifact),
    snapshot,
    sourceIndex: 0,
    sourceUrl: snapshot.download?.url ?? "",
    subject: snapshot.subject,
  };
}

async function handleRestartIfNeeded(
  input: Pick<ApplyPreparedUpdateInput, "journalStore" | "lifecycleHandler" | "restartController" | "restartHook" | "statusHandler">,
  context: {
    artifact: PreparedUpdate["artifact"];
    operationId: string;
    releaseVersion: string;
    restartRequired: boolean;
    targetPath?: string;
  },
): Promise<boolean> {
  if (!context.restartRequired) {
    return false;
  }

  const controller = toRestartController(input, context);
  if (!controller) {
    return false;
  }

  const decision = await controller.request({
    artifact: context.artifact,
    operationId: context.operationId,
    releaseVersion: context.releaseVersion,
    targetPath: context.targetPath,
  });

  if (decision === "defer") {
    await emitLifecycle(input, {
      artifact: context.artifact,
      operationId: context.operationId,
      releaseVersion: context.releaseVersion,
      type: "restart.required",
    });
    return true;
  }

  await controller.perform?.({
    artifact: context.artifact,
    operationId: context.operationId,
    releaseVersion: context.releaseVersion,
    targetPath: context.targetPath,
  });

  return false;
}

function toRestartController(
  input: Pick<ApplyPreparedUpdateInput, "restartController" | "restartHook">,
  context: {
    artifact: PreparedUpdate["artifact"];
    operationId: string;
    releaseVersion: string;
    targetPath?: string;
  },
): UpdateRestartController | null {
  if (input.restartController) {
    return input.restartController;
  }

  if (!input.restartHook || !context.targetPath) {
    return null;
  }

  return {
    perform: async () => input.restartHook?.({
      artifact: context.artifact,
      mode: "self",
      releaseVersion: context.releaseVersion,
      targetPath: context.targetPath!,
    }),
    request: () => "restart-now",
  };
}

async function rollbackAfterFailure(
  input: Pick<ApplyPreparedUpdateInput, "journalStore" | "lifecycleHandler" | "statusHandler">,
  operationId: string,
  artifact: PreparedUpdate["artifact"],
  rollback: NonNullable<AppliedUpdateResult["activation"]>["rollback"],
): Promise<void> {
  await emitLifecycle(input, {
    operationId,
    rollback,
    type: "rollback.started",
  });

  try {
    await rollbackActivatedArtifact({
      rollback,
    });
    await emitLifecycle(input, {
      operationId,
      rollback,
      type: "rollback.succeeded",
    });
  }
  catch (error) {
    await emitLifecycle(input, {
      error: toError(error),
      operationId,
      rollback,
      type: "rollback.failed",
    });
    throw error;
  }
}

async function cleanupPreparedArtifacts(prepared: PreparedUpdate): Promise<void> {
  await ensureRemoved(prepared.download.filePath);

  if (prepared.stage) {
    await ensureRemoved(prepared.stage.stageDirectory);
  }
}

function requiredActivationTarget(input: ApplyPreparedUpdateInput) {
  if (!input.activationTarget && !input.target) {
    throw new Error("Activation target is required for staged updates.");
  }

  return input.target ?? input.activationTarget!;
}

function toStatusEvent(event: UpdateLifecycleEvent) {
  switch (event.type) {
    case "check.started":
      return { code: event.type, level: "info" as const, message: "Update check started.", context: { operationId: event.operationId } };
    case "manifest.fetched":
      return { code: event.type, level: "info" as const, message: "Manifest fetched.", context: { operationId: event.operationId, sourceUrl: event.sourceUrl } };
    case "update.available":
      return { code: event.type, level: "info" as const, message: "Update available.", context: { artifactId: event.artifact.id, operationId: event.operationId } };
    case "no.update":
      return { code: event.type, level: "info" as const, message: "No update available.", context: { operationId: event.operationId, reason: event.reason } };
    case "apply.started":
      return { code: event.type, level: "info" as const, message: "Apply started.", context: { artifactId: event.artifact.id, operationId: event.operationId } };
    case "stage.failed":
    case "activate.failed":
    case "rollback.failed":
    case "cleanup.failed":
    case "apply.failed":
      return { code: event.type, level: "error" as const, message: event.type, context: { error: event.error?.message, operationId: event.operationId } };
    default:
      return { code: event.type, level: "info" as const, message: event.type, context: { operationId: event.operationId } };
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
