import type {
  NormalizedUpdateConfig,
  UpdateClientConfigDefaults,
  UpdateClientConfigurableInput,
  UpdateConfig,
  UpdateSchedulerConfigDefaults,
} from "./types.js";
import type { UpdateSchedulerConfig } from "#kn5mninc2td8";
import { PACKAGE_VERSION } from "#ohc5bi40j86u";
import {
  isRecord,
  toTrimmedString,
} from "@trebired/utils";
import { resolveForVersion } from "@trebired/utils";

type NormalizeOptions = {
  configPath?: string;
  requireForVersion?: boolean;
};

function defineConfig<TConfig extends UpdateConfig>(config: TConfig): TConfig {
  return config;
}

function normalizeConfig(
  config: UpdateConfig = {},
  options: NormalizeOptions = {},
): NormalizedUpdateConfig {
  if (!isRecord(config)) throw new Error("update config must be an object");
  return {
    client: normalizeClient(config.client),
    forVersion: normalizeForVersion(config, options),
    scheduler: normalizeScheduler(config.scheduler),
    selection: normalizeSelection(config.selection),
  };
}

function mergeClientOptions<TOptions extends UpdateClientConfigurableInput>(
  defaults: UpdateClientConfigDefaults,
  options: TOptions,
): TOptions {
  return {
    ...defaults,
    ...options,
    normalization: mergeObjects(defaults.normalization, options.normalization),
  } as TOptions;
}

function mergeSchedulerOptions<TOptions extends UpdateSchedulerConfig>(
  defaults: UpdateSchedulerConfigDefaults,
  options: TOptions,
): TOptions {
  return {
    ...defaults,
    ...options,
  } as TOptions;
}

function normalizeClient(input: UpdateConfig["client"]): UpdateClientConfigDefaults {
  if (!isRecord(input)) return {};
  return pickDefined({
      allowDowngrade: typeof input.allowDowngrade === "boolean" ? input.allowDowngrade : undefined,
      allowSameVersion: typeof input.allowSameVersion === "boolean" ? input.allowSameVersion : undefined,
      normalization: normalizeNormalization(input.normalization),
  });
}

function normalizeScheduler(input: UpdateConfig["scheduler"]): UpdateSchedulerConfigDefaults {
  if (!isRecord(input)) return {};
  return pickDefined({
      intervalMs: normalizePositiveNumber(input.intervalMs),
      lockKey: normalizeString(input.lockKey),
      mode: input.mode === "apply" || input.mode === "check" ? input.mode : undefined,
      unrefTimer: typeof input.unrefTimer === "boolean" ? input.unrefTimer : undefined,
  });
}

function normalizeSelection(input: UpdateConfig["selection"]): NormalizedUpdateConfig["selection"] {
  if (!isRecord(input)) return {};
  return pickDefined({
      channel: typeof input.channel === "string" || input.channel === null ? input.channel : undefined,
      legacyChannelMatch: typeof input.legacyChannelMatch === "boolean" ? input.legacyChannelMatch : undefined,
  });
}

function normalizeNormalization(input: unknown) {
  if (!isRecord(input)) return undefined;
  return {
    ...input,
    allowFieldAliases: typeof input.allowFieldAliases === "boolean" ? input.allowFieldAliases : undefined,
  };
}

function mergeObjects<TValue extends object>(left: TValue | undefined, right: TValue | undefined): TValue | undefined {
  if (!left && !right) return undefined;
  return {
    ...(left || {}),
    ...(right || {}),
  } as TValue;
}

function normalizePositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, value) : undefined;
}

function normalizeString(value: unknown): string | undefined {
  const normalized = toTrimmedString(value);
  return normalized || undefined;
}

function normalizeForVersion(
  config: UpdateConfig,
  options: NormalizeOptions,
): string {
  return resolveForVersion({
      configPath: options.configPath,
      forVersion: config.forVersion,
      label: "update",
      packageVersion: PACKAGE_VERSION,
      requireForVersion: options.requireForVersion,
  });
}

function pickDefined<TValue extends Record<string, unknown>>(input: TValue): Partial<TValue> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<TValue>;
}

export {
  defineConfig,
  mergeClientOptions,
  mergeSchedulerOptions,
  normalizeConfig,
};
