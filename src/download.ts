import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";

import { inferArtifactFileName } from "#artifacts";
import { ensureDirectory } from "#fs";
import { getWorkingPath } from "#paths";
import type {
  DownloadArtifactInput,
  DownloadArtifactResult,
  UpdateAuthConfig,
  UpdateHeaderResolverContext,
} from "#types";

export async function downloadArtifact(input: DownloadArtifactInput): Promise<DownloadArtifactResult> {
  await ensureDirectory(getWorkingPath(input.workingDirectory, "downloads"));
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const fileName = inferArtifactFileName(input.artifact);
  const filePath = getWorkingPath(input.workingDirectory, `downloads/${randomUUID()}-${fileName}`);
  const response = await fetchImpl(input.artifact.url, {
    headers: await resolveAuthHeaders(input.auth, {
      artifactId: input.artifact.id,
      purpose: "artifact",
      url: input.artifact.url,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Artifact download failed with status ${response.status}.`);
  }

  const reader = response.body.getReader();
  const handle = await fs.open(filePath, "w", 0o600);
  const hash = createHash("sha256");
  let bytesWritten = 0;

  try {
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
    filePath,
    sha256: hash.digest("hex"),
  };
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
