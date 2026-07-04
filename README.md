# @trebired/update

Generic update runtime for distributed binaries and packages, with strict manifest normalization, signature verification, artifact verification, resumable downloads, staging, activation, rollback, persistence helpers, polling, and controller-managed rollout primitives.

`@trebired/update` is intentionally product-agnostic.

It does not know about any specific repository, deployment system, service manager, transport, or UI. It provides reusable update building blocks plus a few strong high-level flows.

## Install

Runtime support: Bun 1+ and Node.js 18+.

```sh
npm install @trebired/update
```

## Layers

The package now exposes three adoption levels:

- low-level primitives
- self-managed high-level flows
- controller-managed multi-target rollout

Release channels are accepted as optional legacy metadata, but they are no longer required by the new core runtime, manifest, selection, or persisted-state flows.

## Self-Managed Flow

Use `checkForUpdate`, `prepareUpdate`, `applyPreparedUpdate`, `applyUpdate`, `resumeUpdate`, and `createUpdateScheduler` when the updating process owns its own lifecycle:

```ts
import { applyUpdate, createFileUpdateJournalStore, createFileUpdateStateStore } from "@trebired/update";

const workingDirectory = "/var/lib/my-service/update";

const result = await applyUpdate({
  entity: "primary",
  currentVersion: "1.4.0",
  os: process.platform,
  arch: process.arch,
  installStrategy: "raw",
  manifestUrl: "https://updates.example.test/primary/manifest.json",
  workingDirectory,
  verificationKeys: [process.env.UPDATE_PUBLIC_KEY_PEM!],
  activationTarget: {
    livePath: "/opt/my-service/bin/service",
  },
  stateStore: createFileUpdateStateStore({
    directory: workingDirectory,
  }),
  journalStore: createFileUpdateJournalStore({
    directory: workingDirectory,
  }),
  lifecycleHandler: (event) => {
    console.log(event.type, event.operationId);
  },
});

if (result.restartPending) {
  // defer restart until your product decides to complete activation
}
```

Built-in scheduler support is available when consumers want polling without custom timer glue:

```ts
import { createUpdateScheduler } from "@trebired/update";

const scheduler = createUpdateScheduler({
  entity: "primary",
  currentVersion: "1.4.0",
  os: process.platform,
  arch: process.arch,
  installStrategy: "raw",
  manifestUrl: "https://updates.example.test/primary/manifest.json",
  workingDirectory: "/var/lib/my-service/update",
  verificationKeys: [process.env.UPDATE_PUBLIC_KEY_PEM!],
  intervalMs: 60_000,
  mode: "check",
});

scheduler.start();
```

## Controller-Managed Rollout

Use rollout planning and instruction helpers when a controller chooses artifacts for many targets while transports stay outside the library:

```ts
import {
  createRolloutInstructions,
  planRollout,
  summarizeRollout,
} from "@trebired/update";

const plan = await planRollout({
  manifestUrl: "https://updates.example.test/secondary/manifest.json",
  verificationKeys: [process.env.UPDATE_PUBLIC_KEY_PEM!],
  targets: [
    {
      targetId: "worker-1",
      subject: {
        entity: "secondary",
        currentVersion: "1.0.0",
        os: "linux",
        arch: "x64",
        installStrategy: "raw",
      },
    },
  ],
});

const instructions = createRolloutInstructions({
  instructionSigner: process.env.UPDATE_PRIVATE_KEY_PEM!,
  manifest: plan.manifest,
  plans: plan.targets,
});

const summary = summarizeRollout({
  instructions,
  plan,
});
```

Delivery, acknowledgement collection, and apply-result collection are transport interfaces. The library defines the contracts but does not ship a transport.

## Core Primitives

Low-level consumers can compose the runtime directly:

```ts
import {
  activateStagedArtifact,
  checkForUpdate,
  createFileUpdateLockStore,
  downloadArtifact,
  executePackageInstall,
  fetchManifestFromSources,
  selectArtifactForSubject,
  stageArtifact,
  verifyDownloadedArtifact,
  verifyUpdateInstruction,
  withUpdateLock,
} from "@trebired/update";
```

Key capabilities:

- fallback manifest sources
- optional channel-aware legacy selection plus channel-free core selection
- resumable downloads and artifact mirrors
- file-backed state, journal, and locking helpers
- package install execution for `deb` and `rpm`
- restart/deferred-activation hooks
- update instruction creation and verification
- batch rollout planning and summary types

## Compatibility Helpers

The previous surface remains available for incremental migration:

- `fetchManifest`
- `selectArtifact`
- `planSelfUpdate`
- `applySelfUpdate`
- `planSecondaryUpdate`
- `createSecondaryUpdateInstruction`
- `verifySecondaryUpdateInstruction`
- `applySecondaryUpdate`
- `createUpdateClient`

These helpers now wrap the newer primitives and flows. Legacy channel-aware behavior remains available through those wrappers when a consumer still depends on it.

## Security Defaults

- invalid manifest signatures are rejected
- invalid instruction signatures are rejected
- invalid SHA-256 checksums are rejected
- archive traversal is rejected
- expired instructions are rejected
- minimum supported version rules are enforced consistently during planning and applying
- duplicate concurrent check and apply executions can be locked out
- rollback state is preserved before staged binary replacement

## Public API

High-level flows:

- `checkForUpdate`
- `prepareUpdate`
- `applyPreparedUpdate`
- `applyUpdate`
- `resumeUpdate`
- `createUpdateScheduler`

Controller rollout:

- `planRollout`
- `createRolloutInstructions`
- `deliverRolloutInstructions`
- `collectRolloutAcknowledgements`
- `collectRolloutResults`
- `summarizeRollout`

Persistence and locking:

- `createFileUpdateStateStore`
- `createFileUpdateJournalStore`
- `createFileUpdateLockStore`
- `withUpdateLock`

Instruction and evaluation primitives:

- `createUpdateInstruction`
- `verifyUpdateInstruction`
- `evaluateUpdateCandidate`
- `fetchManifestFromSources`
- `selectArtifactForSubject`

Download, install, and activation primitives:

- `downloadArtifact`
- `verifyDownloadedArtifact`
- `stageArtifact`
- `executePackageInstall`
- `activateStagedArtifact`
- `rollbackActivatedArtifact`
