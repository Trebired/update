import type { KeyObject } from "node:crypto";

export type UpdateRole = "primary" | "secondary";
export type UpdateInstallStrategy = "raw" | "archive" | "deb" | "rpm";
export type UpdateArchiveFormat = "tar.gz" | "zip";
export type UpdateOperationMode = "self" | "secondary";

export type UpdateSignature = {
  type: "ed25519";
  value: string;
};

export type UpdateChecksum = {
  type: "sha256";
  value: string;
};

export type UpdateReleaseNotes = {
  title?: string;
  summary?: string;
  url?: string;
} | null;

export type UpdateArtifact = {
  id: string;
  entity: string;
  channel?: string | null;
  os: string;
  arch: string;
  installStrategy: UpdateInstallStrategy;
  archiveFormat?: UpdateArchiveFormat | null;
  binaryPath?: string | null;
  url: string;
  mirrors?: string[];
  checksum: UpdateChecksum;
  size?: number | null;
  fileName?: string | null;
};

export type UpdateManifest = {
  version: 1;
  entity: string;
  channel?: string | null;
  releaseVersion: string;
  recordedAt: string;
  minimumSupportedVersion?: string | null;
  notes?: UpdateReleaseNotes;
  artifacts: UpdateArtifact[];
  signature: UpdateSignature;
};

export type UpdateSubject = {
  entity: string;
  currentVersion: string;
  os: string;
  arch: string;
  installStrategy: UpdateInstallStrategy;
};

export type UpdateRuntimeTarget = UpdateSubject & {
  channel?: string | null;
};

export type UpdateManifestFieldAliases = {
  manifest?: Partial<Record<"entity" | "channel" | "releaseVersion" | "recordedAt" | "minimumSupportedVersion" | "notes" | "artifacts" | "signature", string[]>>;
  artifact?: Partial<Record<"id" | "entity" | "channel" | "os" | "arch" | "installStrategy" | "archiveFormat" | "binaryPath" | "url" | "mirrors" | "checksum" | "size" | "fileName", string[]>>;
};

export type UpdateNormalizationOptions = {
  allowFieldAliases?: boolean;
  fieldAliases?: UpdateManifestFieldAliases;
};

export type UpdateVerificationKeyInput =
  | string
  | Uint8Array
  | Buffer
  | KeyObject
  | {
    key: string | Uint8Array | Buffer | KeyObject;
    format?: "pem" | "raw" | "raw-base64" | "base64" | "base64url";
    keyId?: string;
  };

export type UpdateSigningKeyInput =
  | string
  | Uint8Array
  | Buffer
  | KeyObject
  | {
    key: string | Uint8Array | Buffer | KeyObject;
    format?: "pem" | "pkcs8-pem" | "pkcs8-der";
    keyId?: string;
  };

export type UpdateHeaderResolverContext = {
  artifactId?: string | null;
  purpose: "manifest" | "artifact";
  url: string;
};

export type UpdateAuthConfig =
  | {
    type: "bearer";
    token: string;
  }
  | {
    type: "headers";
    headers: Record<string, string>;
  }
  | {
    type: "callback";
    getHeaders: (context: UpdateHeaderResolverContext) => Promise<Record<string, string> | null | undefined> | Record<string, string> | null | undefined;
  };

export type UpdateManifestSource = {
  url: string;
  auth?: UpdateAuthConfig | null;
};

export type UpdateDownloadSource = {
  url: string;
  auth?: UpdateAuthConfig | null;
};

export type UpdateFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type UpdateActivationTarget = {
  livePath: string;
  fileMode?: number;
};

export type UpdateRestartHookContext = {
  artifact: UpdateArtifact;
  mode: UpdateOperationMode;
  releaseVersion: string;
  targetPath: string;
};

export type UpdateRestartHook = (context: UpdateRestartHookContext) => void | Promise<void>;
export type UpdateVersionReader = () => string | Promise<string>;
