import {
  resolveLogger as resolveSharedLogger,
} from "@package/logger-adapter";

import { PACKAGE_NAME } from "#ohc5bi40j86u";
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
    source: PACKAGE_NAME,
  }) as NormalizedUpdateLogger;
}

export { resolveLogger };
