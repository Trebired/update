import type {
  UpdateChecksum,
  UpdateFetch,
  UpdateSignature,
  UpdateAuthConfig,
  UpdateNormalizationOptions,
  UpdateRuntimeTarget,
  UpdateVerificationKeyInput,
} from "./core.js";
import type { AppliedUpdateResult, UpdateCheckResult } from "./runtime.js";

export type CompatibilityResourceDescriptor = {
  version: string;
  fileName: string;
  checksum: UpdateChecksum;
};

export type CompatibilityCombination = {
  versions: Record<string, string>;
  resources?: Record<string, CompatibilityResourceDescriptor>;
};

export type CompatibilitySet = {
  version: 1;
  combinations: CompatibilityCombination[];
  recordedAt?: string | null;
  signature?: UpdateSignature;
};

export type CompatibilitySetFieldAliases = {
  compatibilitySet?: Partial<Record<"combinations" | "recordedAt" | "signature", string[]>>;
  combination?: Partial<Record<"versions" | "resources", string[]>>;
  resource?: Partial<Record<"version" | "fileName" | "checksum", string[]>>;
};

export type GenericManifestNormalizationOptions = UpdateNormalizationOptions & {
  fieldAliases?: UpdateNormalizationOptions["fieldAliases"] & CompatibilitySetFieldAliases & ResourceManifestFieldAliases;
};

export type FetchJsonManifestOptions<T> = {
  auth?: UpdateAuthConfig | null;
  authHeader?: Record<string, string> | null;
  fetchImpl?: UpdateFetch;
  headers?: Record<string, string>;
  normalization?: (raw: unknown) => T;
  verificationKeys?: UpdateVerificationKeyInput[];
};

export type FetchedJsonManifest<T> = {
  manifest: T;
  responseHeaders: Headers;
};

export type CounterpartExpectationPaths = Record<string, string | string[]>;

export type ReadCounterpartExpectationsOptions = {
  fieldPaths: CounterpartExpectationPaths;
};

export type CounterpartMismatch = {
  entity: string;
  expected: string;
  reported: string | null;
};

export type EvaluateCounterpartInput = {
  selfEntity: string;
  selfVersion: string;
  expected: Record<string, string>;
  reported: Record<string, string | null | undefined>;
  treatUnknownAsCompatible?: boolean;
};

export type EvaluateCounterpartResult = {
  compatible: boolean;
  mismatches: CounterpartMismatch[];
};

export type AssertCounterpartOptions = {
  treatUnknownAsCompatible?: boolean;
};

export type ClassifySubjectInput = {
  reported?: string | null;
  target?: string | null;
  expected?: string | null;
};

export type SubjectClassificationStatus = "current" | "outdated" | "incompatible" | "unknown";

export type SubjectClassification = {
  status: SubjectClassificationStatus;
};

export type ClassifyFleetCriteria = {
  target?: Record<string, string | null | undefined>;
  expected?: Record<string, string | null | undefined>;
};

export type ClassifiedFleetSubject = {
  subject: UpdateRuntimeTarget;
  status: SubjectClassificationStatus;
  reported: string | null;
  target?: string | null;
  expected?: string | null;
};

export type ClassifiedFleet = {
  all: ClassifiedFleetSubject[];
  byStatus: Record<SubjectClassificationStatus, ClassifiedFleetSubject[]>;
  signature: string;
};

export type ResourceManifestEntry = {
  key: string;
  combination: Record<string, string>;
  resource: string;
  version: string;
  fileName: string;
  url: string;
  checksum: UpdateChecksum;
};

export type ResourceManifest = {
  version: 1;
  entries: ResourceManifestEntry[];
  recordedAt?: string | null;
  signature?: UpdateSignature;
};

export type ResourceManifestFieldAliases = {
  resourceManifest?: Partial<Record<"entries" | "recordedAt" | "signature", string[]>>;
  resourceEntry?: Partial<Record<"key" | "combination" | "resource" | "version" | "fileName" | "url" | "checksum", string[]>>;
};

export type FetchResourceManifestOptions = {
  auth?: UpdateAuthConfig | null;
  authHeader?: Record<string, string> | null;
  fetchImpl?: UpdateFetch;
  normalization?: GenericManifestNormalizationOptions;
  verificationKeys?: UpdateVerificationKeyInput[];
};

export type SelectResourceCriteria = {
  combination?: Record<string, string>;
  key?: string;
  resource: string;
};

export type InstalledResourceMeta = {
  version: string;
  key: string;
  installedAt: string;
  [key: string]: unknown;
};

export type InstallResourceBundleInput = {
  url: string;
  checksum: UpdateChecksum;
  workingDirectory: string;
  targetDirectory: string;
  version: string;
  key: string;
  fetchImpl?: UpdateFetch;
  extract?: (input: {
    archivePath: string;
    stagingDir: string;
  }) => Promise<void> | void;
  validate?: (stagingDir: string) => Promise<void> | void;
  meta?: Record<string, unknown>;
};

export type InstallResourceBundleResult = {
  meta: InstalledResourceMeta;
  targetDirectory: string;
};

export type SchedulerErrorHandlerContext = {
  state: import("./runtime.js").UpdateSchedulerState;
};

export type UpdateSchedulerLoopOptions = {
  onError?: (error: Error, context: SchedulerErrorHandlerContext) => void | Promise<void>;
  unrefTimer?: boolean;
};

export type SchedulerRunResult = AppliedUpdateResult | UpdateCheckResult;
