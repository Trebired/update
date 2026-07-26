import {
  resolveLogger as resolveSharedLogger,
} from "@package/logger-adapter";

import type {
  NormalizedUpdateLogger,
  UpdateLogger,
  UpdateLoggerAdapter,
} from "#types";

function resolveLogger(
  logger?: UpdateLogger,
  adapter?: UpdateLoggerAdapter,
): NormalizedUpdateLogger {
  return resolveSharedLogger({
    adapter,
    fallback: "console",
    logger,
    source: "@package/update",
  }) as NormalizedUpdateLogger;
}

export { resolveLogger };
