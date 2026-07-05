import type {
  AppliedUpdateResult,
  PreparedUpdate,
  ResumeUpdateInput,
  UpdateCheckResult,
} from "#types";
import { applyUpdate } from "./apply.js";
import { checkForUpdate } from "./check.js";
import { prepareUpdate } from "./prepare.js";
import { fromSnapshotCheck } from "./snapshots.js";

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

  if (shouldResumePreparation(snapshot.phase)) {
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

function shouldResumePreparation(phase: string) {
  return phase === "staged"
    || phase === "verified"
    || phase === "downloaded"
    || phase === "update-selected"
    || phase === "manifest-fetched";
}
