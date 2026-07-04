import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";

import { inferArtifactFileName } from "#artifacts";
import { ensureDirectory, pathExists } from "#fs";
import { getWorkingPath } from "#paths";
import type {
  DownloadArtifactInput,
  DownloadArtifactResult,
  UpdateDownloadSource,
  UpdateAuthConfig,
  UpdateHeaderResolverContext,
} from "#types";

export async function downloadArtifact(input: DownloadArtifactInput): Promise<DownloadArtifactResult> {
  await ensureDirectory(getWorkingPath(input.workingDirectory, "downloads"));
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const fileName = inferArtifactFileName(input.artifact);
  const filePath = input.resumeFrom?.filePath ?? getWorkingPath(input.workingDirectory, `downloads/${randomUUID()}-${fileName}`);
  const sources = buildDownloadSources(input);
  let lastError: Error | null = null;

  for (const [mirrorIndex, source] of sources.entries()) {
    try {
      const resumeFrom = await resolveResumeCheckpoint(input, source.url, mirrorIndex);
      const response = await fetchImpl(source.url, {
        headers: await buildDownloadHeaders(source, input, resumeFrom),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Artifact download failed with status ${response.status}.`);
      }

      const resumed = response.status === 206 && Boolean(resumeFrom);
      const baseBytes = resumed ? resumeFrom!.bytesWritten : 0;
      const hash = await createDownloadHash(filePath, resumed);
      const handle = await fs.open(filePath, resumed ? "a" : "w", 0o600);
      let bytesWritten = baseBytes;

      try {
        const reader = response.body.getReader();

        while (true) {
          const chunk = await reader.read();
          if (chunk.done) {
            break;
          }

          const buffer = Buffer.from(chunk.value);
          hash.update(buffer);
          bytesWritten += buffer.length;
          await handle.write(buffer);
        }
      }
      finally {
        await handle.close();
      }

      return {
        artifact: input.artifact,
        bytesWritten,
        downloadedAt: new Date().toISOString(),
        etag: response.headers.get("etag"),
        filePath,
        lastModified: response.headers.get("last-modified"),
        mirrorIndex,
        resumed,
        sha256: hash.digest("hex"),
        sourceUrl: source.url,
        url: source.url,
      };
    }
    catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error(`Artifact download failed for ${input.artifact.id}.`);
}

export async function resolveAuthHeaders(auth: UpdateAuthConfig | null | undefined, context: UpdateHeaderResolverContext): Promise<Record<string, string> | undefined> {
  if (!auth) {
    return undefined;
  }

  if (auth.type === "bearer") {
    return {
      authorization: `Bearer ${auth.token}`,
    };
  }

  if (auth.type === "headers") {
    return auth.headers;
  }

  const resolved = await auth.getHeaders(context);
  return resolved ?? undefined;
}

function buildDownloadSources(input: DownloadArtifactInput): UpdateDownloadSource[] {
  const mirrors = input.mirrors ?? input.artifact.mirrors ?? [];
  return [
    {
      auth: input.auth,
      url: input.artifact.url,
    },
    ...mirrors.map((url) => ({
      auth: input.auth,
      url,
    })),
  ];
}

async function buildDownloadHeaders(source: UpdateDownloadSource, input: DownloadArtifactInput, resumeFrom: DownloadArtifactResult | DownloadArtifactInput["resumeFrom"]) {
  const headers = await resolveAuthHeaders(source.auth ?? input.auth, {
    artifactId: input.artifact.id,
    purpose: "artifact",
    url: source.url,
  }) ?? {};

  if (resumeFrom) {
    headers.range = `bytes=${resumeFrom.bytesWritten}-`;
    if (resumeFrom.etag) {
      headers["if-range"] = resumeFrom.etag;
    }
    else if (resumeFrom.lastModified) {
      headers["if-range"] = resumeFrom.lastModified;
    }
  }

  return headers;
}

async function resolveResumeCheckpoint(input: DownloadArtifactInput, sourceUrl: string, mirrorIndex: number) {
  const checkpoint = input.resumeFrom;
  if (!checkpoint || checkpoint.url !== sourceUrl || checkpoint.mirrorIndex !== mirrorIndex) {
    return null;
  }

  if (!(await pathExists(checkpoint.filePath))) {
    return null;
  }

  const stats = await fs.stat(checkpoint.filePath);
  if (stats.size !== checkpoint.bytesWritten) {
    return null;
  }

  return checkpoint;
}

async function createDownloadHash(filePath: string, resumed: boolean) {
  const hash = createHash("sha256");

  if (!resumed) {
    return hash;
  }

  hash.update(await fs.readFile(filePath));
  return hash;
}
