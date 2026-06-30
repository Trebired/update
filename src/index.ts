export { activateStagedArtifact, rollbackActivatedArtifact } from "#activate";
export { inferArtifactFileName, normalizeArtifact, selectArtifact } from "#artifacts";
export { createUpdateClient, applySecondaryUpdate, applySelfUpdate, planSelfUpdate } from "#client";
export { downloadArtifact } from "#download";
export { fetchManifest, normalizeManifest } from "#manifest";
export { createSecondaryUpdateInstruction, planSecondaryUpdate, verifySecondaryUpdateInstruction } from "#orchestrator";
export { stageArtifact } from "#stage";
export {
  createDetachedSignature,
  hashFileSha256,
  validateInstalledVersion,
  validateVersionTransition,
  verifyDetachedSignature,
  verifyDownloadedArtifact,
  verifyInstructionSignature,
  verifyManifestSignature,
} from "#verify";
export type * from "#types";
