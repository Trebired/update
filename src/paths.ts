import path from "node:path";

export function getWorkingPath(root: string, segment: string): string {
  return path.join(root, segment);
}

export function sanitizeFileName(value: string, fallback = "artifact.bin"): string {
  const baseName = path.basename(value).trim().replace(/[^a-zA-Z0-9._-]+/gu, "-");
  return baseName.length > 0 ? baseName : fallback;
}

export function safeJoinWithin(root: string, relativePath: string): string {
  const candidate = path.resolve(root, relativePath);
  const normalizedRoot = path.resolve(root) + path.sep;

  if (!candidate.startsWith(normalizedRoot) && candidate !== path.resolve(root)) {
    throw new Error(`Resolved path escapes root: ${relativePath}`);
  }

  return candidate;
}

export function normalizeArchiveEntryPath(entryPath: string): string {
  const normalized = entryPath.replace(/\\/gu, "/").replace(/^\/+/u, "");

  if (normalized.length === 0 || normalized.includes("\0")) {
    throw new Error("Archive entry path is empty or invalid.");
  }

  const parts = normalized.split("/").filter(Boolean);

  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error(`Archive entry path is not allowed: ${entryPath}`);
  }

  return parts.join("/");
}
