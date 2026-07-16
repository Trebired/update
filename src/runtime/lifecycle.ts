import { result } from "@trebired/result";

import { resolveLogger } from "#3qds0eu17fy6";
import type {
  UpdateClientConfig,
  UpdateLifecycleEvent,
  UpdateStatusEvent,
} from "#types";

type LifecycleInput = Pick<
  UpdateClientConfig,
  "journalStore" | "lifecycleHandler" | "logger" | "loggerAdapter" | "statusHandler"
>;

export async function emitLifecycle(input: LifecycleInput, event: UpdateLifecycleEvent): Promise<void> {
  const at = new Date().toISOString();
  await input.journalStore?.append({
    ...event,
    at,
  });
  await input.lifecycleHandler?.(event);

  const statusEvent = toStatusEvent(event);
  if (input.statusHandler) {
    await input.statusHandler(statusEvent);
  }

  if (!input.logger && !input.loggerAdapter) {
    return;
  }

  logStatusEvent(input, statusEvent);
}

export function toStatusEvent(event: UpdateLifecycleEvent): UpdateStatusEvent {
  switch (event.type) {
    case "check.started":
      return toCheckStartedStatusEvent(event);
    case "manifest.fetched":
      return toManifestFetchedStatusEvent(event);
    case "update.available":
      return toUpdateAvailableStatusEvent(event);
    case "no.update":
      return toNoUpdateStatusEvent(event);
    case "apply.started":
      return toApplyStartedStatusEvent(event);
    case "stage.failed":
    case "activate.failed":
    case "rollback.failed":
    case "cleanup.failed":
    case "apply.failed":
      return toFailureStatusEvent({
        error: event.error,
        operationId: event.operationId,
        type: event.type,
      });
    default:
      return toDefaultStatusEvent(event);
  }
}

function logStatusEvent(input: LifecycleInput, statusEvent: UpdateStatusEvent) {
  const logger = resolveLogger(input.logger, input.loggerAdapter);
  const metadata = statusEvent.context
    ? {
      ...statusEvent.context,
      result: statusEvent.result,
    }
    : {
      result: statusEvent.result,
    };

  if (statusEvent.level === "error") {
    logger.fail("trebired.update", statusEvent.message, metadata);
    return;
  }

  if (statusEvent.level === "warn") {
    logger.warn("trebired.update", statusEvent.message, metadata);
    return;
  }

  logger.info("trebired.update", statusEvent.message, metadata);
}

function toCheckStartedStatusEvent(event: Extract<UpdateLifecycleEvent, { type: "check.started" }>): UpdateStatusEvent {
  return {
    code: event.type,
    context: { operationId: event.operationId },
    level: "info",
    message: "Update check started.",
    result: result.ok("Update check started.", {
      data: {
        operationId: event.operationId,
      },
    }),
  };
}

function toManifestFetchedStatusEvent(event: Extract<UpdateLifecycleEvent, { type: "manifest.fetched" }>): UpdateStatusEvent {
  return {
    code: event.type,
    context: { operationId: event.operationId, sourceUrl: event.sourceUrl },
    level: "info",
    message: "Manifest fetched.",
    result: result.ok("Update manifest fetched.", {
      data: {
        operationId: event.operationId,
        sourceUrl: event.sourceUrl,
      },
    }),
  };
}

function toUpdateAvailableStatusEvent(event: Extract<UpdateLifecycleEvent, { type: "update.available" }>): UpdateStatusEvent {
  return {
    code: event.type,
    context: { artifactId: event.artifact.id, operationId: event.operationId },
    level: "info",
    message: "Update available.",
    result: result.ok("Update available.", {
      data: {
        artifactId: event.artifact.id,
        operationId: event.operationId,
      },
    }),
  };
}

function toNoUpdateStatusEvent(event: Extract<UpdateLifecycleEvent, { type: "no.update" }>): UpdateStatusEvent {
  return {
    code: event.type,
    context: { operationId: event.operationId, reason: event.reason },
    level: "info",
    message: "No update available.",
    result: result.noop("no-update", "No update is available.", {
      data: {
        operationId: event.operationId,
      },
      details: {
        reason: event.reason,
      },
    }),
  };
}

function toApplyStartedStatusEvent(event: Extract<UpdateLifecycleEvent, { type: "apply.started" }>): UpdateStatusEvent {
  return {
    code: event.type,
    context: { artifactId: event.artifact.id, operationId: event.operationId },
    level: "info",
    message: "Apply started.",
    result: result.ok("Update apply started.", {
      data: {
        artifactId: event.artifact.id,
        operationId: event.operationId,
      },
    }),
  };
}

function toFailureStatusEvent(
  event: {
    type: "stage.failed" | "activate.failed" | "rollback.failed" | "cleanup.failed" | "apply.failed";
    operationId: string;
    error?: Error;
  },
): UpdateStatusEvent {
  return {
    code: event.type,
    context: { error: event.error?.message, operationId: event.operationId },
    level: "error",
    message: event.type,
    result: result.internal(event.type, event.type, {
      data: {
        operationId: event.operationId,
      },
      details: {
        error: event.error?.message,
      },
    }),
  };
}

function toDefaultStatusEvent(event: UpdateLifecycleEvent): UpdateStatusEvent {
  return {
    code: event.type,
    context: { operationId: event.operationId },
    level: "info",
    message: event.type,
    result: result.ok(event.type, {
      data: {
        operationId: event.operationId,
      },
    }),
  };
}
