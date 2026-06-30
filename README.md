# @trebired/update

Generic update engine for distributed binaries, with strict manifest normalization, Ed25519 signature verification, SHA-256 artifact verification, safe staging, atomic-style activation, rollback support, and primary-managed secondary orchestration.

`@trebired/update` is intentionally product-agnostic.

It does not know about any specific repository, forge, deployment panel, website, process manager, or UI framework. It gives hosts a reusable update core that can be embedded into different products and different topologies.

## Install

Runtime support: Bun 1+ and Node.js 18+.

```sh
npm install @trebired/update
```

## What It Covers

- manifest fetching from a configured URL
- strict manifest normalization into one canonical shape
- Ed25519 signature verification for manifests and secondary instructions
- artifact selection by entity, channel, OS, architecture, and install strategy
- authenticated or public artifact downloads
- SHA-256 checksum verification
- staging for raw binaries, `.tar.gz`, and `.zip`
- archive traversal rejection
- activation with rollback preparation
- primary-managed secondary instruction creation and verification
- high-level self-update and secondary-update flows

## Core Types

```ts
type UpdateManifest = {
  version: 1;
  entity: string;
  channel: string;
  releaseVersion: string;
  recordedAt: string;
  minimumSupportedVersion?: string | null;
  notes?: {
    title?: string;
    summary?: string;
    url?: string;
  } | null;
  artifacts: UpdateArtifact[];
  signature: {
    type: "ed25519";
    value: string;
  };
};

type UpdateArtifact = {
  id: string;
  entity: string;
  channel?: string | null;
  os: string;
  arch: string;
  installStrategy: "raw" | "archive" | "deb" | "rpm";
  archiveFormat?: "tar.gz" | "zip" | null;
  binaryPath?: string | null;
  url: string;
  checksum: {
    type: "sha256";
    value: string;
  };
  size?: number | null;
  fileName?: string | null;
};

type SecondaryUpdateInstruction = {
  version: 1;
  instructionId: string;
  targetEntity: string;
  targetInstanceId: string;
  releaseVersion: string;
  artifact: UpdateArtifact;
  manifestSignature: {
    type: "ed25519";
    value: string;
  };
  downloadAuth?: {
    type: "bearer";
    token: string;
  } | null;
  issuedAt: string;
  expiresAt: string;
  signature: {
    type: "ed25519";
    value: string;
  };
};
```

## Self-Managed Flow

Use the package directly from the running entity when it owns its own update lifecycle:

```ts
import { applySelfUpdate, createUpdateClient } from "@trebired/update";

const client = createUpdateClient({
  entity: "primary",
  channel: "stable",
  currentVersion: "1.4.0",
  os: process.platform,
  arch: process.arch,
  installStrategy: "raw",
  manifestUrl: "https://updates.example.test/primary/manifest.json",
  workingDirectory: "/var/lib/my-service/update",
  verificationKeys: [process.env.UPDATE_PUBLIC_KEY_PEM!],
  activationTarget: {
    livePath: "/opt/my-service/bin/service",
  },
  readInstalledVersion: async () => {
    return process.env.CURRENT_BINARY_VERSION ?? "unknown";
  },
});

const plan = await client.planSelfUpdate();

if (plan.shouldUpdate) {
  await client.applySelfUpdate();
}
```

You can also call the low-level steps independently:

```ts
import {
  activateStagedArtifact,
  downloadArtifact,
  fetchManifest,
  selectArtifact,
  stageArtifact,
  verifyDownloadedArtifact,
} from "@trebired/update";
```

That split is deliberate so existing product updaters can strip out bespoke internals step by step instead of rewriting every surrounding integration in one pass.

## Primary-Managed Secondary Flow

The primary side can fetch the manifest, choose the correct secondary artifact, and mint a signed instruction:

```ts
import {
  createSecondaryUpdateInstruction,
  planSecondaryUpdate,
} from "@trebired/update";

const plan = await planSecondaryUpdate({
  manifestUrl: "https://updates.example.test/secondary/manifest.json",
  runtime: {
    entity: "secondary",
    channel: "stable",
    currentVersion: "1.0.0",
    os: "linux",
    arch: "x64",
    installStrategy: "raw",
  },
  targetEntity: "secondary",
  targetInstanceId: "worker-17",
  verificationKeys: [process.env.UPDATE_PUBLIC_KEY_PEM!],
  instructionSigner: process.env.UPDATE_PRIVATE_KEY_PEM!,
});

if (plan.instruction) {
  // deliver over any transport your product owns
}
```

The secondary side validates the instruction and performs the local update:

```ts
import { applySecondaryUpdate } from "@trebired/update";

await applySecondaryUpdate({
  instruction,
  targetEntity: "secondary",
  targetInstanceId: "worker-17",
  verificationKeys: [process.env.UPDATE_PUBLIC_KEY_PEM!],
  workingDirectory: "/var/lib/secondary/update",
  target: {
    livePath: "/opt/secondary/bin/worker",
  },
});
```

## Public API

The package exposes the high-level surface below:

```ts
createUpdateClient(config)
fetchManifest(config)
selectArtifact(manifest, runtime)
downloadArtifact(input)
verifyDownloadedArtifact(input)
stageArtifact(input)
activateStagedArtifact(input)
rollbackActivatedArtifact(input)
createSecondaryUpdateInstruction(input)
verifySecondaryUpdateInstruction(input)
planSelfUpdate(input)
planSecondaryUpdate(input)
applySelfUpdate(input)
applySecondaryUpdate(input)
```

## Security Defaults

- invalid manifest signatures are rejected
- invalid instruction signatures are rejected
- invalid SHA-256 checksums are rejected
- archive entries with traversal segments are rejected
- unsupported archive entry types are rejected
- expired instructions are rejected
- wrong target entity or instance instructions are rejected
- target rollback state is preserved before replacement when a live target exists

## Notes On Extensibility

The package intentionally keeps the core generic:

- transport delivery is left to the consuming product
- restart behavior is provided through hooks instead of systemd-specific code
- manifest transport auth is configurable
- file layout uses a caller-provided working directory
- low-level steps remain callable on their own for incremental migration from existing updaters
