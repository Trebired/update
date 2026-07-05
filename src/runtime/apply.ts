import { activateStagedArtifact } from "#activate";
import { executePackageInstall } from "#package-install";
import { withUpdateLock } from "#stores";
import type {
  AppliedUpdateResult,
  ApplyPreparedUpdateInput,
  ApplyUpdateInput,
  PreparedUpdate,
} from "#types";
import { emitLifecycle } from "./lifecycle.js";
import { checkForUpdate } from "./check.js";
import { prepareUpdate } from "./prepare.js";
import { cleanupPreparedArtifacts, handleRestartIfNeeded, rollbackAfterFailure } from "./restart.js";
import { createSnapshot } from "./snapshots.js";
import { createFlowLockKey, requiredActivationTarget, saveSnapshot, toError } from "./shared.js";

export async function applyPreparedUpdate(input: ApplyPreparedUpdateInput): Promise<AppliedUpdateResult> {
  const operationId = input.operationId ?? input.prepared.operationId;
  const lockKey = input.lockKey ?? createFlowLockKey("apply", input.prepared.check.subject);

  return withUpdateLock({
    key: lockKey,
    lockStore: input.lockStore,
  }, async () => runApplyFlow(input, operationId));
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

async function runApplyFlow(input: ApplyPreparedUpdateInput, operationId: string): Promise<AppliedUpdateResult> {
  await emitLifecycle(input, {
    artifact: input.prepared.artifact,
    operationId,
    releaseVersion: input.prepared.releaseVersion,
    type: "apply.started",
  });

  try {
    const execution = input.prepared.kind === "package"
      ? await applyPackagePreparedUpdate(input, operationId)
      : await applyStagedPreparedUpdate(input, operationId);

    return finalizeAppliedUpdate(input, operationId, execution);
  }
  catch (error) {
    await handleApplyFailure(input, operationId, error);
    throw error;
  }
}

async function applyPackagePreparedUpdate(input: ApplyPreparedUpdateInput, operationId: string) {
  const installation = await executePackageInstall({
    artifact: input.prepared.artifact,
    filePath: input.prepared.packageFilePath!,
    installer: input.packageInstaller,
    lifecycleHandler: input.lifecycleHandler,
    workingDirectory: input.workingDirectory,
  });
  await saveSnapshot(input, createSnapshot({
    artifact: input.prepared.artifact,
    download: input.prepared.download,
    flow: "apply",
    manifest: input.prepared.manifest,
    operationId,
    phase: "installed",
    releaseVersion: input.prepared.releaseVersion,
    subject: input.prepared.check.subject,
  }));

  const restartPending = await handleRestartIfNeeded(input, {
    artifact: input.prepared.artifact,
    operationId,
    releaseVersion: input.prepared.releaseVersion,
    restartRequired: installation.restartRequired ?? true,
  });

  return { installation, restartPending };
}

async function applyStagedPreparedUpdate(input: ApplyPreparedUpdateInput, operationId: string) {
  const activation = await activatePreparedUpdate(input, operationId);
  await saveSnapshot(input, createSnapshot({
    artifact: input.prepared.artifact,
    download: input.prepared.download,
    flow: "apply",
    manifest: input.prepared.manifest,
    operationId,
    phase: "activated",
    releaseVersion: input.prepared.releaseVersion,
    rollback: activation.rollback,
    subject: input.prepared.check.subject,
  }));

  try {
    const restartPending = await handleRestartIfNeeded(input, {
      artifact: input.prepared.artifact,
      operationId,
      releaseVersion: input.prepared.releaseVersion,
      restartRequired: true,
      targetPath: activation.targetPath,
    });
    return { activation, restartPending };
  }
  catch (error) {
    await rollbackAfterFailure(input, operationId, activation.rollback);
    throw error;
  }
}

async function activatePreparedUpdate(input: ApplyPreparedUpdateInput, operationId: string) {
  await emitLifecycle(input, {
    artifact: input.prepared.artifact,
    operationId,
    type: "activate.started",
  });

  try {
    const activation = await activateStagedArtifact({
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
    return activation;
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
}

async function finalizeAppliedUpdate(
  input: ApplyPreparedUpdateInput,
  operationId: string,
  execution: {
    activation?: AppliedUpdateResult["activation"];
    installation?: AppliedUpdateResult["installation"];
    restartPending: boolean;
  },
): Promise<AppliedUpdateResult> {
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
    restartPending: execution.restartPending,
    rollback: execution.activation?.rollback ?? null,
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

  return buildAppliedUpdateResult(input.prepared, operationId, snapshot, execution);
}

function buildAppliedUpdateResult(
  prepared: PreparedUpdate,
  operationId: string,
  snapshot: AppliedUpdateResult["snapshot"],
  execution: {
    activation?: AppliedUpdateResult["activation"];
    installation?: AppliedUpdateResult["installation"];
    restartPending: boolean;
  },
): AppliedUpdateResult {
  return {
    activation: execution.activation,
    artifact: prepared.artifact,
    check: prepared.check,
    download: prepared.download,
    installation: execution.installation,
    manifest: prepared.manifest,
    operationId,
    prepared,
    restartPending: execution.restartPending,
    snapshot,
    stage: prepared.stage,
    verification: prepared.verification,
  };
}

async function handleApplyFailure(input: ApplyPreparedUpdateInput, operationId: string, error: unknown) {
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
    rollback: null,
    subject: input.prepared.check.subject,
  }));
}
