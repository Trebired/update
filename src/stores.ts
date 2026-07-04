import fs from "node:fs/promises";
import path from "node:path";

import { ensureDirectory, ensureRemoved, pathExists } from "#fs";
import { sanitizeFileName } from "#paths";
import type {
  UpdateFileStoreConfig,
  UpdateJournalEntry,
  UpdateJournalStore,
  UpdateLockStore,
  UpdateStateSnapshot,
  UpdateStateStore,
} from "#types";

export async function withUpdateLock<T>(
  input: {
    key: string;
    lockStore?: UpdateLockStore;
  },
  fn: () => Promise<T>,
): Promise<T> {
  if (!input.lockStore) {
    return fn();
  }

  const lock = await input.lockStore.acquire(input.key);

  try {
    return await fn();
  }
  finally {
    await lock.release();
  }
}

export function createFileUpdateStateStore(input: UpdateFileStoreConfig): UpdateStateStore {
  return {
    async load(operationId) {
      const filePath = path.join(input.directory, "state", `${toStoreFileName(operationId)}.json`);
      if (!(await pathExists(filePath))) {
        return null;
      }

      return JSON.parse(await fs.readFile(filePath, "utf8")) as UpdateStateSnapshot;
    },
    async remove(operationId) {
      await ensureRemoved(path.join(input.directory, "state", `${toStoreFileName(operationId)}.json`));
    },
    async save(snapshot) {
      const filePath = path.join(input.directory, "state", `${toStoreFileName(snapshot.operationId)}.json`);
      await ensureDirectory(path.dirname(filePath));
      await fs.writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    },
  };
}

export function createFileUpdateJournalStore(input: UpdateFileStoreConfig): UpdateJournalStore {
  return {
    async append(entry) {
      const filePath = path.join(input.directory, "journal", `${toStoreFileName(entry.operationId)}.jsonl`);
      await ensureDirectory(path.dirname(filePath));
      await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
    },
    async list(operationId) {
      const filePath = path.join(input.directory, "journal", `${toStoreFileName(operationId)}.jsonl`);
      if (!(await pathExists(filePath))) {
        return [];
      }

      return (await fs.readFile(filePath, "utf8"))
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as UpdateJournalEntry);
    },
  };
}

export function createFileUpdateLockStore(input: UpdateFileStoreConfig): UpdateLockStore {
  return {
    async acquire(key) {
      const filePath = path.join(input.directory, "locks", `${toStoreFileName(key)}.lock`);
      await ensureDirectory(path.dirname(filePath));

      let handle;
      try {
        handle = await fs.open(filePath, "wx", 0o600);
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new Error(`Update lock is already held for ${key}.`);
        }
        throw error;
      }

      return {
        async release() {
          await handle.close();
          await ensureRemoved(filePath);
        },
      };
    },
  };
}

function toStoreFileName(value: string): string {
  return sanitizeFileName(value.replace(/[:/\\]+/gu, "-"), "update");
}
