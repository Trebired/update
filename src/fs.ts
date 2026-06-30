import fs from "node:fs/promises";

export async function ensureDirectory(path: string): Promise<void> {
  await fs.mkdir(path, {
    recursive: true,
  });
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  }
  catch {
    return false;
  }
}

export async function ensureRemoved(path: string): Promise<void> {
  await fs.rm(path, {
    force: true,
    recursive: true,
  });
}

export async function readFileBytes(path: string): Promise<Uint8Array> {
  return new Uint8Array(await fs.readFile(path));
}
