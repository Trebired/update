import type {
  ApplyPreparedUpdateInput,
  PrepareUpdateInput,
  UpdateCheckInput,
  UpdateClientConfig,
  UpdateManifest,
  UpdateStateSnapshot,
  UpdateSubject,
} from "#types";

export function resolveManifestSources(input: Pick<UpdateClientConfig, "auth" | "manifestSources" | "manifestUrl">) {
  if (input.manifestSources?.length) {
    return input.manifestSources;
  }

  return [{
    auth: input.auth,
    url: input.manifestUrl,
  }];
}

export function resolveSubject(input: Pick<UpdateCheckInput, "arch" | "currentVersion" | "entity" | "installStrategy" | "os" | "subject">): UpdateSubject {
  return input.subject ?? {
    arch: input.arch,
    currentVersion: input.currentVersion,
    entity: input.entity,
    installStrategy: input.installStrategy,
    os: input.os,
  };
}

export function createFlowLockKey(flow: "apply" | "check", subject: UpdateSubject): string {
  return `${flow}:${subject.entity}:${subject.os}:${subject.arch}:${subject.installStrategy}`;
}

export async function saveSnapshot(input: Pick<UpdateClientConfig, "stateStore">, snapshot: UpdateStateSnapshot): Promise<void> {
  await input.stateStore?.save(snapshot);
}

export function requiredActivationTarget(input: ApplyPreparedUpdateInput) {
  if (!input.activationTarget && !input.target) {
    throw new Error("Activation target is required for staged updates.");
  }

  return input.target ?? input.activationTarget!;
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function toPackageSnapshotInput(input: PrepareUpdateInput, manifest: UpdateManifest, operationId: string, subject: UpdateSubject) {
  return {
    flow: "apply" as const,
    manifest,
    operationId,
    releaseVersion: manifest.releaseVersion,
    subject,
  };
}
