import { rollbackActivatedArtifact } from "#activate";
import { ensureRemoved } from "#fs";
import type {
  AppliedUpdateResult,
  ApplyPreparedUpdateInput,
  PreparedUpdate,
  UpdateClientConfig,
  UpdateRestartController,
} from "#types";
import { emitLifecycle } from "./lifecycle.js";
import { toError } from "./shared.js";

export async function handleRestartIfNeeded(
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

export async function rollbackAfterFailure(
  input: Pick<ApplyPreparedUpdateInput, "journalStore" | "lifecycleHandler" | "statusHandler">,
  operationId: string,
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

export async function cleanupPreparedArtifacts(prepared: PreparedUpdate): Promise<void> {
  await ensureRemoved(prepared.download.filePath);

  if (prepared.stage) {
    await ensureRemoved(prepared.stage.stageDirectory);
  }
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
