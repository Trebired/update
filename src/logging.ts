import {
  resolveLogger as resolveSharedLogger,
} from "@trebired/logger-adapter";

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
    source: "@trebired/update",
  }) as NormalizedUpdateLogger;
}

export { resolveLogger };
