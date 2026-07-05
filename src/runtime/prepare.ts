import { downloadArtifact } from "#download";
import { stageArtifact } from "#stage";
import { withUpdateLock } from "#stores";
import { verifyDownloadedArtifact } from "#verify";
import type {
  PrepareUpdateInput,
  PreparedUpdate,
  UpdateCheckResult,
} from "#types";
import { emitLifecycle } from "./lifecycle.js";
import { checkForUpdate } from "./check.js";
import { createSnapshot } from "./snapshots.js";
import { createFlowLockKey, saveSnapshot, toError, toPackageSnapshotInput } from "./shared.js";

export async function prepareUpdate(input: PrepareUpdateInput): Promise<PreparedUpdate> {
  const check = input.check ?? await checkForUpdate({
    ...input,
    operationId: input.operationId,
    subject: input.subject,
  });

  assertUpdateAvailable(check);
  const operationId = input.operationId ?? check.operationId;
  const lockKey = input.lockKey ?? createFlowLockKey("apply", check.subject);

  return withUpdateLock({
    key: lockKey,
    lockStore: input.lockStore,
  }, async () => runPrepareFlow(input, check, operationId));
}

function assertUpdateAvailable(check: UpdateCheckResult) {
  if (!check.shouldUpdate || !check.artifact) {
    throw new Error("No update is available.");
  }
}

async function runPrepareFlow(input: PrepareUpdateInput, check: UpdateCheckResult, operationId: string): Promise<PreparedUpdate> {
  const artifact = check.artifact!;
  const download = await downloadAndVerify(input, check, artifact, operationId);
  return isPackageArtifact(artifact.installStrategy)
    ? preparePackageUpdate(input, check, artifact, download, operationId)
    : prepareStagedUpdate(input, check, artifact, download, operationId);
}

async function downloadAndVerify(input: PrepareUpdateInput, check: UpdateCheckResult, artifact: NonNullable<UpdateCheckResult["artifact"]>, operationId: string) {
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
    ...toPackageSnapshotInput(input, check.manifest, operationId, check.subject),
    phase: "downloaded",
  }));

  const verification = await verifyDownloadedArtifact({
    artifact,
    filePath: download.filePath,
  });
  await saveSnapshot(input, createSnapshot({
    artifact,
    download,
    ...toPackageSnapshotInput(input, check.manifest, operationId, check.subject),
    phase: "verified",
  }));

  return { download, verification };
}

function isPackageArtifact(installStrategy: string) {
  return installStrategy === "deb" || installStrategy === "rpm";
}

async function preparePackageUpdate(
  input: PrepareUpdateInput,
  check: UpdateCheckResult,
  artifact: NonNullable<UpdateCheckResult["artifact"]>,
  downloadState: Awaited<ReturnType<typeof downloadAndVerify>>,
  operationId: string,
): Promise<PreparedUpdate> {
  const snapshot = createSnapshot({
    artifact,
    download: downloadState.download,
    ...toPackageSnapshotInput(input, check.manifest, operationId, check.subject),
    phase: "verified",
  });

  return {
    artifact,
    check,
    download: downloadState.download,
    kind: "package",
    manifest: check.manifest,
    operationId,
    packageFilePath: downloadState.download.filePath,
    releaseVersion: check.manifest.releaseVersion,
    snapshot,
    verification: downloadState.verification,
  };
}

async function prepareStagedUpdate(
  input: PrepareUpdateInput,
  check: UpdateCheckResult,
  artifact: NonNullable<UpdateCheckResult["artifact"]>,
  downloadState: Awaited<ReturnType<typeof downloadAndVerify>>,
  operationId: string,
): Promise<PreparedUpdate> {
  await emitLifecycle(input, {
    artifact,
    operationId,
    type: "stage.started",
  });

  try {
    const stage = await stageArtifact({
      artifact,
      download: downloadState.download,
      statusHandler: input.statusHandler,
      workingDirectory: input.workingDirectory,
    });
    const snapshot = createSnapshot({
      artifact,
      download: downloadState.download,
      ...toPackageSnapshotInput(input, check.manifest, operationId, check.subject),
      phase: "staged",
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
      download: downloadState.download,
      kind: "staged",
      manifest: check.manifest,
      operationId,
      releaseVersion: check.manifest.releaseVersion,
      snapshot,
      stage,
      verification: downloadState.verification,
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
}
