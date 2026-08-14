export {
  defineConfig,
  mergeClientOptions,
  mergeSchedulerOptions,
  normalizeConfig,
} from "./normalize.js";
export {
  UPDATE_PROJECT_CONFIG_PATH,
  findConfig,
  findConfigSync,
  loadCachedConfigSync,
  loadConfig,
  loadConfigSync,
  resetConfigCacheForTests,
} from "./load.js";

export type {
  LoadedUpdateConfig,
  LoadUpdateConfigOptions,
  NormalizedUpdateConfig,
  UpdateClientConfigDefaults,
  UpdateClientConfigurableInput,
  UpdateConfig,
  UpdateSchedulerConfigDefaults,
} from "./types.js";
