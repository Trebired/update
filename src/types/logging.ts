import type { ResultLike } from "@trebired/result";
import type {
  LoggerAdapterEvent,
  LoggerAdapterGenericLogMethod,
  LoggerAdapterLogger,
  LoggerAdapterLogMethod,
  LoggerAdapterWriter,
  NormalizedLoggerAdapter,
} from "@trebired/logger-adapter";

export type UpdateStatusLevel = "debug" | "info" | "warn" | "error";
export type UpdateLogMethod = LoggerAdapterLogMethod;
export type UpdateLogEvent = LoggerAdapterEvent;
export type UpdateGenericLogMethod = LoggerAdapterGenericLogMethod;
export type UpdateLogger = LoggerAdapterLogger;
export type UpdateLoggerAdapter = LoggerAdapterWriter;
export type NormalizedUpdateLogger = NormalizedLoggerAdapter;

export type UpdateStatusEvent = {
  code: string;
  level: UpdateStatusLevel;
  message: string;
  context?: Record<string, unknown>;
  result?: ResultLike;
};

export type UpdateStatusHandler = (event: UpdateStatusEvent) => void | Promise<void>;
