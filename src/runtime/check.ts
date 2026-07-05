import { randomUUID } from "node:crypto";

import { selectArtifactForSubject } from "#artifacts";
import { fetchManifestFromSources } from "#manifest";
import { withUpdateLock } from "#stores";
import { evaluateUpdateCandidate } from "#verify";
import type {
  UpdateCheckInput,
  UpdateCheckResult,
  UpdateManifest,
  UpdateSubject,
} from "#types";
import { emitLifecycle } from "./lifecycle.js";
import { createSnapshot } from "./snapshots.js";
import { createFlowLockKey, resolveManifestSources, resolveSubject, saveSnapshot } from "./shared.js";

export async function checkForUpdate(input: UpdateCheckInput): Promise<UpdateCheckResult> {
  const subject = resolveSubject(input);
  const operationId = input.operationId ?? randomUUID();
  const lockKey = input.lockKey ?? createFlowLockKey("check", subject);

  return withUpdateLock({
    key: lockKey,
    lockStore: input.lockStore,
  }, async () => runCheckFlow(input, subject, operationId));
}

async function runCheckFlow(input: UpdateCheckInput, subject: UpdateSubject, operationId: string): Promise<UpdateCheckResult> {
  await emitLifecycle(input, {
    operationId,
    subject,
    type: "check.started",
  });

  const fetched = await resolveFetchedManifest(input);
  assertManifestEntity(fetched.manifest, subject);
  await emitManifestFetched(input, operationId, fetched.manifest, fetched.sourceUrl);

  return resolveCheckDecision(input, subject, operationId, fetched);
}

async function resolveFetchedManifest(input: UpdateCheckInput) {
  if (input.manifest) {
    return {
      manifest: input.manifest,
      sourceIndex: 0,
      sourceUrl: input.manifestSources?.[0] && typeof input.manifestSources[0] !== "string"
        ? input.manifestSources[0].url
        : input.manifestUrl,
    };
  }

  return fetchManifestFromSources({
    fetchImpl: input.fetchImpl,
    normalization: input.normalization,
    sources: resolveManifestSources(input),
    verificationKeys: input.verificationKeys,
  });
}

function assertManifestEntity(manifest: UpdateManifest, subject: UpdateSubject) {
  if (manifest.entity !== subject.entity) {
    throw new Error(`Manifest ${manifest.entity} does not match runtime ${subject.entity}.`);
  }
}

async function emitManifestFetched(input: UpdateCheckInput, operationId: string, manifest: UpdateManifest, sourceUrl: string) {
  await emitLifecycle(input, {
    manifest,
    operationId,
    sourceUrl,
    type: "manifest.fetched",
  });
}

async function resolveCheckDecision(
  input: UpdateCheckInput,
  subject: UpdateSubject,
  operationId: string,
  fetched: Awaited<ReturnType<typeof resolveFetchedManifest>>,
): Promise<UpdateCheckResult> {
  const artifact = selectArtifactForSubject(fetched.manifest, subject);
  const evaluation = evaluateUpdateCandidate({
    allowDowngrade: input.allowDowngrade,
    allowSameVersion: input.allowSameVersion,
    currentVersion: subject.currentVersion,
    minimumSupportedVersion: fetched.manifest.minimumSupportedVersion,
    releaseVersion: fetched.manifest.releaseVersion,
  });

  if (evaluation.reason === "already-current" && !evaluation.shouldUpdate) {
    return finalizeNoUpdate(input, fetched.manifest, operationId, subject, fetched.sourceIndex, fetched.sourceUrl, evaluation.reason);
  }

  evaluation.assertAllowed();
  return finalizeAvailableUpdate(input, artifact, fetched.manifest, operationId, subject, fetched.sourceIndex, fetched.sourceUrl);
}

async function finalizeNoUpdate(
  input: UpdateCheckInput,
  manifest: UpdateManifest,
  operationId: string,
  subject: UpdateSubject,
  sourceIndex: number,
  sourceUrl: string,
  reason: string,
): Promise<UpdateCheckResult> {
  const snapshot = createSnapshot({
    artifact: null,
    flow: "check",
    manifest,
    operationId,
    phase: "manifest-fetched",
    releaseVersion: manifest.releaseVersion,
    subject,
  });
  await saveSnapshot(input, snapshot);
  await emitLifecycle(input, {
    manifest,
    operationId,
    reason,
    type: "no.update",
  });

  return {
    artifact: null,
    manifest,
    operationId,
    reason,
    shouldUpdate: false,
    snapshot,
    sourceIndex,
    sourceUrl,
    subject,
  };
}

async function finalizeAvailableUpdate(
  input: UpdateCheckInput,
  artifact: UpdateCheckResult["artifact"],
  manifest: UpdateManifest,
  operationId: string,
  subject: UpdateSubject,
  sourceIndex: number,
  sourceUrl: string,
): Promise<UpdateCheckResult> {
  const snapshot = createSnapshot({
    artifact,
    flow: "check",
    manifest,
    operationId,
    phase: "update-selected",
    releaseVersion: manifest.releaseVersion,
    subject,
  });
  await saveSnapshot(input, snapshot);
  await emitLifecycle(input, {
    artifact: artifact!,
    manifest,
    operationId,
    type: "update.available",
  });

  return {
    artifact,
    manifest,
    operationId,
    shouldUpdate: true,
    snapshot,
    sourceIndex,
    sourceUrl,
    subject,
  };
}
