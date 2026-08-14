import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  LoadedUpdateConfig,
  LoadUpdateConfigOptions,
  NormalizedUpdateConfig,
  UpdateConfig,
} from "./types.js";
import { defineConfig, normalizeConfig } from "./normalize.js";

const UPDATE_PROJECT_CONFIG_PATH = ".trebired/update/config.ts";
const EMPTY_CONFIG = Object.freeze(normalizeConfig({}));

let cachedConfigs = new Map<string, LoadedUpdateConfig>();

async function loadConfig(projectRoot = process.cwd(), options: LoadUpdateConfigOptions = {}): Promise<LoadedUpdateConfig> {
  const root = path.resolve(projectRoot);
  const configPath = options.configPath
  ? path.resolve(root, options.configPath)
  : await findConfig(options.searchFrom || root, root);
  if (!configPath) return handleMissingConfig(options);
  if (!await pathExists(configPath)) throw new Error(`update config was not found: ${configPath}`);
  return loadedConfig(configPath, readSourceConfig(await fsPromises.readFile(configPath, "utf8"), configPath));
}

function loadConfigSync(projectRoot = process.cwd(), options: LoadUpdateConfigOptions = {}): LoadedUpdateConfig {
  const root = path.resolve(projectRoot);
  const configPath = options.configPath
  ? path.resolve(root, options.configPath)
  : findConfigSync(options.searchFrom || root, root);
  if (!configPath) return handleMissingConfig(options);
  if (!fs.existsSync(configPath)) throw new Error(`update config was not found: ${configPath}`);
  return loadedConfig(configPath, readSourceConfig(fs.readFileSync(configPath, "utf8"), configPath));
}

function loadCachedConfigSync(projectRoot = process.cwd()): NormalizedUpdateConfig {
  const root = path.resolve(projectRoot);
  const configPath = findConfigSync(root);
  const cacheKey = configPath || `missing:${root}`;
  const cached = cachedConfigs.get(cacheKey);
  if (cached) return cached.config;
  const loaded = configPath ? loadConfigSync(root, { configPath }) : missingConfig();
  cachedConfigs.set(cacheKey, loaded);
  return loaded.config;
}

function resetConfigCacheForTests(): void {
  cachedConfigs = new Map<string, LoadedUpdateConfig>();
}

async function findConfig(startDir = process.cwd(), boundaryDir?: string): Promise<string|null> {
  let current = path.resolve(startDir);
  const boundary = boundaryDir ? path.resolve(boundaryDir) : "";
  for (;; ) {
    const candidate = path.join(current, UPDATE_PROJECT_CONFIG_PATH);
    if (await pathExists(candidate)) return candidate;
    if (boundary && current === boundary) return null;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function findConfigSync(startDir = process.cwd(), boundaryDir?: string): string | null {
  let current = path.resolve(startDir);
  const boundary = boundaryDir ? path.resolve(boundaryDir) : "";
  for (;; ) {
    const candidate = path.join(current, UPDATE_PROJECT_CONFIG_PATH);
    if (fs.existsSync(candidate)) return candidate;
    if (boundary && current === boundary) return null;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  }
  catch {
    return false;
  }
}

function handleMissingConfig(options: LoadUpdateConfigOptions): LoadedUpdateConfig {
  if (options.defaultIfMissing === false) throw new Error("update config was not found");
  return missingConfig();
}

function missingConfig(): LoadedUpdateConfig {
  return { config: EMPTY_CONFIG, configPath: null, dependencies: [] };
}

function loadedConfig(configPath: string, config: UpdateConfig): LoadedUpdateConfig {
  return {
    config: normalizeConfig(config),
    configPath,
    dependencies: [configPath],
  };
}

function readSourceConfig(source: string, configPath: string): UpdateConfig {
  const candidate = runConfigSource(source, configPath);
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error(`update config must default-export an object: ${configPath}`);
  }
  return candidate as UpdateConfig;
}

function runConfigSource(source: string, configPath: string): unknown {
  try {
    return Function("defineConfig", `${toRuntimeConfigSource(source, configPath)}\n//# sourceURL=${pathToFileURL(configPath).href}`)(defineConfig);
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`update config failed to load: ${configPath}: ${reason}`);
  }
}

function toRuntimeConfigSource(source: string, configPath: string): string {
  const withoutImports = source
  .replace(/^\s*import\s+type\s+[\s\S]*?\s+from\s+["'][^"']+["'];?\s*$/gmu, "")
  .replace(/^\s*import\s+[\s\S]*?\s+from\s+["'][^"']+["'];?\s*$/gmu, "")
  .replace(/^\s*import\s+["'][^"']+["'];?\s*$/gmu, "");
  const runtimeSource = withoutImports.replace(/\bexport\s+default\b/u, "return");
  if (runtimeSource === withoutImports || /\bexport\b/u.test(runtimeSource)) {
    throw new Error(`update config only supports a default export: ${configPath}`);
  }
  return runtimeSource;
}

export {
  UPDATE_PROJECT_CONFIG_PATH,
  findConfig,
  findConfigSync,
  loadCachedConfigSync,
  loadConfig,
  loadConfigSync,
  resetConfigCacheForTests,
};
