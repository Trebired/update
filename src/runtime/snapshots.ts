import type {
  UpdateCheckResult,
  UpdateManifest,
  UpdateStateSnapshot,
  UpdateSubject,
} from "#types";

export function createSnapshot(input: {
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

export function fromSnapshotCheck(snapshot: UpdateStateSnapshot): UpdateCheckResult {
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
