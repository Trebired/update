import { fetchManifestFromSources } from "#manifest";
import { planRollout, planSecondaryUpdate, verifySecondaryUpdateInstruction } from "#orchestrator";
import { applyPreparedUpdate, applyUpdate, checkForUpdate, prepareUpdate } from "#runtime";
import { createUpdateScheduler } from "#scheduler";
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
    applyUpdate: (input = {}) => applyUpdate({
      ...config,
      ...input,
    }),
    checkForUpdate: (input = {}) => checkForUpdate({
      ...config,
      ...input,
    }),
    createUpdateScheduler: (input) => createUpdateScheduler({
      ...config,
      ...input,
    }),
    fetchManifest: () => fetchManifestForClient(config),
    planRollout: async (input) => planRollout({
      ...input,
      verificationKeys: input.verificationKeys ?? config.verificationKeys,
    }),
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
  const result = await checkForUpdate(input);

  if (input.channel && result.manifest.channel && result.manifest.channel !== input.channel) {
    throw new Error(`Manifest channel ${result.manifest.channel} does not match runtime ${input.channel}.`);
  }

  return {
    artifact: result.artifact,
    manifest: result.manifest,
    reason: result.reason,
    shouldUpdate: result.shouldUpdate,
  };
}

export async function applySelfUpdate(input: ApplySelfUpdateInput): Promise<ApplySelfUpdateResult> {
  if (!input.activationTarget && input.installStrategy !== "deb" && input.installStrategy !== "rpm") {
    throw new Error("Self update requires activationTarget.");
  }

  const result = await applyUpdate(input);

  return {
    activation: result.activation,
    download: result.download,
    installation: result.installation,
    plan: {
      artifact: result.check.artifact,
      manifest: result.check.manifest,
      reason: result.check.reason,
      shouldUpdate: result.check.shouldUpdate,
    },
    stage: result.stage,
    verification: result.verification,
  };
}

export async function applySecondaryUpdate(input: ApplySecondaryUpdateInput): Promise<ApplySecondaryUpdateResult> {
  const verified = verifyInputInstruction(input);
  const currentVersion = await resolveCurrentVersion(input);
  const manifest = createSecondaryManifest(verified);
  const check = createSecondaryCheck(verified, currentVersion, manifest);
  const runtimeInput = createSecondaryRuntimeInput(input, verified, currentVersion, manifest, check.subject);
  const prepared = await prepareUpdate({
    ...runtimeInput,
    check,
  });
  const result = await applyPreparedUpdate({
    ...runtimeInput,
    currentVersion: prepared.check.subject.currentVersion,
    prepared,
    target: input.target,
  });

  return {
    activation: result.activation,
    download: result.download,
    installation: result.installation,
    instruction: verified.instruction as ApplySecondaryUpdateResult["instruction"],
    stage: result.stage,
    verification: result.verification,
  };
}

async function fetchManifestForClient(config: UpdateClientConfig) {
  const result = await fetchManifestFromSources({
    fetchImpl: config.fetchImpl,
    normalization: config.normalization,
    sources: config.manifestSources ?? [{
      auth: config.auth,
      url: config.manifestUrl,
    }],
    verificationKeys: config.verificationKeys,
  });

  return {
    manifest: result.manifest,
    responseHeaders: result.responseHeaders,
  };
}

function verifyInputInstruction(input: ApplySecondaryUpdateInput) {
  return verifySecondaryUpdateInstruction({
    expectedTargetEntity: input.targetEntity,
    expectedTargetInstanceId: input.targetInstanceId,
    instruction: input.instruction,
    now: input.now,
    verificationKeys: input.verificationKeys,
  });
}

async function resolveCurrentVersion(input: ApplySecondaryUpdateInput) {
  return input.readInstalledVersion ? input.readInstalledVersion() : "unknown";
}

function createSecondaryManifest(verified: ReturnType<typeof verifyInputInstruction>) {
  return {
    artifacts: [verified.instruction.artifact],
    channel: null,
    entity: verified.instruction.targetEntity,
    minimumSupportedVersion: null,
    notes: null,
    recordedAt: verified.verifiedAt,
    releaseVersion: verified.instruction.releaseVersion,
    signature: verified.instruction.manifestSignature,
    version: 1 as const,
  };
}

function createSecondaryCheck(
  verified: ReturnType<typeof verifyInputInstruction>,
  currentVersion: string,
  manifest: ReturnType<typeof createSecondaryManifest>,
) {
  const subject = {
    arch: verified.instruction.artifact.arch,
    currentVersion,
    entity: verified.instruction.targetEntity,
    installStrategy: verified.instruction.artifact.installStrategy,
    os: verified.instruction.artifact.os,
  };

  return {
    artifact: verified.instruction.artifact,
    manifest,
    operationId: verified.instruction.instructionId,
    shouldUpdate: true as const,
    snapshot: {
      artifact: verified.instruction.artifact,
      flow: "apply" as const,
      manifest,
      operationId: verified.instruction.instructionId,
      phase: "update-selected" as const,
      releaseVersion: verified.instruction.releaseVersion,
      subject,
      updatedAt: verified.verifiedAt,
      version: 1 as const,
    },
    sourceIndex: 0,
    sourceUrl: verified.instruction.artifact.url,
    subject,
  };
}

function createSecondaryRuntimeInput(
  input: ApplySecondaryUpdateInput,
  verified: ReturnType<typeof verifyInputInstruction>,
  currentVersion: string,
  manifest: ReturnType<typeof createSecondaryManifest>,
  subject: ReturnType<typeof createSecondaryCheck>["subject"],
) {
  return {
    activationTarget: input.target,
    arch: verified.instruction.artifact.arch,
    auth: verified.instruction.downloadAuth ?? undefined,
    currentVersion,
    entity: verified.instruction.targetEntity,
    fetchImpl: input.fetchImpl,
    installStrategy: verified.instruction.artifact.installStrategy,
    journalStore: input.journalStore,
    lifecycleHandler: input.lifecycleHandler,
    lockStore: input.lockStore,
    manifest,
    manifestUrl: verified.instruction.artifact.url,
    operationId: verified.instruction.instructionId,
    os: verified.instruction.artifact.os,
    packageInstaller: input.packageInstaller,
    readInstalledVersion: input.readInstalledVersion,
    restartController: input.restartController,
    restartHook: input.restartHook ? (context: Parameters<NonNullable<typeof input.restartHook>>[0]) => input.restartHook?.({
      ...context,
      mode: "secondary",
    }) : undefined,
    stateStore: input.stateStore,
    statusHandler: input.statusHandler,
    subject,
    verificationKeys: input.verificationKeys,
    workingDirectory: input.workingDirectory,
  };
}
