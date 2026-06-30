import { activateStagedArtifact } from "#activate";
import { downloadArtifact, resolveAuthHeaders } from "#download";
import { fetchManifest } from "#manifest";
import { planSecondaryUpdate, verifySecondaryUpdateInstruction } from "#orchestrator";
import { stageArtifact } from "#stage";
import { selectArtifact } from "#artifacts";
import { validateVersionTransition, verifyDownloadedArtifact } from "#verify";
import type {
  ApplySecondaryUpdateInput,
  ApplySecondaryUpdateResult,
  ApplySelfUpdateInput,
  ApplySelfUpdateResult,
  PlanSelfUpdateInput,
  SelfUpdatePlan,
  UpdateClient,
  UpdateClientConfig,
} from "#types";

export function createUpdateClient(config: UpdateClientConfig): UpdateClient {
  return {
    applySecondaryUpdate: (input) => applySecondaryUpdate({
      ...input,
      mode: "secondary",
    }),
    applySelfUpdate: (input = {}) => applySelfUpdate({
      ...config,
      ...input,
    }),
    fetchManifest: () => fetchManifestForClient(config),
    planSecondaryUpdate: async (input) => planSecondaryUpdate({
      ...input,
      runtime: input.runtime ?? config,
      verificationKeys: input.verificationKeys ?? config.verificationKeys,
    }),
    planSelfUpdate: (input = {}) => planSelfUpdate({
      ...config,
      ...input,
    }),
  };
}

export async function planSelfUpdate(input: PlanSelfUpdateInput): Promise<SelfUpdatePlan> {
  const manifest = input.manifest ?? (await fetchManifestForClient(input)).manifest;

  if (manifest.entity !== input.entity || manifest.channel !== input.channel) {
    throw new Error(`Manifest ${manifest.entity}/${manifest.channel} does not match runtime ${input.entity}/${input.channel}.`);
  }

  if (input.currentVersion === manifest.releaseVersion) {
    return {
      artifact: null,
      manifest,
      reason: "already-current",
      shouldUpdate: false,
    };
  }

  validateVersionTransition({
    allowDowngrade: input.allowDowngrade,
    allowSameVersion: input.allowSameVersion,
    currentVersion: input.currentVersion,
    minimumSupportedVersion: manifest.minimumSupportedVersion,
    releaseVersion: manifest.releaseVersion,
  });

  return {
    artifact: selectArtifact(manifest, input),
    manifest,
    shouldUpdate: true,
  };
}

export async function applySelfUpdate(input: ApplySelfUpdateInput): Promise<ApplySelfUpdateResult> {
  if (!input.activationTarget) {
    throw new Error("Self update requires activationTarget.");
  }

  const plan = await planSelfUpdate(input);

  if (!plan.shouldUpdate || !plan.artifact) {
    throw new Error("No self update is available.");
  }

  const download = await downloadArtifact({
    artifact: plan.artifact,
    auth: input.auth,
    fetchImpl: input.fetchImpl,
    statusHandler: input.statusHandler,
    workingDirectory: input.workingDirectory,
  });
  const verification = await verifyDownloadedArtifact({
    artifact: plan.artifact,
    filePath: download.filePath,
  });
  const stage = await stageArtifact({
    artifact: plan.artifact,
    download,
    statusHandler: input.statusHandler,
    workingDirectory: input.workingDirectory,
  });
  const activation = await activateStagedArtifact({
    artifact: plan.artifact,
    readInstalledVersion: input.readInstalledVersion,
    releaseVersion: plan.manifest.releaseVersion,
    restartHook: input.restartHook,
    stage,
    statusHandler: input.statusHandler,
    target: input.activationTarget,
    workingDirectory: input.workingDirectory,
  });

  return {
    activation,
    download,
    plan,
    stage,
    verification,
  };
}

export async function applySecondaryUpdate(input: ApplySecondaryUpdateInput): Promise<ApplySecondaryUpdateResult> {
  const verified = verifySecondaryUpdateInstruction({
    expectedTargetEntity: input.targetEntity,
    expectedTargetInstanceId: input.targetInstanceId,
    instruction: input.instruction,
    now: input.now,
    verificationKeys: input.verificationKeys,
  });
  const download = await downloadArtifact({
    artifact: verified.instruction.artifact,
    auth: verified.instruction.downloadAuth ?? undefined,
    fetchImpl: input.fetchImpl,
    statusHandler: input.statusHandler,
    workingDirectory: input.workingDirectory,
  });
  const verification = await verifyDownloadedArtifact({
    artifact: verified.instruction.artifact,
    filePath: download.filePath,
  });
  const stage = await stageArtifact({
    artifact: verified.instruction.artifact,
    download,
    statusHandler: input.statusHandler,
    workingDirectory: input.workingDirectory,
  });
  const activation = await activateStagedArtifact({
    artifact: verified.instruction.artifact,
    readInstalledVersion: input.readInstalledVersion,
    releaseVersion: verified.instruction.releaseVersion,
    restartHook: input.restartHook,
    stage,
    statusHandler: input.statusHandler,
    target: input.target,
    workingDirectory: input.workingDirectory,
  });

  return {
    activation,
    download,
    instruction: verified.instruction,
    stage,
    verification,
  };
}

async function fetchManifestForClient(config: UpdateClientConfig) {
  return fetchManifest({
    authHeader: await resolveAuthHeaders(config.auth, {
      purpose: "manifest",
      url: config.manifestUrl,
    }),
    fetchImpl: config.fetchImpl,
    manifestUrl: config.manifestUrl,
    normalization: config.normalization,
    verificationKeys: config.verificationKeys,
  });
}
